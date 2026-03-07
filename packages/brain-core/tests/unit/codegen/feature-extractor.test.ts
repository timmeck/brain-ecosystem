import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { FeatureExtractor } from '../../../src/codegen/feature-extractor.js';

describe('FeatureExtractor', () => {
  let db: Database.Database;
  let extractor: FeatureExtractor;

  beforeEach(() => {
    db = new Database(':memory:');
    extractor = new FeatureExtractor(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('table creation', () => {
    it('should create extracted_features table', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='extracted_features'",
      ).all();
      expect(tables).toHaveLength(1);
    });

    it('should have correct columns', () => {
      const columns = db.prepare('PRAGMA table_info(extracted_features)').all() as Array<{ name: string }>;
      const names = columns.map(c => c.name);
      expect(names).toContain('repo');
      expect(names).toContain('name');
      expect(names).toContain('category');
      expect(names).toContain('code_snippet');
      expect(names).toContain('usefulness');
      expect(names).toContain('tags');
    });
  });

  describe('extractFeaturesFromCode', () => {
    it('should extract exported functions', () => {
      const code = `
export function retryWithBackoff(fn: () => Promise<any>, maxRetries = 3): Promise<any> {
  let attempt = 0;
  const execute = async (): Promise<any> => {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      attempt++;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100));
      return execute();
    }
  };
  return execute();
}
`;
      const features = extractor.extractFeaturesFromCode(code, 'src/utils/retry.ts', 'test/repo', '.ts');
      expect(features.length).toBeGreaterThanOrEqual(1);
      const retryFeature = features.find(f => f.name === 'retryWithBackoff');
      expect(retryFeature).toBeDefined();
      expect(retryFeature!.category).toBe('utility_function');
      expect(retryFeature!.usefulness).toBeGreaterThan(0.4);
      expect(retryFeature!.tags).toContain('retry');
    });

    it('should extract exported classes', () => {
      const code = `
export class CacheManager extends BaseCache implements ICacheable {
  private store: Map<string, any> = new Map();
  private ttl: number;

  constructor(ttl: number = 60000) {
    super();
    this.ttl = ttl;
  }

  get(key: string): any {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: any): void {
    this.store.set(key, { value, expiry: Date.now() + this.ttl });
  }
}
`;
      const features = extractor.extractFeaturesFromCode(code, 'src/cache.ts', 'test/repo', '.ts');
      const cacheFeature = features.find(f => f.name === 'CacheManager');
      expect(cacheFeature).toBeDefined();
      expect(cacheFeature!.category).toBe('design_pattern');
      expect(cacheFeature!.tags).toContain('caching');
    });

    it('should extract custom error classes', () => {
      const code = `
export class HttpError extends Error {
  public readonly statusCode: number;
  public readonly response: unknown;

  constructor(statusCode: number, message: string, response?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.response = response;
  }
}
`;
      const features = extractor.extractFeaturesFromCode(code, 'src/errors.ts', 'test/repo', '.ts');
      const errorFeature = features.find(f => f.name === 'HttpError');
      expect(errorFeature).toBeDefined();
      // May be caught by error_handling or design_pattern pattern
      expect(['error_handling', 'design_pattern']).toContain(errorFeature!.category);
    });

    it('should extract test helpers', () => {
      const code = `
export function createMockDatabase(): MockDB {
  const data: Record<string, any> = {};
  return {
    get: (key: string) => data[key],
    set: (key: string, value: any) => { data[key] = value; },
    delete: (key: string) => { delete data[key]; },
    clear: () => { Object.keys(data).forEach(k => delete data[k]); },
  };
}
`;
      const features = extractor.extractFeaturesFromCode(code, 'src/test-utils.ts', 'test/repo', '.ts');
      const mockFeature = features.find(f => f.name === 'createMockDatabase');
      expect(mockFeature).toBeDefined();
      // May match utility_function (general) or testing_pattern (specific)
      expect(['utility_function', 'testing_pattern']).toContain(mockFeature!.category);
      expect(mockFeature!.tags).toContain('testing');
    });

    it('should skip boring names like constructor', () => {
      const code = `
export function constructor() {
  return {};
}
`;
      const features = extractor.extractFeaturesFromCode(code, 'src/x.ts', 'test/repo', '.ts');
      const boring = features.find(f => f.name === 'constructor');
      expect(boring).toBeUndefined();
    });

    it('should not extract very short functions', () => {
      const code = `
export function x() { return 1; }
`;
      const features = extractor.extractFeaturesFromCode(code, 'src/x.ts', 'test/repo', '.ts');
      expect(features.length).toBe(0);
    });

    it('should calculate higher usefulness for functions with useful keywords', () => {
      const cacheCode = `
export function createThrottledQueue(maxConcurrent: number = 5): ThrottledQueue {
  const queue: Array<() => Promise<any>> = [];
  let running = 0;

  async function processNext(): Promise<void> {
    if (running >= maxConcurrent || queue.length === 0) return;
    running++;
    const task = queue.shift()!;
    try {
      await task();
    } finally {
      running--;
      processNext();
    }
  }

  return {
    add: (task: () => Promise<any>) => {
      queue.push(task);
      processNext();
    },
    size: () => queue.length,
  };
}
`;
      const plainCode = `
export function formatDate(date: Date, format: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day);
}
`;
      const throttled = extractor.extractFeaturesFromCode(cacheCode, 'src/queue.ts', 'r', '.ts');
      const plain = extractor.extractFeaturesFromCode(plainCode, 'src/date.ts', 'r', '.ts');

      expect(throttled.length).toBeGreaterThanOrEqual(1);
      expect(plain.length).toBeGreaterThanOrEqual(1);

      // Throttled queue should score higher (has queue/throttle keywords)
      expect(throttled[0]!.usefulness).toBeGreaterThan(plain[0]!.usefulness);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      // Insert some test features
      db.prepare(`
        INSERT INTO extracted_features (repo, name, category, description, code_snippet, file_path, language, usefulness, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('owner/repo1', 'retryFetch', 'utility_function', 'Retry HTTP fetch', 'async function retryFetch() {}', 'src/retry.ts', 'typescript', 0.8, '["retry","async"]');

      db.prepare(`
        INSERT INTO extracted_features (repo, name, category, description, code_snippet, file_path, language, usefulness, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('owner/repo1', 'AppError', 'error_handling', 'Custom error class', 'class AppError extends Error {}', 'src/errors.ts', 'typescript', 0.6, '[]');

      db.prepare(`
        INSERT INTO extracted_features (repo, name, category, description, code_snippet, file_path, language, usefulness, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('owner/repo2', 'CacheStore', 'design_pattern', 'LRU cache implementation', 'class CacheStore {}', 'src/cache.ts', 'typescript', 0.9, '["caching"]');
    });

    it('should return all features sorted by usefulness', () => {
      const results = extractor.search();
      expect(results).toHaveLength(3);
      expect(results[0]!.name).toBe('CacheStore'); // highest usefulness
    });

    it('should filter by category', () => {
      const results = extractor.search({ category: 'error_handling' });
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('AppError');
    });

    it('should filter by repo', () => {
      const results = extractor.search({ repo: 'owner/repo2' });
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('CacheStore');
    });

    it('should filter by minimum usefulness', () => {
      const results = extractor.search({ minUsefulness: 0.7 });
      expect(results).toHaveLength(2);
    });

    it('should filter by query text', () => {
      const results = extractor.search({ query: 'retry' });
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('retryFetch');
    });

    it('should respect limit', () => {
      const results = extractor.search({ limit: 1 });
      expect(results).toHaveLength(1);
    });
  });

  describe('getStats', () => {
    it('should return empty stats when no features exist', () => {
      const stats = extractor.getStats();
      expect(stats.totalFeatures).toBe(0);
      expect(stats.avgUsefulness).toBe(0);
    });

    it('should return correct stats with features', () => {
      db.prepare(`
        INSERT INTO extracted_features (repo, name, category, description, code_snippet, file_path, language, usefulness, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('r1', 'fn1', 'utility_function', '', 'code', 'f.ts', 'typescript', 0.8, '[]');
      db.prepare(`
        INSERT INTO extracted_features (repo, name, category, description, code_snippet, file_path, language, usefulness, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('r1', 'fn2', 'error_handling', '', 'code', 'e.ts', 'typescript', 0.6, '[]');

      const stats = extractor.getStats();
      expect(stats.totalFeatures).toBe(2);
      expect(stats.avgUsefulness).toBeCloseTo(0.7, 1);
      expect(stats.byCategory['utility_function']).toBe(1);
      expect(stats.byCategory['error_handling']).toBe(1);
      expect(stats.byRepo['r1']).toBe(2);
    });
  });

  describe('deduplication', () => {
    it('should not insert duplicate features (same repo+name+path)', () => {
      const code = `
export function myHelper(x: number): number {
  const result = x * 2;
  return result + 1;
}
`;
      extractor.extractFeaturesFromCode(code, 'src/helper.ts', 'r', '.ts');
      // Save features
      const features = extractor.extractFeaturesFromCode(code, 'src/helper.ts', 'r', '.ts');
      for (const f of features) {
        db.prepare(`
          INSERT OR IGNORE INTO extracted_features
            (repo, name, category, description, code_snippet, file_path, language, usefulness, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(f.repo, f.name, f.category, f.description, f.codeSnippet, f.filePath, f.language, f.usefulness, JSON.stringify(f.tags));
      }
      // Insert again — should be ignored
      for (const f of features) {
        db.prepare(`
          INSERT OR IGNORE INTO extracted_features
            (repo, name, category, description, code_snippet, file_path, language, usefulness, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(f.repo, f.name, f.category, f.description, f.codeSnippet, f.filePath, f.language, f.usefulness, JSON.stringify(f.tags));
      }

      const count = db.prepare('SELECT COUNT(*) as c FROM extracted_features').get() as { c: number };
      // Should have at most the number of unique features, not double
      expect(count.c).toBeLessThanOrEqual(features.length);
    });
  });
});
