// ── Experiment Ledger ─────────────────────────────────────
//
// Kontrolliertes A/B-Testing für Systemänderungen.
// Max 1 aktives Experiment gleichzeitig (Isolation der Effekte).
// Jedes Experiment: Hypothese → A/B Varianten → Metriken → Entscheidung (keep/revert).
//
// Integration:
//   - ParameterRegistry für Snapshots + Rollback
//   - CycleOutcomeTracker für Metriken

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────

export type ExperimentLedgerStatus = 'running_a' | 'running_b' | 'evaluating' | 'decided' | 'cancelled';
export type ExperimentDecision = 'keep' | 'revert';

export interface ExperimentEntry {
  id: number;
  hypothesis: string;
  variant_a: string;          // description of variant A (baseline)
  variant_b: string;          // description of variant B (change)
  target_engine: string;
  metric_keys: string[];      // which metrics to compare
  cycles_per_variant: number;
  status: ExperimentLedgerStatus;
  current_cycle: number;
  metrics_a: Record<string, number[]>;
  metrics_b: Record<string, number[]>;
  snapshot_id: number | null;  // ParameterRegistry snapshot for rollback
  decision: ExperimentDecision | null;
  decision_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ExperimentResult {
  experimentId: number;
  decision: ExperimentDecision;
  summary: {
    metricKey: string;
    meanA: number;
    meanB: number;
    improvement: number; // percentage
  }[];
}

// ── Migration ─────────────────────────────────────────────

export function runExperimentLedgerMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiment_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hypothesis TEXT NOT NULL,
      variant_a TEXT NOT NULL,
      variant_b TEXT NOT NULL,
      target_engine TEXT NOT NULL,
      metric_keys TEXT NOT NULL DEFAULT '[]',
      cycles_per_variant INTEGER NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'running_a',
      current_cycle INTEGER NOT NULL DEFAULT 0,
      metrics_a TEXT NOT NULL DEFAULT '{}',
      metrics_b TEXT NOT NULL DEFAULT '{}',
      snapshot_id INTEGER,
      decision TEXT,
      decision_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_exp_ledger_status ON experiment_ledger(status);
  `);
}

// ── Engine ────────────────────────────────────────────────

export class ExperimentLedger {
  private readonly db: Database.Database;
  private readonly log = getLogger();

  constructor(db: Database.Database) {
    this.db = db;
    runExperimentLedgerMigration(db);
  }

  /**
   * Start a new A/B experiment.
   * Only 1 active experiment allowed (rule 7).
   */
  startExperiment(opts: {
    hypothesis: string;
    variantA: string;
    variantB: string;
    targetEngine: string;
    metricKeys: string[];
    cyclesPerVariant?: number;
    snapshotId?: number;
  }): ExperimentEntry {
    // Check: max 1 active experiment
    const active = this.getActive();
    if (active) {
      throw new Error(`Experiment #${active.id} is still running. Max 1 active experiment allowed.`);
    }

    const cycles = opts.cyclesPerVariant ?? 20;

    const result = this.db.prepare(`
      INSERT INTO experiment_ledger (hypothesis, variant_a, variant_b, target_engine, metric_keys, cycles_per_variant, snapshot_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      opts.hypothesis,
      opts.variantA,
      opts.variantB,
      opts.targetEngine,
      JSON.stringify(opts.metricKeys),
      cycles,
      opts.snapshotId ?? null,
    );

    const id = result.lastInsertRowid as number;
    this.log.info(`[experiment-ledger] Started experiment #${id}: "${opts.hypothesis}"`);

    return this.get(id)!;
  }

  /**
   * Record metrics for the current cycle.
   * Automatically switches from variant A → B when enough cycles collected.
   */
  recordCycleMetrics(metrics: Record<string, number>): { phase: 'a' | 'b' | 'done'; cycle: number } | null {
    const exp = this.getActive();
    if (!exp) return null;

    const isPhaseA = exp.status === 'running_a';
    const isPhaseB = exp.status === 'running_b';
    if (!isPhaseA && !isPhaseB) return null;

    const metricsStore = isPhaseA ? exp.metrics_a : exp.metrics_b;

    // Append each metric value
    for (const key of exp.metric_keys) {
      if (metrics[key] !== undefined) {
        if (!metricsStore[key]) metricsStore[key] = [];
        metricsStore[key]!.push(metrics[key]!);
      }
    }

    const newCycle = exp.current_cycle + 1;
    const metricsJson = JSON.stringify(metricsStore);

    // Check if we need to switch phases
    const currentPhaseMetrics = isPhaseA ? exp.metrics_a : exp.metrics_b;
    const sampleCount = Math.max(...exp.metric_keys.map(k => (currentPhaseMetrics[k]?.length ?? 0)));

    if (sampleCount >= exp.cycles_per_variant) {
      if (isPhaseA) {
        // Switch to phase B
        this.db.prepare(`
          UPDATE experiment_ledger SET metrics_a = ?, current_cycle = ?, status = 'running_b'
          WHERE id = ?
        `).run(metricsJson, newCycle, exp.id);

        this.log.info(`[experiment-ledger] Experiment #${exp.id}: Phase A complete (${sampleCount} cycles), switching to B`);
        return { phase: 'b', cycle: newCycle };
      } else {
        // Phase B complete → evaluating
        this.db.prepare(`
          UPDATE experiment_ledger SET metrics_b = ?, current_cycle = ?, status = 'evaluating'
          WHERE id = ?
        `).run(metricsJson, newCycle, exp.id);

        this.log.info(`[experiment-ledger] Experiment #${exp.id}: Phase B complete (${sampleCount} cycles), ready to evaluate`);
        return { phase: 'done', cycle: newCycle };
      }
    }

    // Still collecting
    const col = isPhaseA ? 'metrics_a' : 'metrics_b';
    this.db.prepare(`UPDATE experiment_ledger SET ${col} = ?, current_cycle = ? WHERE id = ?`).run(metricsJson, newCycle, exp.id);
    return { phase: isPhaseA ? 'a' : 'b', cycle: newCycle };
  }

  /**
   * Evaluate the experiment: compare A vs B metrics.
   */
  evaluate(experimentId: number): ExperimentResult | null {
    const exp = this.get(experimentId);
    if (!exp) return null;

    const summary: ExperimentResult['summary'] = [];

    for (const key of exp.metric_keys) {
      const valuesA = exp.metrics_a[key] ?? [];
      const valuesB = exp.metrics_b[key] ?? [];

      const meanA = valuesA.length > 0 ? valuesA.reduce((a, b) => a + b, 0) / valuesA.length : 0;
      const meanB = valuesB.length > 0 ? valuesB.reduce((a, b) => a + b, 0) / valuesB.length : 0;
      const improvement = meanA > 0 ? ((meanB - meanA) / meanA) * 100 : 0;

      summary.push({ metricKey: key, meanA, meanB, improvement });
    }

    return { experimentId, decision: 'keep', summary };
  }

  /**
   * Decide: keep variant B or revert to variant A.
   */
  decide(experimentId: number, decision: ExperimentDecision, reason?: string): void {
    this.db.prepare(`
      UPDATE experiment_ledger SET decision = ?, decision_reason = ?, status = 'decided', completed_at = datetime('now')
      WHERE id = ?
    `).run(decision, reason ?? null, experimentId);

    this.log.info(`[experiment-ledger] Experiment #${experimentId}: decided → ${decision}${reason ? ` (${reason})` : ''}`);
  }

  /**
   * Cancel an active experiment.
   */
  cancel(experimentId: number, reason?: string): void {
    this.db.prepare(`
      UPDATE experiment_ledger SET status = 'cancelled', decision_reason = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(reason ?? 'cancelled', experimentId);

    this.log.info(`[experiment-ledger] Experiment #${experimentId}: cancelled`);
  }

  /** Get active experiment (max 1). */
  getActive(): ExperimentEntry | null {
    const row = this.db.prepare(
      "SELECT * FROM experiment_ledger WHERE status IN ('running_a', 'running_b', 'evaluating') LIMIT 1",
    ).get() as Record<string, unknown> | undefined;

    return row ? this.toEntry(row) : null;
  }

  /** Get experiment by ID. */
  get(id: number): ExperimentEntry | null {
    const row = this.db.prepare('SELECT * FROM experiment_ledger WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.toEntry(row) : null;
  }

  /** List all experiments. */
  list(limit = 20): ExperimentEntry[] {
    const rows = this.db.prepare(
      'SELECT * FROM experiment_ledger ORDER BY id DESC LIMIT ?',
    ).all(limit) as Array<Record<string, unknown>>;
    return rows.map(r => this.toEntry(r));
  }

  /** Get summary stats. */
  getStatus(): { total: number; active: ExperimentEntry | null; kept: number; reverted: number; cancelled: number } {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM experiment_ledger').get() as { c: number }).c;
    const kept = (this.db.prepare("SELECT COUNT(*) as c FROM experiment_ledger WHERE decision = 'keep'").get() as { c: number }).c;
    const reverted = (this.db.prepare("SELECT COUNT(*) as c FROM experiment_ledger WHERE decision = 'revert'").get() as { c: number }).c;
    const cancelled = (this.db.prepare("SELECT COUNT(*) as c FROM experiment_ledger WHERE status = 'cancelled'").get() as { c: number }).c;

    return { total, active: this.getActive(), kept, reverted, cancelled };
  }

  private toEntry(row: Record<string, unknown>): ExperimentEntry {
    return {
      id: row.id as number,
      hypothesis: row.hypothesis as string,
      variant_a: row.variant_a as string,
      variant_b: row.variant_b as string,
      target_engine: row.target_engine as string,
      metric_keys: JSON.parse((row.metric_keys as string) || '[]'),
      cycles_per_variant: row.cycles_per_variant as number,
      status: row.status as ExperimentLedgerStatus,
      current_cycle: row.current_cycle as number,
      metrics_a: JSON.parse((row.metrics_a as string) || '{}'),
      metrics_b: JSON.parse((row.metrics_b as string) || '{}'),
      snapshot_id: row.snapshot_id as number | null,
      decision: row.decision as ExperimentDecision | null,
      decision_reason: row.decision_reason as string | null,
      created_at: row.created_at as string,
      completed_at: row.completed_at as string | null,
    };
  }
}
