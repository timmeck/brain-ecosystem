import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { AgentTrainer, runTrainerMigration } from '../agent-trainer.js';
import { BenchmarkSuite, runBenchmarkMigration } from '../benchmark-suite.js';
import type { EvalCase } from '../benchmark-suite.js';

describe('AgentTrainer', () => {
  let db: Database.Database;
  let suite: BenchmarkSuite;

  const easyCases: EvalCase[] = [
    { input: '2+2', expected: '4', category: 'math', difficulty: 'easy' },
    { input: '3+1', expected: '4', category: 'math', difficulty: 'easy' },
  ];

  const mediumCases: EvalCase[] = [
    { input: '10*5', expected: '50', category: 'math', difficulty: 'medium' },
    { input: '100/4', expected: '25', category: 'math', difficulty: 'medium' },
  ];

  const hardCases: EvalCase[] = [
    { input: 'sqrt(144)', expected: '12', category: 'math', difficulty: 'hard' },
    { input: '2^10', expected: '1024', category: 'math', difficulty: 'hard' },
  ];

  beforeEach(() => {
    db = new Database(':memory:');
    runBenchmarkMigration(db);
    runTrainerMigration(db);
    suite = new BenchmarkSuite(db);
    suite.addCases([...easyCases, ...mediumCases, ...hardCases]);
  });

  afterEach(() => { db.close(); });

  it('creates trainer without error', () => {
    const trainer = new AgentTrainer(db);
    expect(trainer).toBeInstanceOf(AgentTrainer);
  });

  it('getStatus returns zeros when no training has occurred', () => {
    const trainer = new AgentTrainer(db);
    const status = trainer.getStatus();
    expect(status.totalTrainingSessions).toBe(0);
    expect(status.bestAccuracy).toBe(0);
    expect(status.lastAccuracy).toBeNull();
    expect(status.totalEpochsRun).toBe(0);
    expect(status.avgImprovement).toBe(0);
  });

  it('setBenchmarkSuite sets suite for training', async () => {
    const trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);
    // Verifying it doesn't throw when training after setting suite
    const report = await trainer.train(async () => 'ignored', { epochs: 1 });
    expect(report.totalEpochs).toBe(1);
  });

  it('throws if train is called without setBenchmarkSuite', async () => {
    const trainer = new AgentTrainer(db);
    await expect(trainer.train(async () => 'x')).rejects.toThrow('BenchmarkSuite not set');
  });

  it('trains with evalFn that returns correct answers', async () => {
    const trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);

    const answers: Record<string, string> = {
      '2+2': '4', '3+1': '4',
      '10*5': '50', '100/4': '25',
      'sqrt(144)': '12', '2^10': '1024',
    };

    const report = await trainer.train(
      async (input) => answers[input] ?? 'unknown',
      { epochs: 3, name: 'perfect-run' },
    );

    expect(report.name).toBe('perfect-run');
    expect(report.totalEpochs).toBe(3);
    expect(report.bestAccuracy).toBe(1);
    expect(report.finalAccuracy).toBe(1);
    expect(report.passed).toBe(true);
    expect(report.id).toMatch(/^train-/);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('trains with evalFn that returns wrong answers', async () => {
    const trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);

    const report = await trainer.train(
      async () => 'wrong',
      { epochs: 1, name: 'fail-run', curriculumLearning: false },
    );

    expect(report.finalAccuracy).toBe(0);
    expect(report.passed).toBe(false);
    expect(report.epochs[0].passed).toBe(false);
  });

  it('getHistory returns persisted sessions', async () => {
    const trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);

    await trainer.train(async () => '4', { epochs: 1, name: 'session-1' });
    await trainer.train(async () => '50', { epochs: 1, name: 'session-2' });

    const history = trainer.getHistory();
    expect(history).toHaveLength(2);
    expect(history.map(h => h.name)).toContain('session-1');
    expect(history.map(h => h.name)).toContain('session-2');
    expect(typeof history[0].finalAccuracy).toBe('number');
    expect(typeof history[0].passed).toBe('boolean');
  });

  it('getSession returns full report by id', async () => {
    const trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);

    const report = await trainer.train(async () => '4', { epochs: 1, name: 'retrievable' });
    const session = trainer.getSession(report.id);

    expect(session).not.toBeNull();
    expect(session!.name).toBe('retrievable');
    expect(session!.epochs).toHaveLength(1);
    expect(session!.id).toBe(report.id);
  });

  it('getSession returns null for unknown id', () => {
    const trainer = new AgentTrainer(db);
    expect(trainer.getSession('nonexistent-id')).toBeNull();
  });

  it('uses curriculum learning with ascending difficulty', async () => {
    const trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);

    const report = await trainer.train(
      async () => 'any',
      { epochs: 3, curriculumLearning: true, name: 'curriculum-test' },
    );

    expect(report.epochs).toHaveLength(3);
    expect(report.epochs[0].difficulty).toBe('easy');
    expect(report.epochs[1].difficulty).toBe('medium');
    expect(report.epochs[2].difficulty).toBe('hard');
  });

  it('skips curriculum when curriculumLearning is false', async () => {
    const trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);

    const report = await trainer.train(
      async () => 'any',
      { epochs: 2, curriculumLearning: false, name: 'no-curriculum' },
    );

    expect(report.epochs).toHaveLength(2);
    expect(report.epochs[0].difficulty).toBe('all');
    expect(report.epochs[1].difficulty).toBe('all');
  });

  it('triggers early stopping when accuracy drops significantly', async () => {
    const trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);

    // Easy cases get correct answers, medium/hard get wrong answers
    // Epoch 1 (easy): 100% accuracy, Epoch 2 (medium): 0% accuracy → drop > 0.2 → stop
    const answers: Record<string, string> = { '2+2': '4', '3+1': '4' };

    const report = await trainer.train(
      async (input) => answers[input] ?? 'wrong',
      { epochs: 3, curriculumLearning: true, earlyStop: true, name: 'early-stop-test' },
    );

    // Should stop after epoch 2 due to accuracy drop from 1.0 to 0.0 (> 0.2)
    expect(report.totalEpochs).toBe(2);
    expect(report.epochs).toHaveLength(2);
    expect(report.epochs[0].difficulty).toBe('easy');
    expect(report.epochs[1].difficulty).toBe('medium');
  });

  it('getStatus reflects training history', async () => {
    const trainer = new AgentTrainer(db);
    trainer.setBenchmarkSuite(suite);

    const answers: Record<string, string> = {
      '2+2': '4', '3+1': '4',
      '10*5': '50', '100/4': '25',
      'sqrt(144)': '12', '2^10': '1024',
    };
    await trainer.train(async (input) => answers[input] ?? 'unknown', { epochs: 1, name: 'status-check' });

    const status = trainer.getStatus();
    expect(status.totalTrainingSessions).toBe(1);
    expect(status.bestAccuracy).toBeGreaterThan(0);
    expect(status.lastAccuracy).not.toBeNull();
    expect(status.totalEpochsRun).toBe(1);
  });

  it('migration is idempotent', () => {
    runTrainerMigration(db);
    runTrainerMigration(db);
    const trainer = new AgentTrainer(db);
    expect(trainer.getHistory()).toHaveLength(0);
  });
});
