import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { RuleRepository } from '../../../src/db/repositories/rule.repository.js';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      path TEXT,
      language TEXT,
      framework TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      occurrences INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      project_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX idx_rules_pattern ON rules(pattern);
    CREATE INDEX idx_rules_active ON rules(active);
    INSERT INTO projects (name) VALUES ('project-alpha');
    INSERT INTO projects (name) VALUES ('project-beta');
  `);
  return db;
}

describe('RuleRepository', () => {
  let db: Database.Database;
  let repo: RuleRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new RuleRepository(db);
  });

  it('creates a rule and retrieves it by id', () => {
    const id = repo.create({
      pattern: 'TypeError.*undefined',
      action: 'Check null values before access',
      description: 'Prevents null pointer errors',
      project_id: 1,
    });
    expect(id).toBe(1);

    const rule = repo.getById(id);
    expect(rule).toBeDefined();
    expect(rule!.pattern).toBe('TypeError.*undefined');
    expect(rule!.confidence).toBe(0.5);
    expect(rule!.active).toBe(1);
  });

  it('creates a rule with custom confidence and occurrences', () => {
    const id = repo.create({
      pattern: 'SyntaxError.*unexpected',
      action: 'Run linter',
      description: null,
      confidence: 0.9,
      occurrences: 15,
      project_id: null,
    });

    const rule = repo.getById(id);
    expect(rule!.confidence).toBe(0.9);
    expect(rule!.occurrences).toBe(15);
  });

  it('updates a rule', () => {
    const id = repo.create({
      pattern: 'Error.*pattern',
      action: 'old action',
      description: 'old desc',
      project_id: 1,
    });

    repo.update(id, { confidence: 0.85, action: 'new action' });
    const updated = repo.getById(id);
    expect(updated!.confidence).toBe(0.85);
    expect(updated!.action).toBe('new action');
    expect(updated!.description).toBe('old desc'); // unchanged
  });

  it('deletes a rule', () => {
    const id = repo.create({
      pattern: 'delete-me',
      action: 'action',
      description: null,
      project_id: null,
    });
    expect(repo.getById(id)).toBeDefined();
    repo.delete(id);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('findActive returns only active rules', () => {
    repo.create({ pattern: 'active-1', action: 'a1', description: null, project_id: null, confidence: 0.8 });
    repo.create({ pattern: 'active-2', action: 'a2', description: null, project_id: null, confidence: 0.6 });
    const inactiveId = repo.create({ pattern: 'inactive', action: 'a3', description: null, project_id: null, active: 0 });

    const active = repo.findActive();
    expect(active).toHaveLength(2);
    // Verify they are sorted by confidence DESC
    expect(active[0]!.confidence).toBeGreaterThanOrEqual(active[1]!.confidence);

    // The inactive rule should not appear
    expect(active.find(r => r.id === inactiveId)).toBeUndefined();
  });

  it('findActive by project includes project-specific and global rules', () => {
    repo.create({ pattern: 'proj1-rule', action: 'a', description: null, project_id: 1 });
    repo.create({ pattern: 'global-rule', action: 'b', description: null, project_id: null });
    repo.create({ pattern: 'proj2-rule', action: 'c', description: null, project_id: 2 });

    const forProject1 = repo.findActive(1);
    // Should include proj1-rule and global-rule (project_id IS NULL)
    expect(forProject1).toHaveLength(2);
    const patterns = forProject1.map(r => r.pattern);
    expect(patterns).toContain('proj1-rule');
    expect(patterns).toContain('global-rule');
  });

  it('findByPattern returns rules matching an exact pattern', () => {
    repo.create({ pattern: 'TypeError.*missing', action: 'fix', description: null, project_id: null });
    repo.create({ pattern: 'TypeError.*missing', action: 'fix2', description: null, project_id: 1 });
    repo.create({ pattern: 'SyntaxError', action: 'lint', description: null, project_id: null });

    const matches = repo.findByPattern('TypeError.*missing');
    expect(matches).toHaveLength(2);
  });

  it('findByPattern returns empty array for unknown pattern', () => {
    const matches = repo.findByPattern('NonExistent.*pattern');
    expect(matches).toHaveLength(0);
  });

  it('returns undefined for non-existent id', () => {
    expect(repo.getById(9999)).toBeUndefined();
  });

  it('deactivates a rule via update', () => {
    const id = repo.create({
      pattern: 'deactivate-me',
      action: 'action',
      description: null,
      project_id: null,
    });
    expect(repo.getById(id)!.active).toBe(1);

    repo.update(id, { active: 0 });
    expect(repo.getById(id)!.active).toBe(0);

    // Should no longer appear in findActive
    const active = repo.findActive();
    expect(active.find(r => r.id === id)).toBeUndefined();
  });
});
