import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PatternExtractor, runPatternExtractorMigration } from '../../../src/codegen/pattern-extractor.js';
import { runCodeMinerMigration } from '../../../src/codegen/code-miner.js';

describe('PatternExtractor', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    // Create tables needed by PatternExtractor (repo_contents from CodeMiner)
    runCodeMinerMigration(db);
    // Create scanned_repos for JOIN queries
    db.exec(`
      CREATE TABLE IF NOT EXISTS scanned_repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        signal_level TEXT DEFAULT 'noise'
      );
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('runPatternExtractorMigration', () => {
    it('should create extracted_patterns table', () => {
      runPatternExtractorMigration(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='extracted_patterns'").all();
      expect(tables).toHaveLength(1);
    });

    it('should be idempotent', () => {
      runPatternExtractorMigration(db);
      runPatternExtractorMigration(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='extracted_patterns'").all();
      expect(tables).toHaveLength(1);
    });
  });

  describe('extractDependencyPatterns', () => {
    it('should return empty array when no data', () => {
      const extractor = new PatternExtractor(db);
      expect(extractor.extractDependencyPatterns()).toEqual([]);
    });

    it('should extract and rank dependencies', () => {
      const extractor = new PatternExtractor(db);
      seedPackageJsons(db);

      const deps = extractor.extractDependencyPatterns(5);
      expect(deps.length).toBeGreaterThan(0);
      expect(deps[0].name).toBe('zod');
      expect(deps[0].count).toBe(3);
      expect(deps[0].percentage).toBe(100); // 3/3 = 100%
    });

    it('should save patterns to DB', () => {
      const extractor = new PatternExtractor(db);
      seedPackageJsons(db);
      extractor.extractDependencyPatterns();

      const saved = db.prepare("SELECT * FROM extracted_patterns WHERE pattern_type = 'dependency'").all();
      expect(saved.length).toBeGreaterThan(0);
    });
  });

  describe('extractTechStacks', () => {
    it('should return empty array when no data', () => {
      const extractor = new PatternExtractor(db);
      expect(extractor.extractTechStacks()).toEqual([]);
    });

    it('should extract tech stack combinations', () => {
      const extractor = new PatternExtractor(db);
      seedReposAndPackages(db);

      const stacks = extractor.extractTechStacks();
      expect(stacks.length).toBeGreaterThan(0);
      // All 3 repos have TypeScript + Zod
      const tsZod = stacks.find(s => s.stack.includes('TypeScript') && s.stack.includes('Zod'));
      expect(tsZod).toBeDefined();
    });
  });

  describe('extractProjectStructures', () => {
    it('should return empty array when no data', () => {
      const extractor = new PatternExtractor(db);
      expect(extractor.extractProjectStructures()).toEqual([]);
    });

    it('should extract common directories', () => {
      const extractor = new PatternExtractor(db);
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(1, 'tree', 'd src\nd tests\nf package.json\nf README.md');
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(2, 'tree', 'd src\nd docs\nf package.json');

      const structures = extractor.extractProjectStructures();
      expect(structures[0].path).toBe('src');
      expect(structures[0].count).toBe(2);
    });
  });

  describe('extractReadmePatterns', () => {
    it('should return empty array when no data', () => {
      const extractor = new PatternExtractor(db);
      expect(extractor.extractReadmePatterns()).toEqual([]);
    });

    it('should extract common README sections', () => {
      const extractor = new PatternExtractor(db);
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(1, 'README.md', '# Project\n## Installation\n## Usage\n## API');
      db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(2, 'README.md', '# Other\n## Installation\n## Contributing');

      const patterns = extractor.extractReadmePatterns();
      const installation = patterns.find(p => p.section === 'installation');
      expect(installation).toBeDefined();
      expect(installation!.count).toBe(2);
    });
  });

  describe('getPatterns', () => {
    it('should return empty array when no patterns extracted', () => {
      const extractor = new PatternExtractor(db);
      expect(extractor.getPatterns()).toEqual([]);
    });

    it('should filter by type', () => {
      const extractor = new PatternExtractor(db);
      seedPackageJsons(db);
      extractor.extractDependencyPatterns();

      const deps = extractor.getPatterns('dependency');
      expect(deps.length).toBeGreaterThan(0);
      expect(deps.every(p => p.pattern_type === 'dependency')).toBe(true);
    });
  });

  describe('extractAll', () => {
    it('should run all extractors', () => {
      const extractor = new PatternExtractor(db);
      const result = extractor.extractAll();
      expect(result).toHaveProperty('dependencies');
      expect(result).toHaveProperty('techStacks');
      expect(result).toHaveProperty('structures');
      expect(result).toHaveProperty('readmePatterns');
    });
  });
});

// ── Helpers ──────────────────────────────────────────────

function seedPackageJsons(db: Database.Database): void {
  const pkgs = [
    { dependencies: { zod: '^3.0', express: '^4.0' } },
    { dependencies: { zod: '^3.0', vitest: '^1.0' } },
    { dependencies: { zod: '^3.0', hono: '^4.0' } },
  ];
  for (let i = 0; i < pkgs.length; i++) {
    db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(i + 1, 'package.json', JSON.stringify(pkgs[i]));
  }
}

function seedReposAndPackages(db: Database.Database): void {
  const pkgs = [
    { type: 'module', dependencies: { zod: '^3.0' }, devDependencies: { typescript: '^5.0', vitest: '^1.0' } },
    { type: 'module', dependencies: { zod: '^3.0', react: '^18.0' }, devDependencies: { typescript: '^5.0' } },
    { dependencies: { zod: '^3.0', express: '^4.0' }, devDependencies: { typescript: '^5.0', jest: '^29.0' } },
  ];
  for (let i = 0; i < pkgs.length; i++) {
    db.prepare('INSERT INTO scanned_repos (id, full_name) VALUES (?, ?)').run(i + 1, `user/repo-${i + 1}`);
    db.prepare('INSERT INTO repo_contents (repo_id, file_path, content) VALUES (?, ?, ?)').run(i + 1, 'package.json', JSON.stringify(pkgs[i]));
  }
}
