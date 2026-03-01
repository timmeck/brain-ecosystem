import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SynapseRepository } from '../../../src/db/repositories/synapse.repository.js';

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS synapses (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      activations INTEGER NOT NULL DEFAULT 0,
      total_profit REAL NOT NULL DEFAULT 0,
      last_activated TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_synapses_fingerprint ON synapses(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_synapses_weight ON synapses(weight);
  `);
}

describe('SynapseRepository', () => {
  let db: Database.Database;
  let repo: SynapseRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    repo = new SynapseRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  const makeSynapse = (overrides: Partial<{ id: string; fingerprint: string; weight: number; wins: number; losses: number; activations: number; total_profit: number; last_activated: string }> = {}) => ({
    id: 'syn_neutral|neutral|flat|low',
    fingerprint: 'neutral|neutral|flat|low',
    weight: 0.5,
    wins: 0,
    losses: 0,
    activations: 0,
    total_profit: 0,
    last_activated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  describe('upsert', () => {
    it('should insert a new synapse', () => {
      repo.upsert(makeSynapse());

      const result = repo.getById('syn_neutral|neutral|flat|low');
      expect(result).toBeDefined();
      expect(result!.weight).toBeCloseTo(0.5);
    });

    it('should update an existing synapse on conflict', () => {
      repo.upsert(makeSynapse({ weight: 0.5 }));
      repo.upsert(makeSynapse({ weight: 0.8, wins: 5 }));

      const result = repo.getById('syn_neutral|neutral|flat|low');
      expect(result!.weight).toBeCloseTo(0.8);
      expect(result!.wins).toBe(5);
    });
  });

  describe('getById', () => {
    it('should return undefined for non-existent id', () => {
      expect(repo.getById('nonexistent')).toBeUndefined();
    });

    it('should return the correct synapse', () => {
      repo.upsert(makeSynapse({ id: 'syn_a', fingerprint: 'a' }));
      const result = repo.getById('syn_a');
      expect(result).toBeDefined();
      expect(result!.fingerprint).toBe('a');
    });
  });

  describe('getAll', () => {
    it('should return all synapses ordered by weight DESC', () => {
      repo.upsert(makeSynapse({ id: 'low', fingerprint: 'low', weight: 0.2 }));
      repo.upsert(makeSynapse({ id: 'high', fingerprint: 'high', weight: 0.9 }));
      repo.upsert(makeSynapse({ id: 'mid', fingerprint: 'mid', weight: 0.5 }));

      const all = repo.getAll();
      expect(all).toHaveLength(3);
      expect(all[0].id).toBe('high');
      expect(all[1].id).toBe('mid');
      expect(all[2].id).toBe('low');
    });
  });

  describe('count', () => {
    it('should return 0 when empty', () => {
      expect(repo.count()).toBe(0);
    });

    it('should return correct count', () => {
      repo.upsert(makeSynapse({ id: 'a', fingerprint: 'a' }));
      repo.upsert(makeSynapse({ id: 'b', fingerprint: 'b' }));
      expect(repo.count()).toBe(2);
    });
  });

  describe('updateWeight', () => {
    it('should update the weight of an existing synapse', () => {
      repo.upsert(makeSynapse({ weight: 0.5 }));
      repo.updateWeight('syn_neutral|neutral|flat|low', 0.85);

      const result = repo.getById('syn_neutral|neutral|flat|low');
      expect(result!.weight).toBeCloseTo(0.85);
    });
  });

  describe('delete', () => {
    it('should remove a synapse by id', () => {
      repo.upsert(makeSynapse());
      expect(repo.count()).toBe(1);

      repo.delete('syn_neutral|neutral|flat|low');
      expect(repo.count()).toBe(0);
    });
  });

  describe('getByMinWeight', () => {
    it('should return synapses with weight >= threshold', () => {
      repo.upsert(makeSynapse({ id: 'weak', fingerprint: 'weak', weight: 0.2 }));
      repo.upsert(makeSynapse({ id: 'strong', fingerprint: 'strong', weight: 0.8 }));
      repo.upsert(makeSynapse({ id: 'mid', fingerprint: 'mid', weight: 0.5 }));

      const result = repo.getByMinWeight(0.5);
      expect(result).toHaveLength(2);
      expect(result.every(s => s.weight >= 0.5)).toBe(true);
    });
  });

  describe('getStrongest', () => {
    it('should return top N synapses by weight', () => {
      for (let i = 0; i < 5; i++) {
        repo.upsert(makeSynapse({ id: `s${i}`, fingerprint: `fp${i}`, weight: i * 0.2 }));
      }

      const strongest = repo.getStrongest(3);
      expect(strongest).toHaveLength(3);
      expect(strongest[0].weight).toBeCloseTo(0.8);
      expect(strongest[1].weight).toBeCloseTo(0.6);
      expect(strongest[2].weight).toBeCloseTo(0.4);
    });

    it('should default to 20', () => {
      for (let i = 0; i < 25; i++) {
        repo.upsert(makeSynapse({ id: `s${i}`, fingerprint: `fp${i}`, weight: 0.5 }));
      }

      const strongest = repo.getStrongest();
      expect(strongest).toHaveLength(20);
    });
  });
});
