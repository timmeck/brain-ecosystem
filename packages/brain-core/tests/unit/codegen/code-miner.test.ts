import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import Database from 'better-sqlite3';
import { CodeMiner, runCodeMinerMigration } from '../../../src/codegen/code-miner.js';

describe('CodeMiner', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create scanned_repos table for foreign key reference
    db.exec(`
      CREATE TABLE IF NOT EXISTS scanned_repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        github_id INTEGER UNIQUE,
        full_name TEXT NOT NULL,
        description TEXT,
        url TEXT,
        language TEXT,
        current_stars INTEGER DEFAULT 0,
        current_forks INTEGER DEFAULT 0,
        star_velocity_24h REAL DEFAULT 0,
        signal_score REAL DEFAULT 0,
        signal_level TEXT DEFAULT 'noise',
        phase TEXT DEFAULT 'unknown',
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('runCodeMinerMigration', () => {
    it('should create repo_contents table', () => {
      runCodeMinerMigration(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='repo_contents'").all();
      expect(tables).toHaveLength(1);
    });

    it('should be idempotent', () => {
      runCodeMinerMigration(db);
      runCodeMinerMigration(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='repo_contents'").all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('constructor', () => {
    it('should create tables on construction', () => {
      new CodeMiner(db, {});
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='repo_contents'").all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('getRepoContent', () => {
    it('should return undefined for non-existent content', () => {
      const miner = new CodeMiner(db, {});
      expect(miner.getRepoContent(999, 'README.md')).toBeUndefined();
    });

    it('should return stored content', () => {
      const miner = new CodeMiner(db, {});
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content, content_hash) VALUES (?, ?, ?, ?)').run(1, 'README.md', '# Hello', 'abc123');
      const result = miner.getRepoContent(1, 'README.md');
      expect(result).not.toBeNull();
      expect(result!.content).toBe('# Hello');
      expect(result!.file_path).toBe('README.md');
    });
  });

  describe('getTopDependencies', () => {
    it('should return empty array when no data', () => {
      const miner = new CodeMiner(db, {});
      expect(miner.getTopDependencies()).toEqual([]);
    });

    it('should aggregate dependencies from package.json', () => {
      const miner = new CodeMiner(db, {});
      const pkg1 = JSON.stringify({ dependencies: { zod: '^3.0', vitest: '^1.0' } });
      const pkg2 = JSON.stringify({ dependencies: { zod: '^3.0', express: '^4.0' } });
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(1, 'package.json', pkg1);
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(2, 'package.json', pkg2);

      const deps = miner.getTopDependencies();
      expect(deps[0].name).toBe('zod');
      expect(deps[0].count).toBe(2);
      expect(deps).toHaveLength(3);
    });
  });

  describe('getArchitecturePatterns', () => {
    it('should detect ESM pattern', () => {
      const miner = new CodeMiner(db, {});
      const pkg = JSON.stringify({ type: 'module', scripts: { test: 'vitest run', build: 'tsc' }, devDependencies: { typescript: '^5.0' } });
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(1, 'package.json', pkg);

      const patterns = miner.getArchitecturePatterns();
      expect(patterns.esm).toBe(1);
      expect(patterns.vitest).toBe(1);
      expect(patterns.tsc).toBe(1);
      expect(patterns.typescript).toBe(1);
    });
  });

  describe('getSummary', () => {
    it('should return zero stats when empty', () => {
      const miner = new CodeMiner(db, {});
      const summary = miner.getSummary();
      expect(summary.total_repos_mined).toBe(0);
      expect(summary.total_contents).toBe(0);
      expect(summary.total_size_bytes).toBe(0);
    });

    it('should count mined repos', () => {
      const miner = new CodeMiner(db, {});
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(1, 'README.md', '# Test');
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(1, 'package.json', '{}');
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(2, 'README.md', '# Other');

      const summary = miner.getSummary();
      expect(summary.total_repos_mined).toBe(2);
      expect(summary.total_contents).toBe(3);
      expect(summary.by_file).toHaveLength(2);
    });
  });

  describe('bootstrap', () => {
    it('should skip without GITHUB_TOKEN', async () => {
      const miner = new CodeMiner(db, { githubToken: undefined });
      const result = await miner.bootstrap();
      expect(result.mined).toBe(0);
    });

    it('should return 0 when no unmined repos', async () => {
      const miner = new CodeMiner(db, { githubToken: 'test-token' });
      const result = await miner.bootstrap();
      expect(result.mined).toBe(0);
    });
  });

  describe('abort', () => {
    it('should set abort flag', () => {
      const miner = new CodeMiner(db, {});
      miner.abort();
      // No error thrown
    });
  });
});
