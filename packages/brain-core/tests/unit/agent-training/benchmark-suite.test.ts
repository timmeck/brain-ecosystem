import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { BenchmarkSuite } from '../../../src/agent-training/benchmark-suite.js';
import type { EvalCase } from '../../../src/agent-training/benchmark-suite.js';

describe('BenchmarkSuite', () => {
  let db: Database.Database;
  let suite: BenchmarkSuite;

  beforeEach(() => {
    db = new Database(':memory:');
    suite = new BenchmarkSuite(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Case Management ───────────────────────────────────

  it('adds and retrieves a single case', () => {
    const id = suite.addCase({
      input: 'What is 2+2?',
      expected: '4',
      category: 'math',
      difficulty: 'easy',
    });
    expect(id).toBeGreaterThan(0);
    const cases = suite.getCases();
    expect(cases).toHaveLength(1);
    expect(cases[0].input).toBe('What is 2+2?');
    expect(cases[0].difficulty).toBe('easy');
  });

  it('adds multiple cases in a transaction', () => {
    const cases: EvalCase[] = [
      { input: 'a', expected: 'A', category: 'text', difficulty: 'easy' },
      { input: 'b', expected: 'B', category: 'text', difficulty: 'medium' },
      { input: 'c', expected: 'C', category: 'text', difficulty: 'hard' },
    ];
    const count = suite.addCases(cases);
    expect(count).toBe(3);
    expect(suite.getCases()).toHaveLength(3);
  });

  it('filters cases by category', () => {
    suite.addCase({ input: 'a', expected: 'A', category: 'math', difficulty: 'easy' });
    suite.addCase({ input: 'b', expected: 'B', category: 'text', difficulty: 'easy' });
    const mathCases = suite.getCases({ category: 'math' });
    expect(mathCases).toHaveLength(1);
    expect(mathCases[0].category).toBe('math');
  });

  it('filters cases by difficulty', () => {
    suite.addCase({ input: 'a', expected: 'A', category: 'math', difficulty: 'easy' });
    suite.addCase({ input: 'b', expected: 'B', category: 'math', difficulty: 'hard' });
    const hardCases = suite.getCases({ difficulty: 'hard' });
    expect(hardCases).toHaveLength(1);
    expect(hardCases[0].difficulty).toBe('hard');
  });

  it('gets distinct categories', () => {
    suite.addCase({ input: 'a', expected: 'A', category: 'math', difficulty: 'easy' });
    suite.addCase({ input: 'b', expected: 'B', category: 'text', difficulty: 'easy' });
    suite.addCase({ input: 'c', expected: 'C', category: 'math', difficulty: 'hard' });
    const cats = suite.getCategories();
    expect(cats).toEqual(['math', 'text']);
  });

  it('deletes a case by ID', () => {
    const id = suite.addCase({ input: 'a', expected: 'A', category: 'math', difficulty: 'easy' });
    expect(suite.deleteCase(id)).toBe(true);
    expect(suite.getCases()).toHaveLength(0);
  });

  it('clears all cases', () => {
    suite.addCases([
      { input: 'a', expected: 'A', category: 'math', difficulty: 'easy' },
      { input: 'b', expected: 'B', category: 'text', difficulty: 'easy' },
    ]);
    const cleared = suite.clearCases();
    expect(cleared).toBe(2);
    expect(suite.getCases()).toHaveLength(0);
  });

  // ── Benchmark Execution ──────────────────────────────

  it('runs benchmark with perfect score', async () => {
    suite.addCase({ input: 'What is 2+2?', expected: '4', category: 'math', difficulty: 'easy' });
    suite.addCase({ input: 'What is 3+3?', expected: '6', category: 'math', difficulty: 'medium' });

    const evalFn = vi.fn()
      .mockResolvedValueOnce('4')
      .mockResolvedValueOnce('6');

    const report = await suite.run(evalFn);
    expect(report.totalCases).toBe(2);
    expect(report.passed).toBe(2);
    expect(report.failed).toBe(0);
    expect(report.accuracy).toBe(1);
  });

  it('runs benchmark with failures', async () => {
    suite.addCase({ input: 'a', expected: 'A', category: 'text', difficulty: 'easy' });
    suite.addCase({ input: 'b', expected: 'B', category: 'text', difficulty: 'easy' });

    const evalFn = vi.fn()
      .mockResolvedValueOnce('A')
      .mockResolvedValueOnce('wrong');

    const report = await suite.run(evalFn);
    expect(report.accuracy).toBe(0.5);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
  });

  it('handles eval function errors', async () => {
    suite.addCase({ input: 'a', expected: 'A', category: 'text', difficulty: 'easy' });

    const evalFn = vi.fn().mockRejectedValueOnce(new Error('LLM timeout'));

    const report = await suite.run(evalFn);
    expect(report.errored).toBe(1);
    expect(report.results[0].error).toBe('LLM timeout');
  });

  it('returns empty report for no cases', async () => {
    const evalFn = vi.fn();
    const report = await suite.run(evalFn);
    expect(report.totalCases).toBe(0);
    expect(report.accuracy).toBe(0);
    expect(evalFn).not.toHaveBeenCalled();
  });

  it('computes breakdown by category and difficulty', async () => {
    suite.addCase({ input: 'a', expected: 'A', category: 'math', difficulty: 'easy' });
    suite.addCase({ input: 'b', expected: 'B', category: 'text', difficulty: 'hard' });

    const evalFn = vi.fn()
      .mockResolvedValueOnce('A')
      .mockResolvedValueOnce('wrong');

    const report = await suite.run(evalFn);
    expect(report.byCategory.math.accuracy).toBe(1);
    expect(report.byCategory.text.accuracy).toBe(0);
    expect(report.byDifficulty.easy.accuracy).toBe(1);
    expect(report.byDifficulty.hard.accuracy).toBe(0);
  });

  it('supports custom scoring function', async () => {
    suite.scoreFunction = (expected, actual) =>
      actual.includes(expected);

    suite.addCase({ input: 'capital?', expected: 'Berlin', category: 'geo', difficulty: 'easy' });

    const evalFn = vi.fn().mockResolvedValueOnce('The capital is Berlin, Germany');

    const report = await suite.run(evalFn);
    expect(report.passed).toBe(1);
    expect(report.accuracy).toBe(1);
  });

  it('case-insensitive exact match by default', async () => {
    suite.addCase({ input: 'a', expected: 'Hello', category: 'text', difficulty: 'easy' });

    const evalFn = vi.fn().mockResolvedValueOnce('  hello  ');

    const report = await suite.run(evalFn);
    expect(report.passed).toBe(1);
  });

  // ── History & Persistence ────────────────────────────

  it('persists benchmark runs and retrieves history', async () => {
    suite.addCase({ input: 'a', expected: 'A', category: 'text', difficulty: 'easy' });
    const evalFn = vi.fn().mockResolvedValueOnce('A');

    await suite.run(evalFn, { name: 'test-run-1' });
    const history = suite.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].name).toBe('test-run-1');
    expect(history[0].accuracy).toBe(1);
  });

  it('retrieves full run report by ID', async () => {
    suite.addCase({ input: 'a', expected: 'A', category: 'text', difficulty: 'easy' });
    const evalFn = vi.fn().mockResolvedValueOnce('A');

    const report = await suite.run(evalFn);
    const retrieved = suite.getRun(report.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(report.id);
    expect(retrieved!.accuracy).toBe(1);
  });

  it('returns null for unknown run ID', () => {
    expect(suite.getRun('nonexistent')).toBeNull();
  });

  // ── Status ──────────────────────────────────────────

  it('reports correct status', async () => {
    suite.addCases([
      { input: 'a', expected: 'A', category: 'math', difficulty: 'easy' },
      { input: 'b', expected: 'B', category: 'text', difficulty: 'easy' },
    ]);

    const evalFn = vi.fn().mockResolvedValue('A');
    await suite.run(evalFn);

    const status = suite.getStatus();
    expect(status.totalCases).toBe(2);
    expect(status.totalRuns).toBe(1);
    expect(status.categories).toContain('math');
    expect(status.categories).toContain('text');
    expect(status.lastRunAccuracy).toBe(0.5);
    expect(status.bestAccuracy).toBe(0.5);
  });
});
