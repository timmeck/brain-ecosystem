import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export type ObservationCategory = 'tool_usage' | 'query_quality' | 'resolution_rate' | 'latency' | 'cross_brain';
export type InsightType = 'usage_pattern' | 'quality_issue' | 'optimization_opportunity' | 'anomaly';

export interface SelfObservation {
  id?: number;
  timestamp: number;
  category: ObservationCategory;
  event_type: string;
  metrics: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface SelfInsight {
  id?: number;
  timestamp: number;
  type: InsightType;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  confidence: number;       // 0-1
  actionable: boolean;
}

export interface ImprovementSuggestion {
  area: string;
  problem: string;
  suggestion: string;
  evidence: Record<string, unknown>;
  priority: number;         // 0-1
  estimated_impact: string;
}

export interface SelfObserverConfig {
  brainName: string;
  /** Minimum observations before generating insights. Default: 10 */
  minObservationsForInsight?: number;
  /** How many recent observations to analyze. Default: 500 */
  analysisWindow?: number;
}

// ── Migration ───────────────────────────────────────────

export function runSelfObserverMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS self_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      category TEXT NOT NULL,
      event_type TEXT NOT NULL,
      metrics TEXT NOT NULL,
      context TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_self_obs_category ON self_observations(category);
    CREATE INDEX IF NOT EXISTS idx_self_obs_event ON self_observations(event_type);
    CREATE INDEX IF NOT EXISTS idx_self_obs_ts ON self_observations(timestamp);

    CREATE TABLE IF NOT EXISTS self_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence TEXT NOT NULL,
      confidence REAL NOT NULL,
      actionable INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_self_insights_type ON self_insights(type);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class SelfObserver {
  private db: Database.Database;
  private config: Required<SelfObserverConfig>;
  private log = getLogger();

  constructor(db: Database.Database, config: SelfObserverConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      minObservationsForInsight: config.minObservationsForInsight ?? 10,
      analysisWindow: config.analysisWindow ?? 500,
    };
    runSelfObserverMigration(db);
  }

  /** Record a self-observation about tool usage, query quality, etc. */
  record(obs: Omit<SelfObservation, 'id' | 'timestamp'>): void {
    const timestamp = Date.now();
    this.db.prepare(`
      INSERT INTO self_observations (timestamp, category, event_type, metrics, context)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      timestamp,
      obs.category,
      obs.event_type,
      JSON.stringify(obs.metrics),
      obs.context ? JSON.stringify(obs.context) : null,
    );
  }

  /** Get observation statistics grouped by category and event type. */
  getStats(): Record<string, unknown> {
    const byCategory = this.db.prepare(`
      SELECT category, COUNT(*) as count,
             AVG(json_extract(metrics, '$.duration_ms')) as avg_duration,
             AVG(json_extract(metrics, '$.result_count')) as avg_results,
             AVG(json_extract(metrics, '$.success')) as success_rate
      FROM self_observations
      GROUP BY category
      ORDER BY count DESC
    `).all() as Array<Record<string, unknown>>;

    const byEventType = this.db.prepare(`
      SELECT event_type, COUNT(*) as count,
             AVG(json_extract(metrics, '$.duration_ms')) as avg_duration,
             AVG(json_extract(metrics, '$.result_count')) as avg_results
      FROM self_observations
      GROUP BY event_type
      ORDER BY count DESC
      LIMIT 20
    `).all() as Array<Record<string, unknown>>;

    const total = this.db.prepare(`SELECT COUNT(*) as count FROM self_observations`).get() as { count: number };

    return {
      totalObservations: total.count,
      byCategory,
      topEventTypes: byEventType,
    };
  }

  /** Analyze observations and generate insights. */
  analyze(): SelfInsight[] {
    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM self_observations`).get() as { c: number }).c;
    if (total < this.config.minObservationsForInsight) return [];

    const insights: SelfInsight[] = [];

    // 1. Usage pattern insights — which tools are used most/least
    const usagePatterns = this.db.prepare(`
      SELECT event_type, COUNT(*) as count
      FROM self_observations
      WHERE category = 'tool_usage'
      GROUP BY event_type
      ORDER BY count DESC
    `).all() as Array<{ event_type: string; count: number }>;

    if (usagePatterns.length >= 2) {
      const top = usagePatterns[0];
      const bottom = usagePatterns[usagePatterns.length - 1];
      if (top.count > bottom.count * 5) {
        insights.push(this.createInsight(
          'usage_pattern',
          `${top.event_type} is used ${Math.round(top.count / bottom.count)}x more than ${bottom.event_type}`,
          `Users strongly prefer ${top.event_type} (${top.count} calls) over ${bottom.event_type} (${bottom.count} calls). Consider optimizing the popular tool or investigating why the other is underused.`,
          { top, bottom, ratio: top.count / bottom.count },
          Math.min(0.9, 0.5 + (top.count / (top.count + bottom.count))),
          true,
        ));
      }
    }

    // 2. Quality insights — tools that return empty results
    const qualityIssues = this.db.prepare(`
      SELECT event_type,
             COUNT(*) as total,
             SUM(CASE WHEN json_extract(metrics, '$.result_count') = 0 THEN 1 ELSE 0 END) as empty_count
      FROM self_observations
      WHERE category = 'query_quality' AND json_extract(metrics, '$.result_count') IS NOT NULL
      GROUP BY event_type
      HAVING total >= 5
    `).all() as Array<{ event_type: string; total: number; empty_count: number }>;

    for (const q of qualityIssues) {
      const emptyRate = q.empty_count / q.total;
      if (emptyRate > 0.5) {
        insights.push(this.createInsight(
          'quality_issue',
          `${(emptyRate * 100).toFixed(0)}% of ${q.event_type} calls return empty results`,
          `${q.event_type} returns no results in ${q.empty_count}/${q.total} calls (${(emptyRate * 100).toFixed(0)}%). The underlying algorithm may need improvement.`,
          { event_type: q.event_type, total: q.total, empty_count: q.empty_count, empty_rate: emptyRate },
          Math.min(0.95, 0.5 + emptyRate * 0.4),
          true,
        ));
      }
    }

    // 3. Latency insights — slow operations
    const latencyIssues = this.db.prepare(`
      SELECT event_type,
             COUNT(*) as total,
             AVG(json_extract(metrics, '$.duration_ms')) as avg_ms,
             MAX(json_extract(metrics, '$.duration_ms')) as max_ms
      FROM self_observations
      WHERE category = 'latency' AND json_extract(metrics, '$.duration_ms') IS NOT NULL
      GROUP BY event_type
      HAVING total >= 3
      ORDER BY avg_ms DESC
      LIMIT 5
    `).all() as Array<{ event_type: string; total: number; avg_ms: number; max_ms: number }>;

    const overallAvg = this.db.prepare(`
      SELECT AVG(json_extract(metrics, '$.duration_ms')) as avg
      FROM self_observations
      WHERE category = 'latency' AND json_extract(metrics, '$.duration_ms') IS NOT NULL
    `).get() as { avg: number | null };

    if (overallAvg?.avg && latencyIssues.length > 0) {
      for (const l of latencyIssues) {
        if (l.avg_ms > overallAvg.avg * 3) {
          insights.push(this.createInsight(
            'optimization_opportunity',
            `${l.event_type} is ${(l.avg_ms / overallAvg.avg).toFixed(1)}x slower than average`,
            `${l.event_type} averages ${l.avg_ms.toFixed(0)}ms (overall avg: ${overallAvg.avg.toFixed(0)}ms). Peak: ${l.max_ms.toFixed(0)}ms. Consider optimizing.`,
            { event_type: l.event_type, avg_ms: l.avg_ms, max_ms: l.max_ms, overall_avg: overallAvg.avg },
            0.8,
            true,
          ));
        }
      }
    }

    // 4. Resolution rate insights
    const resolutionData = this.db.prepare(`
      SELECT json_extract(metrics, '$.tag') as tag,
             COUNT(*) as total,
             SUM(CASE WHEN json_extract(metrics, '$.resolved') = 1 THEN 1 ELSE 0 END) as resolved
      FROM self_observations
      WHERE category = 'resolution_rate' AND json_extract(metrics, '$.tag') IS NOT NULL
      GROUP BY tag
      HAVING total >= 3
    `).all() as Array<{ tag: string; total: number; resolved: number }>;

    for (const r of resolutionData) {
      const rate = r.resolved / r.total;
      if (rate < 0.3) {
        insights.push(this.createInsight(
          'quality_issue',
          `Low resolution rate for "${r.tag}" errors: ${(rate * 100).toFixed(0)}%`,
          `Errors tagged "${r.tag}" are resolved only ${(rate * 100).toFixed(0)}% of the time (${r.resolved}/${r.total}). Knowledge in this area is weak.`,
          { tag: r.tag, total: r.total, resolved: r.resolved, rate },
          Math.min(0.9, 0.6 + (1 - rate) * 0.3),
          true,
        ));
      }
    }

    // Persist insights
    for (const insight of insights) {
      this.persistInsight(insight);
    }

    return insights;
  }

  /** Get all insights, optionally filtered by type. */
  getInsights(type?: InsightType, limit = 20): SelfInsight[] {
    let sql = `SELECT * FROM self_insights`;
    const params: unknown[] = [];
    if (type) {
      sql += ` WHERE type = ?`;
      params.push(type);
    }
    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(row => ({
      id: row.id as number,
      timestamp: row.timestamp as number,
      type: row.type as InsightType,
      title: row.title as string,
      description: row.description as string,
      evidence: JSON.parse(row.evidence as string),
      confidence: row.confidence as number,
      actionable: (row.actionable as number) === 1,
    }));
  }

  /** Generate an improvement plan based on insights. */
  getImprovementPlan(): ImprovementSuggestion[] {
    const insights = this.getInsights(undefined, 50);
    const suggestions: ImprovementSuggestion[] = [];

    for (const insight of insights) {
      if (!insight.actionable) continue;

      let suggestion: ImprovementSuggestion;

      switch (insight.type) {
        case 'quality_issue':
          suggestion = {
            area: 'Quality',
            problem: insight.title,
            suggestion: `Improve the algorithm or data behind this operation. ${insight.description}`,
            evidence: insight.evidence,
            priority: insight.confidence * 0.9,
            estimated_impact: 'medium',
          };
          break;
        case 'optimization_opportunity':
          suggestion = {
            area: 'Performance',
            problem: insight.title,
            suggestion: `Optimize this operation to reduce latency. ${insight.description}`,
            evidence: insight.evidence,
            priority: insight.confidence * 0.7,
            estimated_impact: 'low',
          };
          break;
        case 'usage_pattern':
          suggestion = {
            area: 'UX',
            problem: insight.title,
            suggestion: `Investigate why certain tools are underused. ${insight.description}`,
            evidence: insight.evidence,
            priority: insight.confidence * 0.5,
            estimated_impact: 'medium',
          };
          break;
        case 'anomaly':
          suggestion = {
            area: 'Reliability',
            problem: insight.title,
            suggestion: `Investigate this anomaly. ${insight.description}`,
            evidence: insight.evidence,
            priority: insight.confidence * 0.8,
            estimated_impact: 'high',
          };
          break;
        default:
          continue;
      }

      suggestions.push(suggestion);
    }

    return suggestions.sort((a, b) => b.priority - a.priority);
  }

  private createInsight(
    type: InsightType, title: string, description: string,
    evidence: Record<string, unknown>, confidence: number, actionable: boolean,
  ): SelfInsight {
    return {
      timestamp: Date.now(),
      type,
      title,
      description,
      evidence,
      confidence,
      actionable,
    };
  }

  private persistInsight(insight: SelfInsight): void {
    // Avoid duplicates: check if similar insight exists recently (last 24h)
    const existing = this.db.prepare(`
      SELECT id FROM self_insights
      WHERE title = ? AND timestamp > ?
      LIMIT 1
    `).get(insight.title, Date.now() - 86_400_000);

    if (existing) return;

    this.db.prepare(`
      INSERT INTO self_insights (timestamp, type, title, description, evidence, confidence, actionable)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      insight.timestamp,
      insight.type,
      insight.title,
      insight.description,
      JSON.stringify(insight.evidence),
      insight.confidence,
      insight.actionable ? 1 : 0,
    );
  }
}
