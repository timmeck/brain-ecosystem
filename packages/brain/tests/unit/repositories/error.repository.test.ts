import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ErrorRepository } from '../../../src/db/repositories/error.repository.js';

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
    CREATE TABLE terminals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      project_id INTEGER,
      pid INTEGER,
      shell TEXT,
      cwd TEXT,
      connected_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      disconnected_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
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
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (terminal_id) REFERENCES terminals(id) ON DELETE SET NULL
    );
    CREATE TABLE error_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_error_id INTEGER NOT NULL,
      child_error_id INTEGER NOT NULL,
      relationship TEXT NOT NULL DEFAULT 'causes',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_error_id) REFERENCES errors(id) ON DELETE CASCADE,
      FOREIGN KEY (child_error_id) REFERENCES errors(id) ON DELETE CASCADE,
      UNIQUE(parent_error_id, child_error_id)
    );
    CREATE VIRTUAL TABLE errors_fts USING fts5(
      type, message, raw_output, context, file_path,
      content='errors',
      content_rowid='id'
    );
    CREATE TRIGGER errors_ai AFTER INSERT ON errors BEGIN
      INSERT INTO errors_fts(rowid, type, message, raw_output, context, file_path)
      VALUES (new.id, new.type, new.message, new.raw_output, new.context, new.file_path);
    END;
    CREATE TRIGGER errors_ad AFTER DELETE ON errors BEGIN
      INSERT INTO errors_fts(errors_fts, rowid, type, message, raw_output, context, file_path)
      VALUES ('delete', old.id, old.type, old.message, old.raw_output, old.context, old.file_path);
    END;
    CREATE TRIGGER errors_au AFTER UPDATE ON errors BEGIN
      INSERT INTO errors_fts(errors_fts, rowid, type, message, raw_output, context, file_path)
      VALUES ('delete', old.id, old.type, old.message, old.raw_output, old.context, old.file_path);
      INSERT INTO errors_fts(rowid, type, message, raw_output, context, file_path)
      VALUES (new.id, new.type, new.message, new.raw_output, new.context, new.file_path);
    END;
    CREATE INDEX idx_errors_fingerprint ON errors(fingerprint);
    CREATE INDEX idx_errors_project ON errors(project_id);
    CREATE INDEX idx_errors_resolved ON errors(resolved);
    INSERT INTO projects (name) VALUES ('test-project');
  `);
  return db;
}

describe('ErrorRepository', () => {
  let db: Database.Database;
  let repo: ErrorRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new ErrorRepository(db);
  });

  it('creates an error and retrieves it by id', () => {
    const id = repo.create({
      project_id: 1,
      terminal_id: null,
      fingerprint: 'fp-001',
      type: 'TypeError',
      message: 'Cannot read property x of undefined',
      raw_output: 'TypeError: Cannot read property x of undefined\n    at foo.ts:10',
      context: null,
      file_path: 'foo.ts',
      line_number: 10,
      column_number: 5,
    });
    expect(id).toBe(1);

    const record = repo.getById(id);
    expect(record).toBeDefined();
    expect(record!.type).toBe('TypeError');
    expect(record!.fingerprint).toBe('fp-001');
    expect(record!.occurrence_count).toBe(1);
    expect(record!.resolved).toBe(0);
  });

  it('updates an error', () => {
    const id = repo.create({
      project_id: 1,
      terminal_id: null,
      fingerprint: 'fp-002',
      type: 'ReferenceError',
      message: 'x is not defined',
      raw_output: 'ReferenceError: x is not defined',
      context: null,
      file_path: null,
      line_number: null,
      column_number: null,
    });

    repo.update(id, { resolved: 1, resolved_at: '2025-01-01T00:00:00Z' });
    const record = repo.getById(id);
    expect(record!.resolved).toBe(1);
    expect(record!.resolved_at).toBe('2025-01-01T00:00:00Z');
  });

  it('deletes an error', () => {
    const id = repo.create({
      project_id: 1,
      terminal_id: null,
      fingerprint: 'fp-del',
      type: 'Error',
      message: 'delete me',
      raw_output: 'Error: delete me',
      context: null,
      file_path: null,
      line_number: null,
      column_number: null,
    });
    expect(repo.getById(id)).toBeDefined();
    repo.delete(id);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('finds errors by fingerprint', () => {
    repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-dup', type: 'Error',
      message: 'dup 1', raw_output: 'Error: dup 1', context: null,
      file_path: null, line_number: null, column_number: null,
    });
    repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-dup', type: 'Error',
      message: 'dup 2', raw_output: 'Error: dup 2', context: null,
      file_path: null, line_number: null, column_number: null,
    });
    const results = repo.findByFingerprint('fp-dup');
    expect(results).toHaveLength(2);
  });

  it('finds unresolved errors globally and by project', () => {
    repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-a', type: 'Error',
      message: 'unresolved', raw_output: 'Error: unresolved', context: null,
      file_path: null, line_number: null, column_number: null,
    });
    const id2 = repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-b', type: 'Error',
      message: 'resolved', raw_output: 'Error: resolved', context: null,
      file_path: null, line_number: null, column_number: null,
    });
    repo.update(id2, { resolved: 1 });

    const unresolvedAll = repo.findUnresolved();
    expect(unresolvedAll).toHaveLength(1);
    expect(unresolvedAll[0]!.message).toBe('unresolved');

    const unresolvedByProject = repo.findUnresolved(1);
    expect(unresolvedByProject).toHaveLength(1);
  });

  it('counts errors since a given date', () => {
    repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-c', type: 'Error',
      message: 'recent', raw_output: 'Error: recent', context: null,
      file_path: null, line_number: null, column_number: null,
    });
    // Count since epoch should include all
    const count = repo.countSince('1970-01-01T00:00:00Z');
    expect(count).toBeGreaterThanOrEqual(1);

    // Count since far future should be 0
    const futureCount = repo.countSince('2099-01-01T00:00:00Z');
    expect(futureCount).toBe(0);

    // Count by project
    const countByProject = repo.countSince('1970-01-01T00:00:00Z', 1);
    expect(countByProject).toBeGreaterThanOrEqual(1);
  });

  it('searches errors via full-text search', () => {
    repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-fts', type: 'SyntaxError',
      message: 'unexpected token in javascript', raw_output: 'SyntaxError: unexpected token',
      context: 'parsing module', file_path: 'app.js', line_number: 42, column_number: 1,
    });
    repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-fts2', type: 'TypeError',
      message: 'null is not an object', raw_output: 'TypeError: null is not an object',
      context: null, file_path: 'index.ts', line_number: 5, column_number: null,
    });

    const results = repo.search('javascript');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.type).toBe('SyntaxError');
  });

  it('increments occurrence count', () => {
    const id = repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-occ', type: 'Error',
      message: 'occurs often', raw_output: 'Error: occurs often', context: null,
      file_path: null, line_number: null, column_number: null,
    });
    expect(repo.getById(id)!.occurrence_count).toBe(1);
    repo.incrementOccurrence(id);
    expect(repo.getById(id)!.occurrence_count).toBe(2);
    repo.incrementOccurrence(id);
    expect(repo.getById(id)!.occurrence_count).toBe(3);
  });

  it('creates and finds error chains', () => {
    const parentId = repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-parent', type: 'Error',
      message: 'parent error', raw_output: 'Error: parent', context: null,
      file_path: null, line_number: null, column_number: null,
    });
    const childId = repo.create({
      project_id: 1, terminal_id: null, fingerprint: 'fp-child', type: 'Error',
      message: 'child error', raw_output: 'Error: child', context: null,
      file_path: null, line_number: null, column_number: null,
    });

    repo.createChain(parentId, childId, 'caused_by_fix');

    const children = repo.findChainChildren(parentId);
    expect(children).toHaveLength(1);
    expect(children[0]!.id).toBe(childId);

    const parents = repo.findChainParents(childId);
    expect(parents).toHaveLength(1);
    expect(parents[0]!.id).toBe(parentId);
  });

  it('returns undefined for non-existent id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('findAll with pagination', () => {
    for (let i = 0; i < 5; i++) {
      repo.create({
        project_id: 1, terminal_id: null, fingerprint: `fp-page-${i}`, type: 'Error',
        message: `error ${i}`, raw_output: `Error: ${i}`, context: null,
        file_path: null, line_number: null, column_number: null,
      });
    }
    const page1 = repo.findAll(2, 0);
    expect(page1).toHaveLength(2);

    const page2 = repo.findAll(2, 2);
    expect(page2).toHaveLength(2);

    const all = repo.findAll(100, 0);
    expect(all).toHaveLength(5);
  });
});
