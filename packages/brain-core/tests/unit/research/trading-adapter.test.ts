import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { TradingDataMinerAdapter } from '../../../src/research/adapters/trading-adapter.js';

function createTradingSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      pair TEXT NOT NULL,
      win INTEGER NOT NULL DEFAULT 0,
      profit REAL,
      regime TEXT,
      timeframe TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      win_rate REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair TEXT NOT NULL,
      type TEXT NOT NULL,
      length INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS calibration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      overall_accuracy REAL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

describe('TradingDataMinerAdapter', () => {
  let db: Database.Database;
  const adapter = new TradingDataMinerAdapter();

  beforeEach(() => {
    db = new Database(':memory:');
    createTradingSchema(db);
  });

  it('has correct name', () => {
    expect(adapter.name).toBe('trading-brain');
  });

  describe('mineObservations', () => {
    it('mines trade pair stats', () => {
      db.exec(`INSERT INTO trades (fingerprint, pair, win, profit) VALUES
        ('fp1', 'BTC/USD', 1, 100),
        ('fp2', 'BTC/USD', 0, -50),
        ('fp3', 'ETH/USD', 1, 200)`);

      const obs = adapter.mineObservations(db, 0);
      const btc = obs.find(o => o.event_type === 'trade:pair_stats' && (o.metrics as Record<string, unknown>).pair === 'BTC/USD');
      expect(btc).toBeDefined();
      expect(btc!.metrics.count).toBe(2);
      expect(btc!.metrics.wins).toBe(1);
      expect(btc!.metrics.win_rate).toBeCloseTo(0.5);
      expect(btc!.metrics.total_profit).toBe(50);
    });

    it('mines trade regime stats', () => {
      db.exec(`INSERT INTO trades (fingerprint, pair, win, regime) VALUES
        ('fp1', 'BTC/USD', 1, 'bull'),
        ('fp2', 'BTC/USD', 1, 'bull'),
        ('fp3', 'BTC/USD', 0, 'bear')`);

      const obs = adapter.mineObservations(db, 0);
      const bull = obs.find(o => o.event_type === 'trade:regime_stats' && (o.metrics as Record<string, unknown>).regime === 'bull');
      expect(bull).toBeDefined();
      expect(bull!.metrics.win_rate).toBeCloseTo(1.0);
    });

    it('mines rule confidence', () => {
      db.exec(`INSERT INTO rules (pattern, confidence, win_rate) VALUES ('momentum', 0.85, 0.7)`);

      const obs = adapter.mineObservations(db, 0);
      const rule = obs.find(o => o.event_type === 'rule:confidence');
      expect(rule).toBeDefined();
      expect(rule!.metrics.confidence).toBe(0.85);
    });

    it('mines chain streaks', () => {
      db.exec(`INSERT INTO chains (pair, type, length) VALUES ('BTC/USD', 'win', 5)`);

      const obs = adapter.mineObservations(db, 0);
      const chain = obs.find(o => o.event_type === 'chain:streak');
      expect(chain).toBeDefined();
      expect(chain!.metrics.length).toBe(5);
    });
  });

  describe('mineCausalEvents', () => {
    it('mines trades as causal events with win/loss type', () => {
      db.exec(`INSERT INTO trades (fingerprint, pair, win, profit, regime) VALUES
        ('fp1', 'BTC/USD', 1, 100, 'bull'),
        ('fp2', 'ETH/USD', 0, -50, 'bear')`);

      const events = adapter.mineCausalEvents(db, 0);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('trade:win');
      expect(events[1].type).toBe('trade:loss');
    });

    it('mines rule learning as causal events', () => {
      db.exec(`INSERT INTO rules (pattern, confidence) VALUES ('breakout', 0.9)`);

      const events = adapter.mineCausalEvents(db, 0);
      const rule = events.find(e => e.type === 'rule:learned');
      expect(rule).toBeDefined();
    });
  });

  describe('mineMetrics', () => {
    it('mines win rate', () => {
      db.exec(`INSERT INTO trades (fingerprint, pair, win) VALUES
        ('fp1', 'A', 1), ('fp2', 'A', 1), ('fp3', 'A', 0), ('fp4', 'A', 0)`);

      const metrics = adapter.mineMetrics(db, 0);
      const wr = metrics.find(m => m.name === 'win_rate');
      expect(wr).toBeDefined();
      expect(wr!.value).toBeCloseTo(0.5);
    });

    it('mines trade count', () => {
      db.exec(`INSERT INTO trades (fingerprint, pair, win) VALUES ('fp1', 'A', 1), ('fp2', 'B', 0)`);

      const metrics = adapter.mineMetrics(db, 0);
      const tc = metrics.find(m => m.name === 'trade_count');
      expect(tc).toBeDefined();
      expect(tc!.value).toBe(2);
    });

    it('mines calibration accuracy', () => {
      db.exec(`INSERT INTO calibration (overall_accuracy) VALUES (0.82)`);

      const metrics = adapter.mineMetrics(db, 0);
      const cal = metrics.find(m => m.name === 'calibration_accuracy');
      expect(cal).toBeDefined();
      expect(cal!.value).toBeCloseTo(0.82);
    });
  });

  describe('mineHypothesisObservations', () => {
    it('mines trade wins/losses per pair', () => {
      db.exec(`INSERT INTO trades (fingerprint, pair, win) VALUES
        ('fp1', 'BTC/USD', 1), ('fp2', 'BTC/USD', 1), ('fp3', 'BTC/USD', 0)`);

      const obs = adapter.mineHypothesisObservations(db, 0);
      const wins = obs.find(o => o.type === 'trade:win' && o.metadata?.pair === 'BTC/USD');
      expect(wins).toBeDefined();
      expect(wins!.value).toBe(2);
    });
  });

  describe('mineCrossDomainEvents', () => {
    it('mines trade batch summary', () => {
      db.exec(`INSERT INTO trades (fingerprint, pair, win, profit) VALUES
        ('fp1', 'A', 1, 100), ('fp2', 'A', 0, -50)`);

      const events = adapter.mineCrossDomainEvents(db, 0);
      expect(events).toHaveLength(1);
      expect(events[0].brain).toBe('trading-brain');
      expect(events[0].data!.count).toBe(2);
      expect(events[0].data!.win_rate).toBeCloseTo(0.5);
    });
  });

  describe('graceful handling of missing tables', () => {
    it('returns empty arrays when tables do not exist', () => {
      const emptyDb = new Database(':memory:');
      expect(adapter.mineObservations(emptyDb, 0)).toEqual([]);
      expect(adapter.mineCausalEvents(emptyDb, 0)).toEqual([]);
      expect(adapter.mineMetrics(emptyDb, 0)).toEqual([]);
      expect(adapter.mineHypothesisObservations(emptyDb, 0)).toEqual([]);
      expect(adapter.mineCrossDomainEvents(emptyDb, 0)).toEqual([]);
    });
  });
});
