import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { FeatureRecommender } from '../../../src/codegen/feature-recommender.js';
import { FeatureExtractor } from '../../../src/codegen/feature-extractor.js';

describe('FeatureRecommender', () => {
  let db: Database.Database;
  let recommender: FeatureRecommender;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    recommender = new FeatureRecommender(db);
  });

  describe('ensureTables', () => {
    it('should create feature_wishes and feature_connections tables', () => {
      const tables = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('feature_wishes', 'feature_connections') ORDER BY name`,
      ).all() as Array<{ name: string }>;
      expect(tables.map(t => t.name)).toEqual(['feature_connections', 'feature_wishes']);
    });
  });

  describe('getStatus', () => {
    it('should return empty status initially', () => {
      const status = recommender.getStatus();
      expect(status.totalWishes).toBe(0);
      expect(status.openWishes).toBe(0);
      expect(status.matchedWishes).toBe(0);
      expect(status.adoptedWishes).toBe(0);
      expect(status.totalConnections).toBe(0);
      expect(status.lastScanAt).toBeNull();
    });
  });

  describe('getWishlist', () => {
    it('should return empty list initially', () => {
      expect(recommender.getWishlist()).toEqual([]);
    });

    it('should filter by status', () => {
      db.prepare(`INSERT INTO feature_wishes (need, reason, priority, status) VALUES (?, ?, ?, ?)`).run('retry', 'errors', 0.8, 'open');
      db.prepare(`INSERT INTO feature_wishes (need, reason, priority, status) VALUES (?, ?, ?, ?)`).run('cache', 'perf', 0.7, 'matched');
      expect(recommender.getWishlist('open')).toHaveLength(1);
      expect(recommender.getWishlist('matched')).toHaveLength(1);
      expect(recommender.getWishlist()).toHaveLength(2);
    });
  });

  describe('adoptFeature / dismissWish', () => {
    it('should mark wish as adopted', () => {
      db.prepare(`INSERT INTO feature_wishes (need, reason, priority) VALUES (?, ?, ?)`).run('retry', 'test', 0.8);
      const wish = db.prepare(`SELECT id FROM feature_wishes WHERE need = 'retry'`).get() as { id: number };
      recommender.adoptFeature(wish.id);
      const updated = db.prepare(`SELECT status FROM feature_wishes WHERE id = ?`).get(wish.id) as { status: string };
      expect(updated.status).toBe('adopted');
    });

    it('should mark wish as dismissed', () => {
      db.prepare(`INSERT INTO feature_wishes (need, reason, priority) VALUES (?, ?, ?)`).run('cache', 'test', 0.7);
      const wish = db.prepare(`SELECT id FROM feature_wishes WHERE need = 'cache'`).get() as { id: number };
      recommender.dismissWish(wish.id);
      const updated = db.prepare(`SELECT status FROM feature_wishes WHERE id = ?`).get(wish.id) as { status: string };
      expect(updated.status).toBe('dismissed');
    });
  });

  describe('getConnections', () => {
    it('should return empty list initially', () => {
      expect(recommender.getConnections()).toEqual([]);
    });

    it('should return connections for a specific feature', () => {
      db.prepare(`INSERT INTO feature_connections (feature_id_a, feature_id_b, name_a, name_b, relationship, strength, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(1, 2, 'CacheStore', 'RetryHandler', 'complementary', 0.8, 'test');
      db.prepare(`INSERT INTO feature_connections (feature_id_a, feature_id_b, name_a, name_b, relationship, strength, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(3, 4, 'Queue', 'Worker', 'enhances', 0.6, 'test2');

      const forFeature1 = recommender.getConnections(1);
      expect(forFeature1).toHaveLength(1);
      expect(forFeature1[0]!.nameA).toBe('CacheStore');

      const all = recommender.getConnections();
      expect(all).toHaveLength(2);
    });
  });

  describe('getRelatedSuggestions', () => {
    it('should find related features by name', () => {
      db.prepare(`INSERT INTO feature_connections (feature_id_a, feature_id_b, name_a, name_b, relationship, strength, reason) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(1, 2, 'CacheStore', 'RetryHandler', 'complementary', 0.8, 'complement');

      const suggestions = recommender.getRelatedSuggestions('CacheStore');
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]!.feature).toBe('RetryHandler');
      expect(suggestions[0]!.relationship).toBe('complementary');
    });

    it('should return empty for unknown feature', () => {
      expect(recommender.getRelatedSuggestions('Unknown')).toEqual([]);
    });
  });

  describe('runCycle', () => {
    it('should run without errors when no data exists', async () => {
      const result = await recommender.runCycle();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.wishesCreated).toBeGreaterThanOrEqual(0);
      expect(result.connectionsFound).toBe(0);
      expect(result.matchesFound).toBe(0);
    });

    it('should detect needs when error table has data', async () => {
      // Create the errors table with repeating errors
      db.exec(`CREATE TABLE IF NOT EXISTS errors (id INTEGER PRIMARY KEY, fingerprint TEXT, occurrence_count INTEGER DEFAULT 1)`);
      db.prepare(`INSERT INTO errors (fingerprint, occurrence_count) VALUES (?, ?)`).run('TypeError:foo', 5);
      db.prepare(`INSERT INTO errors (fingerprint, occurrence_count) VALUES (?, ?)`).run('ReferenceError:bar', 3);

      const result = await recommender.runCycle();
      expect(result.wishesCreated).toBeGreaterThanOrEqual(1);

      const wishes = recommender.getWishlist();
      const retryWish = wishes.find(w => w.need === 'retry mechanism');
      expect(retryWish).toBeDefined();
      expect(retryWish!.priority).toBe(0.8);
    });

    it('should set lastScanAt after cycle', async () => {
      await recommender.runCycle();
      const status = recommender.getStatus();
      expect(status.lastScanAt).not.toBeNull();
    });

    it('should not duplicate wishes on repeated cycles', async () => {
      db.exec(`CREATE TABLE IF NOT EXISTS errors (id INTEGER PRIMARY KEY, fingerprint TEXT, occurrence_count INTEGER DEFAULT 1)`);
      db.prepare(`INSERT INTO errors (fingerprint, occurrence_count) VALUES (?, ?)`).run('Error:repeat', 5);

      await recommender.runCycle();
      const first = recommender.getStatus().totalWishes;
      await recommender.runCycle();
      const second = recommender.getStatus().totalWishes;
      expect(second).toBe(first);
    });
  });

  describe('matchWishesToFeatures', () => {
    it('should match wishes to features when FeatureExtractor is set', async () => {
      const extractor = new FeatureExtractor(db);
      recommender.setFeatureExtractor(extractor);

      // Insert a wish manually
      db.prepare(`INSERT INTO feature_wishes (need, reason, priority) VALUES (?, ?, ?)`).run('retry mechanism', 'errors', 0.8);

      // Insert a matching feature
      db.exec(`CREATE TABLE IF NOT EXISTS extracted_features (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo TEXT NOT NULL, name TEXT NOT NULL, file_path TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'utility_function',
        code_snippet TEXT, language TEXT DEFAULT 'typescript',
        usefulness REAL DEFAULT 0.5, tags TEXT DEFAULT '[]',
        description TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(repo, name, file_path)
      )`);
      db.prepare(`INSERT INTO extracted_features (repo, name, file_path, category, code_snippet, usefulness, tags) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run('test-repo', 'retryWithBackoff', 'src/utils.ts', 'utility_function', 'export async function retryWithBackoff() {}', 0.8, '["retry","async"]');

      const result = await recommender.runCycle();
      expect(result.matchesFound).toBeGreaterThanOrEqual(1);

      const wishes = recommender.getWishlist('matched');
      expect(wishes.length).toBeGreaterThanOrEqual(1);
      expect(wishes[0]!.matchedFeatureName).toBe('retryWithBackoff');
    });
  });

  describe('buildConnections', () => {
    it('should build connections between features with related tags', async () => {
      const extractor = new FeatureExtractor(db);
      recommender.setFeatureExtractor(extractor);

      db.exec(`CREATE TABLE IF NOT EXISTS extracted_features (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo TEXT NOT NULL, name TEXT NOT NULL, file_path TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'utility_function',
        code_snippet TEXT, language TEXT DEFAULT 'typescript',
        usefulness REAL DEFAULT 0.5, tags TEXT DEFAULT '[]',
        description TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(repo, name, file_path)
      )`);
      db.prepare(`INSERT INTO extracted_features (repo, name, file_path, category, code_snippet, usefulness, tags) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run('test-repo', 'CacheManager', 'src/cache.ts', 'utility_function', 'export class CacheManager {}', 0.7, '["caching"]');
      db.prepare(`INSERT INTO extracted_features (repo, name, file_path, category, code_snippet, usefulness, tags) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run('test-repo', 'RetryHandler', 'src/retry.ts', 'utility_function', 'export function retryHandler() {}', 0.8, '["retry"]');

      const result = await recommender.runCycle();
      expect(result.connectionsFound).toBeGreaterThanOrEqual(1);

      const connections = recommender.getConnections();
      expect(connections.length).toBeGreaterThanOrEqual(1);
      expect(connections[0]!.relationship).toBe('complementary');
    });
  });
});
