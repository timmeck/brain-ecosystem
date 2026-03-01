import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { RuleRepository } from '../../../src/db/repositories/rule.repository.js';

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      confidence REAL NOT NULL,
      sample_count INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      avg_profit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_rules_pattern ON rules(pattern);
    CREATE INDEX IF NOT EXISTS idx_rules_confidence ON rules(confidence);
  `);
}

describe('RuleRepository', () => {
  let db: Database.Database;
  let repo: RuleRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    repo = new RuleRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should insert a rule and return the row id', () => {
      const id = repo.create({
        pattern: 'oversold|bullish|up|medium',
        confidence: 0.72,
        sample_count: 15,
        win_rate: 0.8,
        avg_profit: 2.3,
      });

      expect(id).toBe(1);
    });

    it('should store all fields correctly', () => {
      const id = repo.create({
        pattern: 'neutral|neutral|flat|low',
        confidence: 0.55,
        sample_count: 10,
        win_rate: 0.6,
        avg_profit: 1.1,
      });

      const rule = repo.getById(id);
      expect(rule).toBeDefined();
      expect(rule!.pattern).toBe('neutral|neutral|flat|low');
      expect(rule!.confidence).toBeCloseTo(0.55);
      expect(rule!.sample_count).toBe(10);
      expect(rule!.win_rate).toBeCloseTo(0.6);
      expect(rule!.avg_profit).toBeCloseTo(1.1);
    });
  });

  describe('getById', () => {
    it('should return undefined for non-existent id', () => {
      expect(repo.getById(999)).toBeUndefined();
    });

    it('should return the correct rule', () => {
      const id = repo.create({ pattern: 'p1', confidence: 0.5, sample_count: 5, win_rate: 0.5, avg_profit: 0 });
      const rule = repo.getById(id);
      expect(rule).toBeDefined();
      expect(rule!.id).toBe(id);
    });
  });

  describe('getAll', () => {
    it('should return rules ordered by confidence DESC', () => {
      repo.create({ pattern: 'low', confidence: 0.3, sample_count: 5, win_rate: 0.4, avg_profit: -0.5 });
      repo.create({ pattern: 'high', confidence: 0.9, sample_count: 20, win_rate: 0.85, avg_profit: 3.0 });
      repo.create({ pattern: 'mid', confidence: 0.6, sample_count: 10, win_rate: 0.65, avg_profit: 1.5 });

      const all = repo.getAll();
      expect(all).toHaveLength(3);
      expect(all[0].pattern).toBe('high');
      expect(all[1].pattern).toBe('mid');
      expect(all[2].pattern).toBe('low');
    });

    it('should return empty array when no rules exist', () => {
      expect(repo.getAll()).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('should return 0 for empty table', () => {
      expect(repo.count()).toBe(0);
    });

    it('should return correct count', () => {
      repo.create({ pattern: 'a', confidence: 0.5, sample_count: 5, win_rate: 0.5, avg_profit: 0 });
      repo.create({ pattern: 'b', confidence: 0.6, sample_count: 8, win_rate: 0.6, avg_profit: 1 });
      expect(repo.count()).toBe(2);
    });
  });

  describe('delete', () => {
    it('should delete a rule by id', () => {
      const id = repo.create({ pattern: 'del', confidence: 0.5, sample_count: 5, win_rate: 0.5, avg_profit: 0 });
      expect(repo.getById(id)).toBeDefined();

      repo.delete(id);
      expect(repo.getById(id)).toBeUndefined();
    });
  });

  describe('deleteAll', () => {
    it('should remove all rules', () => {
      repo.create({ pattern: 'a', confidence: 0.5, sample_count: 5, win_rate: 0.5, avg_profit: 0 });
      repo.create({ pattern: 'b', confidence: 0.6, sample_count: 8, win_rate: 0.6, avg_profit: 1 });
      expect(repo.count()).toBe(2);

      repo.deleteAll();
      expect(repo.count()).toBe(0);
    });
  });

  describe('replaceAll', () => {
    it('should atomically replace all rules', () => {
      repo.create({ pattern: 'old1', confidence: 0.3, sample_count: 5, win_rate: 0.4, avg_profit: -0.5 });
      repo.create({ pattern: 'old2', confidence: 0.4, sample_count: 6, win_rate: 0.5, avg_profit: 0 });

      const newRules = [
        { pattern: 'new1', confidence: 0.8, sample_count: 20, win_rate: 0.75, avg_profit: 2.5 },
        { pattern: 'new2', confidence: 0.7, sample_count: 15, win_rate: 0.7, avg_profit: 1.8 },
        { pattern: 'new3', confidence: 0.6, sample_count: 10, win_rate: 0.65, avg_profit: 1.0 },
      ];

      repo.replaceAll(newRules);

      expect(repo.count()).toBe(3);
      const all = repo.getAll();
      expect(all[0].pattern).toBe('new1');
      expect(all[1].pattern).toBe('new2');
      expect(all[2].pattern).toBe('new3');
    });

    it('should handle empty replacement list', () => {
      repo.create({ pattern: 'a', confidence: 0.5, sample_count: 5, win_rate: 0.5, avg_profit: 0 });
      repo.replaceAll([]);
      expect(repo.count()).toBe(0);
    });
  });
});
