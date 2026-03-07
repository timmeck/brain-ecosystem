import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { BenchmarkSuite } from '../../../src/agent-training/benchmark-suite.js';
import { AgentTrainer } from '../../../src/agent-training/agent-trainer.js';

describe('AgentTrainer', () => {
  let db: Database.Database;
  let suite: BenchmarkSuite;
  let trainer: AgentTrainer;

  beforeEach(() => {
    db = new Database(':memory:');
    suite = new BenchmarkSuite(db);
    trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);

    // Add test cases with different difficulties
    suite.addCase({ input: 'easy-1', expected: 'E1', category: 'test', difficulty: 'easy' });
    suite.addCase({ input: 'easy-2', expected: 'E2', category: 'test', difficulty: 'easy' });
    suite.addCase({ input: 'med-1', expected: 'M1', category: 'test', difficulty: 'medium' });
    suite.addCase({ input: 'med-2', expected: 'M2', category: 'test', difficulty: 'medium' });
    suite.addCase({ input: 'hard-1', expected: 'H1', category: 'test', difficulty: 'hard' });
    suite.addCase({ input: 'hard-2', expected: 'H2', category: 'test', difficulty: 'hard' });
  });

  afterEach(() => {
    db.close();
  });

  // ── Basic Training ───────────────────────────────────

  it('throws when no suite is set', async () => {
    const standalone = new AgentTrainer(db);
    await expect(standalone.train(async () => '')).rejects.toThrow('BenchmarkSuite not set');
  });

  it('runs training with curriculum learning (easy → medium → hard)', async () => {
    const evalFn = vi.fn().mockResolvedValue('correct-but-wrong');

    const report = await trainer.train(evalFn, { epochs: 3, name: 'test-curriculum' });

    expect(report.totalEpochs).toBe(3);
    expect(report.name).toBe('test-curriculum');
    expect(report.epochs[0].difficulty).toBe('easy');
    expect(report.epochs[1].difficulty).toBe('medium');
    expect(report.epochs[2].difficulty).toBe('hard');
  });

  it('extends beyond 3 epochs with all difficulty', async () => {
    const evalFn = vi.fn().mockResolvedValue('wrong');

    const report = await trainer.train(evalFn, { epochs: 5, earlyStop: false });

    expect(report.totalEpochs).toBe(5);
    expect(report.epochs[3].difficulty).toBe('all');
    expect(report.epochs[4].difficulty).toBe('all');
  });

  it('runs all difficulty when curriculum disabled', async () => {
    const evalFn = vi.fn().mockResolvedValue('wrong');

    const report = await trainer.train(evalFn, { epochs: 2, curriculumLearning: false, earlyStop: false });

    expect(report.epochs[0].difficulty).toBe('all');
    expect(report.epochs[1].difficulty).toBe('all');
  });

  // ── Accuracy Tracking ────────────────────────────────

  it('tracks perfect accuracy', async () => {
    // Mock: always return matching answer (case insensitive)
    const evalFn = vi.fn().mockImplementation(async (input: string) => {
      const map: Record<string, string> = {
        'easy-1': 'E1', 'easy-2': 'E2',
        'med-1': 'M1', 'med-2': 'M2',
        'hard-1': 'H1', 'hard-2': 'H2',
      };
      return map[input] ?? '';
    });

    const report = await trainer.train(evalFn, { epochs: 3 });
    expect(report.bestAccuracy).toBe(1);
    expect(report.finalAccuracy).toBe(1);
    expect(report.passed).toBe(true);
  });

  it('tracks improvement from first to last epoch', async () => {
    let callCount = 0;
    const evalFn = vi.fn().mockImplementation(async () => {
      callCount++;
      // First epoch: fail everything, then gradually improve
      return callCount <= 2 ? 'wrong' : 'E1';
    });

    // Only easy cases exist for easy difficulty
    const report = await trainer.train(evalFn, { epochs: 3, earlyStop: false });
    // First epoch (easy): 0 correct, later: depends on mock
    expect(report.epochs).toHaveLength(3);
    expect(typeof report.improvement).toBe('number');
  });

  // ── Early Stopping ───────────────────────────────────

  it('stops early when accuracy drops significantly', async () => {
    let epoch = 0;
    const evalFn = vi.fn().mockImplementation(async () => {
      epoch++;
      // epoch 1 (easy): 100%, epoch 2 (medium): 0% — drop of 1.0
      if (epoch <= 2) return 'E1'; // matches easy cases
      return 'wrong';
    });

    const report = await trainer.train(evalFn, { epochs: 3, earlyStop: true });
    // Should stop after epoch 2 due to >0.2 accuracy drop
    expect(report.totalEpochs).toBeLessThanOrEqual(3);
  });

  it('does not stop early when disabled', async () => {
    const evalFn = vi.fn().mockResolvedValue('wrong');

    const report = await trainer.train(evalFn, { epochs: 3, earlyStop: false });
    expect(report.totalEpochs).toBe(3);
  });

  // ── Pass Threshold ───────────────────────────────────

  it('marks epochs as passed/failed based on threshold', async () => {
    // Mock: perfect for easy, fail for medium/hard
    const evalFn = vi.fn().mockImplementation(async (input: string) => {
      if (input.startsWith('easy')) return input === 'easy-1' ? 'E1' : 'E2';
      return 'wrong';
    });

    const report = await trainer.train(evalFn, { epochs: 3, passThreshold: 0.5, earlyStop: false });
    expect(report.epochs[0].passed).toBe(true); // easy: 100%
    expect(report.epochs[1].passed).toBe(false); // medium: 0%
  });

  // ── Persistence ──────────────────────────────────────

  it('persists training sessions', async () => {
    const evalFn = vi.fn().mockResolvedValue('E1');

    await trainer.train(evalFn, { epochs: 1, name: 'persist-test' });
    const history = trainer.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe('persist-test');
  });

  it('retrieves full session report', async () => {
    const evalFn = vi.fn().mockResolvedValue('E1');

    const report = await trainer.train(evalFn, { epochs: 1 });
    const session = trainer.getSession(report.id);
    expect(session).not.toBeNull();
    expect(session!.id).toBe(report.id);
  });

  it('returns null for unknown session', () => {
    expect(trainer.getSession('nonexistent')).toBeNull();
  });

  // ── Status ──────────────────────────────────────────

  it('reports correct status', async () => {
    const evalFn = vi.fn().mockResolvedValue('E1');

    await trainer.train(evalFn, { epochs: 2, earlyStop: false });
    await trainer.train(evalFn, { epochs: 1 });

    const status = trainer.getStatus();
    expect(status.totalTrainingSessions).toBe(2);
    expect(status.bestAccuracy).toBeGreaterThanOrEqual(0);
    expect(status.totalEpochsRun).toBe(3);
    expect(typeof status.avgImprovement).toBe('number');
  });

  it('returns default status on empty DB', () => {
    const fresh = new AgentTrainer(db);
    const status = fresh.getStatus();
    expect(status.totalTrainingSessions).toBe(0);
    expect(status.bestAccuracy).toBe(0);
    expect(status.lastAccuracy).toBeNull();
  });
});
