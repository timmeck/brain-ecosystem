import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { PredictionEngine, runPredictionMigration } from '../prediction-engine.js';

// ── Helpers ───────────────────────────────────────────────

/** Seed ascending metric data to produce a predictable upward trend. */
function seedMetrics(
  db: Database.Database,
  metric: string,
  count: number,
  options?: { baseValue?: number; step?: number; domain?: string; baseTime?: number },
): void {
  const baseValue = options?.baseValue ?? 10;
  const step = options?.step ?? 1;
  const domain = options?.domain ?? 'metric';
  const baseTime = options?.baseTime ?? Date.now() - count * 60_000;

  for (let i = 0; i < count; i++) {
    db.prepare(
      'INSERT INTO prediction_metrics (metric, value, domain, timestamp) VALUES (?, ?, ?, ?)',
    ).run(metric, baseValue + i * step, domain, baseTime + i * 60_000);
  }
}

// ── Tests ─────────────────────────────────────────────────

describe('runPredictionMigration', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates predictions, prediction_metrics, and prediction_state tables', () => {
    runPredictionMigration(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map(t => t.name);

    expect(names).toContain('predictions');
    expect(names).toContain('prediction_metrics');
    expect(names).toContain('prediction_state');
  });

  it('initialises prediction_state with a single row', () => {
    runPredictionMigration(db);

    const row = db.prepare('SELECT * FROM prediction_state WHERE id = 1').get() as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.total_predictions).toBe(0);
    expect(row.total_resolved).toBe(0);
    expect(row.total_correct).toBe(0);
    expect(row.calibration_offset).toBe(0);
  });

  it('is idempotent (running twice does not throw)', () => {
    runPredictionMigration(db);
    expect(() => runPredictionMigration(db)).not.toThrow();
  });
});

describe('PredictionEngine', () => {
  let db: Database.Database;
  let engine: PredictionEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    runPredictionMigration(db);
    engine = new PredictionEngine(db, { brainName: 'test-brain', minConfidence: 0.01, minDataPoints: 5 });
  });

  afterEach(() => {
    engine.stop();
    db.close();
  });

  // ── Creation & Config ───────────────────────────────────

  it('creates an engine with default config values', () => {
    const cfg = engine.getConfig();
    expect(cfg.brainName).toBe('test-brain');
    expect(cfg.defaultHorizonMs).toBe(600_000);
    expect(cfg.expirationMs).toBe(3_600_000);
    expect(cfg.ewmaAlpha).toBe(0.3);
    expect(cfg.trendBeta).toBe(0.1);
    expect(cfg.minDataPoints).toBe(5);
    expect(cfg.minConfidence).toBe(0.01);
    expect(cfg.maxPredictionsPerCycle).toBe(5);
    expect(cfg.resolveIntervalMs).toBe(60_000);
  });

  it('updateConfig merges partial updates', () => {
    engine.updateConfig({ ewmaAlpha: 0.5, trendBeta: 0.2 });
    const cfg = engine.getConfig();
    expect(cfg.ewmaAlpha).toBe(0.5);
    expect(cfg.trendBeta).toBe(0.2);
    // unchanged fields remain
    expect(cfg.minDataPoints).toBe(5);
  });

  // ── recordMetric ────────────────────────────────────────

  it('recordMetric inserts data points into prediction_metrics', () => {
    engine.recordMetric('cpu_load', 42.5, 'metric');
    engine.recordMetric('cpu_load', 45.0, 'metric');
    engine.recordMetric('cpu_load', 47.2, 'metric');

    const rows = db.prepare('SELECT * FROM prediction_metrics WHERE metric = ?').all('cpu_load');
    expect(rows).toHaveLength(3);
  });

  // ── predict ─────────────────────────────────────────────

  it('predict returns null when insufficient data (< 2 points)', () => {
    engine.recordMetric('sparse', 10);

    const result = engine.predict({ domain: 'metric', metric: 'sparse' });
    expect(result).toBeNull();
  });

  it('predict returns a Prediction with EWMA when 2-4 data points exist', () => {
    seedMetrics(db, 'short_series', 3, { baseValue: 10, step: 5 });

    const prediction = engine.predict({ domain: 'metric', metric: 'short_series' });
    expect(prediction).not.toBeNull();
    expect(prediction!.method).toBe('ewma');
    expect(prediction!.status).toBe('pending');
    expect(prediction!.domain).toBe('metric');
    expect(prediction!.metric).toBe('short_series');
    expect(prediction!.prediction_id).toBeTruthy();
    expect(prediction!.confidence).toBeGreaterThan(0);
    expect(prediction!.horizon_ms).toBe(600_000);
  });

  it('predict returns a Prediction with holt_winters when >= minDataPoints', () => {
    seedMetrics(db, 'long_series', 10, { baseValue: 100, step: 2 });

    const prediction = engine.predict({ domain: 'trade', metric: 'long_series' });
    expect(prediction).not.toBeNull();
    expect(prediction!.method).toBe('holt_winters');
    expect(prediction!.predicted_direction).toBe('up');
    expect(prediction!.evidence).toHaveProperty('dataPoints', 10);
    expect(prediction!.evidence).toHaveProperty('trend');
  });

  it('predict increments total_predictions in prediction_state', () => {
    seedMetrics(db, 'counter_test', 3, { baseValue: 10, step: 1 });

    engine.predict({ domain: 'metric', metric: 'counter_test' });
    engine.predict({ domain: 'metric', metric: 'counter_test' });

    const state = db.prepare('SELECT total_predictions FROM prediction_state WHERE id = 1').get() as { total_predictions: number };
    expect(state.total_predictions).toBe(2);
  });

  // ── forecast ────────────────────────────────────────────

  it('forecast uses EWMA for small datasets and holt_winters for large', () => {
    const shortResult = engine.forecast([10, 20, 30], 60_000);
    expect(shortResult.method).toBe('ewma');
    expect(shortResult.dataPoints).toBe(3);

    const longResult = engine.forecast([10, 20, 30, 40, 50, 60, 70], 60_000);
    expect(longResult.method).toBe('holt_winters');
    expect(longResult.dataPoints).toBe(7);
    expect(longResult.direction).toBe('up');
  });

  // ── list ────────────────────────────────────────────────

  it('list returns stored predictions, optionally filtered by domain/status', () => {
    seedMetrics(db, 'm1', 3, { baseValue: 10, step: 1, domain: 'error' });
    seedMetrics(db, 'm2', 3, { baseValue: 50, step: 5, domain: 'trade' });

    engine.predict({ domain: 'error', metric: 'm1' });
    engine.predict({ domain: 'trade', metric: 'm2' });

    const all = engine.list();
    expect(all).toHaveLength(2);

    const errorOnly = engine.list('error');
    expect(errorOnly).toHaveLength(1);
    expect(errorOnly[0]!.domain).toBe('error');

    const pendingOnly = engine.list(undefined, 'pending');
    expect(pendingOnly).toHaveLength(2);
  });

  // ── getAccuracy ─────────────────────────────────────────

  it('getAccuracy returns per-domain accuracy stats after resolution', () => {
    // Insert a prediction directly, then resolve it via the tracker
    seedMetrics(db, 'acc_metric', 5, { baseValue: 100, step: 1 });
    const pred = engine.predict({ domain: 'error', metric: 'acc_metric' });
    expect(pred).not.toBeNull();

    // Manually resolve: set status to 'correct' in DB
    db.prepare("UPDATE predictions SET status = 'correct', actual_value = ?, error = 0.01 WHERE prediction_id = ?")
      .run(pred!.predicted_value, pred!.prediction_id);

    const accuracy = engine.getAccuracy('error');
    expect(accuracy).toHaveLength(1);
    expect(accuracy[0]!.domain).toBe('error');
    expect(accuracy[0]!.correct).toBe(1);
    expect(accuracy[0]!.accuracy_rate).toBe(1);
  });

  // ── getSummary ──────────────────────────────────────────

  it('getSummary returns a full summary with totals and recent predictions', () => {
    seedMetrics(db, 'sum_m', 4, { baseValue: 5, step: 2 });
    engine.predict({ domain: 'metric', metric: 'sum_m' });

    const summary = engine.getSummary();
    expect(summary.total_predictions).toBe(1);
    expect(summary.pending).toBe(1);
    expect(summary.resolved).toBe(0);
    expect(summary.accuracy_rate).toBe(0);
    expect(summary.calibration_offset).toBe(0);
    expect(summary.recent).toHaveLength(1);
    expect(summary.by_domain).toEqual([]);
  });

  // ── resolveExpired ──────────────────────────────────────

  it('resolveExpired marks predictions past expires_at as expired', () => {
    seedMetrics(db, 'exp_m', 3, { baseValue: 10, step: 1 });
    const pred = engine.predict({ domain: 'metric', metric: 'exp_m' });
    expect(pred).not.toBeNull();

    // Force the prediction to be expired by setting expires_at to the past
    const past = Date.now() - 10_000;
    db.prepare('UPDATE predictions SET expires_at = ? WHERE prediction_id = ?')
      .run(past, pred!.prediction_id);

    const resolved = engine.resolveExpired();
    expect(resolved).toBeGreaterThanOrEqual(1);

    const updated = engine.list(undefined, 'expired');
    expect(updated).toHaveLength(1);
    expect(updated[0]!.prediction_id).toBe(pred!.prediction_id);
  });

  it('resolveExpired resolves predictions past their horizon against actual data', () => {
    seedMetrics(db, 'res_m', 4, { baseValue: 50, step: 2 });
    const pred = engine.predict({ domain: 'metric', metric: 'res_m' });
    expect(pred).not.toBeNull();

    // Make the prediction resolvable: created_at + horizon_ms <= now AND expires_at >= now
    const now = Date.now();
    db.prepare('UPDATE predictions SET created_at = ?, expires_at = ? WHERE prediction_id = ?')
      .run(now - pred!.horizon_ms - 1000, now + 100_000, pred!.prediction_id);

    // Insert post-prediction metric values (timestamp > created_at)
    const predCreatedAt = now - pred!.horizon_ms - 1000;
    for (let i = 0; i < 5; i++) {
      db.prepare('INSERT INTO prediction_metrics (metric, value, domain, timestamp) VALUES (?, ?, ?, ?)')
        .run('res_m', pred!.predicted_value + i * 0.1, 'metric', predCreatedAt + 1000 + i * 1000);
    }

    const resolved = engine.resolveExpired();
    expect(resolved).toBeGreaterThanOrEqual(1);

    // The prediction should no longer be 'pending'
    const pending = engine.list(undefined, 'pending');
    const resolvedPred = pending.find(p => p.prediction_id === pred!.prediction_id);
    expect(resolvedPred).toBeUndefined();
  });

  // ── getMetricHistory ────────────────────────────────────

  it('getMetricHistory returns data points in ascending timestamp order', () => {
    engine.recordMetric('hist_m', 10);
    engine.recordMetric('hist_m', 20);
    engine.recordMetric('hist_m', 30);

    const history = engine.getMetricHistory('hist_m', 10);
    expect(history).toHaveLength(3);
    expect(history[0]!.value).toBe(10);
    expect(history[2]!.value).toBe(30);
    expect(history[0]!.timestamp).toBeLessThanOrEqual(history[1]!.timestamp);
    expect(history[1]!.timestamp).toBeLessThanOrEqual(history[2]!.timestamp);
  });

  it('getMetricHistory respects the limit parameter', () => {
    for (let i = 0; i < 20; i++) {
      engine.recordMetric('limited_m', i);
    }

    const limited = engine.getMetricHistory('limited_m', 5);
    expect(limited).toHaveLength(5);
  });

  // ── start / stop ────────────────────────────────────────

  it('start and stop manage the resolution timer without error', () => {
    expect(() => engine.start()).not.toThrow();
    // calling start again is a no-op
    expect(() => engine.start()).not.toThrow();
    expect(() => engine.stop()).not.toThrow();
    // stopping again is safe
    expect(() => engine.stop()).not.toThrow();
  });
});
