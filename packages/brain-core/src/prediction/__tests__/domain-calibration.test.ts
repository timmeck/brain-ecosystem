import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PredictionTracker } from '../tracker.js';
import { runPredictionMigration } from '../prediction-engine.js';

describe('PredictionTracker — Domain Calibration', () => {
  let db: Database.Database;
  let tracker: PredictionTracker;

  beforeEach(() => {
    db = new Database(':memory:');
    runPredictionMigration(db);
    tracker = new PredictionTracker(db);
  });

  function insertPrediction(domain: string, confidence: number, status: string) {
    db.prepare(`
      INSERT INTO predictions (prediction_id, domain, metric, predicted_value, predicted_direction, confidence, horizon_ms, method, status, created_at, expires_at)
      VALUES (?, ?, 'test', 100, 'up', ?, 60000, 'ewma', ?, ?, ?)
    `).run(
      `pred-${Math.random()}`, domain, confidence, status,
      Date.now() - 100000, Date.now() + 100000,
    );
  }

  describe('getCalibrationBucketsByDomain', () => {
    it('should return domain-specific buckets', () => {
      // Add scanner predictions — mostly wrong
      for (let i = 0; i < 10; i++) insertPrediction('scanner', 0.8, 'wrong');
      for (let i = 0; i < 2; i++) insertPrediction('scanner', 0.8, 'correct');

      // Add codegen predictions — mostly correct
      for (let i = 0; i < 10; i++) insertPrediction('codegen', 0.8, 'correct');

      const scannerBuckets = tracker.getCalibrationBucketsByDomain('scanner');
      const codegenBuckets = tracker.getCalibrationBucketsByDomain('codegen');

      const scannerHigh = scannerBuckets.find(b => b.range_start === 0.8);
      const codegenHigh = codegenBuckets.find(b => b.range_start === 0.8);

      expect(scannerHigh!.actual_accuracy).toBeCloseTo(2 / 12, 1);
      expect(codegenHigh!.actual_accuracy).toBe(1.0);
    });
  });

  describe('getDomainRollingAccuracy', () => {
    it('should return rolling accuracy for a domain', () => {
      for (let i = 0; i < 8; i++) insertPrediction('scanner', 0.7, 'wrong');
      for (let i = 0; i < 2; i++) insertPrediction('scanner', 0.7, 'correct');

      const acc = tracker.getDomainRollingAccuracy('scanner');
      expect(acc).toBeCloseTo(0.2, 1);
    });

    it('should return 0 for empty domain', () => {
      const acc = tracker.getDomainRollingAccuracy('codegen');
      expect(acc).toBe(0);
    });
  });

  describe('getDomainCalibrationOffsets', () => {
    it('should return per-domain offsets', () => {
      for (let i = 0; i < 5; i++) insertPrediction('scanner', 0.8, 'wrong');
      for (let i = 0; i < 5; i++) insertPrediction('codegen', 0.8, 'correct');

      const offsets = tracker.getDomainCalibrationOffsets();
      expect(offsets.has('scanner')).toBe(true);
      expect(offsets.has('codegen')).toBe(true);

      // scanner: high confidence, low accuracy → positive offset (overconfident)
      expect(offsets.get('scanner')!).toBeGreaterThan(0);
      // codegen: high confidence, high accuracy → low offset
      expect(offsets.get('codegen')!).toBeLessThan(offsets.get('scanner')!);
    });
  });
});
