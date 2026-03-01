import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export type ExperimentStatus = 'planned' | 'running_control' | 'running_treatment' | 'analyzing' | 'complete' | 'aborted';

export interface Experiment {
  id?: number;
  name: string;
  hypothesis: string;
  independent_variable: string;
  dependent_variable: string;
  control_value: number;
  treatment_value: number;
  duration_cycles: number;
  status: ExperimentStatus;
  control_results: number[];
  treatment_results: number[];
  current_cycle: number;
  conclusion: ExperimentConclusion | null;
  created_at?: string;
  completed_at?: string;
}

export interface ExperimentConclusion {
  significant: boolean;
  p_value: number;
  effect_size: number;       // Cohen's d
  direction: 'positive' | 'negative' | 'neutral';
  recommendation: 'adopt_treatment' | 'keep_control' | 'inconclusive_extend';
  control_mean: number;
  treatment_mean: number;
  control_std: number;
  treatment_std: number;
}

export interface ExperimentProposal {
  name: string;
  hypothesis: string;
  independent_variable: string;
  dependent_variable: string;
  control_value: number;
  treatment_value: number;
  duration_cycles?: number;
}

export interface ExperimentEngineConfig {
  brainName: string;
  /** Default experiment duration in cycles. Default: 10 */
  defaultDuration?: number;
  /** Significance level for hypothesis testing. Default: 0.05 */
  alpha?: number;
  /** Maximum concurrent experiments. Default: 3 */
  maxConcurrent?: number;
}

// ── Migration ───────────────────────────────────────────

export function runExperimentMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      hypothesis TEXT NOT NULL,
      independent_variable TEXT NOT NULL,
      dependent_variable TEXT NOT NULL,
      control_value REAL NOT NULL,
      treatment_value REAL NOT NULL,
      duration_cycles INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'planned',
      control_results TEXT NOT NULL DEFAULT '[]',
      treatment_results TEXT NOT NULL DEFAULT '[]',
      current_cycle INTEGER NOT NULL DEFAULT 0,
      conclusion TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
  `);
}

// ── Statistics ──────────────────────────────────────────

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/** Welch's t-test for two independent samples with unequal variances. */
function welchTTest(a: number[], b: number[]): { t: number; df: number; pValue: number } {
  const nA = a.length;
  const nB = b.length;
  if (nA < 2 || nB < 2) return { t: 0, df: 0, pValue: 1 };

  const meanA = mean(a);
  const meanB = mean(b);
  const varA = stddev(a) ** 2;
  const varB = stddev(b) ** 2;

  const se = Math.sqrt(varA / nA + varB / nB);
  if (se === 0) return { t: 0, df: nA + nB - 2, pValue: 1 };

  const t = (meanA - meanB) / se;

  // Welch–Satterthwaite degrees of freedom
  const num = (varA / nA + varB / nB) ** 2;
  const den = (varA / nA) ** 2 / (nA - 1) + (varB / nB) ** 2 / (nB - 1);
  const df = den === 0 ? nA + nB - 2 : num / den;

  // Approximate two-tailed p-value using t-distribution approximation
  const pValue = approxTwoTailedP(Math.abs(t), df);

  return { t, df, pValue };
}

/** Approximate two-tailed p-value for t-distribution. Uses normal approximation for large df. */
function approxTwoTailedP(t: number, df: number): number {
  if (df <= 0) return 1;
  // For large df, t ≈ normal
  if (df > 100) {
    return 2 * normalCDF(-Math.abs(t));
  }
  // Incomplete beta function approximation for Student's t
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;
  return incompleteBetaApprox(x, a, b);
}

/** Standard normal CDF approximation (Abramowitz and Stegun). */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
}

/** Rough approximation of the regularized incomplete beta function. */
function incompleteBetaApprox(x: number, a: number, b: number): number {
  // Use a continued fraction approximation (Lentz's method, simplified)
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // For our purposes (t-test p-values), use a simpler approximation
  // Convert to normal approximation: t → z
  const z = Math.sqrt(-2 * Math.log(x)) * Math.sqrt(a);
  return Math.min(1, Math.max(0, 2 * normalCDF(-z)));
}

/** Cohen's d effect size. */
function cohensD(a: number[], b: number[]): number {
  const pooledStd = Math.sqrt(
    ((a.length - 1) * stddev(a) ** 2 + (b.length - 1) * stddev(b) ** 2) /
    (a.length + b.length - 2),
  );
  if (pooledStd === 0) return 0;
  return (mean(a) - mean(b)) / pooledStd;
}

/** Minimum sample size for power 0.8, two-tailed. Simplified. */
function minimumSampleSize(effectSize: number, alpha = 0.05): number {
  if (effectSize <= 0) return 100;
  // Approximate: n ≈ 16/d² for power=0.8, alpha=0.05
  const zAlpha = alpha === 0.05 ? 1.96 : 2.576;
  const zBeta = 0.842; // power 0.8
  const n = Math.ceil(2 * ((zAlpha + zBeta) / effectSize) ** 2);
  return Math.max(5, Math.min(n, 1000));
}

// ── Engine ──────────────────────────────────────────────

export class ExperimentEngine {
  private db: Database.Database;
  private config: Required<ExperimentEngineConfig>;
  private log = getLogger();

  constructor(db: Database.Database, config: ExperimentEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      defaultDuration: config.defaultDuration ?? 10,
      alpha: config.alpha ?? 0.05,
      maxConcurrent: config.maxConcurrent ?? 3,
    };
    runExperimentMigration(db);
  }

  /** Propose a new experiment. */
  propose(proposal: ExperimentProposal): Experiment {
    const running = this.getRunning().length;
    if (running >= this.config.maxConcurrent) {
      throw new Error(`Maximum ${this.config.maxConcurrent} concurrent experiments. ${running} currently running.`);
    }

    const duration = proposal.duration_cycles ?? this.config.defaultDuration;

    const result = this.db.prepare(`
      INSERT INTO experiments (name, hypothesis, independent_variable, dependent_variable,
        control_value, treatment_value, duration_cycles, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'planned')
    `).run(
      proposal.name,
      proposal.hypothesis,
      proposal.independent_variable,
      proposal.dependent_variable,
      proposal.control_value,
      proposal.treatment_value,
      duration,
    );

    return this.get(Number(result.lastInsertRowid))!;
  }

  /** Start an experiment (transitions from planned to running_control). */
  start(experimentId: number): Experiment | null {
    const exp = this.get(experimentId);
    if (!exp || exp.status !== 'planned') return null;

    this.db.prepare(`UPDATE experiments SET status = 'running_control' WHERE id = ?`).run(experimentId);
    return this.get(experimentId);
  }

  /** Record a measurement for the current phase of an experiment. */
  recordMeasurement(experimentId: number, value: number): Experiment | null {
    const exp = this.get(experimentId);
    if (!exp) return null;

    if (exp.status === 'running_control') {
      exp.control_results.push(value);
      this.db.prepare(`
        UPDATE experiments SET control_results = ?, current_cycle = ?
        WHERE id = ?
      `).run(JSON.stringify(exp.control_results), exp.current_cycle + 1, experimentId);

      // Check if control phase complete
      if (exp.control_results.length >= exp.duration_cycles) {
        this.db.prepare(`UPDATE experiments SET status = 'running_treatment', current_cycle = 0 WHERE id = ?`).run(experimentId);
      }
    } else if (exp.status === 'running_treatment') {
      exp.treatment_results.push(value);
      this.db.prepare(`
        UPDATE experiments SET treatment_results = ?, current_cycle = ?
        WHERE id = ?
      `).run(JSON.stringify(exp.treatment_results), exp.current_cycle + 1, experimentId);

      // Check if treatment phase complete
      if (exp.treatment_results.length >= exp.duration_cycles) {
        this.db.prepare(`UPDATE experiments SET status = 'analyzing' WHERE id = ?`).run(experimentId);
        return this.analyze(experimentId);
      }
    }

    return this.get(experimentId);
  }

  /** Analyze a completed experiment. */
  analyze(experimentId: number): Experiment | null {
    const exp = this.get(experimentId);
    if (!exp || (exp.status !== 'analyzing' && exp.status !== 'complete')) return null;

    const control = exp.control_results;
    const treatment = exp.treatment_results;

    if (control.length < 2 || treatment.length < 2) {
      const conclusion: ExperimentConclusion = {
        significant: false,
        p_value: 1,
        effect_size: 0,
        direction: 'neutral',
        recommendation: 'inconclusive_extend',
        control_mean: mean(control),
        treatment_mean: mean(treatment),
        control_std: stddev(control),
        treatment_std: stddev(treatment),
      };
      this.completeExperiment(experimentId, conclusion);
      return this.get(experimentId);
    }

    // Welch's t-test
    const test = welchTTest(treatment, control);

    // Apply Bonferroni correction if multiple experiments running
    const runningCount = Math.max(1, this.getRunning().length + 1);
    const correctedAlpha = this.config.alpha / runningCount;
    const significant = test.pValue < correctedAlpha;

    // Cohen's d
    const d = cohensD(treatment, control);

    // Direction
    const treatmentMean = mean(treatment);
    const controlMean = mean(control);
    let direction: 'positive' | 'negative' | 'neutral';
    if (!significant) direction = 'neutral';
    else if (treatmentMean > controlMean) direction = 'positive';
    else direction = 'negative';

    // Recommendation
    let recommendation: ExperimentConclusion['recommendation'];
    if (!significant) {
      recommendation = 'inconclusive_extend';
    } else if (direction === 'positive') {
      recommendation = 'adopt_treatment';
    } else {
      recommendation = 'keep_control';
    }

    const conclusion: ExperimentConclusion = {
      significant,
      p_value: test.pValue,
      effect_size: Math.abs(d),
      direction,
      recommendation,
      control_mean: controlMean,
      treatment_mean: treatmentMean,
      control_std: stddev(control),
      treatment_std: stddev(treatment),
    };

    this.completeExperiment(experimentId, conclusion);
    return this.get(experimentId);
  }

  /** Abort a running experiment. */
  abort(experimentId: number): boolean {
    const exp = this.get(experimentId);
    if (!exp || exp.status === 'complete' || exp.status === 'aborted') return false;

    this.db.prepare(`
      UPDATE experiments SET status = 'aborted', completed_at = datetime('now') WHERE id = ?
    `).run(experimentId);
    return true;
  }

  /** Get a single experiment by ID. */
  get(id: number): Experiment | null {
    const row = this.db.prepare(`SELECT * FROM experiments WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToExperiment(row);
  }

  /** List experiments by status. */
  list(status?: ExperimentStatus, limit = 20): Experiment[] {
    let sql = `SELECT * FROM experiments`;
    const params: unknown[] = [];
    if (status) {
      sql += ` WHERE status = ?`;
      params.push(status);
    }
    sql += ` ORDER BY CASE status
      WHEN 'running_control' THEN 0
      WHEN 'running_treatment' THEN 1
      WHEN 'analyzing' THEN 2
      WHEN 'planned' THEN 3
      WHEN 'complete' THEN 4
      WHEN 'aborted' THEN 5
    END, id DESC LIMIT ?`;
    params.push(limit);

    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(r => this.rowToExperiment(r));
  }

  /** Get currently running experiments. */
  getRunning(): Experiment[] {
    return (this.db.prepare(`
      SELECT * FROM experiments WHERE status IN ('running_control', 'running_treatment')
    `).all() as Array<Record<string, unknown>>).map(r => this.rowToExperiment(r));
  }

  /** Get results of completed experiments. */
  getResults(limit = 10): Experiment[] {
    return (this.db.prepare(`
      SELECT * FROM experiments WHERE status = 'complete' ORDER BY completed_at DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>).map(r => this.rowToExperiment(r));
  }

  /** Calculate minimum required sample size for a desired effect size. */
  getMinimumSampleSize(expectedEffectSize: number): number {
    return minimumSampleSize(expectedEffectSize, this.config.alpha);
  }

  private completeExperiment(id: number, conclusion: ExperimentConclusion): void {
    this.db.prepare(`
      UPDATE experiments SET status = 'complete', conclusion = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(JSON.stringify(conclusion), id);
  }

  private rowToExperiment(row: Record<string, unknown>): Experiment {
    return {
      id: row.id as number,
      name: row.name as string,
      hypothesis: row.hypothesis as string,
      independent_variable: row.independent_variable as string,
      dependent_variable: row.dependent_variable as string,
      control_value: row.control_value as number,
      treatment_value: row.treatment_value as number,
      duration_cycles: row.duration_cycles as number,
      status: row.status as ExperimentStatus,
      control_results: JSON.parse((row.control_results as string) || '[]'),
      treatment_results: JSON.parse((row.treatment_results as string) || '[]'),
      current_cycle: row.current_cycle as number,
      conclusion: row.conclusion ? JSON.parse(row.conclusion as string) : null,
      created_at: row.created_at as string,
      completed_at: row.completed_at as string | undefined,
    };
  }
}
