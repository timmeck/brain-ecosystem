import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { RuleRepository } from '../../../src/db/repositories/rule.repository.js';

function applyMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      trigger_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rules_active ON marketing_rules(active);
    CREATE INDEX IF NOT EXISTS idx_rules_confidence ON marketing_rules(confidence);
  `);
}

describe('RuleRepository', () => {
  let db: Database.Database;
  let repo: RuleRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new RuleRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a rule and return its id', () => {
    const id = repo.create({ pattern: 'best_time_10h', recommendation: 'Post at 10am' });
    expect(id).toBe(1);
  });

  it('should retrieve a rule by id', () => {
    const id = repo.create({ pattern: 'best_format_video', recommendation: 'Use video content', confidence: 0.8 });
    const rule = repo.getById(id);
    expect(rule).toBeDefined();
    expect(rule!.pattern).toBe('best_format_video');
    expect(rule!.recommendation).toBe('Use video content');
    expect(rule!.confidence).toBe(0.8);
    expect(rule!.trigger_count).toBe(0);
    expect(rule!.success_count).toBe(0);
    expect(rule!.active).toBe(1);
  });

  it('should return undefined for non-existent rule id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('should list all rules ordered by confidence', () => {
    repo.create({ pattern: 'low', recommendation: 'Low confidence', confidence: 0.3 });
    repo.create({ pattern: 'high', recommendation: 'High confidence', confidence: 0.9 });

    const all = repo.listAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.confidence).toBeGreaterThanOrEqual(all[1]!.confidence);
  });

  it('should list only active rules', () => {
    const id1 = repo.create({ pattern: 'active_rule', recommendation: 'Active' });
    const id2 = repo.create({ pattern: 'inactive_rule', recommendation: 'Inactive' });
    repo.update(id2, { active: 0 });

    const active = repo.listActive();
    expect(active).toHaveLength(1);
    expect(active[0]!.pattern).toBe('active_rule');
  });

  it('should update a rule', () => {
    const id = repo.create({ pattern: 'test', recommendation: 'Original' });
    const updated = repo.update(id, { recommendation: 'Updated', confidence: 0.9 });
    expect(updated).toBe(true);

    const rule = repo.getById(id);
    expect(rule!.recommendation).toBe('Updated');
    expect(rule!.confidence).toBe(0.9);
  });

  it('should return false when updating with empty data', () => {
    const id = repo.create({ pattern: 'test', recommendation: 'Test' });
    expect(repo.update(id, {})).toBe(false);
  });

  it('should increment trigger count with success', () => {
    const id = repo.create({ pattern: 'test', recommendation: 'Test' });
    repo.incrementTrigger(id, true);
    repo.incrementTrigger(id, true);
    repo.incrementTrigger(id, false);

    const rule = repo.getById(id);
    expect(rule!.trigger_count).toBe(3);
    expect(rule!.success_count).toBe(2);
  });

  it('should do nothing when incrementing trigger for non-existent rule', () => {
    // Should not throw
    repo.incrementTrigger(999, true);
  });

  it('should count all rules', () => {
    expect(repo.countAll()).toBe(0);
    repo.create({ pattern: 'a', recommendation: 'A' });
    repo.create({ pattern: 'b', recommendation: 'B' });
    expect(repo.countAll()).toBe(2);
  });

  it('should count active rules', () => {
    const id1 = repo.create({ pattern: 'a', recommendation: 'A' });
    const id2 = repo.create({ pattern: 'b', recommendation: 'B' });
    repo.update(id2, { active: 0 });

    expect(repo.countActive()).toBe(1);
  });

  it('should delete a rule', () => {
    const id = repo.create({ pattern: 'to_delete', recommendation: 'Delete me' });
    expect(repo.delete(id)).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('should return false when deleting non-existent rule', () => {
    expect(repo.delete(999)).toBe(false);
  });
});
