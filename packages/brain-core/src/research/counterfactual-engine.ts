import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { CausalGraph, CausalEdge } from '../causal/engine.js';

// ── Types ───────────────────────────────────────────────

export interface CounterfactualQuery {
  intervention: {
    variable: string;
    actual_value: unknown;
    counterfactual_value: unknown;
  };
  outcome_variable: string;
  time_range?: { start: number; end: number };
}

export interface CounterfactualResult {
  id?: number;
  query: CounterfactualQuery;
  actual_outcome: number;
  counterfactual_outcome: number;
  difference: number;
  confidence_interval: [number, number];
  confidence_level: number;
  causal_path: string[];
  narrative: string;
  timestamp: number;
}

export interface InterventionImpact {
  variable: string;
  proposed_value: unknown;
  current_value: unknown;
  affected_outcomes: Array<{
    outcome: string;
    expected_change: number;
    confidence: number;
    causal_distance: number;
  }>;
  total_impact_score: number;
  recommendation: string;
}

export interface CounterfactualConfig {
  /** Default confidence level for intervals. Default: 0.8 */
  defaultConfidence?: number;
  /** Maximum causal path depth. Default: 5 */
  maxPathDepth?: number;
}

// ── Migration ───────────────────────────────────────────

export function runCounterfactualMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS counterfactual_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      actual_outcome REAL NOT NULL,
      counterfactual_outcome REAL NOT NULL,
      difference REAL NOT NULL,
      confidence_interval TEXT NOT NULL,
      confidence_level REAL NOT NULL,
      causal_path TEXT NOT NULL,
      narrative TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cf_timestamp ON counterfactual_queries(timestamp);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class CounterfactualEngine {
  private db: Database.Database;
  private causalGraph: CausalGraph | null;
  private config: Required<CounterfactualConfig>;
  private log = getLogger();

  constructor(db: Database.Database, causalGraph: CausalGraph | null, config?: CounterfactualConfig) {
    this.db = db;
    this.causalGraph = causalGraph;
    this.config = {
      defaultConfidence: config?.defaultConfidence ?? 0.8,
      maxPathDepth: config?.maxPathDepth ?? 5,
    };
    runCounterfactualMigration(db);
  }

  /** Answer a "what if" question using causal graph and historical data. */
  whatIf(query: CounterfactualQuery): CounterfactualResult {
    const timestamp = Date.now();

    // 1. Find causal path from intervention variable to outcome
    const causalPath = this.findCausalPath(query.intervention.variable, query.outcome_variable);

    // 2. Get actual outcome from historical data
    const actualOutcome = this.getActualOutcome(query.outcome_variable, query.time_range);

    // 3. Estimate counterfactual outcome using causal model
    const { estimate, confidence, interval } = this.estimateCounterfactual(
      query, causalPath, actualOutcome,
    );

    // 4. Generate narrative
    const narrative = this.generateNarrative(query, actualOutcome, estimate, causalPath);

    const result: CounterfactualResult = {
      query,
      actual_outcome: actualOutcome,
      counterfactual_outcome: estimate,
      difference: estimate - actualOutcome,
      confidence_interval: interval,
      confidence_level: confidence,
      causal_path: causalPath,
      narrative,
      timestamp,
    };

    // Persist
    this.db.prepare(`
      INSERT INTO counterfactual_queries
      (query, actual_outcome, counterfactual_outcome, difference, confidence_interval,
       confidence_level, causal_path, narrative, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      JSON.stringify(query),
      result.actual_outcome,
      result.counterfactual_outcome,
      result.difference,
      JSON.stringify(result.confidence_interval),
      result.confidence_level,
      JSON.stringify(result.causal_path),
      result.narrative,
      timestamp,
    );

    return result;
  }

  /** Get history of past counterfactual queries. */
  getHistory(limit = 10): CounterfactualResult[] {
    return (this.db.prepare(`
      SELECT * FROM counterfactual_queries ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>).map(row => ({
      id: row.id as number,
      query: JSON.parse(row.query as string),
      actual_outcome: row.actual_outcome as number,
      counterfactual_outcome: row.counterfactual_outcome as number,
      difference: row.difference as number,
      confidence_interval: JSON.parse(row.confidence_interval as string),
      confidence_level: row.confidence_level as number,
      causal_path: JSON.parse(row.causal_path as string),
      narrative: row.narrative as string,
      timestamp: row.timestamp as number,
    }));
  }

  /** Estimate the impact of a proposed intervention before making it. */
  estimateIntervention(variable: string, proposedValue: unknown, currentValue: unknown): InterventionImpact {
    if (!this.causalGraph) {
      return {
        variable,
        proposed_value: proposedValue,
        current_value: currentValue,
        affected_outcomes: [],
        total_impact_score: 0,
        recommendation: 'Cannot estimate — causal graph not available.',
      };
    }

    // Find all downstream effects
    const effects = this.causalGraph.getEffects(variable);
    const affectedOutcomes: InterventionImpact['affected_outcomes'] = [];

    for (const edge of effects) {
      // Estimate change propagation
      const valueDiff = typeof proposedValue === 'number' && typeof currentValue === 'number'
        ? (proposedValue - currentValue) / Math.max(Math.abs(currentValue as number), 1e-10)
        : 0;

      const expectedChange = valueDiff * edge.strength * edge.direction;
      affectedOutcomes.push({
        outcome: edge.effect,
        expected_change: expectedChange,
        confidence: edge.confidence,
        causal_distance: 1,
      });

      // Check second-order effects
      const secondOrder = this.causalGraph.getEffects(edge.effect);
      for (const e2 of secondOrder) {
        if (e2.effect === variable) continue; // Skip cycles
        affectedOutcomes.push({
          outcome: e2.effect,
          expected_change: expectedChange * e2.strength * e2.direction,
          confidence: edge.confidence * e2.confidence,
          causal_distance: 2,
        });
      }
    }

    const totalImpact = affectedOutcomes.reduce(
      (sum, o) => sum + Math.abs(o.expected_change) * o.confidence, 0,
    );

    let recommendation: string;
    if (affectedOutcomes.length === 0) {
      recommendation = 'No known causal effects. Safe to change but impact unknown.';
    } else if (affectedOutcomes.every(o => o.expected_change >= 0)) {
      recommendation = 'All known effects are positive. Recommended to proceed.';
    } else if (affectedOutcomes.every(o => o.expected_change <= 0)) {
      recommendation = 'All known effects are negative. Not recommended.';
    } else {
      const posImpact = affectedOutcomes.filter(o => o.expected_change > 0).reduce((s, o) => s + o.expected_change * o.confidence, 0);
      const negImpact = affectedOutcomes.filter(o => o.expected_change < 0).reduce((s, o) => s + Math.abs(o.expected_change) * o.confidence, 0);
      recommendation = posImpact > negImpact
        ? `Mixed effects but net positive (${(posImpact - negImpact).toFixed(2)}). Consider proceeding with monitoring.`
        : `Mixed effects with net negative impact (${(negImpact - posImpact).toFixed(2)}). Caution advised.`;
    }

    return {
      variable,
      proposed_value: proposedValue,
      current_value: currentValue,
      affected_outcomes: affectedOutcomes.sort((a, b) => Math.abs(b.expected_change) - Math.abs(a.expected_change)),
      total_impact_score: totalImpact,
      recommendation,
    };
  }

  private findCausalPath(from: string, to: string): string[] {
    if (!this.causalGraph) return [from, to];

    // BFS through causal graph
    const visited = new Set<string>();
    const queue: Array<{ node: string; path: string[] }> = [{ node: from, path: [from] }];
    visited.add(from);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.node === to) return current.path;
      if (current.path.length >= this.config.maxPathDepth) continue;

      const effects = this.causalGraph.getEffects(current.node);
      for (const edge of effects) {
        if (!visited.has(edge.effect)) {
          visited.add(edge.effect);
          queue.push({ node: edge.effect, path: [...current.path, edge.effect] });
        }
      }
    }

    return [from, to]; // No path found, assume direct
  }

  private getActualOutcome(variable: string, timeRange?: { start: number; end: number }): number {
    // Try to get from causal events
    let sql = `
      SELECT AVG(CAST(json_extract(data, '$.value') AS REAL)) as avg_val,
             COUNT(*) as count
      FROM causal_events WHERE type = ?
    `;
    const params: unknown[] = [variable];
    if (timeRange) {
      sql += ` AND timestamp BETWEEN ? AND ?`;
      params.push(timeRange.start, timeRange.end);
    }

    try {
      const row = this.db.prepare(sql).get(...params) as { avg_val: number | null; count: number };
      if (row.avg_val !== null) return row.avg_val;
    } catch {
      // Table might not exist
    }

    // Fallback: count events as a proxy
    try {
      let countSql = `SELECT COUNT(*) as c FROM causal_events WHERE type = ?`;
      const countParams: unknown[] = [variable];
      if (timeRange) {
        countSql += ` AND timestamp BETWEEN ? AND ?`;
        countParams.push(timeRange.start, timeRange.end);
      }
      const count = this.db.prepare(countSql).get(...countParams) as { c: number };
      return count.c;
    } catch {
      return 0;
    }
  }

  private estimateCounterfactual(
    query: CounterfactualQuery,
    causalPath: string[],
    actualOutcome: number,
  ): { estimate: number; confidence: number; interval: [number, number] } {
    if (!this.causalGraph || causalPath.length < 2) {
      // No causal model — assume linear relationship
      const ratio = typeof query.intervention.counterfactual_value === 'number' &&
        typeof query.intervention.actual_value === 'number' &&
        (query.intervention.actual_value as number) !== 0
        ? (query.intervention.counterfactual_value as number) / (query.intervention.actual_value as number)
        : 1;

      const estimate = actualOutcome * ratio;
      const spread = Math.abs(estimate - actualOutcome) * 0.5;
      return {
        estimate,
        confidence: 0.3,
        interval: [estimate - spread, estimate + spread],
      };
    }

    // Use causal path to estimate propagation
    let cumulativeEffect = 1;
    let cumulativeConfidence = 1;

    for (let i = 0; i < causalPath.length - 1; i++) {
      const edges = this.causalGraph.getEffects(causalPath[i])
        .filter(e => e.effect === causalPath[i + 1]);

      if (edges.length > 0) {
        const edge = edges[0];
        cumulativeEffect *= edge.strength * edge.direction;
        cumulativeConfidence *= edge.confidence;
      } else {
        cumulativeEffect *= 0.5; // Unknown link — assume weak
        cumulativeConfidence *= 0.3;
      }
    }

    // Compute value difference
    const valueDiff = typeof query.intervention.counterfactual_value === 'number' &&
      typeof query.intervention.actual_value === 'number'
      ? (query.intervention.counterfactual_value as number) - (query.intervention.actual_value as number)
      : 0;

    const estimate = actualOutcome + valueDiff * cumulativeEffect;
    const spread = Math.abs(estimate - actualOutcome) * (1 - cumulativeConfidence);

    return {
      estimate,
      confidence: cumulativeConfidence,
      interval: [estimate - spread, estimate + spread],
    };
  }

  private generateNarrative(
    query: CounterfactualQuery, actual: number, counterfactual: number, path: string[],
  ): string {
    const diff = counterfactual - actual;
    const pctDiff = actual !== 0 ? ((diff / actual) * 100).toFixed(1) : 'N/A';
    const direction = diff > 0 ? 'higher' : diff < 0 ? 'lower' : 'the same';
    const pathStr = path.length > 2 ? ` via ${path.slice(1, -1).join(' → ')}` : '';

    return `If ${query.intervention.variable} had been ${query.intervention.counterfactual_value} instead of ${query.intervention.actual_value}, ` +
      `${query.outcome_variable} would have been ${direction} at ${counterfactual.toFixed(2)} (actual: ${actual.toFixed(2)}, ${pctDiff}% change)${pathStr}.`;
  }
}
