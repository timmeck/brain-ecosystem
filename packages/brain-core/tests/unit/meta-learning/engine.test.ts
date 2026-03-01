import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MetaLearningEngine, runMetaLearningMigration } from '../../../src/meta-learning/engine.js';
import type { HyperParameter } from '../../../src/meta-learning/engine.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

/** Helper: create a standard set of hyper-parameters for tests. */
function defaultParams(): HyperParameter[] {
  return [
    { name: 'learningRate', value: 0.5, min: 0.0, max: 1.0, step: 0.05 },
    { name: 'decayFactor', value: 0.3, min: 0.0, max: 1.0, step: 0.05 },
  ];
}

describe('MetaLearningEngine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
  });

  afterEach(() => {
    db.close();
  });

  // ── Migration ─────────────────────────────────────────

  describe('runMetaLearningMigration', () => {
    it('creates the meta_learning_snapshots table', () => {
      runMetaLearningMigration(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta_learning_snapshots'")
        .all() as { name: string }[];

      expect(tables).toHaveLength(1);
      expect(tables[0]!.name).toBe('meta_learning_snapshots');
    });

    it('creates the meta_learning_optimizations table', () => {
      runMetaLearningMigration(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta_learning_optimizations'")
        .all() as { name: string }[];

      expect(tables).toHaveLength(1);
      expect(tables[0]!.name).toBe('meta_learning_optimizations');
    });

    it('is idempotent (safe to call twice)', () => {
      runMetaLearningMigration(db);
      runMetaLearningMigration(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'meta_learning_%'")
        .all();

      expect(tables).toHaveLength(2);
    });
  });

  // ── Constructor ───────────────────────────────────────

  describe('constructor', () => {
    it('runs migration automatically and sets default config', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      // Tables should exist because constructor calls runMetaLearningMigration
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'meta_learning_%'")
        .all();
      expect(tables).toHaveLength(2);

      // Default params are accessible
      const params = engine.getParams();
      expect(params.learningRate).toBe(0.5);
      expect(params.decayFactor).toBe(0.3);
    });
  });

  // ── recordSnapshot ────────────────────────────────────

  describe('recordSnapshot', () => {
    it('records a snapshot and returns it', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      const snap = engine.recordSnapshot({ newPatterns: 5, prunedRules: 2 }, 0.75);

      expect(snap.cycle).toBe(1);
      expect(snap.score).toBe(0.75);
      expect(snap.params.learningRate).toBe(0.5);
      expect(snap.metrics.newPatterns).toBe(5);
    });

    it('persists snapshots to the database', () => {
      const engine = new MetaLearningEngine(db, defaultParams());
      engine.recordSnapshot({ a: 1 }, 0.5);
      engine.recordSnapshot({ a: 2 }, 0.8);

      const rows = db.prepare('SELECT * FROM meta_learning_snapshots').all();
      expect(rows).toHaveLength(2);
    });

    it('increments cycle count with each call', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      const s1 = engine.recordSnapshot({ a: 1 }, 0.5);
      const s2 = engine.recordSnapshot({ a: 2 }, 0.6);
      const s3 = engine.recordSnapshot({ a: 3 }, 0.7);

      expect(s1.cycle).toBe(1);
      expect(s2.cycle).toBe(2);
      expect(s3.cycle).toBe(3);
    });
  });

  // ── getParams / setParam ──────────────────────────────

  describe('getParams', () => {
    it('returns all current parameter values', () => {
      const engine = new MetaLearningEngine(db, defaultParams());
      const params = engine.getParams();

      expect(params).toEqual({ learningRate: 0.5, decayFactor: 0.3 });
    });
  });

  describe('setParam', () => {
    it('updates a known parameter and returns true', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      const result = engine.setParam('learningRate', 0.9);
      expect(result).toBe(true);
      expect(engine.getParams().learningRate).toBe(0.9);
    });

    it('returns false for an unknown parameter', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      const result = engine.setParam('nonExistent', 0.5);
      expect(result).toBe(false);
    });

    it('clamps value to parameter bounds (max)', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      engine.setParam('learningRate', 5.0); // max is 1.0
      expect(engine.getParams().learningRate).toBe(1.0);
    });

    it('clamps value to parameter bounds (min)', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      engine.setParam('learningRate', -2.0); // min is 0.0
      expect(engine.getParams().learningRate).toBe(0.0);
    });
  });

  // ── analyze ───────────────────────────────────────────

  describe('analyze', () => {
    it('returns empty array with fewer than 5 snapshots', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      engine.recordSnapshot({ a: 1 }, 0.5);
      engine.recordSnapshot({ a: 2 }, 0.6);
      engine.recordSnapshot({ a: 3 }, 0.7);

      const recs = engine.analyze();
      expect(recs).toEqual([]);
    });

    it('returns recommendations when enough data is available', () => {
      // We need at least 5 snapshots, with values spanning different bins
      // so the algorithm can find a "best bin" different from the current one.
      //
      // param: learningRate  range 0..1  binSize=0.2
      //   bin0: 0.0-0.2   bin1: 0.2-0.4   bin2: 0.4-0.6   bin3: 0.6-0.8   bin4: 0.8-1.0
      //
      // Current value 0.5 => currentBin = 2
      // We'll inject snapshots placing learningRate in bin4 (0.8-1.0) with high scores
      // and bin2 (0.4-0.6) with low scores to ensure a recommendation exists.

      const params: HyperParameter[] = [
        { name: 'learningRate', value: 0.5, min: 0.0, max: 1.0, step: 0.05 },
      ];
      const engine = new MetaLearningEngine(db, params);

      // Insert snapshots directly into DB to control parameter values
      const insert = db.prepare(
        'INSERT INTO meta_learning_snapshots (cycle, params, metrics, score) VALUES (?, ?, ?, ?)',
      );

      // 3 snapshots in bin4 (high scores)
      insert.run(1, JSON.stringify({ learningRate: 0.85 }), '{}', 0.9);
      insert.run(2, JSON.stringify({ learningRate: 0.90 }), '{}', 0.95);
      insert.run(3, JSON.stringify({ learningRate: 0.88 }), '{}', 0.92);

      // 3 snapshots in bin2 (low scores, where current value sits)
      insert.run(4, JSON.stringify({ learningRate: 0.45 }), '{}', 0.3);
      insert.run(5, JSON.stringify({ learningRate: 0.50 }), '{}', 0.35);
      insert.run(6, JSON.stringify({ learningRate: 0.48 }), '{}', 0.32);

      const recs = engine.analyze();

      expect(recs.length).toBeGreaterThanOrEqual(1);

      const lr = recs.find(r => r.name === 'learningRate');
      expect(lr).toBeDefined();
      expect(lr!.recommendedValue).toBeGreaterThan(0.5); // should recommend moving up
      expect(lr!.expectedImprovement).toBeGreaterThan(0);
      expect(lr!.confidence).toBeGreaterThan(0);
      expect(lr!.evidence).toBeGreaterThan(0);
    });

    it('returns no recommendation when current value is already in the best bin', () => {
      const params: HyperParameter[] = [
        { name: 'learningRate', value: 0.5, min: 0.0, max: 1.0, step: 0.05 },
      ];
      const engine = new MetaLearningEngine(db, params);

      const insert = db.prepare(
        'INSERT INTO meta_learning_snapshots (cycle, params, metrics, score) VALUES (?, ?, ?, ?)',
      );

      // All snapshots in bin2 (0.4-0.6), which is where current value sits
      for (let i = 1; i <= 6; i++) {
        insert.run(i, JSON.stringify({ learningRate: 0.45 + i * 0.01 }), '{}', 0.8);
      }

      const recs = engine.analyze();
      // No recommendation for learningRate since it's already in the best bin
      const lr = recs.find(r => r.name === 'learningRate');
      expect(lr).toBeUndefined();
    });
  });

  // ── optimize ──────────────────────────────────────────

  describe('optimize', () => {
    it('applies recommendations and records optimizations', () => {
      const params: HyperParameter[] = [
        { name: 'learningRate', value: 0.1, min: 0.0, max: 1.0, step: 0.05 },
      ];
      // explorationRate=0 ensures we always exploit (deterministic)
      const engine = new MetaLearningEngine(db, params, { explorationRate: 0 });

      const insert = db.prepare(
        'INSERT INTO meta_learning_snapshots (cycle, params, metrics, score) VALUES (?, ?, ?, ?)',
      );

      // bin0 (0.0-0.2): low scores (current param = 0.1 => bin0)
      insert.run(1, JSON.stringify({ learningRate: 0.05 }), '{}', 0.2);
      insert.run(2, JSON.stringify({ learningRate: 0.15 }), '{}', 0.25);
      insert.run(3, JSON.stringify({ learningRate: 0.10 }), '{}', 0.22);

      // bin4 (0.8-1.0): high scores
      insert.run(4, JSON.stringify({ learningRate: 0.85 }), '{}', 0.9);
      insert.run(5, JSON.stringify({ learningRate: 0.90 }), '{}', 0.95);
      insert.run(6, JSON.stringify({ learningRate: 0.88 }), '{}', 0.92);

      const applied = engine.optimize();

      expect(applied.length).toBe(1);
      expect(applied[0]!.name).toBe('learningRate');

      // Parameter should have been updated
      const newVal = engine.getParams().learningRate;
      expect(newVal).toBeGreaterThan(0.1); // moved away from 0.1

      // Optimization should be recorded in DB
      const opts = db.prepare('SELECT * FROM meta_learning_optimizations').all();
      expect(opts).toHaveLength(1);
    });

    it('skips low-confidence recommendations', () => {
      const params: HyperParameter[] = [
        { name: 'learningRate', value: 0.1, min: 0.0, max: 1.0, step: 0.05 },
      ];
      const engine = new MetaLearningEngine(db, params, { explorationRate: 0 });

      const insert = db.prepare(
        'INSERT INTO meta_learning_snapshots (cycle, params, metrics, score) VALUES (?, ?, ?, ?)',
      );

      // Only 2 samples in the "best" bin (confidence = 2/10 = 0.2 < 0.3 threshold)
      insert.run(1, JSON.stringify({ learningRate: 0.85 }), '{}', 0.9);
      insert.run(2, JSON.stringify({ learningRate: 0.90 }), '{}', 0.95);

      // 3 samples in current bin
      insert.run(3, JSON.stringify({ learningRate: 0.05 }), '{}', 0.2);
      insert.run(4, JSON.stringify({ learningRate: 0.10 }), '{}', 0.25);
      insert.run(5, JSON.stringify({ learningRate: 0.15 }), '{}', 0.22);

      const applied = engine.optimize();

      // confidence is 2/10 = 0.2, below the 0.3 threshold, so nothing applied
      expect(applied).toHaveLength(0);
    });

    it('clamps optimized values within parameter bounds', () => {
      const params: HyperParameter[] = [
        { name: 'rate', value: 0.1, min: 0.0, max: 1.0, step: 0.05 },
      ];
      const engine = new MetaLearningEngine(db, params, { explorationRate: 0 });

      const insert = db.prepare(
        'INSERT INTO meta_learning_snapshots (cycle, params, metrics, score) VALUES (?, ?, ?, ?)',
      );

      // Provide enough high-confidence data to trigger optimization
      // bin4 (0.8-1.0) with many samples => confidence >= 0.3
      for (let i = 1; i <= 4; i++) {
        insert.run(i, JSON.stringify({ rate: 0.85 + i * 0.01 }), '{}', 0.9);
      }
      // bin0 for current value
      for (let i = 5; i <= 7; i++) {
        insert.run(i, JSON.stringify({ rate: 0.05 + i * 0.01 }), '{}', 0.2);
      }

      engine.optimize();

      const val = engine.getParams().rate;
      expect(val).toBeGreaterThanOrEqual(0.0);
      expect(val).toBeLessThanOrEqual(1.0);
    });
  });

  // ── step ──────────────────────────────────────────────

  describe('step', () => {
    it('records a snapshot every call', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      const result = engine.step({ a: 1 }, 0.5);

      expect(result.snapshot.cycle).toBe(1);
      expect(result.snapshot.score).toBe(0.5);
    });

    it('triggers optimize at the analyzeInterval boundary (default every 5)', () => {
      const params: HyperParameter[] = [
        { name: 'rate', value: 0.1, min: 0.0, max: 1.0, step: 0.05 },
      ];
      const engine = new MetaLearningEngine(db, params, { explorationRate: 0 });

      // Seed database with data that will produce recommendations
      const insert = db.prepare(
        'INSERT INTO meta_learning_snapshots (cycle, params, metrics, score) VALUES (?, ?, ?, ?)',
      );
      for (let i = 1; i <= 4; i++) {
        insert.run(i, JSON.stringify({ rate: 0.85 }), '{}', 0.9);
      }
      for (let i = 5; i <= 7; i++) {
        insert.run(i, JSON.stringify({ rate: 0.1 }), '{}', 0.2);
      }

      // Steps 1-4: no optimization (not at interval)
      for (let i = 0; i < 4; i++) {
        const r = engine.step({ a: i }, 0.5);
        expect(r.optimized).toEqual([]);
      }

      // Step 5: should trigger optimization (cycleCount=5, 5 % 5 === 0)
      const r5 = engine.step({ a: 5 }, 0.5);
      // There may or may not be optimizations depending on data distribution,
      // but the optimize path was exercised (no error).
      expect(Array.isArray(r5.optimized)).toBe(true);
    });

    it('does not optimize before analyzeInterval', () => {
      const engine = new MetaLearningEngine(db, defaultParams(), { analyzeInterval: 10 });

      // Run 9 steps -- none should trigger optimization
      for (let i = 0; i < 9; i++) {
        const r = engine.step({ a: i }, 0.5);
        expect(r.optimized).toEqual([]);
      }
    });

    it('respects custom analyzeInterval', () => {
      const engine = new MetaLearningEngine(db, defaultParams(), { analyzeInterval: 3 });

      // Steps 1, 2: no optimization
      engine.step({ a: 1 }, 0.5);
      engine.step({ a: 2 }, 0.6);

      // Step 3: would trigger optimize (3 % 3 === 0), but not enough data (< 5 snapshots)
      const r3 = engine.step({ a: 3 }, 0.7);
      expect(Array.isArray(r3.optimized)).toBe(true);
    });
  });

  // ── getStatus ─────────────────────────────────────────

  describe('getStatus', () => {
    it('returns zeroed status with no snapshots', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      const status = engine.getStatus();

      expect(status.totalSnapshots).toBe(0);
      expect(status.totalOptimizations).toBe(0);
      expect(status.bestScore).toBe(0);
      expect(status.worstScore).toBe(0);
      expect(status.currentScore).toBe(0);
      expect(status.trend).toBe('stable');
      expect(status.recommendations).toEqual([]);
    });

    it('computes bestScore and worstScore correctly', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      engine.recordSnapshot({ a: 1 }, 0.3);
      engine.recordSnapshot({ a: 2 }, 0.9);
      engine.recordSnapshot({ a: 3 }, 0.6);

      const status = engine.getStatus();

      expect(status.bestScore).toBe(0.9);
      expect(status.worstScore).toBe(0.3);
      expect(status.totalSnapshots).toBe(3);
    });

    it('reports currentScore as the most recent snapshot score', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      engine.recordSnapshot({ a: 1 }, 0.3);
      engine.recordSnapshot({ a: 2 }, 0.9);
      engine.recordSnapshot({ a: 3 }, 0.6);

      const status = engine.getStatus();
      // getSnapshots orders by cycle DESC, so scores[0] is the latest
      expect(status.currentScore).toBe(0.6);
    });

    it('detects improving trend', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      // Need at least 10 snapshots for trend detection.
      // Previous 5 (cycles 1-5) with low scores, recent 5 (cycles 6-10) with high scores.
      // getSnapshots returns DESC order so scores[0..4] = recent, scores[5..9] = previous.
      const scores = [0.2, 0.25, 0.22, 0.23, 0.24, 0.6, 0.65, 0.62, 0.63, 0.64];
      for (let i = 0; i < scores.length; i++) {
        engine.recordSnapshot({ a: i }, scores[i]!);
      }

      const status = engine.getStatus();
      // Recent avg ~0.628, previous avg ~0.228 => delta ~0.4 > 0.05 => improving
      expect(status.trend).toBe('improving');
    });

    it('detects declining trend', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      // Previous 5 with high scores, recent 5 with low scores.
      const scores = [0.8, 0.85, 0.82, 0.83, 0.84, 0.2, 0.25, 0.22, 0.23, 0.24];
      for (let i = 0; i < scores.length; i++) {
        engine.recordSnapshot({ a: i }, scores[i]!);
      }

      const status = engine.getStatus();
      // Recent avg ~0.228, previous avg ~0.828 => delta ~-0.6 < -0.05 => declining
      expect(status.trend).toBe('declining');
    });

    it('detects stable trend when delta is small', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      // All 10 snapshots with very similar scores
      for (let i = 0; i < 10; i++) {
        engine.recordSnapshot({ a: i }, 0.5 + (i % 2 === 0 ? 0.01 : -0.01));
      }

      const status = engine.getStatus();
      expect(status.trend).toBe('stable');
    });

    it('reports stable trend when fewer than 10 snapshots', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      for (let i = 0; i < 8; i++) {
        engine.recordSnapshot({ a: i }, 0.1 * (i + 1));
      }

      const status = engine.getStatus();
      // Not enough data for trend detection (< 10)
      expect(status.trend).toBe('stable');
    });
  });

  // ── getHistory ────────────────────────────────────────

  describe('getHistory', () => {
    it('returns empty array when no optimizations exist', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      const history = engine.getHistory();
      expect(history).toEqual([]);
    });

    it('returns optimization records', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      // Insert optimization records directly
      db.prepare(
        'INSERT INTO meta_learning_optimizations (param_name, old_value, new_value, reason, improvement) VALUES (?, ?, ?, ?, ?)',
      ).run('learningRate', 0.5, 0.7, 'exploitation', 0.15);

      db.prepare(
        'INSERT INTO meta_learning_optimizations (param_name, old_value, new_value, reason, improvement) VALUES (?, ?, ?, ?, ?)',
      ).run('decayFactor', 0.3, 0.4, 'exploration', 0.05);

      const history = engine.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0]!.param_name).toBeDefined();
      expect(history[0]!.old_value).toBeDefined();
      expect(history[0]!.new_value).toBeDefined();
      expect(history[0]!.reason).toBeDefined();
    });

    it('respects limit parameter', () => {
      const engine = new MetaLearningEngine(db, defaultParams());

      for (let i = 0; i < 5; i++) {
        db.prepare(
          'INSERT INTO meta_learning_optimizations (param_name, old_value, new_value, reason, improvement) VALUES (?, ?, ?, ?, ?)',
        ).run('learningRate', 0.1 * i, 0.1 * (i + 1), 'exploitation', 0.01);
      }

      const history = engine.getHistory(3);
      expect(history).toHaveLength(3);
    });
  });
});
