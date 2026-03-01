import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { PredictionEngine, runPredictionMigration } from '../../../src/prediction/prediction-engine.js';

describe('runPredictionMigration', () => {
  it('should create all 3 tables', () => {
    const db = new Database(':memory:');
    runPredictionMigration(db);

    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'prediction%'`,
    ).all() as Array<{ name: string }>;
    const names = tables.map(t => t.name);

    expect(names).toContain('predictions');
    expect(names).toContain('prediction_metrics');
    expect(names).toContain('prediction_state');
    db.close();
  });

  it('should be idempotent', () => {
    const db = new Database(':memory:');
    runPredictionMigration(db);
    runPredictionMigration(db);

    const count = (db.prepare('SELECT COUNT(*) as c FROM prediction_state').get() as { c: number }).c;
    expect(count).toBe(1);
    db.close();
  });

  it('should initialize prediction_state with id=1', () => {
    const db = new Database(':memory:');
    runPredictionMigration(db);

    const state = db.prepare('SELECT * FROM prediction_state WHERE id = 1').get() as Record<string, unknown>;
    expect(state).toBeDefined();
    expect(state.total_predictions).toBe(0);
    expect(state.calibration_offset).toBe(0);
    db.close();
  });
});

describe('PredictionEngine', () => {
  let db: Database.Database;
  let engine: PredictionEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    db = new Database(':memory:');
    engine = new PredictionEngine(db, { brainName: 'test' });
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should run migration and create engine', () => {
      const tables = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'prediction%'`,
      ).all() as Array<{ name: string }>;
      expect(tables.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('recordMetric', () => {
    it('should insert into prediction_metrics', () => {
      engine.recordMetric('error_count', 5, 'error');
      engine.recordMetric('error_count', 3, 'error');

      const count = (db.prepare('SELECT COUNT(*) as c FROM prediction_metrics').get() as { c: number }).c;
      expect(count).toBe(2);
    });
  });

  describe('predict', () => {
    it('should return null when insufficient data', () => {
      // Only 1 data point → need at least 2
      engine.recordMetric('error_count', 5, 'error');
      const result = engine.predict({ domain: 'error', metric: 'error_count' });
      expect(result).toBeNull();
    });

    it('should return Prediction with correct fields when enough data', () => {
      for (let i = 0; i < 6; i++) {
        engine.recordMetric('error_count', 10 + i, 'error');
      }
      const result = engine.predict({ domain: 'error', metric: 'error_count' });
      expect(result).not.toBeNull();
      expect(result!.prediction_id).toBeDefined();
      expect(result!.domain).toBe('error');
      expect(result!.metric).toBe('error_count');
      expect(result!.status).toBe('pending');
      expect(result!.method).toBe('holt_winters');
      expect(result!.predicted_direction).toBe('up');
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
    });

    it('should use EWMA for < 5 data points', () => {
      for (let i = 0; i < 3; i++) {
        engine.recordMetric('metric_a', 10 + i, 'metric');
      }
      const result = engine.predict({ domain: 'metric', metric: 'metric_a' });
      if (result) {
        expect(result.method).toBe('ewma');
      }
    });

    it('should emit ThoughtStream thought', () => {
      const emitFn = vi.fn();
      const mockStream = { emit: emitFn, getRecent: vi.fn(), getByEngine: vi.fn(), getStats: vi.fn(), getEngineActivity: vi.fn(), clear: vi.fn(), onThought: vi.fn() };
      engine.setThoughtStream(mockStream as any);

      for (let i = 0; i < 6; i++) {
        engine.recordMetric('test_metric', 10 + i, 'metric');
      }
      engine.predict({ domain: 'metric', metric: 'test_metric' });

      expect(emitFn).toHaveBeenCalled();
      const call = emitFn.mock.calls.find((c: unknown[]) => c[0] === 'prediction');
      expect(call).toBeDefined();
    });

    it('should suppress low confidence predictions', () => {
      const lowConfEngine = new PredictionEngine(db, {
        brainName: 'test',
        minConfidence: 0.99,
      });
      for (let i = 0; i < 6; i++) {
        lowConfEngine.recordMetric('noisy', Math.random() * 100, 'metric');
      }
      const result = lowConfEngine.predict({ domain: 'metric', metric: 'noisy' });
      // With minConfidence 0.99, most predictions should be suppressed
      // (unless data is perfectly stable, which random data won't be)
      // This test may occasionally pass if random data happens to be very stable
      expect(result === null || result.confidence >= 0.99).toBe(true);
    });
  });

  describe('autoPredictAll', () => {
    it('should generate predictions for tracked metrics', () => {
      // Record enough data for 2 metrics
      for (let i = 0; i < 6; i++) {
        engine.recordMetric('metric_a', 10 + i, 'error');
        engine.recordMetric('metric_b', 20 + i, 'trade');
      }
      const predictions = engine.autoPredictAll();
      expect(predictions.length).toBeGreaterThanOrEqual(1);
      expect(predictions.length).toBeLessThanOrEqual(5);
    });

    it('should skip metrics with pending predictions', () => {
      for (let i = 0; i < 6; i++) {
        engine.recordMetric('metric_x', 10 + i, 'error');
      }
      // First call creates a pending prediction
      const first = engine.autoPredictAll();
      expect(first.length).toBe(1);

      // Second call should skip (pending exists)
      const second = engine.autoPredictAll();
      expect(second.length).toBe(0);
    });

    it('should respect maxPredictionsPerCycle', () => {
      const limitedEngine = new PredictionEngine(db, {
        brainName: 'test',
        maxPredictionsPerCycle: 2,
      });
      for (let i = 0; i < 6; i++) {
        limitedEngine.recordMetric('m1', 10 + i, 'error');
        limitedEngine.recordMetric('m2', 20 + i, 'trade');
        limitedEngine.recordMetric('m3', 30 + i, 'engagement');
      }
      const predictions = limitedEngine.autoPredictAll();
      expect(predictions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('resolveExpired', () => {
    it('should mark expired predictions', () => {
      // Insert a prediction that's already expired
      db.prepare(`
        INSERT INTO predictions (prediction_id, domain, metric, predicted_value, predicted_direction, confidence, horizon_ms, reasoning, method, status, created_at, expires_at, evidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('expired-1', 'error', 'error_count', 10, 'up', 0.7, 3600000, '', 'holt_winters', 'pending', Date.now() - 200_000, Date.now() - 100_000, '{}');

      const resolved = engine.resolveExpired();
      expect(resolved).toBeGreaterThanOrEqual(1);

      const list = engine.list(undefined, 'expired');
      expect(list.length).toBe(1);
    });

    it('should resolve predictions with available metric data', () => {
      // Create a pending prediction from the past
      const now = Date.now();
      db.prepare(`
        INSERT INTO predictions (prediction_id, domain, metric, predicted_value, predicted_direction, confidence, horizon_ms, reasoning, method, status, created_at, expires_at, evidence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('resolve-1', 'error', 'error_count', 10, 'stable', 0.7, 1000, '', 'holt_winters', 'pending', now - 5000, now + 86_400_000, '{}');

      // Record actual metric data after the prediction
      db.prepare(`
        INSERT INTO prediction_metrics (metric, value, domain, timestamp) VALUES (?, ?, ?, ?)
      `).run('error_count', 10.5, 'error', now - 2000);

      const resolved = engine.resolveExpired();
      expect(resolved).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getSummary', () => {
    it('should return correct totals', () => {
      const summary = engine.getSummary();
      expect(summary.total_predictions).toBe(0);
      expect(summary.pending).toBe(0);
      expect(summary.resolved).toBe(0);
      expect(summary.calibration_offset).toBe(0);
      expect(summary.by_domain).toEqual([]);
      expect(summary.recent).toEqual([]);
    });

    it('should track prediction counts', () => {
      for (let i = 0; i < 6; i++) {
        engine.recordMetric('test', 10 + i, 'metric');
      }
      engine.predict({ domain: 'metric', metric: 'test' });

      const summary = engine.getSummary();
      expect(summary.total_predictions).toBe(1);
      expect(summary.pending).toBe(1);
    });
  });

  describe('start/stop', () => {
    it('should manage timer', () => {
      engine.start();
      // Engine is running — advance time
      vi.advanceTimersByTime(61_000);
      engine.stop();
      // No error means success
    });

    it('should not start twice', () => {
      engine.start();
      engine.start(); // Should be no-op
      engine.stop();
    });
  });

  describe('forecast', () => {
    it('should use holtWinters for >= 5 points', () => {
      const result = engine.forecast([1, 2, 3, 4, 5], 3_600_000);
      expect(result.method).toBe('holt_winters');
    });

    it('should use ewma for < 5 points', () => {
      const result = engine.forecast([1, 2, 3], 3_600_000);
      expect(result.method).toBe('ewma');
    });
  });

  describe('getMetricHistory', () => {
    it('should return recorded metrics in order', () => {
      engine.recordMetric('test', 10, 'metric');
      engine.recordMetric('test', 20, 'metric');
      engine.recordMetric('test', 30, 'metric');

      const history = engine.getMetricHistory('test');
      expect(history).toHaveLength(3);
      expect(history[0].value).toBe(10);
      expect(history[2].value).toBe(30);
    });
  });
});
