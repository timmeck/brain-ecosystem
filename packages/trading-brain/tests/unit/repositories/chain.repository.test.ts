import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ChainRepository } from '../../../src/db/repositories/chain.repository.js';

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair TEXT NOT NULL,
      type TEXT NOT NULL,
      length INTEGER NOT NULL,
      fingerprints_json TEXT NOT NULL,
      total_profit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chains_pair ON chains(pair);
    CREATE INDEX IF NOT EXISTS idx_chains_type ON chains(type);
  `);
}

describe('ChainRepository', () => {
  let db: Database.Database;
  let repo: ChainRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    repo = new ChainRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should insert a chain and return the row id', () => {
      const id = repo.create({
        pair: 'BTC/USDT',
        type: 'winning_streak',
        length: 3,
        fingerprints: ['fp1', 'fp2', 'fp3'],
        total_profit: 5.5,
      });

      expect(id).toBe(1);
    });

    it('should serialize fingerprints as JSON', () => {
      const id = repo.create({
        pair: 'ETH/USDT',
        type: 'losing_streak',
        length: 4,
        fingerprints: ['a', 'b', 'c', 'd'],
        total_profit: -3.2,
      });

      const row = db.prepare('SELECT * FROM chains WHERE id = ?').get(id) as any;
      expect(JSON.parse(row.fingerprints_json)).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('getAll', () => {
    it('should return all chains ordered by created_at DESC', () => {
      db.exec(`INSERT INTO chains (pair, type, length, fingerprints_json, total_profit, created_at) VALUES ('BTC/USDT', 'winning_streak', 3, '["a"]', 3.0, '2026-01-01 00:00:00')`);
      db.exec(`INSERT INTO chains (pair, type, length, fingerprints_json, total_profit, created_at) VALUES ('ETH/USDT', 'losing_streak', 3, '["b"]', -2.0, '2026-01-02 00:00:00')`);

      const all = repo.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].pair).toBe('ETH/USDT');
      expect(all[1].pair).toBe('BTC/USDT');
    });
  });

  describe('getRecent', () => {
    it('should respect the limit', () => {
      for (let i = 0; i < 5; i++) {
        repo.create({ pair: 'BTC/USDT', type: 'winning_streak', length: 3, fingerprints: ['fp'], total_profit: 1 });
      }

      const recent = repo.getRecent(3);
      expect(recent).toHaveLength(3);
    });

    it('should default to 10', () => {
      for (let i = 0; i < 15; i++) {
        repo.create({ pair: 'BTC/USDT', type: 'winning_streak', length: 3, fingerprints: ['fp'], total_profit: 1 });
      }

      const recent = repo.getRecent();
      expect(recent).toHaveLength(10);
    });
  });

  describe('getByPair', () => {
    it('should filter chains by pair', () => {
      repo.create({ pair: 'BTC/USDT', type: 'winning_streak', length: 3, fingerprints: ['a'], total_profit: 3 });
      repo.create({ pair: 'ETH/USDT', type: 'losing_streak', length: 3, fingerprints: ['b'], total_profit: -2 });
      repo.create({ pair: 'BTC/USDT', type: 'losing_streak', length: 4, fingerprints: ['c'], total_profit: -5 });

      const btcChains = repo.getByPair('BTC/USDT');
      expect(btcChains).toHaveLength(2);
      expect(btcChains.every(c => c.pair === 'BTC/USDT')).toBe(true);
    });

    it('should return empty array for unknown pair', () => {
      expect(repo.getByPair('DOGE/USDT')).toHaveLength(0);
    });
  });

  describe('getByType', () => {
    it('should filter chains by type', () => {
      repo.create({ pair: 'BTC/USDT', type: 'winning_streak', length: 3, fingerprints: ['a'], total_profit: 3 });
      repo.create({ pair: 'ETH/USDT', type: 'losing_streak', length: 3, fingerprints: ['b'], total_profit: -2 });

      const winning = repo.getByType('winning_streak');
      expect(winning).toHaveLength(1);
      expect(winning[0].type).toBe('winning_streak');
    });
  });

  describe('count', () => {
    it('should return 0 when empty', () => {
      expect(repo.count()).toBe(0);
    });

    it('should return correct count', () => {
      repo.create({ pair: 'BTC/USDT', type: 'winning_streak', length: 3, fingerprints: ['a'], total_profit: 1 });
      repo.create({ pair: 'ETH/USDT', type: 'losing_streak', length: 3, fingerprints: ['b'], total_profit: -1 });
      expect(repo.count()).toBe(2);
    });
  });

  describe('pruneOldest', () => {
    it('should remove excess chains keeping only keepCount', () => {
      for (let i = 0; i < 5; i++) {
        db.exec(`INSERT INTO chains (pair, type, length, fingerprints_json, total_profit, created_at) VALUES ('BTC/USDT', 'winning_streak', 3, '["fp"]', 1, '2026-01-0${i + 1} 00:00:00')`);
      }

      expect(repo.count()).toBe(5);
      repo.pruneOldest(3);
      expect(repo.count()).toBe(3);

      // Should have kept the 3 most recent
      const remaining = repo.getAll();
      const dates = remaining.map(c => c.created_at);
      expect(dates).toContain('2026-01-05 00:00:00');
      expect(dates).toContain('2026-01-04 00:00:00');
      expect(dates).toContain('2026-01-03 00:00:00');
    });

    it('should do nothing when count <= keepCount', () => {
      repo.create({ pair: 'BTC/USDT', type: 'winning_streak', length: 3, fingerprints: ['a'], total_profit: 1 });

      repo.pruneOldest(10);
      expect(repo.count()).toBe(1);
    });
  });
});
