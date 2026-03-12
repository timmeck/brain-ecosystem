import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ExperimentLedger } from '../experiment-ledger.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

describe('ExperimentLedger', () => {
  let db: Database.Database;
  let ledger: ExperimentLedger;

  beforeEach(() => {
    db = new Database(':memory:');
    ledger = new ExperimentLedger(db);
  });

  describe('startExperiment', () => {
    it('creates a new experiment', () => {
      const exp = ledger.startExperiment({
        hypothesis: 'More cycles improve accuracy',
        variantA: 'baseline (10 cycles)',
        variantB: 'change (20 cycles)',
        targetEngine: 'PredictionEngine',
        metricKeys: ['accuracy', 'latency'],
        cyclesPerVariant: 5,
      });

      expect(exp.id).toBe(1);
      expect(exp.hypothesis).toBe('More cycles improve accuracy');
      expect(exp.status).toBe('running_a');
      expect(exp.metric_keys).toEqual(['accuracy', 'latency']);
      expect(exp.cycles_per_variant).toBe(5);
    });

    it('rejects second experiment while one is running', () => {
      ledger.startExperiment({
        hypothesis: 'Test 1',
        variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['m'],
      });

      expect(() => ledger.startExperiment({
        hypothesis: 'Test 2',
        variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['m'],
      })).toThrow(/still running/);
    });
  });

  describe('recordCycleMetrics', () => {
    it('records metrics for phase A', () => {
      ledger.startExperiment({
        hypothesis: 'test', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['accuracy'],
        cyclesPerVariant: 3,
      });

      const r = ledger.recordCycleMetrics({ accuracy: 0.8 });
      expect(r).not.toBeNull();
      expect(r!.phase).toBe('a');
    });

    it('switches from A to B after enough cycles', () => {
      ledger.startExperiment({
        hypothesis: 'test', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['accuracy'],
        cyclesPerVariant: 2,
      });

      ledger.recordCycleMetrics({ accuracy: 0.7 });
      const r = ledger.recordCycleMetrics({ accuracy: 0.8 });
      expect(r!.phase).toBe('b'); // switched to B

      const active = ledger.getActive()!;
      expect(active.status).toBe('running_b');
    });

    it('completes experiment after both phases', () => {
      ledger.startExperiment({
        hypothesis: 'test', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['accuracy'],
        cyclesPerVariant: 2,
      });

      // Phase A: 2 cycles
      ledger.recordCycleMetrics({ accuracy: 0.7 });
      ledger.recordCycleMetrics({ accuracy: 0.8 });
      // Phase B: 2 cycles
      ledger.recordCycleMetrics({ accuracy: 0.85 });
      const r = ledger.recordCycleMetrics({ accuracy: 0.9 });
      expect(r!.phase).toBe('done');

      const active = ledger.getActive()!;
      expect(active.status).toBe('evaluating');
    });

    it('returns null when no active experiment', () => {
      const r = ledger.recordCycleMetrics({ accuracy: 0.5 });
      expect(r).toBeNull();
    });
  });

  describe('evaluate', () => {
    it('compares A vs B metrics', () => {
      ledger.startExperiment({
        hypothesis: 'test', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['accuracy'],
        cyclesPerVariant: 2,
      });

      // Phase A
      ledger.recordCycleMetrics({ accuracy: 0.7 });
      ledger.recordCycleMetrics({ accuracy: 0.8 });
      // Phase B
      ledger.recordCycleMetrics({ accuracy: 0.85 });
      ledger.recordCycleMetrics({ accuracy: 0.9 });

      const result = ledger.evaluate(1);
      expect(result).not.toBeNull();
      expect(result!.summary[0]!.metricKey).toBe('accuracy');
      expect(result!.summary[0]!.meanA).toBeCloseTo(0.75);
      expect(result!.summary[0]!.meanB).toBeCloseTo(0.875);
      expect(result!.summary[0]!.improvement).toBeGreaterThan(0);
    });
  });

  describe('decide', () => {
    it('records keep decision', () => {
      ledger.startExperiment({
        hypothesis: 'test', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['accuracy'],
        cyclesPerVariant: 2,
      });

      // Complete phases
      ledger.recordCycleMetrics({ accuracy: 0.7 });
      ledger.recordCycleMetrics({ accuracy: 0.8 });
      ledger.recordCycleMetrics({ accuracy: 0.9 });
      ledger.recordCycleMetrics({ accuracy: 0.9 });

      ledger.decide(1, 'keep', 'B is better');

      const exp = ledger.get(1)!;
      expect(exp.status).toBe('decided');
      expect(exp.decision).toBe('keep');
      expect(exp.decision_reason).toBe('B is better');
      expect(exp.completed_at).not.toBeNull();
    });
  });

  describe('cancel', () => {
    it('cancels an active experiment', () => {
      ledger.startExperiment({
        hypothesis: 'test', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['accuracy'],
      });

      ledger.cancel(1, 'changed priorities');

      const exp = ledger.get(1)!;
      expect(exp.status).toBe('cancelled');
      expect(exp.decision_reason).toBe('changed priorities');

      // Should allow starting new experiment after cancel
      expect(() => ledger.startExperiment({
        hypothesis: 'test2', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['accuracy'],
      })).not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('returns correct counts', () => {
      let status = ledger.getStatus();
      expect(status.total).toBe(0);
      expect(status.active).toBeNull();
      expect(status.kept).toBe(0);
      expect(status.reverted).toBe(0);

      ledger.startExperiment({
        hypothesis: 'test', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['m'],
        cyclesPerVariant: 1,
      });

      status = ledger.getStatus();
      expect(status.total).toBe(1);
      expect(status.active).not.toBeNull();

      // Complete and decide
      ledger.recordCycleMetrics({ m: 1 });
      ledger.recordCycleMetrics({ m: 2 });
      ledger.decide(1, 'keep');

      status = ledger.getStatus();
      expect(status.kept).toBe(1);
      expect(status.active).toBeNull();
    });
  });

  describe('list', () => {
    it('lists experiments ordered by created_at DESC', () => {
      ledger.startExperiment({
        hypothesis: 'test1', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['m'], cyclesPerVariant: 1,
      });
      ledger.recordCycleMetrics({ m: 1 });
      ledger.recordCycleMetrics({ m: 2 });
      ledger.decide(1, 'keep');

      ledger.startExperiment({
        hypothesis: 'test2', variantA: 'a', variantB: 'b',
        targetEngine: 'e', metricKeys: ['m'],
      });

      const all = ledger.list();
      expect(all).toHaveLength(2);
      expect(all[0]!.hypothesis).toBe('test2'); // most recent first
    });
  });
});
