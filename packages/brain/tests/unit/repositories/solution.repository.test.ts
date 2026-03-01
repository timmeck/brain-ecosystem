import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SolutionRepository } from '../../../src/db/repositories/solution.repository.js';

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
    CREATE TABLE errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      terminal_id INTEGER,
      fingerprint TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      raw_output TEXT NOT NULL,
      context TEXT,
      file_path TEXT,
      line_number INTEGER,
      column_number INTEGER,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      commands TEXT,
      code_change TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL NOT NULL DEFAULT 0.5,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE error_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_id INTEGER NOT NULL,
      solution_id INTEGER NOT NULL,
      applied_at TEXT,
      success INTEGER,
      FOREIGN KEY (error_id) REFERENCES errors(id) ON DELETE CASCADE,
      FOREIGN KEY (solution_id) REFERENCES solutions(id) ON DELETE CASCADE,
      UNIQUE(error_id, solution_id)
    );
    CREATE TABLE solution_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_solution_id INTEGER NOT NULL,
      terminal_id INTEGER,
      attempted_at TEXT NOT NULL DEFAULT (datetime('now')),
      success INTEGER NOT NULL DEFAULT 0,
      output TEXT,
      duration_ms INTEGER,
      FOREIGN KEY (error_solution_id) REFERENCES error_solutions(id) ON DELETE CASCADE
    );
    CREATE VIRTUAL TABLE solutions_fts USING fts5(
      description, commands, code_change,
      content='solutions',
      content_rowid='id'
    );
    CREATE TRIGGER solutions_ai AFTER INSERT ON solutions BEGIN
      INSERT INTO solutions_fts(rowid, description, commands, code_change)
      VALUES (new.id, new.description, new.commands, new.code_change);
    END;
    INSERT INTO projects (name) VALUES ('test-project');
    INSERT INTO errors (project_id, fingerprint, type, message, raw_output)
    VALUES (1, 'fp-001', 'TypeError', 'test error', 'TypeError: test error');
  `);
  return db;
}

describe('SolutionRepository', () => {
  let db: Database.Database;
  let repo: SolutionRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SolutionRepository(db);
  });

  it('creates a solution and retrieves it by id', () => {
    const id = repo.create({
      description: 'Install missing dependency',
      commands: 'npm install lodash',
      code_change: null,
      source: 'manual',
      confidence: 0.8,
    });
    expect(id).toBe(1);

    const record = repo.getById(id);
    expect(record).toBeDefined();
    expect(record!.description).toBe('Install missing dependency');
    expect(record!.confidence).toBe(0.8);
    expect(record!.success_count).toBe(0);
    expect(record!.fail_count).toBe(0);
  });

  it('updates a solution', () => {
    const id = repo.create({
      description: 'Fix import path',
      commands: null,
      code_change: "import x from './correct'",
      source: 'ai',
      confidence: 0.5,
    });

    repo.update(id, { confidence: 0.9, description: 'Fix import path (verified)' });
    const updated = repo.getById(id);
    expect(updated!.confidence).toBe(0.9);
    expect(updated!.description).toBe('Fix import path (verified)');
  });

  it('deletes a solution', () => {
    const id = repo.create({
      description: 'Delete me',
      commands: null,
      code_change: null,
      source: 'manual',
      confidence: 0.5,
    });
    expect(repo.getById(id)).toBeDefined();
    repo.delete(id);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('links a solution to an error and finds solutions for error', () => {
    const solId = repo.create({
      description: 'Solution A',
      commands: null,
      code_change: null,
      source: 'manual',
      confidence: 0.7,
    });

    repo.linkToError(1, solId);

    const found = repo.findForError(1);
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe(solId);
  });

  it('returns empty array for error with no solutions', () => {
    const found = repo.findForError(999);
    expect(found).toHaveLength(0);
  });

  it('getAll returns all solutions', () => {
    repo.create({ description: 'Sol 1', commands: null, code_change: null, source: 'manual', confidence: 0.5 });
    repo.create({ description: 'Sol 2', commands: null, code_change: null, source: 'ai', confidence: 0.8 });
    repo.create({ description: 'Sol 3', commands: null, code_change: null, source: 'manual', confidence: 0.3 });

    const all = repo.getAll();
    expect(all).toHaveLength(3);
  });

  it('records solution attempts and computes success rate', () => {
    const solId = repo.create({
      description: 'Fix config',
      commands: 'cp config.sample config.json',
      code_change: null,
      source: 'manual',
      confidence: 0.5,
    });

    repo.linkToError(1, solId);

    // Get error_solution link id
    const esRows = db.prepare('SELECT id FROM error_solutions WHERE error_id = ? AND solution_id = ?').get(1, solId) as { id: number };
    const esId = esRows.id;

    // Record 3 attempts: 2 success, 1 fail
    repo.recordAttempt({ errorSolutionId: esId, success: 1, output: 'ok', durationMs: 100 });
    repo.recordAttempt({ errorSolutionId: esId, success: 1, output: 'ok', durationMs: 200 });
    repo.recordAttempt({ errorSolutionId: esId, success: 0, output: 'fail', durationMs: 300 });

    const rate = repo.successRate(solId);
    expect(rate).toBeCloseTo(2 / 3, 2);
  });

  it('success rate returns 0 when no attempts', () => {
    const solId = repo.create({
      description: 'No attempts',
      commands: null,
      code_change: null,
      source: 'manual',
      confidence: 0.5,
    });
    expect(repo.successRate(solId)).toBe(0);
  });

  it('linkToError is idempotent (INSERT OR IGNORE)', () => {
    const solId = repo.create({
      description: 'Link once',
      commands: null,
      code_change: null,
      source: 'manual',
      confidence: 0.5,
    });

    repo.linkToError(1, solId);
    // Link again should not throw
    repo.linkToError(1, solId);

    const found = repo.findForError(1);
    expect(found).toHaveLength(1);
  });

  it('returns undefined for non-existent id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });
});
