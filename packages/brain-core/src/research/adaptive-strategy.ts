import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export type StrategyDomain = 'recall' | 'learning' | 'research';

export interface StrategyAdaptation {
  id?: number;
  timestamp: number;
  strategy: StrategyDomain;
  parameter: string;
  old_value: number;
  new_value: number;
  reason: string;
  evidence: Record<string, unknown>;
  reverted: boolean;
}

export interface StrategyStatus {
  totalAdaptations: number;
  activeAdaptations: number;
  revertedAdaptations: number;
  revertRate: number;
  strategies: Record<StrategyDomain, StrategyDomainStatus>;
}

export interface StrategyDomainStatus {
  parameters: Record<string, number>;
  recentChanges: number;
  lastChange?: string;
}

export interface AdaptiveStrategyConfig {
  brainName: string;
  /** Maximum percentage change per adaptation (0-1). Default: 0.2 (20%) */
  maxChangeRate?: number;
  /** Cycles to observe before evaluating an adaptation. Default: 5 */
  observationCycles?: number;
  /** Performance drop threshold for auto-revert (0-1). Default: 0.1 (10%) */
  revertThreshold?: number;
}

// ── Migration ───────────────────────────────────────────

export function runAdaptiveStrategyMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strategy_adaptations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      strategy TEXT NOT NULL,
      parameter TEXT NOT NULL,
      old_value REAL NOT NULL,
      new_value REAL NOT NULL,
      reason TEXT NOT NULL,
      evidence TEXT NOT NULL,
      reverted INTEGER DEFAULT 0,
      revert_reason TEXT,
      performance_before REAL,
      performance_after REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_strat_adapt_strategy ON strategy_adaptations(strategy);
    CREATE INDEX IF NOT EXISTS idx_strat_adapt_param ON strategy_adaptations(parameter);

    CREATE TABLE IF NOT EXISTS strategy_parameters (
      strategy TEXT NOT NULL,
      parameter TEXT NOT NULL,
      value REAL NOT NULL,
      min_value REAL NOT NULL,
      max_value REAL NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (strategy, parameter)
    );
  `);
}

// ── Engine ──────────────────────────────────────────────

const DEFAULT_PARAMS: Record<StrategyDomain, Record<string, { value: number; min: number; max: number }>> = {
  recall: {
    fts_weight: { value: 0.5, min: 0.0, max: 1.0 },
    semantic_weight: { value: 0.5, min: 0.0, max: 1.0 },
    time_window_hours: { value: 168, min: 1, max: 720 },
    min_match_score: { value: 0.3, min: 0.05, max: 0.9 },
  },
  learning: {
    min_sample_size: { value: 5, min: 2, max: 50 },
    synapse_decay_rate: { value: 0.05, min: 0.001, max: 0.3 },
    confidence_threshold: { value: 0.6, min: 0.3, max: 0.95 },
    learning_interval_ms: { value: 1_800_000, min: 60_000, max: 7_200_000 },
  },
  research: {
    hypothesis_min_confidence: { value: 0.5, min: 0.1, max: 0.9 },
    causal_min_strength: { value: 0.3, min: 0.05, max: 0.8 },
    meta_step_size: { value: 0.1, min: 0.01, max: 0.5 },
    research_interval_ms: { value: 600_000, min: 60_000, max: 3_600_000 },
  },
};

export class AdaptiveStrategyEngine {
  private db: Database.Database;
  private config: Required<AdaptiveStrategyConfig>;
  private log = getLogger();

  constructor(db: Database.Database, config: AdaptiveStrategyConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxChangeRate: config.maxChangeRate ?? 0.2,
      observationCycles: config.observationCycles ?? 5,
      revertThreshold: config.revertThreshold ?? 0.1,
    };
    runAdaptiveStrategyMigration(db);
    this.initializeDefaults();
  }

  /** Get current status of all strategies. */
  getStatus(): StrategyStatus {
    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM strategy_adaptations`).get() as { c: number }).c;
    const reverted = (this.db.prepare(`SELECT COUNT(*) as c FROM strategy_adaptations WHERE reverted = 1`).get() as { c: number }).c;

    const strategies = {} as Record<StrategyDomain, StrategyDomainStatus>;
    for (const domain of ['recall', 'learning', 'research'] as StrategyDomain[]) {
      const params = this.db.prepare(`
        SELECT parameter, value FROM strategy_parameters WHERE strategy = ?
      `).all(domain) as Array<{ parameter: string; value: number }>;

      const recentChanges = (this.db.prepare(`
        SELECT COUNT(*) as c FROM strategy_adaptations
        WHERE strategy = ? AND timestamp > ?
      `).get(domain, Date.now() - 86_400_000) as { c: number }).c;

      const lastChange = this.db.prepare(`
        SELECT created_at FROM strategy_adaptations
        WHERE strategy = ? ORDER BY timestamp DESC LIMIT 1
      `).get(domain) as { created_at: string } | undefined;

      strategies[domain] = {
        parameters: Object.fromEntries(params.map(p => [p.parameter, p.value])),
        recentChanges,
        lastChange: lastChange?.created_at,
      };
    }

    return {
      totalAdaptations: total,
      activeAdaptations: total - reverted,
      revertedAdaptations: reverted,
      revertRate: total > 0 ? reverted / total : 0,
      strategies,
    };
  }

  /** Get a parameter value. */
  getParam(strategy: StrategyDomain, parameter: string): number | null {
    const row = this.db.prepare(`
      SELECT value FROM strategy_parameters WHERE strategy = ? AND parameter = ?
    `).get(strategy, parameter) as { value: number } | undefined;
    return row?.value ?? null;
  }

  /** Adapt a strategy parameter based on evidence. Applies stability guard. */
  adapt(
    strategy: StrategyDomain,
    parameter: string,
    newValue: number,
    reason: string,
    evidence: Record<string, unknown>,
  ): StrategyAdaptation | null {
    const current = this.db.prepare(`
      SELECT value, min_value, max_value FROM strategy_parameters
      WHERE strategy = ? AND parameter = ?
    `).get(strategy, parameter) as { value: number; min_value: number; max_value: number } | undefined;

    if (!current) {
      this.log.warn(`Unknown parameter: ${strategy}.${parameter}`);
      return null;
    }

    // Stability guard: limit change to maxChangeRate
    const maxDelta = Math.abs(current.value) * this.config.maxChangeRate;
    const delta = newValue - current.value;
    const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, delta));
    let finalValue = current.value + clampedDelta;

    // Enforce bounds
    finalValue = Math.max(current.min_value, Math.min(current.max_value, finalValue));

    if (Math.abs(finalValue - current.value) < 1e-10) return null; // No effective change

    const timestamp = Date.now();
    this.db.prepare(`
      INSERT INTO strategy_adaptations (timestamp, strategy, parameter, old_value, new_value, reason, evidence)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(timestamp, strategy, parameter, current.value, finalValue, reason, JSON.stringify(evidence));

    this.db.prepare(`
      UPDATE strategy_parameters SET value = ?, updated_at = datetime('now')
      WHERE strategy = ? AND parameter = ?
    `).run(finalValue, strategy, parameter);

    return {
      timestamp,
      strategy,
      parameter,
      old_value: current.value,
      new_value: finalValue,
      reason,
      evidence,
      reverted: false,
    };
  }

  /** Check recent adaptations and revert if performance dropped. */
  checkAndRevert(currentPerformance: number): StrategyAdaptation[] {
    const recentUnreverted = this.db.prepare(`
      SELECT * FROM strategy_adaptations
      WHERE reverted = 0 AND performance_before IS NOT NULL
      AND timestamp > ?
      ORDER BY timestamp DESC
    `).all(Date.now() - 86_400_000 * 7) as Array<Record<string, unknown>>;

    const reverted: StrategyAdaptation[] = [];

    for (const row of recentUnreverted) {
      const perfBefore = row.performance_before as number;
      if (currentPerformance < perfBefore * (1 - this.config.revertThreshold)) {
        // Performance dropped — revert
        this.revert(row.id as number, `Performance dropped from ${perfBefore.toFixed(3)} to ${currentPerformance.toFixed(3)}`);
        reverted.push({
          id: row.id as number,
          timestamp: row.timestamp as number,
          strategy: row.strategy as StrategyDomain,
          parameter: row.parameter as string,
          old_value: row.old_value as number,
          new_value: row.new_value as number,
          reason: row.reason as string,
          evidence: JSON.parse(row.evidence as string),
          reverted: true,
        });
      }
    }

    return reverted;
  }

  /** Manually revert an adaptation. */
  revert(adaptationId: number, reason?: string): boolean {
    const row = this.db.prepare(`
      SELECT * FROM strategy_adaptations WHERE id = ? AND reverted = 0
    `).get(adaptationId) as Record<string, unknown> | undefined;

    if (!row) return false;

    // Restore old value
    this.db.prepare(`
      UPDATE strategy_parameters SET value = ?, updated_at = datetime('now')
      WHERE strategy = ? AND parameter = ?
    `).run(row.old_value, row.strategy, row.parameter);

    // Mark as reverted
    this.db.prepare(`
      UPDATE strategy_adaptations SET reverted = 1, revert_reason = ?
      WHERE id = ?
    `).run(reason ?? 'Manual revert', adaptationId);

    return true;
  }

  /** Get adaptation history. */
  getAdaptations(strategy?: StrategyDomain, limit = 20): StrategyAdaptation[] {
    let sql = `SELECT * FROM strategy_adaptations`;
    const params: unknown[] = [];
    if (strategy) {
      sql += ` WHERE strategy = ?`;
      params.push(strategy);
    }
    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(row => ({
      id: row.id as number,
      timestamp: row.timestamp as number,
      strategy: row.strategy as StrategyDomain,
      parameter: row.parameter as string,
      old_value: row.old_value as number,
      new_value: row.new_value as number,
      reason: row.reason as string,
      evidence: JSON.parse(row.evidence as string),
      reverted: (row.reverted as number) === 1,
    }));
  }

  /** Record performance score for the most recent adaptation. */
  recordPerformance(adaptationId: number, performance: number, phase: 'before' | 'after'): void {
    const col = phase === 'before' ? 'performance_before' : 'performance_after';
    this.db.prepare(`
      UPDATE strategy_adaptations SET ${col} = ? WHERE id = ?
    `).run(performance, adaptationId);
  }

  private initializeDefaults(): void {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO strategy_parameters (strategy, parameter, value, min_value, max_value)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const [strategy, params] of Object.entries(DEFAULT_PARAMS)) {
      for (const [param, def] of Object.entries(params)) {
        insert.run(strategy, param, def.value, def.min, def.max);
      }
    }
  }
}
