/**
 * Agent Trainer — Training Loop mit Curriculum Learning
 *
 * Inspiriert von CrewAI's Agent Training und RLHF.
 * Orchestriert Training-Zyklen mit steigender Schwierigkeit,
 * sammelt Rewards und trackt Fortschritt über Zeit.
 *
 * Usage:
 * ```typescript
 * const trainer = new AgentTrainer(db);
 * trainer.setBenchmarkSuite(suite);
 * const report = await trainer.train(evalFn, { epochs: 3 });
 * console.log(report.progressOverEpochs);
 * ```
 */

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { BenchmarkSuite, EvalFunction, BenchmarkReport } from './benchmark-suite.js';

// ── Types ───────────────────────────────────────────────

export interface TrainingConfig {
  /** Number of training epochs. Default: 3 */
  epochs?: number;
  /** Start with easy, progress to hard. Default: true */
  curriculumLearning?: boolean;
  /** Minimum accuracy to pass an epoch. Default: 0.5 */
  passThreshold?: number;
  /** Stop early if accuracy drops. Default: true */
  earlyStop?: boolean;
  /** Name for this training session */
  name?: string;
}

export interface EpochResult {
  epoch: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'all';
  report: BenchmarkReport;
  passed: boolean;
}

export interface TrainingReport {
  id: string;
  name: string;
  epochs: EpochResult[];
  totalEpochs: number;
  finalAccuracy: number;
  bestAccuracy: number;
  improvement: number;
  durationMs: number;
  passed: boolean;
  createdAt: number;
}

export interface AgentTrainerStatus {
  totalTrainingSessions: number;
  bestAccuracy: number;
  lastAccuracy: number | null;
  totalEpochsRun: number;
  avgImprovement: number;
}

// ── Migration ───────────────────────────────────────────

export function runTrainerMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS training_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      total_epochs INTEGER NOT NULL DEFAULT 0,
      final_accuracy REAL NOT NULL DEFAULT 0,
      best_accuracy REAL NOT NULL DEFAULT 0,
      improvement REAL NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      passed INTEGER NOT NULL DEFAULT 0,
      report TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_training_created ON training_sessions(created_at);
  `);
}

// ── Trainer ─────────────────────────────────────────────

export class AgentTrainer {
  private readonly log = getLogger();
  private suite: BenchmarkSuite | null = null;
  private stmtInsertSession: Database.Statement;

  constructor(private db: Database.Database) {
    runTrainerMigration(db);

    this.stmtInsertSession = db.prepare(
      'INSERT INTO training_sessions (id, name, total_epochs, final_accuracy, best_accuracy, improvement, duration_ms, passed, report) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
  }

  /** Set the benchmark suite used for evaluation. */
  setBenchmarkSuite(suite: BenchmarkSuite): void {
    this.suite = suite;
  }

  /**
   * Run a training session with curriculum learning.
   *
   * Curriculum order: easy → medium → hard → all
   * Each epoch runs the benchmark at a difficulty level.
   * If curriculum disabled, runs all cases each epoch.
   */
  async train(
    evalFn: EvalFunction,
    config: TrainingConfig = {},
  ): Promise<TrainingReport> {
    if (!this.suite) throw new Error('BenchmarkSuite not set — call setBenchmarkSuite() first');

    const {
      epochs = 3,
      curriculumLearning = true,
      passThreshold = 0.5,
      earlyStop = true,
      name = `training-${Date.now()}`,
    } = config;

    const startTime = Date.now();
    const epochResults: EpochResult[] = [];
    let bestAccuracy = 0;
    let prevAccuracy = 0;

    const difficulties: Array<'easy' | 'medium' | 'hard' | 'all'> = curriculumLearning
      ? ['easy', 'medium', 'hard', ...Array(Math.max(0, epochs - 3)).fill('all') as 'all'[]]
      : Array(epochs).fill('all') as 'all'[];

    for (let i = 0; i < epochs; i++) {
      const difficulty = difficulties[i] ?? 'all';
      const difficultyFilter = difficulty === 'all' ? undefined : difficulty;

      this.log.debug(`[AgentTrainer] Epoch ${i + 1}/${epochs} (difficulty: ${difficulty})`);

      const report = await this.suite.run(evalFn, {
        name: `${name}-epoch-${i + 1}`,
        difficulty: difficultyFilter,
      });

      const passed = report.accuracy >= passThreshold;
      epochResults.push({ epoch: i + 1, difficulty, report, passed });

      if (report.accuracy > bestAccuracy) bestAccuracy = report.accuracy;

      // Early stop: accuracy dropped significantly from previous epoch
      if (earlyStop && i > 0 && report.accuracy < prevAccuracy - 0.2) {
        this.log.debug(`[AgentTrainer] Early stop: accuracy dropped ${(prevAccuracy - report.accuracy).toFixed(2)}`);
        break;
      }

      prevAccuracy = report.accuracy;
    }

    const finalAccuracy = epochResults.length > 0 ? epochResults[epochResults.length - 1].report.accuracy : 0;
    const firstAccuracy = epochResults.length > 0 ? epochResults[0].report.accuracy : 0;
    const improvement = finalAccuracy - firstAccuracy;

    const trainingReport: TrainingReport = {
      id: `train-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      epochs: epochResults,
      totalEpochs: epochResults.length,
      finalAccuracy,
      bestAccuracy,
      improvement,
      durationMs: Date.now() - startTime,
      passed: epochResults.every(e => e.passed),
      createdAt: Date.now(),
    };

    // Persist
    try {
      this.stmtInsertSession.run(
        trainingReport.id, trainingReport.name, trainingReport.totalEpochs,
        trainingReport.finalAccuracy, trainingReport.bestAccuracy,
        trainingReport.improvement, trainingReport.durationMs,
        trainingReport.passed ? 1 : 0, JSON.stringify(trainingReport),
      );
    } catch (e) {
      this.log.warn(`[AgentTrainer] Failed to persist training: ${(e as Error).message}`);
    }

    return trainingReport;
  }

  // ── History ─────────────────────────────────────────

  /** Get past training sessions. */
  getHistory(limit = 20): Array<{ id: string; name: string; finalAccuracy: number; bestAccuracy: number; improvement: number; passed: boolean; createdAt: string }> {
    return this.db.prepare(
      'SELECT id, name, final_accuracy as finalAccuracy, best_accuracy as bestAccuracy, improvement, passed, created_at as createdAt FROM training_sessions ORDER BY created_at DESC LIMIT ?',
    ).all(limit).map(r => ({ ...(r as Record<string, unknown>), passed: !!(r as Record<string, unknown>).passed })) as Array<{ id: string; name: string; finalAccuracy: number; bestAccuracy: number; improvement: number; passed: boolean; createdAt: string }>;
  }

  /** Get a specific training session's full report. */
  getSession(id: string): TrainingReport | null {
    const row = this.db.prepare('SELECT report FROM training_sessions WHERE id = ?').get(id) as { report: string } | undefined;
    if (!row) return null;
    try { return JSON.parse(row.report); } catch { return null; }
  }

  // ── Status ──────────────────────────────────────────

  getStatus(): AgentTrainerStatus {
    try {
      const total = (this.db.prepare('SELECT COUNT(*) as c FROM training_sessions').get() as { c: number }).c;
      const best = (this.db.prepare('SELECT MAX(best_accuracy) as v FROM training_sessions').get() as { v: number | null }).v ?? 0;
      const last = this.db.prepare('SELECT final_accuracy FROM training_sessions ORDER BY created_at DESC LIMIT 1').get() as { final_accuracy: number } | undefined;
      const totalEpochs = (this.db.prepare('SELECT COALESCE(SUM(total_epochs), 0) as v FROM training_sessions').get() as { v: number }).v;
      const avgImprovement = (this.db.prepare('SELECT COALESCE(AVG(improvement), 0) as v FROM training_sessions').get() as { v: number }).v;

      return {
        totalTrainingSessions: total,
        bestAccuracy: best,
        lastAccuracy: last?.final_accuracy ?? null,
        totalEpochsRun: totalEpochs,
        avgImprovement: Math.round(avgImprovement * 1000) / 1000,
      };
    } catch {
      return { totalTrainingSessions: 0, bestAccuracy: 0, lastAccuracy: null, totalEpochsRun: 0, avgImprovement: 0 };
    }
  }
}
