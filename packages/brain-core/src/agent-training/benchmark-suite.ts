/**
 * Benchmark Suite — Evaluation Harness für das Brain Ecosystem
 *
 * Inspiriert von CrewAI's Agent Testing und LangSmith Evaluation.
 * Definiert Evaluations-Tasks, führt Benchmarks durch und sammelt Metriken.
 *
 * Usage:
 * ```typescript
 * suite.addCase({ input: 'What is 2+2?', expected: '4', category: 'math' });
 * const result = await suite.run(async (input) => agent.process(input));
 * console.log(result.accuracy, result.avgLatencyMs);
 * ```
 */

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface EvalCase {
  id?: number;
  input: string;
  expected: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  metadata?: Record<string, unknown>;
}

export interface EvalResult {
  caseId: number;
  input: string;
  expected: string;
  actual: string;
  correct: boolean;
  latencyMs: number;
  category: string;
  difficulty: string;
  error?: string;
}

export interface BenchmarkReport {
  id: string;
  name: string;
  totalCases: number;
  passed: number;
  failed: number;
  errored: number;
  accuracy: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p99LatencyMs: number;
  byCategory: Record<string, { total: number; passed: number; accuracy: number }>;
  byDifficulty: Record<string, { total: number; passed: number; accuracy: number }>;
  results: EvalResult[];
  durationMs: number;
  createdAt: number;
}

export interface BenchmarkSuiteStatus {
  totalCases: number;
  totalRuns: number;
  categories: string[];
  lastRunAccuracy: number | null;
  bestAccuracy: number;
}

export type EvalFunction = (input: string) => Promise<string>;
export type ScoreFunction = (expected: string, actual: string) => boolean;

// ── Migration ───────────────────────────────────────────

export function runBenchmarkMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS eval_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input TEXT NOT NULL,
      expected TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      difficulty TEXT NOT NULL DEFAULT 'medium',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_eval_category ON eval_cases(category);

    CREATE TABLE IF NOT EXISTS benchmark_runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      total_cases INTEGER NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      errored INTEGER NOT NULL DEFAULT 0,
      accuracy REAL NOT NULL DEFAULT 0,
      avg_latency_ms REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      report TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_benchmark_created ON benchmark_runs(created_at);
  `);
}

// ── Suite ───────────────────────────────────────────────

export class BenchmarkSuite {
  private readonly log = getLogger();
  private stmtInsertCase: Database.Statement;
  private stmtInsertRun: Database.Statement;

  /** Custom scoring function. Default: exact match (trimmed, case-insensitive). */
  scoreFunction: ScoreFunction = (expected, actual) =>
    expected.trim().toLowerCase() === actual.trim().toLowerCase();

  constructor(private db: Database.Database) {
    runBenchmarkMigration(db);

    this.stmtInsertCase = db.prepare(
      'INSERT INTO eval_cases (input, expected, category, difficulty, metadata) VALUES (?, ?, ?, ?, ?)',
    );
    this.stmtInsertRun = db.prepare(
      'INSERT INTO benchmark_runs (id, name, total_cases, passed, failed, errored, accuracy, avg_latency_ms, duration_ms, report) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
  }

  // ── Case Management ─────────────────────────────────

  /** Add a test case to the dataset. */
  addCase(c: EvalCase): number {
    const result = this.stmtInsertCase.run(
      c.input, c.expected, c.category, c.difficulty,
      JSON.stringify(c.metadata ?? {}),
    );
    return Number(result.lastInsertRowid);
  }

  /** Add multiple test cases at once. */
  addCases(cases: EvalCase[]): number {
    let count = 0;
    const tx = this.db.transaction(() => {
      for (const c of cases) {
        this.addCase(c);
        count++;
      }
    });
    tx();
    return count;
  }

  /** Get all test cases, optionally filtered. */
  getCases(filter?: { category?: string; difficulty?: string }): EvalCase[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter?.category) { conditions.push('category = ?'); params.push(filter.category); }
    if (filter?.difficulty) { conditions.push('difficulty = ?'); params.push(filter.difficulty); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.prepare(`SELECT * FROM eval_cases ${where} ORDER BY id`).all(...params) as EvalCase[];
  }

  /** Get distinct categories. */
  getCategories(): string[] {
    const rows = this.db.prepare('SELECT DISTINCT category FROM eval_cases ORDER BY category').all() as Array<{ category: string }>;
    return rows.map(r => r.category);
  }

  /** Delete a case by ID. */
  deleteCase(id: number): boolean {
    return this.db.prepare('DELETE FROM eval_cases WHERE id = ?').run(id).changes > 0;
  }

  /** Clear all cases. */
  clearCases(): number {
    return this.db.prepare('DELETE FROM eval_cases').run().changes;
  }

  // ── Benchmark Execution ─────────────────────────────

  /** Run benchmark against all cases (or filtered subset). */
  async run(
    evalFn: EvalFunction,
    options?: { name?: string; category?: string; difficulty?: string },
  ): Promise<BenchmarkReport> {
    const name = options?.name ?? `benchmark-${Date.now()}`;
    const cases = this.getCases({ category: options?.category, difficulty: options?.difficulty });

    if (cases.length === 0) {
      return this.emptyReport(name);
    }

    const startTime = Date.now();
    const results: EvalResult[] = [];

    for (const c of cases) {
      const caseStart = Date.now();
      let actual = '';
      let error: string | undefined;
      let correct = false;

      try {
        actual = await evalFn(c.input);
        correct = this.scoreFunction(c.expected, actual);
      } catch (e) {
        error = (e as Error).message;
      }

      results.push({
        caseId: c.id ?? 0,
        input: c.input,
        expected: c.expected,
        actual,
        correct,
        latencyMs: Date.now() - caseStart,
        category: c.category,
        difficulty: c.difficulty,
        error,
      });
    }

    const durationMs = Date.now() - startTime;
    const report = this.buildReport(name, results, durationMs);

    // Persist run
    try {
      this.stmtInsertRun.run(
        report.id, report.name, report.totalCases,
        report.passed, report.failed, report.errored,
        report.accuracy, report.avgLatencyMs, report.durationMs,
        JSON.stringify(report),
      );
    } catch (e) {
      this.log.warn(`[BenchmarkSuite] Failed to persist run: ${(e as Error).message}`);
    }

    return report;
  }

  // ── History ─────────────────────────────────────────

  /** Get past benchmark runs. */
  getHistory(limit = 20): Array<{ id: string; name: string; accuracy: number; totalCases: number; durationMs: number; createdAt: string }> {
    return this.db.prepare(
      'SELECT id, name, accuracy, total_cases as totalCases, duration_ms as durationMs, created_at as createdAt FROM benchmark_runs ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as Array<{ id: string; name: string; accuracy: number; totalCases: number; durationMs: number; createdAt: string }>;
  }

  /** Get a specific run's full report. */
  getRun(id: string): BenchmarkReport | null {
    const row = this.db.prepare('SELECT report FROM benchmark_runs WHERE id = ?').get(id) as { report: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.report); } catch { return null; }
  }

  // ── Status ──────────────────────────────────────────

  getStatus(): BenchmarkSuiteStatus {
    try {
      const totalCases = (this.db.prepare('SELECT COUNT(*) as c FROM eval_cases').get() as { c: number }).c;
      const totalRuns = (this.db.prepare('SELECT COUNT(*) as c FROM benchmark_runs').get() as { c: number }).c;
      const categories = this.getCategories();
      const lastRun = this.db.prepare('SELECT accuracy FROM benchmark_runs ORDER BY created_at DESC LIMIT 1').get() as { accuracy: number } | undefined;
      const bestRun = this.db.prepare('SELECT MAX(accuracy) as best FROM benchmark_runs').get() as { best: number } | undefined;

      return {
        totalCases,
        totalRuns,
        categories,
        lastRunAccuracy: lastRun?.accuracy ?? null,
        bestAccuracy: bestRun?.best ?? 0,
      };
    } catch {
      return { totalCases: 0, totalRuns: 0, categories: [], lastRunAccuracy: null, bestAccuracy: 0 };
    }
  }

  // ── Private ─────────────────────────────────────────

  private buildReport(name: string, results: EvalResult[], durationMs: number): BenchmarkReport {
    const passed = results.filter(r => r.correct).length;
    const errored = results.filter(r => !!r.error).length;
    const failed = results.length - passed - errored;
    const accuracy = results.length > 0 ? passed / results.length : 0;

    const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
    const avgLatency = latencies.length > 0 ? latencies.reduce((s, l) => s + l, 0) / latencies.length : 0;
    const p50 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.5)] : 0;
    const p99 = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.99)] : 0;

    // Breakdown by category
    const byCategory: Record<string, { total: number; passed: number; accuracy: number }> = {};
    for (const r of results) {
      if (!byCategory[r.category]) byCategory[r.category] = { total: 0, passed: 0, accuracy: 0 };
      byCategory[r.category].total++;
      if (r.correct) byCategory[r.category].passed++;
    }
    for (const cat of Object.values(byCategory)) {
      cat.accuracy = cat.total > 0 ? cat.passed / cat.total : 0;
    }

    // Breakdown by difficulty
    const byDifficulty: Record<string, { total: number; passed: number; accuracy: number }> = {};
    for (const r of results) {
      if (!byDifficulty[r.difficulty]) byDifficulty[r.difficulty] = { total: 0, passed: 0, accuracy: 0 };
      byDifficulty[r.difficulty].total++;
      if (r.correct) byDifficulty[r.difficulty].passed++;
    }
    for (const diff of Object.values(byDifficulty)) {
      diff.accuracy = diff.total > 0 ? diff.passed / diff.total : 0;
    }

    return {
      id: `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      totalCases: results.length,
      passed,
      failed,
      errored,
      accuracy,
      avgLatencyMs: Math.round(avgLatency),
      p50LatencyMs: p50,
      p99LatencyMs: p99,
      byCategory,
      byDifficulty,
      results,
      durationMs,
      createdAt: Date.now(),
    };
  }

  private emptyReport(name: string): BenchmarkReport {
    return {
      id: `bench-${Date.now()}-empty`,
      name, totalCases: 0, passed: 0, failed: 0, errored: 0,
      accuracy: 0, avgLatencyMs: 0, p50LatencyMs: 0, p99LatencyMs: 0,
      byCategory: {}, byDifficulty: {}, results: [], durationMs: 0, createdAt: Date.now(),
    };
  }
}
