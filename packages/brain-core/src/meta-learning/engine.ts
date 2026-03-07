import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface HyperParameter {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;         // perturbation size
}

export interface LearningSnapshot {
  id?: number;
  cycle: number;
  params: Record<string, number>;
  metrics: Record<string, number>;
  score: number;        // composite effectiveness score
  created_at?: string;
}

export interface ParameterRecommendation {
  name: string;
  currentValue: number;
  recommendedValue: number;
  expectedImprovement: number;  // estimated % improvement
  confidence: number;           // 0-1 how confident we are
  evidence: number;             // how many snapshots support this
}

export interface MetaLearningStatus {
  totalSnapshots: number;
  totalOptimizations: number;
  bestScore: number;
  worstScore: number;
  currentScore: number;
  trend: 'improving' | 'stable' | 'declining';
  recommendations: ParameterRecommendation[];
}

// ── Migration ───────────────────────────────────────────

export function runMetaLearningMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta_learning_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle INTEGER NOT NULL,
      params TEXT NOT NULL,
      metrics TEXT NOT NULL,
      score REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meta_learning_optimizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      param_name TEXT NOT NULL,
      old_value REAL NOT NULL,
      new_value REAL NOT NULL,
      reason TEXT NOT NULL,
      improvement REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_meta_snapshots_score ON meta_learning_snapshots(score);
    CREATE INDEX IF NOT EXISTS idx_meta_snapshots_cycle ON meta_learning_snapshots(cycle);
  `);
}

// ── Engine ───────────────────────────────────────────────

/**
 * Meta-Learning Engine: observes learning cycle outcomes over time
 * and auto-tunes hyperparameters using gradient-free optimization.
 *
 * Research approach: Bayesian-inspired parameter search.
 * - After each learning cycle, record a snapshot (params + metrics + effectiveness score)
 * - Periodically analyze: which parameter configurations produced the best scores?
 * - Use perturbation: try small changes to parameters, measure improvement, keep what works
 * - Implements "explore vs exploit": 80% exploit best known, 20% explore new configurations
 */
export class MetaLearningEngine {
  private logger = getLogger();
  private cycleCount = 0;
  private analyzeInterval: number;    // analyze every N cycles
  private explorationRate: number;    // % of cycles spent exploring (0-1)

  constructor(
    private db: Database.Database,
    private params: HyperParameter[],
    config?: { analyzeInterval?: number; explorationRate?: number },
  ) {
    runMetaLearningMigration(db);
    this.analyzeInterval = config?.analyzeInterval ?? 5;
    this.explorationRate = config?.explorationRate ?? 0.2;
  }

  /**
   * Record a learning cycle's outcome. Called after each learning cycle.
   * @param metrics - the raw metrics from the cycle (e.g. newPatterns, updatedRules, prunedRules)
   * @param score - a composite effectiveness score (higher = better)
   */
  recordSnapshot(metrics: Record<string, number>, score: number): LearningSnapshot {
    this.cycleCount++;

    const currentParams: Record<string, number> = {};
    for (const p of this.params) {
      currentParams[p.name] = p.value;
    }

    this.db.prepare(`
      INSERT INTO meta_learning_snapshots (cycle, params, metrics, score)
      VALUES (?, ?, ?, ?)
    `).run(this.cycleCount, JSON.stringify(currentParams), JSON.stringify(metrics), score);

    const snapshot: LearningSnapshot = {
      cycle: this.cycleCount,
      params: currentParams,
      metrics,
      score,
    };

    this.logger.debug(`Meta-learning snapshot #${this.cycleCount}: score=${score.toFixed(3)}`);

    return snapshot;
  }

  /**
   * Analyze snapshots and recommend parameter changes.
   * Uses a simplified approach inspired by Bayesian optimization:
   * - Group snapshots by parameter ranges
   * - Find which ranges produced the best average scores
   * - Recommend moving towards those ranges
   */
  analyze(): ParameterRecommendation[] {
    const snapshots = this.getSnapshots(50); // last 50 cycles
    if (snapshots.length < 5) return []; // need minimum data

    const recommendations: ParameterRecommendation[] = [];

    for (const param of this.params) {
      const rec = this.analyzeParameter(param, snapshots);
      if (rec) recommendations.push(rec);
    }

    return recommendations;
  }

  /**
   * Apply recommendations: perturb parameters towards better configurations.
   * Returns the parameters that were changed.
   */
  optimize(): ParameterRecommendation[] {
    const recommendations = this.analyze();
    const applied: ParameterRecommendation[] = [];

    for (const rec of recommendations) {
      if (rec.confidence < 0.3) continue; // skip low-confidence recommendations
      if (Math.abs(rec.expectedImprovement) < 0.01) continue; // skip negligible improvements

      const param = this.params.find(p => p.name === rec.name);
      if (!param) continue;

      // Explore vs exploit: sometimes try random perturbations
      const exploring = Math.random() < this.explorationRate;
      let newValue: number;

      if (exploring) {
        // Random perturbation within bounds
        const range = param.max - param.min;
        newValue = param.value + (Math.random() - 0.5) * range * 0.2;
      } else {
        // Move towards recommended value
        newValue = rec.recommendedValue;
      }

      // Clamp to bounds
      newValue = Math.max(param.min, Math.min(param.max, newValue));

      // Record optimization
      this.db.prepare(`
        INSERT INTO meta_learning_optimizations (param_name, old_value, new_value, reason, improvement)
        VALUES (?, ?, ?, ?, ?)
      `).run(param.name, param.value, newValue, exploring ? 'exploration' : 'exploitation', rec.expectedImprovement);

      this.logger.info(`Meta-learning: ${param.name} ${param.value.toFixed(4)} → ${newValue.toFixed(4)} (${exploring ? 'explore' : 'exploit'}, expected +${(rec.expectedImprovement * 100).toFixed(1)}%)`);

      param.value = newValue;
      rec.recommendedValue = newValue;
      applied.push(rec);
    }

    return applied;
  }

  /**
   * Run analysis + optimization if it's time. Call this after every learning cycle.
   */
  step(metrics: Record<string, number>, score: number): { snapshot: LearningSnapshot; optimized: ParameterRecommendation[] } {
    const snapshot = this.recordSnapshot(metrics, score);

    let optimized: ParameterRecommendation[] = [];
    if (this.cycleCount > 0 && this.cycleCount % this.analyzeInterval === 0) {
      optimized = this.optimize();
    }

    return { snapshot, optimized };
  }

  /** Get current parameter values. */
  getParams(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const p of this.params) {
      result[p.name] = p.value;
    }
    return result;
  }

  /** Update a parameter value externally (e.g. user override). */
  setParam(name: string, value: number): boolean {
    const param = this.params.find(p => p.name === name);
    if (!param) return false;
    param.value = Math.max(param.min, Math.min(param.max, value));
    return true;
  }

  /** Get learning effectiveness status. */
  getStatus(): MetaLearningStatus {
    const snapshots = this.getSnapshots(100);
    const optimizations = this.db.prepare(
      'SELECT COUNT(*) as count FROM meta_learning_optimizations',
    ).get() as { count: number };

    const scores = snapshots.map(s => s.score);
    const currentScore = scores.length > 0 ? scores[0]! : 0;
    const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
    const worstScore = scores.length > 0 ? Math.min(...scores) : 0;

    // Trend detection: compare average of last 5 vs previous 5
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    if (scores.length >= 10) {
      const recent = scores.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const previous = scores.slice(5, 10).reduce((a, b) => a + b, 0) / 5;
      const delta = recent - previous;
      if (delta > 0.05) trend = 'improving';
      else if (delta < -0.05) trend = 'declining';
    }

    return {
      totalSnapshots: snapshots.length,
      totalOptimizations: optimizations.count,
      bestScore,
      worstScore,
      currentScore,
      trend,
      recommendations: this.analyze(),
    };
  }

  /** Get optimization history. */
  getHistory(limit = 20): Array<{
    param_name: string;
    old_value: number;
    new_value: number;
    reason: string;
    improvement: number | null;
    created_at: string;
  }> {
    return this.db.prepare(
      'SELECT * FROM meta_learning_optimizations ORDER BY created_at DESC LIMIT ?',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw SQLite rows
    ).all(limit) as any[];
  }

  // ── Private ─────────────────────────────────────────

  private getSnapshots(limit: number): LearningSnapshot[] {
    const rows = this.db.prepare(
      'SELECT * FROM meta_learning_snapshots ORDER BY cycle DESC LIMIT ?',
    ).all(limit) as Array<{
      id: number; cycle: number; params: string; metrics: string; score: number; created_at: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      cycle: r.cycle,
      params: JSON.parse(r.params),
      metrics: JSON.parse(r.metrics),
      score: r.score,
      created_at: r.created_at,
    }));
  }

  /**
   * Analyze a single parameter's effect on learning effectiveness.
   *
   * Algorithm:
   * 1. Divide the parameter's range into bins
   * 2. For each bin, calculate the average score of snapshots in that bin
   * 3. Find the bin with the highest average score
   * 4. Recommend moving towards the center of that bin
   */
  private analyzeParameter(param: HyperParameter, snapshots: LearningSnapshot[]): ParameterRecommendation | null {
    const numBins = 5;
    const range = param.max - param.min;
    if (range <= 0) return null;

    const binSize = range / numBins;

    // Accumulate scores per bin
    const bins: { sum: number; count: number }[] = Array.from({ length: numBins }, () => ({ sum: 0, count: 0 }));

    for (const snap of snapshots) {
      const val = snap.params[param.name];
      if (val === undefined) continue;

      const binIdx = Math.min(numBins - 1, Math.floor((val - param.min) / binSize));
      bins[binIdx]!.sum += snap.score;
      bins[binIdx]!.count++;
    }

    // Find best bin (minimum 2 samples)
    let bestBin = -1;
    let bestAvg = -Infinity;
    let totalSamples = 0;

    for (let i = 0; i < numBins; i++) {
      if (bins[i]!.count < 2) continue;
      const avg = bins[i]!.sum / bins[i]!.count;
      totalSamples += bins[i]!.count;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestBin = i;
      }
    }

    if (bestBin === -1) return null; // not enough data

    // Calculate recommended value (center of best bin)
    const recommended = param.min + (bestBin + 0.5) * binSize;

    // Skip if current value is already in or near the best bin
    const currentBin = Math.min(numBins - 1, Math.floor((param.value - param.min) / binSize));
    if (currentBin === bestBin) return null;

    // Estimate improvement
    const currentBinAvg = bins[currentBin]!.count > 0
      ? bins[currentBin]!.sum / bins[currentBin]!.count
      : 0;
    const expectedImprovement = currentBinAvg > 0
      ? (bestAvg - currentBinAvg) / currentBinAvg
      : 0;

    // Confidence: based on sample count in best bin
    const confidence = Math.min(1, bins[bestBin]!.count / 10);

    return {
      name: param.name,
      currentValue: param.value,
      recommendedValue: recommended,
      expectedImprovement,
      confidence,
      evidence: totalSamples,
    };
  }
}
