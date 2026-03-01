import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TradeRepository } from '../../../src/db/repositories/trade.repository.js';

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      pair TEXT NOT NULL,
      bot_type TEXT NOT NULL,
      regime TEXT,
      profit_pct REAL NOT NULL,
      win INTEGER NOT NULL DEFAULT 0,
      signals_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_trades_fingerprint ON trades(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_trades_pair ON trades(pair);
    CREATE INDEX IF NOT EXISTS idx_trades_bot_type ON trades(bot_type);
    CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
    CREATE INDEX IF NOT EXISTS idx_trades_win ON trades(win);
  `);
}

describe('TradeRepository', () => {
  let db: Database.Database;
  let repo: TradeRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    repo = new TradeRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should insert a trade and return the row id', () => {
      const id = repo.create({
        fingerprint: 'neutral|neutral|flat|low',
        pair: 'BTC/USDT',
        bot_type: 'dca',
        profit_pct: 2.5,
        win: true,
      });

      expect(id).toBe(1);
    });

    it('should store all fields correctly', () => {
      const id = repo.create({
        fingerprint: 'oversold|bullish|up|medium',
        pair: 'ETH/USDT',
        bot_type: 'grid',
        regime: 'bull',
        profit_pct: -1.2,
        win: false,
        signals_json: '{"rsi14":28}',
      });

      const trade = repo.getById(id);
      expect(trade).toBeDefined();
      expect(trade!.fingerprint).toBe('oversold|bullish|up|medium');
      expect(trade!.pair).toBe('ETH/USDT');
      expect(trade!.bot_type).toBe('grid');
      expect(trade!.regime).toBe('bull');
      expect(trade!.profit_pct).toBeCloseTo(-1.2);
      expect(trade!.win).toBe(0);
      expect(trade!.signals_json).toBe('{"rsi14":28}');
    });

    it('should convert win boolean true to 1 and false to 0', () => {
      const winId = repo.create({ fingerprint: 'a', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: 1, win: true });
      const lossId = repo.create({ fingerprint: 'b', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: -1, win: false });

      expect(repo.getById(winId)!.win).toBe(1);
      expect(repo.getById(lossId)!.win).toBe(0);
    });
  });

  describe('getById', () => {
    it('should return undefined for non-existent id', () => {
      const result = repo.getById(999);
      expect(result).toBeUndefined();
    });

    it('should return the correct trade by id', () => {
      const id = repo.create({ fingerprint: 'fp1', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: 1.0, win: true });
      const trade = repo.getById(id);
      expect(trade).toBeDefined();
      expect(trade!.id).toBe(id);
    });
  });

  describe('count', () => {
    it('should return 0 for empty table', () => {
      expect(repo.count()).toBe(0);
    });

    it('should return the correct count after inserts', () => {
      repo.create({ fingerprint: 'a', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: 1, win: true });
      repo.create({ fingerprint: 'b', pair: 'ETH/USDT', bot_type: 'grid', profit_pct: -1, win: false });
      expect(repo.count()).toBe(2);
    });
  });

  describe('getRecent', () => {
    it('should return trades ordered by created_at DESC with limit', () => {
      // Insert with explicit timestamps to control order
      db.exec(`INSERT INTO trades (fingerprint, pair, bot_type, profit_pct, win, created_at) VALUES ('a', 'BTC/USDT', 'dca', 1, 1, '2026-01-01 00:00:00')`);
      db.exec(`INSERT INTO trades (fingerprint, pair, bot_type, profit_pct, win, created_at) VALUES ('b', 'BTC/USDT', 'dca', 2, 1, '2026-01-02 00:00:00')`);
      db.exec(`INSERT INTO trades (fingerprint, pair, bot_type, profit_pct, win, created_at) VALUES ('c', 'BTC/USDT', 'dca', 3, 1, '2026-01-03 00:00:00')`);

      const recent = repo.getRecent(2);
      expect(recent).toHaveLength(2);
      expect(recent[0].fingerprint).toBe('c');
      expect(recent[1].fingerprint).toBe('b');
    });

    it('should default to 10 results', () => {
      for (let i = 0; i < 15; i++) {
        repo.create({ fingerprint: `fp${i}`, pair: 'BTC/USDT', bot_type: 'dca', profit_pct: i, win: true });
      }
      const recent = repo.getRecent();
      expect(recent).toHaveLength(10);
    });
  });

  describe('getByPair', () => {
    it('should filter trades by pair', () => {
      repo.create({ fingerprint: 'a', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: 1, win: true });
      repo.create({ fingerprint: 'b', pair: 'ETH/USDT', bot_type: 'dca', profit_pct: 2, win: true });
      repo.create({ fingerprint: 'c', pair: 'BTC/USDT', bot_type: 'grid', profit_pct: 3, win: false });

      const btcTrades = repo.getByPair('BTC/USDT');
      expect(btcTrades).toHaveLength(2);
      expect(btcTrades.every(t => t.pair === 'BTC/USDT')).toBe(true);
    });

    it('should return empty array for unknown pair', () => {
      const result = repo.getByPair('DOGE/USDT');
      expect(result).toHaveLength(0);
    });
  });

  describe('getByFingerprint', () => {
    it('should filter trades by fingerprint', () => {
      repo.create({ fingerprint: 'neutral|neutral|flat|low', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: 1, win: true });
      repo.create({ fingerprint: 'neutral|neutral|flat|low', pair: 'ETH/USDT', bot_type: 'dca', profit_pct: 2, win: false });
      repo.create({ fingerprint: 'oversold|bullish|up|medium', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: 3, win: true });

      const result = repo.getByFingerprint('neutral|neutral|flat|low');
      expect(result).toHaveLength(2);
    });
  });

  describe('getByBotType', () => {
    it('should filter trades by bot type', () => {
      repo.create({ fingerprint: 'a', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: 1, win: true });
      repo.create({ fingerprint: 'b', pair: 'BTC/USDT', bot_type: 'grid', profit_pct: 2, win: true });

      const dcaTrades = repo.getByBotType('dca');
      expect(dcaTrades).toHaveLength(1);
      expect(dcaTrades[0].bot_type).toBe('dca');
    });
  });

  describe('search', () => {
    it('should search across fingerprint, pair, and bot_type', () => {
      repo.create({ fingerprint: 'oversold|bullish|up|medium', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: 1, win: true });
      repo.create({ fingerprint: 'neutral|neutral|flat|low', pair: 'ETH/USDT', bot_type: 'grid', profit_pct: 2, win: false });

      const byPair = repo.search('BTC');
      expect(byPair).toHaveLength(1);

      const byBot = repo.search('grid');
      expect(byBot).toHaveLength(1);

      const byFp = repo.search('oversold');
      expect(byFp).toHaveLength(1);
    });

    it('should respect the limit parameter', () => {
      for (let i = 0; i < 10; i++) {
        repo.create({ fingerprint: 'same', pair: 'BTC/USDT', bot_type: 'dca', profit_pct: i, win: true });
      }
      const result = repo.search('same', 3);
      expect(result).toHaveLength(3);
    });
  });

  describe('getSince', () => {
    it('should return trades created after the given date', () => {
      db.exec(`INSERT INTO trades (fingerprint, pair, bot_type, profit_pct, win, created_at) VALUES ('old', 'BTC/USDT', 'dca', 1, 1, '2025-01-01 00:00:00')`);
      db.exec(`INSERT INTO trades (fingerprint, pair, bot_type, profit_pct, win, created_at) VALUES ('new', 'BTC/USDT', 'dca', 2, 1, '2026-06-01 00:00:00')`);

      const result = repo.getSince('2026-01-01 00:00:00');
      expect(result).toHaveLength(1);
      expect(result[0].fingerprint).toBe('new');
    });
  });
});
