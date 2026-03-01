import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { createConnection } from '../connection.js';

describe('createConnection', () => {
  const tmpDbs: string[] = [];

  /** Helper: generate a unique temp DB path. */
  function tmpDbPath(suffix = ''): string {
    const p = path.join(
      os.tmpdir(),
      `brain-core-test-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}.db`,
    );
    tmpDbs.push(p);
    return p;
  }

  afterEach(() => {
    // Clean up any temp DB files we created
    for (const p of tmpDbs) {
      try {
        fs.unlinkSync(p);
      } catch {
        // ignore if already deleted
      }
      // WAL / SHM sidecars
      for (const ext of ['-wal', '-shm']) {
        try {
          fs.unlinkSync(p + ext);
        } catch {
          // ignore
        }
      }
    }
    tmpDbs.length = 0;
  });

  it('returns a usable Database instance', () => {
    const dbPath = tmpDbPath();
    const db = createConnection(dbPath);
    expect(db).toBeDefined();
    // Verify we can execute a simple query
    const row = db.prepare('SELECT 1 AS val').get() as { val: number };
    expect(row.val).toBe(1);
    db.close();
  });

  it('creates the parent directory if it does not exist', () => {
    const nested = path.join(
      os.tmpdir(),
      `brain-core-test-nested-${Date.now()}`,
      'sub',
      'dir',
      'test.db',
    );
    tmpDbs.push(nested);

    const db = createConnection(nested);
    expect(fs.existsSync(path.dirname(nested))).toBe(true);
    db.close();

    // cleanup the nested dir
    fs.rmSync(path.join(os.tmpdir(), path.basename(path.dirname(path.dirname(path.dirname(nested))))), {
      recursive: true,
      force: true,
    });
  });

  it('sets journal_mode to WAL', () => {
    const dbPath = tmpDbPath();
    const db = createConnection(dbPath);
    const result = db.pragma('journal_mode') as { journal_mode: string }[];
    expect(result[0]!.journal_mode.toLowerCase()).toBe('wal');
    db.close();
  });

  it('sets synchronous to NORMAL (1)', () => {
    const dbPath = tmpDbPath();
    const db = createConnection(dbPath);
    const result = db.pragma('synchronous') as { synchronous: number }[];
    // NORMAL = 1
    expect(result[0]!.synchronous).toBe(1);
    db.close();
  });

  it('sets cache_size to 10000', () => {
    const dbPath = tmpDbPath();
    const db = createConnection(dbPath);
    const result = db.pragma('cache_size') as { cache_size: number }[];
    // Negative means KB, positive means pages; the source sets 10000 (pages)
    expect(result[0]!.cache_size).toBe(10000);
    db.close();
  });

  it('enables foreign_keys', () => {
    const dbPath = tmpDbPath();
    const db = createConnection(dbPath);
    const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
    expect(result[0]!.foreign_keys).toBe(1);
    db.close();
  });

  it('works with an in-memory database path (:memory:)', () => {
    // :memory: has dirname "." which already exists, so no mkdir needed
    const db = createConnection(':memory:');
    const row = db.prepare('SELECT 42 AS answer').get() as { answer: number };
    expect(row.answer).toBe(42);
    db.close();
  });

  it('supports creating tables and inserting data', () => {
    const dbPath = tmpDbPath();
    const db = createConnection(dbPath);

    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    db.prepare('INSERT INTO test (name) VALUES (?)').run('hello');
    const row = db.prepare('SELECT name FROM test WHERE id = 1').get() as { name: string };
    expect(row.name).toBe('hello');
    db.close();
  });

  it('enforces foreign key constraints', () => {
    const dbPath = tmpDbPath();
    const db = createConnection(dbPath);

    db.exec(`
      CREATE TABLE parent (id INTEGER PRIMARY KEY);
      CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
    `);

    // Inserting a child with a non-existent parent should fail
    expect(() => {
      db.prepare('INSERT INTO child (parent_id) VALUES (?)').run(999);
    }).toThrow();

    db.close();
  });

  it('can open the same file path twice without error', () => {
    const dbPath = tmpDbPath();
    const db1 = createConnection(dbPath);
    const db2 = createConnection(dbPath);

    db1.exec('CREATE TABLE shared (id INTEGER PRIMARY KEY)');
    db1.prepare('INSERT INTO shared (id) VALUES (1)').run();

    const row = db2.prepare('SELECT id FROM shared WHERE id = 1').get() as { id: number };
    expect(row.id).toBe(1);

    db1.close();
    db2.close();
  });
});
