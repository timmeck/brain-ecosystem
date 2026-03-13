// ── Proactive Engine — Suggestion Generation & Management ────
//
// Analyzes data sources to proactively suggest improvements,
// flag recurring errors, stale knowledge, and quick wins.

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { LLMService } from '../llm/llm-service.js';

// ── Types ───────────────────────────────────────────────

export interface ProactiveEngineConfig {
  brainName: string;
  maxSuggestionsPerHour?: number;
  staleDays?: number;
  recurringThreshold?: number;
}

export interface ProactiveDataSources {
  db: Database.Database;
}

export interface ProactiveSuggestion {
  id?: number;
  type: string;
  title: string;
  description: string | null;
  action: string | null;
  priority: number;
  dismissed: number;
  created_at: string;
}

/** Alias for convenience */
export type Suggestion = ProactiveSuggestion;

export interface ProactiveStatus {
  totalSuggestions: number;
  activeSuggestions: number;
  dismissedCount: number;
  lastAnalysis: string | null;
}

// ── Migration ───────────────────────────────────────────

export function runProactiveMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS proactive_suggestions (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      action TEXT,
      priority REAL DEFAULT 0.5,
      dismissed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_proactive_type ON proactive_suggestions(type);
    CREATE INDEX IF NOT EXISTS idx_proactive_dismissed ON proactive_suggestions(dismissed);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class ProactiveEngine {
  private db: Database.Database;
  private config: Required<ProactiveEngineConfig>;
  private ts: ThoughtStream | null = null;
  private llm: LLMService | null = null;
  private log = getLogger();
  private lastAnalysis: string | null = null;

  // Prepared statements
  private stmtInsert: Database.Statement;
  private stmtGetActive: Database.Statement;
  private stmtGetAll: Database.Statement;
  private stmtDismiss: Database.Statement;
  private stmtTotal: Database.Statement;
  private stmtActiveCount: Database.Statement;
  private stmtDismissedCount: Database.Statement;
  private stmtRecentCount: Database.Statement;
  private stmtCheckDuplicate: Database.Statement;

  constructor(db: Database.Database, config: ProactiveEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxSuggestionsPerHour: config.maxSuggestionsPerHour ?? 3,
      staleDays: config.staleDays ?? 30,
      recurringThreshold: config.recurringThreshold ?? 3,
    };

    runProactiveMigration(db);

    // Prepare all statements
    this.stmtInsert = db.prepare(`
      INSERT INTO proactive_suggestions (type, title, description, action, priority)
      VALUES (?, ?, ?, ?, ?)
    `);

    this.stmtGetActive = db.prepare(`
      SELECT * FROM proactive_suggestions
      WHERE dismissed = 0
      ORDER BY priority DESC
      LIMIT ?
    `);

    this.stmtGetAll = db.prepare(`
      SELECT * FROM proactive_suggestions
      ORDER BY priority DESC
      LIMIT ?
    `);

    this.stmtDismiss = db.prepare(`
      UPDATE proactive_suggestions SET dismissed = 1 WHERE id = ?
    `);

    this.stmtTotal = db.prepare(`
      SELECT COUNT(*) AS total FROM proactive_suggestions
    `);

    this.stmtActiveCount = db.prepare(`
      SELECT COUNT(*) AS active FROM proactive_suggestions WHERE dismissed = 0
    `);

    this.stmtDismissedCount = db.prepare(`
      SELECT COUNT(*) AS dismissed FROM proactive_suggestions WHERE dismissed = 1
    `);

    this.stmtRecentCount = db.prepare(`
      SELECT COUNT(*) AS cnt FROM proactive_suggestions
      WHERE created_at >= datetime('now', '-1 hour')
    `);

    this.stmtCheckDuplicate = db.prepare(`
      SELECT id FROM proactive_suggestions WHERE title = ? AND dismissed = 0 LIMIT 1
    `);

    this.log.info(`[proactive] Engine initialized for ${config.brainName}`);
  }

  /** Set the ThoughtStream for consciousness integration. */
  setThoughtStream(stream: ThoughtStream): void {
    this.ts = stream;
  }

  /** Set the LLMService for enhanced analysis. */
  setLLMService(llm: LLMService): void {
    this.llm = llm;
  }

  /**
   * Analyze data sources and create suggestions based on triggers.
   * Returns number of new suggestions created.
   */
  analyze(dataSources: ProactiveDataSources): number {
    let created = 0;

    try {
      created += this.checkRecurringErrors(dataSources.db);
    } catch (err) {
      this.log.debug(`[proactive] checkRecurringErrors skipped: ${(err as Error).message}`);
    }

    try {
      created += this.checkStaleKnowledge(dataSources.db);
    } catch (err) {
      this.log.debug(`[proactive] checkStaleKnowledge skipped: ${(err as Error).message}`);
    }

    try {
      created += this.checkQuickWins(dataSources.db);
    } catch (err) {
      this.log.debug(`[proactive] checkQuickWins skipped: ${(err as Error).message}`);
    }

    this.lastAnalysis = new Date().toISOString();

    this.ts?.emit(
      'proactive',
      'analyzing',
      `Analysis complete: ${created} new suggestions`,
      created > 0 ? 'notable' : 'routine',
    );

    return created;
  }

  /**
   * Create a suggestion, respecting rate limits and dedup.
   * Returns true if the suggestion was created, false if rate-limited or duplicate.
   */
  createSuggestion(
    type: string,
    title: string,
    description?: string,
    action?: string,
    priority = 0.5,
  ): boolean {
    // Check rate limit
    const recentCount = (this.stmtRecentCount.get() as { cnt: number }).cnt;
    if (recentCount >= this.config.maxSuggestionsPerHour) {
      this.log.debug(`[proactive] Rate limit reached (${recentCount}/${this.config.maxSuggestionsPerHour})`);
      return false;
    }

    // Check dedup — same title not created twice if active
    const existing = this.stmtCheckDuplicate.get(title);
    if (existing) {
      this.log.debug(`[proactive] Duplicate suggestion skipped: ${title}`);
      return false;
    }

    this.stmtInsert.run(type, title, description ?? null, action ?? null, priority);
    return true;
  }

  /**
   * Get suggestions, sorted by priority descending.
   * By default excludes dismissed suggestions.
   */
  getSuggestions(limit = 20, includeDismissed = false): ProactiveSuggestion[] {
    if (includeDismissed) {
      return this.stmtGetAll.all(limit) as ProactiveSuggestion[];
    }
    return this.stmtGetActive.all(limit) as ProactiveSuggestion[];
  }

  /** Dismiss a suggestion by ID. */
  dismiss(id: number): void {
    this.stmtDismiss.run(id);
  }

  /** Get engine status summary. */
  getStatus(): ProactiveStatus {
    const total = (this.stmtTotal.get() as { total: number }).total;
    const active = (this.stmtActiveCount.get() as { active: number }).active;
    const dismissed = (this.stmtDismissedCount.get() as { dismissed: number }).dismissed;

    return {
      totalSuggestions: total,
      activeSuggestions: active,
      dismissedCount: dismissed,
      lastAnalysis: this.lastAnalysis,
    };
  }

  // ── Private Triggers ──────────────────────────────────

  /**
   * Check for recurring errors: same error fingerprint appearing
   * `recurringThreshold` or more times.
   */
  private checkRecurringErrors(sourceDb: Database.Database): number {
    // Check if error_memory table exists (brain-specific)
    const table = sourceDb.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='error_memory'
    `).get() as { name: string } | undefined;

    if (!table) return 0;

    const rows = sourceDb.prepare(`
      SELECT fingerprint, COUNT(*) AS cnt, MAX(message) AS message
      FROM error_memory
      GROUP BY fingerprint
      HAVING cnt >= ?
    `).all(this.config.recurringThreshold) as Array<{
      fingerprint: string;
      cnt: number;
      message: string;
    }>;

    let created = 0;
    for (const row of rows) {
      const ok = this.createSuggestion(
        'recurring_error',
        `Fix recurring error: ${row.fingerprint}`,
        `Error "${row.message}" has occurred ${row.cnt} times. Consider a permanent fix.`,
        `Investigate error fingerprint: ${row.fingerprint}`,
        0.8,
      );
      if (ok) created++;
    }

    return created;
  }

  /**
   * Check for stale knowledge: insights older than staleDays
   * with high priority that haven't been refreshed.
   */
  private checkStaleKnowledge(sourceDb: Database.Database): number {
    // Check if insights table exists
    const table = sourceDb.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='insights'
    `).get() as { name: string } | undefined;

    if (!table) return 0;

    const rows = sourceDb.prepare(`
      SELECT topic, created_at, confidence
      FROM insights
      WHERE created_at < datetime('now', '-' || ? || ' days')
        AND confidence > 0.7
      ORDER BY confidence DESC
      LIMIT 10
    `).all(this.config.staleDays) as Array<{
      topic: string;
      created_at: string;
      confidence: number;
    }>;

    let created = 0;
    for (const row of rows) {
      const ok = this.createSuggestion(
        'stale_knowledge',
        `Review stale insight: ${row.topic}`,
        `High-confidence insight from ${row.created_at} may be outdated. Still relevant?`,
        `Re-research topic: ${row.topic}`,
        0.6,
      );
      if (ok) created++;
    }

    return created;
  }

  /**
   * Check for quick wins: tools with high success rate but low usage count.
   */
  private checkQuickWins(sourceDb: Database.Database): number {
    // Check if tool_usage table exists
    const table = sourceDb.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='tool_usage'
    `).get() as { name: string } | undefined;

    if (!table) return 0;

    // Find tools with high success rate that are underused compared to average.
    // Requires >=10 total uses (not 1-5) to avoid suggesting tools tried once by accident.
    const avgUses = sourceDb.prepare(`
      SELECT AVG(uses) as avg FROM (
        SELECT COUNT(*) as uses FROM tool_usage GROUP BY tool_name HAVING COUNT(*) >= 3
      )
    `).get() as { avg: number | null };
    const threshold = Math.max(10, (avgUses?.avg ?? 10) * 0.2);

    const rows = sourceDb.prepare(`
      SELECT
        tool_name,
        COUNT(*) AS uses,
        CAST(SUM(CASE WHEN outcome = 'success' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) AS success_rate
      FROM tool_usage
      GROUP BY tool_name
      HAVING success_rate >= 0.9 AND uses >= 3 AND uses <= ?
      ORDER BY success_rate DESC, uses DESC
      LIMIT 5
    `).all(threshold) as Array<{
      tool_name: string;
      uses: number;
      success_rate: number;
    }>;

    let created = 0;
    for (const row of rows) {
      const ok = this.createSuggestion(
        'quick_win',
        `Underused high-performer: ${row.tool_name}`,
        `Tool "${row.tool_name}" has ${(row.success_rate * 100).toFixed(0)}% success rate with ${row.uses} uses — well below average. It may be valuable in more contexts.`,
        `Investigate where ${row.tool_name} could replace lower-performing alternatives`,
        0.6,
      );
      if (ok) created++;
    }

    return created;
  }
}
