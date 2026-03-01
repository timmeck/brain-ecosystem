import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PredictionTracker } from '../../../src/prediction/tracker.js';
import { runPredictionMigration } from '../../../src/prediction/prediction-engine.js';
import type { Prediction } from '../../../src/prediction/types.js';

function makePrediction(overrides: Partial<Prediction> = {}): Prediction {
  return {
    prediction_id: `pred-${Math.random().toString(36).slice(2, 8)}`,
    domain: 'error',
    metric: 'error_count',
    predicted_value: 10,
    predicted_direction: 'up',
    confidence: 0.75,
    horizon_ms: 3_600_000,
    reasoning: 'Test prediction',
    method: 'holt_winters',
    status: 'pending',
    created_at: Date.now(),
    expires_at: Date.now() + 86_400_000,
    evidence: {},
    ...overrides,
  };
}

describe('PredictionTracker', () => {
  let db: Database.Database;
  let tracker: PredictionTracker;

  beforeEach(() => {
    db = new Database(':memory:');
    runPredictionMigration(db);
    tracker = new PredictionTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('store', () => {
    it('should insert prediction and return id', () => {
      const pred = makePrediction();
      const id = tracker.store(pred);
      expect(id).toBe(pred.prediction_id);

      const row = db.prepare('SELECT COUNT(*) as c FROM predictions').get() as { c: number };
      expect(row.c).toBe(1);
    });

    it('should store all fields correctly', () => {
      const pred = makePrediction({ domain: 'trade', metric: 'win_rate', confidence: 0.85 });
      tracker.store(pred);

      const rows = tracker.list('trade');
      expect(rows).toHaveLength(1);
      expect(rows[0].domain).toBe('trade');
      expect(rows[0].metric).toBe('win_rate');
      expect(rows[0].confidence).toBe(0.85);
    });
  });

  describe('resolve', () => {
    it('should mark as correct when error < 10% and direction match', () => {
      const pred = makePrediction({ predicted_value: 10, predicted_direction: 'up' });
      tracker.store(pred);

      const status = tracker.resolve(pred.prediction_id, 10.5); // 5% error, value > predicted → up
      expect(status).toBe('correct');
    });

    it('should mark as wrong when error > 25% and wrong direction', () => {
      const pred = makePrediction({ predicted_value: 10, predicted_direction: 'up' });
      tracker.store(pred);

      const status = tracker.resolve(pred.prediction_id, 5); // 50% error, value < predicted → down
      expect(status).toBe('wrong');
    });

    it('should mark as partial when direction correct but value off', () => {
      const pred = makePrediction({ predicted_value: 10, predicted_direction: 'up' });
      tracker.store(pred);

      // 20% error but direction is correct (actual > predicted * 1.02 → up)
      const status = tracker.resolve(pred.prediction_id, 12);
      expect(status).toBe('partial');
    });

    it('should return expired for unknown prediction', () => {
      const status = tracker.resolve('nonexistent', 10);
      expect(status).toBe('expired');
    });
  });

  describe('list', () => {
    it('should filter by domain', () => {
      tracker.store(makePrediction({ domain: 'error' }));
      tracker.store(makePrediction({ domain: 'trade' }));
      tracker.store(makePrediction({ domain: 'error' }));

      const errors = tracker.list('error');
      expect(errors).toHaveLength(2);
      expect(errors.every(p => p.domain === 'error')).toBe(true);
    });

    it('should filter by status', () => {
      const pred1 = makePrediction();
      const pred2 = makePrediction();
      tracker.store(pred1);
      tracker.store(pred2);
      tracker.resolve(pred1.prediction_id, pred1.predicted_value);

      const pending = tracker.list(undefined, 'pending');
      expect(pending).toHaveLength(1);
    });

    it('should respect limit', () => {
      for (let i = 0; i < 10; i++) {
        tracker.store(makePrediction());
      }
      const limited = tracker.list(undefined, undefined, 3);
      expect(limited).toHaveLength(3);
    });
  });

  describe('getAccuracy', () => {
    it('should calculate correct accuracy metrics', () => {
      // 3 predictions: 2 correct, 1 wrong
      const p1 = makePrediction({ domain: 'error', predicted_value: 10, predicted_direction: 'stable' });
      const p2 = makePrediction({ domain: 'error', predicted_value: 10, predicted_direction: 'stable' });
      const p3 = makePrediction({ domain: 'error', predicted_value: 10, predicted_direction: 'up' });
      tracker.store(p1);
      tracker.store(p2);
      tracker.store(p3);

      tracker.resolve(p1.prediction_id, 10);  // correct (0% error, direction match)
      tracker.resolve(p2.prediction_id, 10);  // correct
      tracker.resolve(p3.prediction_id, 5);   // wrong (50% error, predicted up but went down)

      const acc = tracker.getAccuracy();
      expect(acc).toHaveLength(1);
      expect(acc[0].domain).toBe('error');
      expect(acc[0].total).toBe(3);
      expect(acc[0].correct).toBe(2);
      expect(acc[0].wrong).toBe(1);
      expect(acc[0].accuracy_rate).toBeCloseTo(0.667, 2);
    });

    it('should return empty array with no resolved predictions', () => {
      const acc = tracker.getAccuracy();
      expect(acc).toHaveLength(0);
    });

    it('should filter by domain', () => {
      const p1 = makePrediction({ domain: 'error', predicted_value: 10, predicted_direction: 'stable' });
      const p2 = makePrediction({ domain: 'trade', predicted_value: 10, predicted_direction: 'stable' });
      tracker.store(p1);
      tracker.store(p2);
      tracker.resolve(p1.prediction_id, 10);
      tracker.resolve(p2.prediction_id, 10);

      const errorAcc = tracker.getAccuracy('error');
      expect(errorAcc).toHaveLength(1);
      expect(errorAcc[0].domain).toBe('error');
    });
  });

  describe('getCalibrationOffset', () => {
    it('should return 0 when no data', () => {
      const offset = tracker.getCalibrationOffset();
      expect(offset).toBe(0);
    });
  });

  describe('getPendingExpired', () => {
    it('should return predictions past expires_at', () => {
      const expired = makePrediction({ expires_at: Date.now() - 1000 });
      const active = makePrediction({ expires_at: Date.now() + 100_000 });
      tracker.store(expired);
      tracker.store(active);

      const result = tracker.getPendingExpired();
      expect(result).toHaveLength(1);
      expect(result[0].prediction_id).toBe(expired.prediction_id);
    });
  });

  describe('getMetricsWithPending', () => {
    it('should return set of metrics that have pending predictions', () => {
      tracker.store(makePrediction({ metric: 'error_count' }));
      tracker.store(makePrediction({ metric: 'win_rate' }));

      const metrics = tracker.getMetricsWithPending();
      expect(metrics.has('error_count')).toBe(true);
      expect(metrics.has('win_rate')).toBe(true);
      expect(metrics.has('unknown')).toBe(false);
    });
  });
});
