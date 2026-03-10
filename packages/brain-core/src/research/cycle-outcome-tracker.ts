/**
 * CycleOutcomeTracker — Measures whether Brain improves over time.
 *
 * Tracks 4 hard metrics per cycle. Each metric documents what it measures,
 * what it does NOT measure, and how it can be gamed.
 *
 * ─── 1. productive_rate ───────────────────────────────────────────────
 * MEASURES: Cycles with at least one measurable artifact (confirmed hypothesis,
 *   learned rule, completed experiment, or actionable insight).
 *   Anomaly detection alone does NOT count.
 * DOES NOT MEASURE: Whether the artifact is valuable, non-trivial, or useful.
 *   A cycle with 3 banale insights counts the same as one with a breakthrough.
 * CAN BE GAMED BY: Generating many trivial insights or low-confidence rules.
 *   An agent producing "insight: X happened today" inflates the rate.
 * FORMULA: count(productive) / count(total) over window
 * FUTURE: Split into raw_productive and meaningful_productive (weight by significance).
 *
 * ─── 2. failed_rate ──────────────────────────────────────────────────
 * MEASURES: Cycles that errored OR consumed tokens but produced zero outputs.
 * DOES NOT MEASURE: Cycles that produced useless/wrong outputs. A cycle with
 *   garbage output and tokens > 0 is classified "productive", not "failed".
 * CAN BE GAMED BY: Producing any output at all (even trivial) to avoid "failed".
 * FORMULA: count(failed) / count(total) over window
 * FUTURE: Add "wasted_rate" for cycles with output that gets rejected/ignored.
 *
 * ─── 3. novelty_rate (actually: recent-uniqueness-rate) ──────────────
 * MEASURES: Whether output fingerprints were seen in the last 100 cycles.
 *   This is repeat suppression / deduplication, not semantic novelty.
 * DOES NOT MEASURE: Whether output is substantively new, relevant, or a real
 *   epistemic contribution. Rephrasing old knowledge passes the fingerprint check.
 * CAN BE GAMED BY: Minimally rephrasing old outputs to generate new fingerprints.
 * FORMULA: count(cycles with novel output) / count(productive cycles) over window
 * FUTURE: Semantic similarity check against knowledge base, not just fingerprint dedup.
 *
 * ─── 4. efficiency_rate ──────────────────────────────────────────────
 * MEASURES: Raw output count per 1k tokens consumed.
 * DOES NOT MEASURE: Value per token. Rewards quantity over quality.
 *   Fragmenting one insight into 5 small ones quintuples the rate.
 * CAN BE GAMED BY: Producing many tiny, fragmented outputs cheaply.
 * FORMULA: sum(total_outputs) / max(sum(tokens_used), 1) * 1000
 * FUTURE: weighted_efficiency using significance weights (breakthrough=5x, routine=1x).
 *
 * All outcomes are persisted to SQLite and can be aggregated over any time window.
 */

import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface CycleOutcomeRecord {
  cycle: number;
  timestamp: number;       // Unix ms
  durationMs: number;
  tokensUsed: number;

  // Productive outputs (each must be a concrete artifact, not just activity)
  insightsFound: number;
  rulesLearned: number;
  hypothesesConfirmed: number;
  experimentsCompleted: number;
  actionsExecuted: number;

  // Classification
  errored: boolean;

  // Novelty: content fingerprints of this cycle's outputs
  outputFingerprints: string[];
}

export type CycleClassification = 'productive' | 'failed' | 'idle';

export interface CycleRates {
  window: string;          // e.g. "7d", "30d", "all"
  totalCycles: number;
  productiveRate: number;  // 0-1
  failedRate: number;      // 0-1
  noveltyRate: number;     // 0-1 (of productive cycles)
  efficiencyRate: number;  // productive outputs per 1k tokens
  avgDurationMs: number;
}

export interface CycleOutcomeRow {
  id: number;
  cycle: number;
  timestamp: number;
  duration_ms: number;
  tokens_used: number;
  insights_found: number;
  rules_learned: number;
  hypotheses_confirmed: number;
  experiments_completed: number;
  actions_executed: number;
  errored: number;
  classification: string;
  novel_outputs: number;
  total_outputs: number;
  output_fingerprints: string;
}

// ── Constants ───────────────────────────────────────────

/** How many recent cycles to check for fingerprint deduplication. */
const NOVELTY_LOOKBACK_CYCLES = 100;

// ── Tracker ─────────────────────────────────────────────

export class CycleOutcomeTracker {
  private db: Database.Database;
  private log = getLogger();

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cycle_outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        tokens_used INTEGER NOT NULL DEFAULT 0,
        insights_found INTEGER NOT NULL DEFAULT 0,
        rules_learned INTEGER NOT NULL DEFAULT 0,
        hypotheses_confirmed INTEGER NOT NULL DEFAULT 0,
        experiments_completed INTEGER NOT NULL DEFAULT 0,
        actions_executed INTEGER NOT NULL DEFAULT 0,
        errored INTEGER NOT NULL DEFAULT 0,
        classification TEXT NOT NULL DEFAULT 'idle',
        novel_outputs INTEGER NOT NULL DEFAULT 0,
        total_outputs INTEGER NOT NULL DEFAULT 0,
        output_fingerprints TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_cycle_outcomes_cycle ON cycle_outcomes(cycle);
      CREATE INDEX IF NOT EXISTS idx_cycle_outcomes_ts ON cycle_outcomes(timestamp);
    `);
  }

  /**
   * Record one cycle's outcome.
   * Call this at the end of each ResearchOrchestrator cycle.
   */
  recordOutcome(record: CycleOutcomeRecord): CycleClassification {
    const totalOutputs = record.insightsFound + record.rulesLearned
      + record.hypothesesConfirmed + record.experimentsCompleted + record.actionsExecuted;

    const classification = this.classify(record, totalOutputs);
    const novelOutputs = this.countNovelOutputs(record.cycle, record.outputFingerprints);

    this.db.prepare(`
      INSERT INTO cycle_outcomes
        (cycle, timestamp, duration_ms, tokens_used, insights_found, rules_learned,
         hypotheses_confirmed, experiments_completed, actions_executed, errored,
         classification, novel_outputs, total_outputs, output_fingerprints)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.cycle,
      record.timestamp,
      record.durationMs,
      record.tokensUsed,
      record.insightsFound,
      record.rulesLearned,
      record.hypothesesConfirmed,
      record.experimentsCompleted,
      record.actionsExecuted,
      record.errored ? 1 : 0,
      classification,
      novelOutputs,
      totalOutputs,
      JSON.stringify(record.outputFingerprints),
    );

    this.log.debug(`[CycleOutcome] Cycle #${record.cycle}: ${classification}, ${totalOutputs} outputs (${novelOutputs} novel), ${record.tokensUsed} tokens`);
    return classification;
  }

  /**
   * Get aggregated rates for a time window.
   * @param windowHours Hours to look back (0 = all time)
   */
  getRates(windowHours = 0): CycleRates {
    const windowLabel = windowHours === 0 ? 'all'
      : windowHours <= 24 ? `${windowHours}h`
      : `${Math.round(windowHours / 24)}d`;

    const whereClause = windowHours > 0
      ? `WHERE timestamp > ${Date.now() - windowHours * 3_600_000}`
      : '';

    const rows = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN classification = 'productive' THEN 1 ELSE 0 END) as productive,
        SUM(CASE WHEN classification = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN classification = 'productive' AND novel_outputs > 0 THEN 1 ELSE 0 END) as novel_productive,
        SUM(total_outputs) as total_outputs,
        SUM(tokens_used) as total_tokens,
        AVG(duration_ms) as avg_duration
      FROM cycle_outcomes ${whereClause}
    `).get() as {
      total: number; productive: number; failed: number; novel_productive: number;
      total_outputs: number; total_tokens: number; avg_duration: number;
    };

    if (!rows || rows.total === 0) {
      return {
        window: windowLabel, totalCycles: 0,
        productiveRate: 0, failedRate: 0, noveltyRate: 0, efficiencyRate: 0, avgDurationMs: 0,
      };
    }

    return {
      window: windowLabel,
      totalCycles: rows.total,
      productiveRate: rows.productive / rows.total,
      failedRate: rows.failed / rows.total,
      noveltyRate: rows.productive > 0 ? rows.novel_productive / rows.productive : 0,
      efficiencyRate: (rows.total_outputs / Math.max(rows.total_tokens, 1)) * 1000,
      avgDurationMs: rows.avg_duration,
    };
  }

  /**
   * Get rate history as time series (one point per day).
   * @param days Number of days to look back
   */
  getRateHistory(days = 30): Array<{ date: string } & CycleRates> {
    const since = Date.now() - days * 86_400_000;
    const rows = this.db.prepare(`
      SELECT
        date(created_at) as day,
        COUNT(*) as total,
        SUM(CASE WHEN classification = 'productive' THEN 1 ELSE 0 END) as productive,
        SUM(CASE WHEN classification = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN classification = 'productive' AND novel_outputs > 0 THEN 1 ELSE 0 END) as novel_productive,
        SUM(total_outputs) as total_outputs,
        SUM(tokens_used) as total_tokens,
        AVG(duration_ms) as avg_duration
      FROM cycle_outcomes
      WHERE timestamp > ?
      GROUP BY day
      ORDER BY day
    `).all(since) as Array<{
      day: string; total: number; productive: number; failed: number;
      novel_productive: number; total_outputs: number; total_tokens: number; avg_duration: number;
    }>;

    return rows.map(r => ({
      date: r.day,
      window: '1d',
      totalCycles: r.total,
      productiveRate: r.productive / r.total,
      failedRate: r.failed / r.total,
      noveltyRate: r.productive > 0 ? r.novel_productive / r.productive : 0,
      efficiencyRate: (r.total_outputs / Math.max(r.total_tokens, 1)) * 1000,
      avgDurationMs: r.avg_duration,
    }));
  }

  /** Get the last N cycle outcomes. */
  getRecent(limit = 20): CycleOutcomeRow[] {
    return this.db.prepare(`
      SELECT * FROM cycle_outcomes ORDER BY cycle DESC LIMIT ?
    `).all(limit) as CycleOutcomeRow[];
  }

  // ── Classification ────────────────────────────────────

  /**
   * Classify a cycle. Rules:
   * - errored → 'failed'
   * - tokens > 0 but totalOutputs === 0 → 'failed' (consumed resources, produced nothing)
   * - totalOutputs > 0 → 'productive'
   * - everything else → 'idle' (no tokens, no output — scheduler skipped or trivial)
   */
  private classify(record: CycleOutcomeRecord, totalOutputs: number): CycleClassification {
    if (record.errored) return 'failed';
    if (totalOutputs > 0) return 'productive';
    if (record.tokensUsed > 0) return 'failed'; // consumed tokens but produced nothing
    return 'idle';
  }

  // ── Novelty detection ─────────────────────────────────

  /**
   * Count how many of this cycle's fingerprints are genuinely new
   * (not seen in the last NOVELTY_LOOKBACK_CYCLES cycles).
   */
  private countNovelOutputs(currentCycle: number, fingerprints: string[]): number {
    if (fingerprints.length === 0) return 0;

    // Get all fingerprints from recent cycles
    const recentRows = this.db.prepare(`
      SELECT output_fingerprints FROM cycle_outcomes
      WHERE cycle > ? AND cycle < ?
      ORDER BY cycle DESC
    `).all(currentCycle - NOVELTY_LOOKBACK_CYCLES, currentCycle) as Array<{ output_fingerprints: string }>;

    const seenFingerprints = new Set<string>();
    for (const row of recentRows) {
      try {
        const fps: string[] = JSON.parse(row.output_fingerprints);
        for (const fp of fps) seenFingerprints.add(fp);
      } catch { /* skip malformed */ }
    }

    let novel = 0;
    for (const fp of fingerprints) {
      if (!seenFingerprints.has(fp)) novel++;
    }
    return novel;
  }
}

// ── Utility ─────────────────────────────────────────────

/** Create a content fingerprint for novelty detection. */
export function fingerprint(content: string): string {
  // Normalize whitespace and case, then hash
  const normalized = content.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}

/** Run the cycle_outcomes migration (idempotent). */
export function runCycleOutcomeMigration(db: Database.Database): void {
  new CycleOutcomeTracker(db);
}
