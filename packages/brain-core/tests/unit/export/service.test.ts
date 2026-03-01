import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { ExportService } from '../../../src/export/service.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('ExportService', () => {
  let db: Database.Database;
  let service: ExportService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, email TEXT, created_at TEXT);
      INSERT INTO users VALUES (1, 'Alice', 'alice@example.com', '2026-01-15');
      INSERT INTO users VALUES (2, 'Bob', 'bob@example.com', '2026-02-20');
      INSERT INTO users VALUES (3, 'Charlie', 'charlie@example.com', '2026-03-01');

      CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT, user_id INTEGER);
      INSERT INTO posts VALUES (1, 'Hello World', 1);
      INSERT INTO posts VALUES (2, 'Second Post', 2);
    `);
    service = new ExportService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('listTables', () => {
    it('returns all tables', () => {
      const tables = service.listTables();
      expect(tables).toContain('users');
      expect(tables).toContain('posts');
    });

    it('excludes sqlite internal tables', () => {
      const tables = service.listTables();
      expect(tables.every(t => !t.startsWith('sqlite_'))).toBe(true);
    });
  });

  describe('getColumns', () => {
    it('returns column info for a table', () => {
      const cols = service.getColumns('users');
      expect(cols).toHaveLength(4);
      expect(cols.map(c => c.name)).toEqual(['id', 'name', 'email', 'created_at']);
    });

    it('throws for invalid table name', () => {
      expect(() => service.getColumns('DROP TABLE; --')).toThrow('Invalid table name');
    });
  });

  describe('export JSON', () => {
    it('exports all rows as JSON', () => {
      const result = service.export({ table: 'users', format: 'json' });
      expect(result.rowCount).toBe(3);
      expect(result.format).toBe('json');

      const data = JSON.parse(result.data);
      expect(data).toHaveLength(3);
      expect(data[0].name).toBe('Alice');
    });

    it('exports with limit', () => {
      const result = service.export({ table: 'users', format: 'json', limit: 2 });
      expect(result.rowCount).toBe(2);
    });

    it('exports specific columns', () => {
      const result = service.export({ table: 'users', format: 'json', columns: ['name', 'email'] });
      const data = JSON.parse(result.data);
      expect(Object.keys(data[0])).toEqual(['name', 'email']);
    });

    it('filters by date range', () => {
      const result = service.export({
        table: 'users',
        format: 'json',
        dateColumn: 'created_at',
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
      });
      expect(result.rowCount).toBe(1);
      const data = JSON.parse(result.data);
      expect(data[0].name).toBe('Bob');
    });

    it('filters by dateFrom only', () => {
      const result = service.export({
        table: 'users',
        format: 'json',
        dateColumn: 'created_at',
        dateFrom: '2026-02-01',
      });
      expect(result.rowCount).toBe(2); // Bob + Charlie
    });
  });

  describe('export CSV', () => {
    it('exports all rows as CSV', () => {
      const result = service.export({ table: 'users', format: 'csv' });
      expect(result.format).toBe('csv');

      const lines = result.data.split('\n');
      expect(lines[0]).toBe('id,name,email,created_at');
      expect(lines[1]).toBe('1,Alice,alice@example.com,2026-01-15');
      expect(lines).toHaveLength(4); // header + 3 rows
    });

    it('escapes CSV values with commas', () => {
      db.exec(`INSERT INTO users VALUES (4, 'Name, With Comma', 'test@test.com', '2026-03-01')`);
      const result = service.export({ table: 'users', format: 'csv' });

      expect(result.data).toContain('"Name, With Comma"');
    });

    it('escapes CSV values with quotes', () => {
      db.exec(`INSERT INTO users VALUES (5, 'She said "hello"', 'test@test.com', '2026-03-01')`);
      const result = service.export({ table: 'users', format: 'csv' });

      expect(result.data).toContain('"She said ""hello"""');
    });

    it('returns empty string for empty table', () => {
      db.exec('CREATE TABLE empty_table (id INTEGER)');
      const result = service.export({ table: 'empty_table', format: 'csv' });
      expect(result.data).toBe('');
      expect(result.rowCount).toBe(0);
    });
  });

  describe('exportAll', () => {
    it('exports all tables', () => {
      const results = service.exportAll();
      expect(Object.keys(results)).toContain('users');
      expect(Object.keys(results)).toContain('posts');
      expect(results.users!.rowCount).toBe(3);
      expect(results.posts!.rowCount).toBe(2);
    });

    it('exports specific tables', () => {
      const results = service.exportAll(['users']);
      expect(Object.keys(results)).toEqual(['users']);
    });
  });

  describe('getStats', () => {
    it('returns row counts for all tables', () => {
      const stats = service.getStats();
      expect(stats.users).toBe(3);
      expect(stats.posts).toBe(2);
    });
  });

  describe('validation', () => {
    it('rejects SQL injection in table name', () => {
      expect(() => service.export({ table: 'users; DROP TABLE users', format: 'json' })).toThrow();
    });

    it('rejects SQL injection in column name', () => {
      expect(() => service.export({
        table: 'users', format: 'json',
        dateColumn: 'id; DROP TABLE users',
        dateFrom: '2026-01-01',
      })).toThrow();
    });
  });
});
