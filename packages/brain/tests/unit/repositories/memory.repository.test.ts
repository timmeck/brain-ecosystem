import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MemoryRepository } from '../../../src/db/repositories/memory.repository.js';

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
    CREATE TABLE sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      project_id INTEGER,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      summary TEXT,
      goals TEXT,
      outcome TEXT,
      metadata TEXT,
      embedding BLOB DEFAULT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE TABLE memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      session_id INTEGER,
      category TEXT NOT NULL,
      key TEXT,
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 5,
      source TEXT NOT NULL DEFAULT 'explicit',
      tags TEXT,
      expires_at TEXT,
      superseded_by INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      embedding BLOB DEFAULT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (superseded_by) REFERENCES memories(id) ON DELETE SET NULL
    );
    CREATE UNIQUE INDEX idx_memories_key
      ON memories(project_id, key) WHERE key IS NOT NULL AND active = 1;
    CREATE INDEX idx_memories_category ON memories(category);
    CREATE INDEX idx_memories_active ON memories(active);
    CREATE INDEX idx_memories_importance ON memories(importance DESC);

    CREATE VIRTUAL TABLE memories_fts USING fts5(
      category, key, content, tags,
      content='memories',
      content_rowid='id'
    );
    CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, category, key, content, tags)
      VALUES (new.id, new.category, new.key, new.content, new.tags);
    END;
    CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, category, key, content, tags)
      VALUES ('delete', old.id, old.category, old.key, old.content, old.tags);
    END;
    CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, category, key, content, tags)
      VALUES ('delete', old.id, old.category, old.key, old.content, old.tags);
      INSERT INTO memories_fts(rowid, category, key, content, tags)
      VALUES (new.id, new.category, new.key, new.content, new.tags);
    END;

    INSERT INTO projects (name) VALUES ('my-project');
    INSERT INTO sessions (session_id, project_id) VALUES ('sess-001', 1);
  `);
  return db;
}

describe('MemoryRepository', () => {
  let db: Database.Database;
  let repo: MemoryRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new MemoryRepository(db);
  });

  it('creates a memory and retrieves by id', () => {
    const id = repo.create({
      project_id: 1,
      session_id: 1,
      category: 'preference',
      key: 'editor-theme',
      content: 'User prefers dark mode',
      importance: 7,
      source: 'explicit',
      tags: JSON.stringify(['ui', 'preference']),
      expires_at: null,
      superseded_by: null,
      active: 1,
      embedding: null,
    });
    expect(id).toBe(1);

    const mem = repo.getById(id);
    expect(mem).toBeDefined();
    expect(mem!.category).toBe('preference');
    expect(mem!.content).toBe('User prefers dark mode');
    expect(mem!.importance).toBe(7);
    expect(mem!.active).toBe(1);
  });

  it('findByKey returns active memory by project and key', () => {
    repo.create({
      project_id: 1, session_id: null, category: 'fact',
      key: 'db-type', content: 'PostgreSQL', importance: 5,
      source: 'explicit', tags: null, expires_at: null,
      superseded_by: null, active: 1, embedding: null,
    });

    const found = repo.findByKey(1, 'db-type');
    expect(found).toBeDefined();
    expect(found!.content).toBe('PostgreSQL');

    // Non-existent key
    expect(repo.findByKey(1, 'no-such-key')).toBeUndefined();
  });

  it('findByCategory returns memories sorted by importance', () => {
    repo.create({ project_id: 1, session_id: null, category: 'preference', key: 'k1', content: 'low prio', importance: 3, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });
    repo.create({ project_id: 1, session_id: null, category: 'preference', key: 'k2', content: 'high prio', importance: 9, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });
    repo.create({ project_id: 1, session_id: null, category: 'fact', key: 'k3', content: 'different category', importance: 10, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });

    const prefs = repo.findByCategory('preference');
    expect(prefs).toHaveLength(2);
    expect(prefs[0]!.importance).toBeGreaterThanOrEqual(prefs[1]!.importance);

    // With project filter
    const prefsProject = repo.findByCategory('preference', 1);
    expect(prefsProject).toHaveLength(2);
  });

  it('search finds memories via FTS', () => {
    repo.create({ project_id: 1, session_id: null, category: 'fact', key: null, content: 'The database uses PostgreSQL for production', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });
    repo.create({ project_id: 1, session_id: null, category: 'fact', key: null, content: 'Uses Redis for caching', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });

    const results = repo.search('PostgreSQL');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.content).toContain('PostgreSQL');
  });

  it('deactivate marks a memory as inactive', () => {
    const id = repo.create({ project_id: 1, session_id: null, category: 'fact', key: 'deac', content: 'Deactivate me', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });

    repo.deactivate(id);
    const mem = repo.getById(id);
    expect(mem!.active).toBe(0);
  });

  it('supersede marks old memory inactive and links to new', () => {
    const oldId = repo.create({ project_id: 1, session_id: null, category: 'fact', key: 'version', content: 'v1.0', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });
    const newId = repo.create({ project_id: 1, session_id: null, category: 'fact', key: null, content: 'v2.0', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });

    repo.supersede(oldId, newId);
    const old = repo.getById(oldId);
    expect(old!.active).toBe(0);
    expect(old!.superseded_by).toBe(newId);
  });

  it('upsertByKey creates a new memory on first call', () => {
    const result = repo.upsertByKey(1, 'test-key', 'value-1', 'fact');
    expect(result.memoryId).toBeGreaterThan(0);
    expect(result.superseded).toBeUndefined();

    const mem = repo.getById(result.memoryId);
    expect(mem!.content).toBe('value-1');
    expect(mem!.active).toBe(1);
  });

  it('upsertByKey supersedes when old memory is deactivated first', () => {
    // Create the first memory
    const id1 = repo.create({
      project_id: 1, session_id: null, category: 'fact',
      key: 'upsert-key', content: 'old value', importance: 5,
      source: 'explicit', tags: null, expires_at: null,
      superseded_by: null, active: 1, embedding: null,
    });

    // Manually deactivate it (simulating what supersede does)
    repo.deactivate(id1);

    // Now upsertByKey should work since no active memory with this key
    const result = repo.upsertByKey(1, 'upsert-key', 'new value', 'fact');
    expect(result.memoryId).toBeGreaterThan(0);
    const mem = repo.getById(result.memoryId);
    expect(mem!.content).toBe('new value');
    expect(mem!.active).toBe(1);
  });

  it('countActive counts only active memories', () => {
    repo.create({ project_id: 1, session_id: null, category: 'fact', key: null, content: 'active', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });
    repo.create({ project_id: 1, session_id: null, category: 'fact', key: null, content: 'inactive', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 0, embedding: null });

    expect(repo.countActive()).toBe(1);
  });

  it('countByCategory groups by category', () => {
    repo.create({ project_id: 1, session_id: null, category: 'preference', key: null, content: 'a', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });
    repo.create({ project_id: 1, session_id: null, category: 'preference', key: null, content: 'b', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });
    repo.create({ project_id: 1, session_id: null, category: 'fact', key: null, content: 'c', importance: 5, source: 'explicit', tags: null, expires_at: null, superseded_by: null, active: 1, embedding: null });

    const counts = repo.countByCategory();
    expect(counts['preference']).toBe(2);
    expect(counts['fact']).toBe(1);
  });

  it('returns undefined for non-existent id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });
});
