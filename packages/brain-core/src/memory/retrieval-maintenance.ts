// ── Retrieval Maintenance Engine ──────────────────────────
//
// Offline maintenance for memory retrieval quality.
// Runs periodically (every 2h) to:
//   1. Mark cold memories as archive candidates
//   2. Build pre-computed candidate sets for fast typed retrieval
//
// Design principle (ChatGPT): "Retrieval online einfach halten, Struktur offline pflegen."

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ─────────────────────────────────────────────────

export interface RetrievalMaintenanceConfig {
  /** Days without access until archive_candidate. Default: 30 */
  coldThresholdDays?: number;
  /** Minimum importance for protection from archiving. Default: 4 */
  minImportanceForProtection?: number;
  /** Max memories per candidate set. Default: 50 */
  candidateSetSize?: number;
}

export interface MaintenanceReport {
  archiveCandidatesMarked: number;
  candidateSetsRefreshed: number;
  durationMs: number;
}

export interface CandidateSetReport {
  setsCreated: number;
  totalMemories: number;
}

export interface RetrievalMaintenanceStatus {
  lastRunAt: string | null;
  totalRuns: number;
  totalArchiveCandidates: number;
  candidateSets: number;
}

// ── Intent Definitions ────────────────────────────────────

const INTENT_DEFINITIONS: Record<string, { categories: string[]; minImportance: number }> = {
  decision_lookup: { categories: ['decision'], minImportance: 3 },
  project_context: { categories: ['context', 'fact'], minImportance: 3 },
  user_preference_lookup: { categories: ['preference', 'constraint'], minImportance: 2 },
  open_problem_lookup: { categories: ['open_question', 'goal'], minImportance: 2 },
};

// ── Engine ────────────────────────────────────────────────

export class RetrievalMaintenanceEngine {
  private readonly db: Database.Database;
  private readonly config: Required<RetrievalMaintenanceConfig>;
  private readonly log = getLogger();
  private timer: ReturnType<typeof setInterval> | null = null;
  private totalRuns = 0;
  private lastRunAt: string | null = null;

  constructor(db: Database.Database, config: RetrievalMaintenanceConfig = {}) {
    this.db = db;
    this.config = {
      coldThresholdDays: config.coldThresholdDays ?? 30,
      minImportanceForProtection: config.minImportanceForProtection ?? 4,
      candidateSetSize: config.candidateSetSize ?? 50,
    };
    this.ensureTable();
  }

  /** Start periodic maintenance (default: every 2h). */
  start(intervalMs = 2 * 60 * 60 * 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.runMaintenance();
      } catch (err) {
        this.log.debug(`[retrieval-maintenance] Cycle error: ${(err as Error).message}`);
      }
    }, intervalMs);
    this.log.info(`[retrieval-maintenance] Started (interval: ${Math.round(intervalMs / 3600000)}h)`);
  }

  /** Stop periodic maintenance. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.log.info('[retrieval-maintenance] Stopped');
    }
  }

  /** Main cycle — call periodically (every 2h). */
  runMaintenance(): MaintenanceReport {
    const start = Date.now();

    const archiveCandidatesMarked = this.markArchiveCandidates();
    const candidateReport = this.refreshCandidateSets();

    this.totalRuns++;
    this.lastRunAt = new Date().toISOString();

    const durationMs = Date.now() - start;
    this.log.info(`[retrieval-maintenance] Run #${this.totalRuns}: ${archiveCandidatesMarked} archive candidates, ${candidateReport.setsCreated} sets refreshed (${durationMs}ms)`);

    return {
      archiveCandidatesMarked,
      candidateSetsRefreshed: candidateReport.setsCreated,
      durationMs,
    };
  }

  /**
   * Cold Memory Detection.
   * Mark as archive_candidate = 1 when:
   * - created_at > coldThresholdDays AND
   * - access_count = 0 AND use_count = 0 AND
   * - importance < minImportanceForProtection
   *
   * Safety: No automatic deletion, only marking.
   */
  markArchiveCandidates(): number {
    try {
      // Reset existing candidates that no longer qualify (accessed since last run)
      this.db.prepare(`
        UPDATE conversation_memories SET archive_candidate = 0
        WHERE archive_candidate = 1 AND (access_count > 0 OR use_count > 0 OR importance >= ?)
      `).run(this.config.minImportanceForProtection);

      // Mark new cold memories
      const result = this.db.prepare(`
        UPDATE conversation_memories SET archive_candidate = 1
        WHERE active = 1
          AND archive_candidate = 0
          AND created_at < datetime('now', '-' || ? || ' days')
          AND access_count = 0
          AND use_count = 0
          AND importance < ?
      `).run(this.config.coldThresholdDays, this.config.minImportanceForProtection);

      return result.changes;
    } catch (err) {
      this.log.debug(`[retrieval-maintenance] markArchiveCandidates error: ${(err as Error).message}`);
      return 0;
    }
  }

  /** Refresh pre-computed candidate sets for typed retrieval. */
  refreshCandidateSets(): CandidateSetReport {
    let setsCreated = 0;
    let totalMemories = 0;

    // Per-category sets
    const categories = ['preference', 'decision', 'context', 'fact', 'goal', 'lesson', 'constraint', 'open_question'];
    for (const cat of categories) {
      const count = this.buildCandidateSet('category', cat, [cat]);
      if (count > 0) { setsCreated++; totalMemories += count; }
    }

    // Per-intent sets
    for (const [intent, def] of Object.entries(INTENT_DEFINITIONS)) {
      const count = this.buildCandidateSet('intent', intent, def.categories, def.minImportance);
      if (count > 0) { setsCreated++; totalMemories += count; }
    }

    return { setsCreated, totalMemories };
  }

  /** Get current status. */
  getStatus(): RetrievalMaintenanceStatus {
    let totalArchiveCandidates = 0;
    let candidateSets = 0;

    try {
      const archiveRow = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM conversation_memories WHERE archive_candidate = 1',
      ).get() as { cnt: number } | undefined;
      totalArchiveCandidates = archiveRow?.cnt ?? 0;
    } catch { /* table may not have column yet */ }

    try {
      const setsRow = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM retrieval_candidate_sets',
      ).get() as { cnt: number } | undefined;
      candidateSets = setsRow?.cnt ?? 0;
    } catch { /* table may not exist */ }

    return {
      lastRunAt: this.lastRunAt,
      totalRuns: this.totalRuns,
      totalArchiveCandidates,
      candidateSets,
    };
  }

  /** Get a candidate set by type and key. Returns memory IDs. */
  getCandidateSet(setType: string, setKey: string): number[] {
    try {
      const row = this.db.prepare(
        'SELECT memory_ids FROM retrieval_candidate_sets WHERE set_type = ? AND set_key = ?',
      ).get(setType, setKey) as { memory_ids: string } | undefined;
      if (!row) return [];
      return JSON.parse(row.memory_ids);
    } catch {
      return [];
    }
  }

  // ── Private ─────────────────────────────────────────────

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retrieval_candidate_sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_type TEXT NOT NULL,
        set_key TEXT NOT NULL,
        memory_ids TEXT NOT NULL DEFAULT '[]',
        set_size INTEGER NOT NULL DEFAULT 0,
        refreshed_at TEXT DEFAULT (datetime('now')),
        UNIQUE(set_type, set_key)
      );
    `);
  }

  private buildCandidateSet(setType: string, setKey: string, categories: string[], minImportance = 1): number {
    try {
      const placeholders = categories.map(() => '?').join(',');
      const rows = this.db.prepare(`
        SELECT id FROM conversation_memories
        WHERE active = 1
          AND archive_candidate = 0
          AND category IN (${placeholders})
          AND importance >= ?
        ORDER BY importance DESC, use_count DESC, access_count DESC
        LIMIT ?
      `).all(...categories, minImportance, this.config.candidateSetSize) as Array<{ id: number }>;

      const ids = rows.map(r => r.id);

      this.db.prepare(`
        INSERT INTO retrieval_candidate_sets (set_type, set_key, memory_ids, set_size, refreshed_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(set_type, set_key)
        DO UPDATE SET memory_ids = excluded.memory_ids, set_size = excluded.set_size, refreshed_at = datetime('now')
      `).run(setType, setKey, JSON.stringify(ids), ids.length);

      return ids.length;
    } catch (err) {
      this.log.debug(`[retrieval-maintenance] buildCandidateSet error for ${setType}/${setKey}: ${(err as Error).message}`);
      return 0;
    }
  }
}
