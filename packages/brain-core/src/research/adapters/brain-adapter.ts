import type Database from 'better-sqlite3';
import type { DataMinerAdapter, MinedObservation, MinedCausalEvent, MinedMetric, MinedHypothesisObservation, MinedCrossDomainEvent } from '../data-miner.js';

/**
 * DataMiner adapter for the main Brain.
 * Mines: errors, solutions, code_modules, synapses, insights, git_commits, decisions.
 */
export class BrainDataMinerAdapter implements DataMinerAdapter {
  readonly name = 'brain';

  mineObservations(db: Database.Database, since: number): MinedObservation[] {
    const observations: MinedObservation[] = [];

    // Error type distribution
    const errors = safeAll<{ type: string; cnt: number; resolved: number }>(
      db,
      `SELECT type, COUNT(*) as cnt, SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved
       FROM errors WHERE last_seen > ? GROUP BY type`,
      [isoFromTs(since)],
    );
    for (const e of errors) {
      observations.push({
        category: 'resolution_rate',
        event_type: 'error:type_stats',
        metrics: { type: e.type, count: e.cnt, resolved: e.resolved, resolution_rate: e.cnt > 0 ? e.resolved / e.cnt : 0 },
      });
    }

    // Solution success rates
    const solutions = safeAll<{ id: number; description: string; success_count: number; fail_count: number }>(
      db,
      `SELECT id, description, success_count, fail_count FROM solutions WHERE updated_at > ?`,
      [isoFromTs(since)],
    );
    for (const s of solutions) {
      const total = s.success_count + s.fail_count;
      observations.push({
        category: 'resolution_rate',
        event_type: 'solution:effectiveness',
        metrics: { solution_id: s.id, success_count: s.success_count, fail_count: s.fail_count, success_rate: total > 0 ? s.success_count / total : 0 },
      });
    }

    // Code module complexity
    const modules = safeAll<{ id: number; file_path: string; complexity: number; lines: number }>(
      db,
      `SELECT id, file_path, complexity, lines FROM code_modules WHERE updated_at > ?`,
      [isoFromTs(since)],
    );
    for (const m of modules) {
      observations.push({
        category: 'tool_usage',
        event_type: 'module:complexity',
        metrics: { module_id: m.id, file_path: m.file_path, complexity: m.complexity ?? 0, lines: m.lines ?? 0 },
      });
    }

    // Synapse network stats
    const synapseStats = safeAll<{ relationship: string; cnt: number; avg_weight: number }>(
      db,
      `SELECT relationship, COUNT(*) as cnt, AVG(weight) as avg_weight
       FROM synapses WHERE updated_at > ? GROUP BY relationship`,
      [isoFromTs(since)],
    );
    for (const s of synapseStats) {
      observations.push({
        category: 'tool_usage',
        event_type: 'synapse:network_stats',
        metrics: { relationship: s.relationship, count: s.cnt, avg_weight: s.avg_weight },
      });
    }

    // Insight quality
    const insights = safeAll<{ id: number; type: string; confidence: number }>(
      db,
      `SELECT id, type, confidence FROM insights WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    for (const i of insights) {
      observations.push({
        category: 'query_quality',
        event_type: 'insight:quality',
        metrics: { insight_id: i.id, type: i.type, confidence: i.confidence ?? 0 },
      });
    }

    return observations;
  }

  mineCausalEvents(db: Database.Database, since: number): MinedCausalEvent[] {
    const events: MinedCausalEvent[] = [];

    // Errors as causal events
    const errors = safeAll<{ id: number; type: string; fingerprint: string; resolved: number; project_id: number }>(
      db,
      `SELECT id, type, fingerprint, resolved, project_id FROM errors WHERE last_seen > ?`,
      [isoFromTs(since)],
    );
    for (const e of errors) {
      events.push({ source: 'brain', type: 'error:occurred', data: { errorId: e.id, errorType: e.type, fingerprint: e.fingerprint, resolved: e.resolved === 1, projectId: e.project_id } });
    }

    // Decisions as causal events
    const decisions = safeAll<{ id: number; title: string; outcome: string; project_id: number }>(
      db,
      `SELECT id, title, outcome, project_id FROM decisions WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    for (const d of decisions) {
      events.push({ source: 'brain', type: 'decision:made', data: { decisionId: d.id, title: d.title, outcome: d.outcome, projectId: d.project_id } });
    }

    // Git commits as causal events
    const commits = safeAll<{ id: number; hash: string; project_id: number; files_changed: number }>(
      db,
      `SELECT id, hash, project_id, files_changed FROM git_commits WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    for (const c of commits) {
      events.push({ source: 'brain', type: 'commit:pushed', data: { commitId: c.id, hash: c.hash, projectId: c.project_id, filesChanged: c.files_changed ?? 0 } });
    }

    return events;
  }

  mineMetrics(db: Database.Database, since: number): MinedMetric[] {
    const metrics: MinedMetric[] = [];

    // Error counts by type
    const errorCounts = safeAll<{ type: string; cnt: number }>(
      db,
      `SELECT type, COUNT(*) as cnt FROM errors WHERE last_seen > ? GROUP BY type`,
      [isoFromTs(since)],
    );
    for (const e of errorCounts) {
      metrics.push({ name: `error_count:${e.type}`, value: e.cnt });
    }

    // Overall resolution rate
    const resolution = safeGet<{ total: number; resolved: number }>(
      db,
      `SELECT COUNT(*) as total, SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved FROM errors WHERE last_seen > ?`,
      [isoFromTs(since)],
    );
    if (resolution && resolution.total > 0) {
      metrics.push({ name: 'resolution_rate', value: resolution.resolved / resolution.total });
    }

    // Average module complexity
    const complexity = safeGet<{ avg_complexity: number }>(
      db,
      `SELECT AVG(complexity) as avg_complexity FROM code_modules WHERE complexity IS NOT NULL AND updated_at > ?`,
      [isoFromTs(since)],
    );
    if (complexity?.avg_complexity != null) {
      metrics.push({ name: 'avg_module_complexity', value: complexity.avg_complexity });
    }

    // Synapse count
    const synapseCount = safeGet<{ cnt: number }>(
      db,
      `SELECT COUNT(*) as cnt FROM synapses WHERE updated_at > ?`,
      [isoFromTs(since)],
    );
    if (synapseCount) {
      metrics.push({ name: 'synapse_count', value: synapseCount.cnt });
    }

    // Insight count
    const insightCount = safeGet<{ cnt: number }>(
      db,
      `SELECT COUNT(*) as cnt FROM insights WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (insightCount) {
      metrics.push({ name: 'insight_count', value: insightCount.cnt });
    }

    return metrics;
  }

  mineHypothesisObservations(db: Database.Database, since: number): MinedHypothesisObservation[] {
    const observations: MinedHypothesisObservation[] = [];

    // Errors as hypothesis observations
    const errors = safeAll<{ type: string; cnt: number }>(
      db,
      `SELECT type, COUNT(*) as cnt FROM errors WHERE last_seen > ? GROUP BY type`,
      [isoFromTs(since)],
    );
    for (const e of errors) {
      observations.push({ source: 'brain', type: 'error:reported', value: e.cnt, metadata: { errorType: e.type } });
    }

    // Solution applications
    const solutions = safeAll<{ success: number; cnt: number }>(
      db,
      `SELECT success, COUNT(*) as cnt FROM error_solutions WHERE applied_at > ? GROUP BY success`,
      [isoFromTs(since)],
    );
    for (const s of solutions) {
      observations.push({ source: 'brain', type: s.success ? 'solution:success' : 'solution:failure', value: s.cnt });
    }

    // Insights by type
    const insights = safeAll<{ type: string; cnt: number }>(
      db,
      `SELECT type, COUNT(*) as cnt FROM insights WHERE created_at > ? GROUP BY type`,
      [isoFromTs(since)],
    );
    for (const i of insights) {
      observations.push({ source: 'brain', type: 'insight:created', value: i.cnt, metadata: { insightType: i.type } });
    }

    return observations;
  }

  mineCrossDomainEvents(db: Database.Database, since: number): MinedCrossDomainEvent[] {
    const events: MinedCrossDomainEvent[] = [];

    // Errors → cross-domain signal for error frequency
    const errorCount = safeGet<{ cnt: number }>(
      db,
      `SELECT COUNT(*) as cnt FROM errors WHERE last_seen > ?`,
      [isoFromTs(since)],
    );
    if (errorCount && errorCount.cnt > 0) {
      events.push({ brain: 'brain', eventType: 'error:batch', data: { count: errorCount.cnt } });
    }

    // Insights → cross-domain signal
    const insightCount = safeGet<{ cnt: number }>(
      db,
      `SELECT COUNT(*) as cnt FROM insights WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (insightCount && insightCount.cnt > 0) {
      events.push({ brain: 'brain', eventType: 'insight:batch', data: { count: insightCount.cnt } });
    }

    return events;
  }
}

// ── Helpers ─────────────────────────────────────────────

function isoFromTs(ts: number): string {
  return ts > 0 ? new Date(ts).toISOString() : '1970-01-01T00:00:00.000Z';
}

function safeAll<T>(db: Database.Database, sql: string, params: unknown[]): T[] {
  try {
    return db.prepare(sql).all(...params) as T[];
  } catch {
    return [];
  }
}

function safeGet<T>(db: Database.Database, sql: string, params: unknown[]): T | undefined {
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } catch {
    return undefined;
  }
}
