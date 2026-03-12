/**
 * RetentionPolicyEngine — intelligent DB cleanup with protection rules.
 * Targets: rag_vectors (cache TTL), conversation_memories (value-based),
 * compressed_clusters (age TTL), insights (lifecycle supplement).
 *
 * Every method supports dry-run (count only) or live (actual DELETE).
 */
import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Config ──────────────────────────────────────────────────

export interface RetentionConfig {
  /** rag_vectors TTL in days. Default: 30 */
  ragVectorTTLDays: number;
  /** Minimum importance for vector protection. Default: 6 */
  ragVectorProtectionImportance: number;
  /** conversation_memories: days without access + low importance. Default: 90 */
  memoryTTLDays: number;
  /** Minimum importance for memory protection. Default: 4 */
  memoryProtectionImportance: number;
  /** compressed_clusters TTL. Default: 60 */
  clusterTTLDays: number;
  /** insights: archived insights TTL. Default: 120 */
  insightTTLDays: number;
  /** Max rows per batch (safety). Default: 10000 */
  batchLimit: number;
}

const DEFAULT_CONFIG: RetentionConfig = {
  ragVectorTTLDays: 30,
  ragVectorProtectionImportance: 6,
  memoryTTLDays: 90,
  memoryProtectionImportance: 4,
  clusterTTLDays: 60,
  insightTTLDays: 120,
  batchLimit: 10_000,
};

// ── Report Types ────────────────────────────────────────────

export interface TableReport {
  before: number;
  affected: number;
  protected: number;
  estimatedMB: number;
}

export interface ProtectionSummary {
  byImportance: number;
  byUseCount: number;
  byReferences: number;
  byConsolidation: number;
}

export interface RetentionReport {
  dryRun: boolean;
  timestamp: string;
  tables: {
    rag_vectors: TableReport;
    conversation_memories: TableReport;
    compressed_clusters: TableReport;
    insights: TableReport;
  };
  totalRowsAffected: number;
  estimatedSpaceMB: number;
  protectedRows: ProtectionSummary;
  durationMs: number;
}

export interface TableSizeInfo {
  table: string;
  rowCount: number;
  estimatedMB: number;
}

export interface RetentionStatus {
  totalRuns: number;
  lastReport: RetentionReport | null;
  config: RetentionConfig;
}

// ── Engine ──────────────────────────────────────────────────

export class RetentionPolicyEngine {
  private readonly db: Database.Database;
  private readonly config: RetentionConfig;
  private readonly log = getLogger();
  private lastReport: RetentionReport | null = null;
  private totalRuns = 0;

  constructor(db: Database.Database, config?: Partial<RetentionConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Main Entry ────────────────────────────────────────────

  run(dryRun = true): RetentionReport {
    const start = Date.now();
    const protectedRows: ProtectionSummary = { byImportance: 0, byUseCount: 0, byReferences: 0, byConsolidation: 0 };

    const ragReport = this.cleanRagVectors(dryRun, protectedRows);
    const memReport = this.cleanMemories(dryRun, protectedRows);
    const clusterReport = this.cleanClusters(dryRun);
    const insightReport = this.cleanInsights(dryRun);

    const report: RetentionReport = {
      dryRun,
      timestamp: new Date().toISOString(),
      tables: {
        rag_vectors: ragReport,
        conversation_memories: memReport,
        compressed_clusters: clusterReport,
        insights: insightReport,
      },
      totalRowsAffected: ragReport.affected + memReport.affected + clusterReport.affected + insightReport.affected,
      estimatedSpaceMB: +(ragReport.estimatedMB + memReport.estimatedMB + clusterReport.estimatedMB + insightReport.estimatedMB).toFixed(2),
      protectedRows,
      durationMs: Date.now() - start,
    };

    this.lastReport = report;
    this.totalRuns++;

    const mode = dryRun ? 'DRY-RUN' : 'LIVE';
    this.log.info(`[retention] ${mode}: ${report.totalRowsAffected} rows affected (~${report.estimatedSpaceMB} MB), ${report.durationMs}ms`);

    return report;
  }

  // ── rag_vectors ───────────────────────────────────────────

  cleanRagVectors(dryRun: boolean, protectedRows?: ProtectionSummary): TableReport {
    const cfg = this.config;
    const before = this.countRows('rag_vectors');

    // Protected: vectors linked to important/active/used memories
    // We need to check if conversation_memories table exists and has the right columns
    let protectedCount = 0;
    try {
      // Count vectors whose linked memory is protected (importance >= threshold OR use_count > 0 OR active+not-archive)
      const protectedRow = this.db.prepare(`
        SELECT COUNT(DISTINCT rv.id) as cnt FROM rag_vectors rv
        INNER JOIN conversation_memories cm ON rv.source_id = cm.id AND rv.collection = 'conversation_memories'
        WHERE rv.created_at < datetime('now', ?)
          AND (cm.importance >= ? OR cm.use_count > 0 OR (cm.active = 1 AND cm.archive_candidate = 0))
      `).get(`-${cfg.ragVectorTTLDays} days`, cfg.ragVectorProtectionImportance) as { cnt: number } | undefined;
      protectedCount = protectedRow?.cnt ?? 0;

      if (protectedRows) {
        // Break down protection reasons
        const byImp = this.db.prepare(`
          SELECT COUNT(DISTINCT rv.id) as cnt FROM rag_vectors rv
          INNER JOIN conversation_memories cm ON rv.source_id = cm.id AND rv.collection = 'conversation_memories'
          WHERE rv.created_at < datetime('now', ?) AND cm.importance >= ?
        `).get(`-${cfg.ragVectorTTLDays} days`, cfg.ragVectorProtectionImportance) as { cnt: number } | undefined;
        protectedRows.byImportance += byImp?.cnt ?? 0;

        const byUse = this.db.prepare(`
          SELECT COUNT(DISTINCT rv.id) as cnt FROM rag_vectors rv
          INNER JOIN conversation_memories cm ON rv.source_id = cm.id AND rv.collection = 'conversation_memories'
          WHERE rv.created_at < datetime('now', ?) AND cm.use_count > 0
        `).get(`-${cfg.ragVectorTTLDays} days`) as { cnt: number } | undefined;
        protectedRows.byUseCount += byUse?.cnt ?? 0;
      }
    } catch {
      // conversation_memories table may not exist — skip protection checks
    }

    // Deletable: old vectors NOT linked to important memories
    // Strategy: delete old vectors where linked memory is deleted/inactive/low-importance+unused
    let affected = 0;
    try {
      if (dryRun) {
        const row = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM rag_vectors rv
          WHERE rv.created_at < datetime('now', ?)
            AND NOT EXISTS (
              SELECT 1 FROM conversation_memories cm
              WHERE cm.id = rv.source_id AND rv.collection = 'conversation_memories'
                AND (cm.importance >= ? OR cm.use_count > 0 OR (cm.active = 1 AND cm.archive_candidate = 0))
            )
          LIMIT ?
        `).get(`-${cfg.ragVectorTTLDays} days`, cfg.ragVectorProtectionImportance, cfg.batchLimit) as { cnt: number };
        // The LIMIT in subquery doesn't work for COUNT, use a different approach
        const countRow = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM (
            SELECT rv.id FROM rag_vectors rv
            WHERE rv.created_at < datetime('now', ?)
              AND NOT EXISTS (
                SELECT 1 FROM conversation_memories cm
                WHERE cm.id = rv.source_id AND rv.collection = 'conversation_memories'
                  AND (cm.importance >= ? OR cm.use_count > 0 OR (cm.active = 1 AND cm.archive_candidate = 0))
              )
            LIMIT ?
          )
        `).get(`-${cfg.ragVectorTTLDays} days`, cfg.ragVectorProtectionImportance, cfg.batchLimit) as { cnt: number };
        affected = countRow.cnt;
      } else {
        const result = this.db.prepare(`
          DELETE FROM rag_vectors WHERE id IN (
            SELECT rv.id FROM rag_vectors rv
            WHERE rv.created_at < datetime('now', ?)
              AND NOT EXISTS (
                SELECT 1 FROM conversation_memories cm
                WHERE cm.id = rv.source_id AND rv.collection = 'conversation_memories'
                  AND (cm.importance >= ? OR cm.use_count > 0 OR (cm.active = 1 AND cm.archive_candidate = 0))
              )
            LIMIT ?
          )
        `).run(`-${cfg.ragVectorTTLDays} days`, cfg.ragVectorProtectionImportance, cfg.batchLimit);
        affected = Number(result.changes);
      }
    } catch (err) {
      this.log.debug(`[retention] rag_vectors cleanup skipped: ${(err as Error).message}`);
    }

    // Estimate ~10KB per vector (embedding blob + metadata)
    return { before, affected, protected: protectedCount, estimatedMB: +(affected * 10 / 1024).toFixed(2) };
  }

  // ── conversation_memories ─────────────────────────────────

  cleanMemories(dryRun: boolean, protectedRows?: ProtectionSummary): TableReport {
    const cfg = this.config;
    const before = this.countRows('conversation_memories');

    // Count protected rows (meeting any protection criterion but past TTL)
    let protectedCount = 0;
    try {
      const protectedRow = this.db.prepare(`
        SELECT COUNT(*) as cnt FROM conversation_memories
        WHERE archive_candidate = 1
          AND created_at < datetime('now', ?)
          AND (importance >= ? OR use_count > 0 OR source = 'inferred'
               OR (access_count > 0 AND last_accessed_at > datetime('now', '-30 days')))
      `).get(`-${cfg.memoryTTLDays} days`, cfg.memoryProtectionImportance) as { cnt: number };
      protectedCount = protectedRow.cnt;

      if (protectedRows) {
        const byImp = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM conversation_memories
          WHERE archive_candidate = 1 AND created_at < datetime('now', ?) AND importance >= ?
        `).get(`-${cfg.memoryTTLDays} days`, cfg.memoryProtectionImportance) as { cnt: number };
        protectedRows.byImportance += byImp.cnt;

        const byUse = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM conversation_memories
          WHERE archive_candidate = 1 AND created_at < datetime('now', ?) AND use_count > 0
        `).get(`-${cfg.memoryTTLDays} days`) as { cnt: number };
        protectedRows.byUseCount += byUse.cnt;

        const byRef = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM conversation_memories
          WHERE archive_candidate = 1 AND created_at < datetime('now', ?)
            AND access_count > 0 AND last_accessed_at > datetime('now', '-30 days')
        `).get(`-${cfg.memoryTTLDays} days`) as { cnt: number };
        protectedRows.byReferences += byRef.cnt;

        const byCons = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM conversation_memories
          WHERE archive_candidate = 1 AND created_at < datetime('now', ?) AND source = 'inferred'
        `).get(`-${cfg.memoryTTLDays} days`) as { cnt: number };
        protectedRows.byConsolidation += byCons.cnt;
      }
    } catch {
      // table may not exist
    }

    // Deletable: archive_candidate=1, past TTL, no protection criteria met
    let affected = 0;
    try {
      if (dryRun) {
        const row = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM (
            SELECT id FROM conversation_memories
            WHERE archive_candidate = 1
              AND created_at < datetime('now', ?)
              AND importance < ?
              AND use_count = 0
              AND source != 'inferred'
              AND NOT (access_count > 0 AND last_accessed_at > datetime('now', '-30 days'))
            LIMIT ?
          )
        `).get(`-${cfg.memoryTTLDays} days`, cfg.memoryProtectionImportance, cfg.batchLimit) as { cnt: number };
        affected = row.cnt;
      } else {
        const result = this.db.prepare(`
          DELETE FROM conversation_memories WHERE id IN (
            SELECT id FROM conversation_memories
            WHERE archive_candidate = 1
              AND created_at < datetime('now', ?)
              AND importance < ?
              AND use_count = 0
              AND source != 'inferred'
              AND NOT (access_count > 0 AND last_accessed_at > datetime('now', '-30 days'))
            LIMIT ?
          )
        `).run(`-${cfg.memoryTTLDays} days`, cfg.memoryProtectionImportance, cfg.batchLimit);
        affected = Number(result.changes);
      }
    } catch (err) {
      this.log.debug(`[retention] conversation_memories cleanup skipped: ${(err as Error).message}`);
    }

    // Estimate ~3KB per memory row (content + tags + metadata)
    return { before, affected, protected: protectedCount, estimatedMB: +(affected * 3 / 1024).toFixed(2) };
  }

  // ── compressed_clusters ───────────────────────────────────

  cleanClusters(dryRun: boolean): TableReport {
    const cfg = this.config;
    const before = this.countRows('compressed_clusters');

    let affected = 0;
    try {
      if (dryRun) {
        const row = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM (
            SELECT id FROM compressed_clusters
            WHERE created_at < datetime('now', ?)
            LIMIT ?
          )
        `).get(`-${cfg.clusterTTLDays} days`, cfg.batchLimit) as { cnt: number };
        affected = row.cnt;
      } else {
        const result = this.db.prepare(`
          DELETE FROM compressed_clusters WHERE id IN (
            SELECT id FROM compressed_clusters
            WHERE created_at < datetime('now', ?)
            LIMIT ?
          )
        `).run(`-${cfg.clusterTTLDays} days`, cfg.batchLimit);
        affected = Number(result.changes);
      }
    } catch (err) {
      this.log.debug(`[retention] compressed_clusters cleanup skipped: ${(err as Error).message}`);
    }

    // Estimate ~2KB per cluster (summary + member_ids JSON)
    return { before, affected, protected: 0, estimatedMB: +(affected * 2 / 1024).toFixed(2) };
  }

  // ── insights (supplement to lifecycle.ts) ─────────────────

  cleanInsights(dryRun: boolean): TableReport {
    const cfg = this.config;
    const before = this.countRows('insights');

    let affected = 0;
    try {
      if (dryRun) {
        const row = this.db.prepare(`
          SELECT COUNT(*) as cnt FROM (
            SELECT id FROM insights
            WHERE lifecycle = 'archived' AND created_at < datetime('now', ?)
            LIMIT ?
          )
        `).get(`-${cfg.insightTTLDays} days`, cfg.batchLimit) as { cnt: number };
        affected = row.cnt;
      } else {
        const result = this.db.prepare(`
          DELETE FROM insights WHERE id IN (
            SELECT id FROM insights
            WHERE lifecycle = 'archived' AND created_at < datetime('now', ?)
            LIMIT ?
          )
        `).run(`-${cfg.insightTTLDays} days`, cfg.batchLimit);
        affected = Number(result.changes);
      }
    } catch (err) {
      this.log.debug(`[retention] insights cleanup skipped: ${(err as Error).message}`);
    }

    // Estimate ~1KB per insight
    return { before, affected, protected: 0, estimatedMB: +(affected * 1 / 1024).toFixed(2) };
  }

  // ── Status & Reports ──────────────────────────────────────

  getStatus(): RetentionStatus {
    return {
      totalRuns: this.totalRuns,
      lastReport: this.lastReport,
      config: { ...this.config },
    };
  }

  getLastReport(): RetentionReport | null {
    return this.lastReport;
  }

  getTableSizes(): TableSizeInfo[] {
    const tables = ['rag_vectors', 'conversation_memories', 'compressed_clusters', 'insights'];
    const sizes: TableSizeInfo[] = [];

    for (const table of tables) {
      const rowCount = this.countRows(table);
      // Estimate per-row sizes
      const kbPerRow = table === 'rag_vectors' ? 10
        : table === 'conversation_memories' ? 3
        : table === 'compressed_clusters' ? 2
        : 1;
      sizes.push({
        table,
        rowCount,
        estimatedMB: +(rowCount * kbPerRow / 1024).toFixed(2),
      });
    }

    return sizes;
  }

  // ── Helpers ───────────────────────────────────────────────

  private countRows(table: string): number {
    try {
      const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number } | undefined;
      return row?.cnt ?? 0;
    } catch {
      return 0;
    }
  }
}
