import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SignalRepository } from '../../../src/db/repositories/signal.repository.js';

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_combos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      signals_json TEXT NOT NULL,
      regime TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_combos_fingerprint ON signal_combos(fingerprint);
  `);
}

describe('SignalRepository', () => {
  let db: Database.Database;
  let repo: SignalRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    repo = new SignalRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should insert a signal combo and return the row id', () => {
      const id = repo.create('neutral|neutral|flat|low', '{"rsi14":50}');
      expect(id).toBe(1);
    });

    it('should store regime when provided', () => {
      const id = repo.create('oversold|bullish|up|medium', '{"rsi14":28}', 'bull');

      const rows = db.prepare('SELECT * FROM signal_combos WHERE id = ?').all(id) as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].regime).toBe('bull');
    });

    it('should store null regime when not provided', () => {
      const id = repo.create('neutral|neutral|flat|low', '{"rsi14":50}');

      const rows = db.prepare('SELECT * FROM signal_combos WHERE id = ?').all(id) as any[];
      expect(rows[0].regime).toBeNull();
    });
  });

  describe('getByFingerprint', () => {
    it('should return combos matching the fingerprint', () => {
      repo.create('fp_a', '{"a":1}');
      repo.create('fp_a', '{"a":2}');
      repo.create('fp_b', '{"b":1}');

      const result = repo.getByFingerprint('fp_a');
      expect(result).toHaveLength(2);
      expect(result.every(r => r.fingerprint === 'fp_a')).toBe(true);
    });

    it('should return empty array for unknown fingerprint', () => {
      const result = repo.getByFingerprint('nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  describe('getAll', () => {
    it('should return all signal combos ordered by created_at DESC', () => {
      db.exec(`INSERT INTO signal_combos (fingerprint, signals_json, created_at) VALUES ('a', '{}', '2026-01-01 00:00:00')`);
      db.exec(`INSERT INTO signal_combos (fingerprint, signals_json, created_at) VALUES ('b', '{}', '2026-01-02 00:00:00')`);

      const all = repo.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].fingerprint).toBe('b');
      expect(all[1].fingerprint).toBe('a');
    });

    it('should return empty array when no combos exist', () => {
      expect(repo.getAll()).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('should return 0 for empty table', () => {
      expect(repo.count()).toBe(0);
    });

    it('should return the correct count', () => {
      repo.create('a', '{}');
      repo.create('b', '{}');
      repo.create('c', '{}');
      expect(repo.count()).toBe(3);
    });
  });

  describe('signals_json storage', () => {
    it('should preserve complex signals JSON', () => {
      const json = '{"rsi14":25,"macd":1.5,"trendScore":2,"volatility":45}';
      const id = repo.create('fp', json, 'bull');

      const combos = repo.getByFingerprint('fp');
      expect(combos).toHaveLength(1);
      expect(combos[0].signals_json).toBe(json);
    });
  });
});
