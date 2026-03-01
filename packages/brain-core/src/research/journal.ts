import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export type JournalEntryType = 'discovery' | 'experiment' | 'anomaly' | 'adaptation' | 'insight' | 'reflection' | 'milestone';
export type Significance = 'routine' | 'notable' | 'breakthrough' | 'paradigm_shift';

export interface JournalEntry {
  id?: number;
  timestamp: number;
  type: JournalEntryType;
  title: string;
  content: string;
  tags: string[];
  references: string[];    // IDs of related entries
  significance: Significance;
  data: Record<string, unknown>;
  created_at?: string;
}

export interface JournalSummary {
  total_entries: number;
  by_type: Record<string, number>;
  by_significance: Record<string, number>;
  recent_highlights: JournalEntry[];
  date_range: { first: string; last: string } | null;
}

export interface JournalConfig {
  brainName: string;
  /** Auto-reflect every N cycles. Default: 10 */
  reflectionInterval?: number;
  /** Maximum journal entries before cleanup. Default: 10000 */
  maxEntries?: number;
}

// ── Migration ───────────────────────────────────────────

export function runJournalMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      ref_ids TEXT NOT NULL DEFAULT '[]',
      significance TEXT NOT NULL DEFAULT 'routine',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_journal_type ON research_journal(type);
    CREATE INDEX IF NOT EXISTS idx_journal_ts ON research_journal(timestamp);
    CREATE INDEX IF NOT EXISTS idx_journal_sig ON research_journal(significance);

    CREATE VIRTUAL TABLE IF NOT EXISTS journal_fts USING fts5(
      title, content, tags,
      content='research_journal',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS journal_ai AFTER INSERT ON research_journal BEGIN
      INSERT INTO journal_fts(rowid, title, content, tags)
      VALUES (new.id, new.title, new.content, new.tags);
    END;
    CREATE TRIGGER IF NOT EXISTS journal_ad AFTER DELETE ON research_journal BEGIN
      INSERT INTO journal_fts(journal_fts, rowid, title, content, tags)
      VALUES ('delete', old.id, old.title, old.content, old.tags);
    END;
  `);
}

// ── Engine ──────────────────────────────────────────────

export class ResearchJournal {
  private db: Database.Database;
  private config: Required<JournalConfig>;
  private cyclesSinceReflection = 0;
  private log = getLogger();

  constructor(db: Database.Database, config: JournalConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      reflectionInterval: config.reflectionInterval ?? 10,
      maxEntries: config.maxEntries ?? 10_000,
    };
    runJournalMigration(db);
  }

  /** Write a journal entry. */
  write(entry: Omit<JournalEntry, 'id' | 'timestamp' | 'created_at'>): JournalEntry {
    const timestamp = Date.now();
    const result = this.db.prepare(`
      INSERT INTO research_journal (timestamp, type, title, content, tags, ref_ids, significance, data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      timestamp,
      entry.type,
      entry.title,
      entry.content,
      JSON.stringify(entry.tags),
      JSON.stringify(entry.references),
      entry.significance,
      JSON.stringify(entry.data),
    );

    this.cleanup();

    return { ...entry, id: Number(result.lastInsertRowid), timestamp };
  }

  /** Record a discovery in the journal. */
  recordDiscovery(title: string, description: string, data: Record<string, unknown>, significance: Significance = 'notable'): JournalEntry {
    return this.write({
      type: 'discovery',
      title,
      content: description,
      tags: ['discovery', this.config.brainName],
      references: [],
      significance,
      data,
    });
  }

  /** Record an experiment result. */
  recordExperiment(name: string, result: string, data: Record<string, unknown>, significant: boolean): JournalEntry {
    return this.write({
      type: 'experiment',
      title: `Experiment: ${name}`,
      content: result,
      tags: ['experiment', significant ? 'significant' : 'not_significant'],
      references: [],
      significance: significant ? 'notable' : 'routine',
      data,
    });
  }

  /** Record an anomaly. */
  recordAnomaly(title: string, description: string, severity: string, data: Record<string, unknown>): JournalEntry {
    const sig: Significance = severity === 'critical' ? 'breakthrough' :
      severity === 'high' ? 'notable' : 'routine';

    return this.write({
      type: 'anomaly',
      title,
      content: description,
      tags: ['anomaly', severity],
      references: [],
      significance: sig,
      data,
    });
  }

  /** Record a strategy adaptation. */
  recordAdaptation(parameter: string, oldValue: number, newValue: number, reason: string): JournalEntry {
    return this.write({
      type: 'adaptation',
      title: `Adapted ${parameter}: ${oldValue.toFixed(3)} → ${newValue.toFixed(3)}`,
      content: reason,
      tags: ['adaptation', parameter],
      references: [],
      significance: 'routine',
      data: { parameter, old_value: oldValue, new_value: newValue },
    });
  }

  /** Generate automatic reflection based on recent entries. */
  reflect(): JournalEntry | null {
    this.cyclesSinceReflection++;
    if (this.cyclesSinceReflection < this.config.reflectionInterval) return null;
    this.cyclesSinceReflection = 0;

    // Get recent entries since last reflection
    const lastReflection = this.db.prepare(`
      SELECT timestamp FROM research_journal WHERE type = 'reflection'
      ORDER BY timestamp DESC LIMIT 1
    `).get() as { timestamp: number } | undefined;

    const since = lastReflection?.timestamp ?? 0;
    const entries = this.db.prepare(`
      SELECT type, significance, title FROM research_journal
      WHERE timestamp > ? AND type != 'reflection'
      ORDER BY timestamp DESC
    `).all(since) as Array<{ type: string; significance: string; title: string }>;

    if (entries.length === 0) return null;

    const byType = new Map<string, number>();
    const bySignificance = new Map<string, number>();
    const highlights: string[] = [];

    for (const e of entries) {
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
      bySignificance.set(e.significance, (bySignificance.get(e.significance) ?? 0) + 1);
      if (e.significance !== 'routine') highlights.push(e.title);
    }

    const typeStr = [...byType.entries()].map(([k, v]) => `${v} ${k}(s)`).join(', ');
    const content = [
      `Reflection on ${entries.length} entries since last review:`,
      `Types: ${typeStr}`,
      '',
    ];

    if (highlights.length > 0) {
      content.push('Key highlights:');
      for (const h of highlights.slice(0, 5)) content.push(`  - ${h}`);
      content.push('');
    }

    const confirmed = entries.filter(e => e.type === 'experiment' || e.type === 'discovery').length;
    const anomalies = entries.filter(e => e.type === 'anomaly').length;

    if (confirmed > 0) content.push(`${confirmed} discoveries/experiments completed.`);
    if (anomalies > 0) content.push(`${anomalies} anomalies detected.`);

    return this.write({
      type: 'reflection',
      title: `Reflection: ${entries.length} events reviewed`,
      content: content.join('\n'),
      tags: ['reflection', 'auto'],
      references: [],
      significance: highlights.length >= 3 ? 'notable' : 'routine',
      data: { entries_count: entries.length, by_type: Object.fromEntries(byType), highlights },
    });
  }

  /** Get journal entries, optionally filtered. */
  getEntries(type?: JournalEntryType, limit = 20): JournalEntry[] {
    let sql = `SELECT * FROM research_journal`;
    const params: unknown[] = [];
    if (type) {
      sql += ` WHERE type = ?`;
      params.push(type);
    }
    sql += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(limit);

    return (this.db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map(r => this.rowToEntry(r));
  }

  /** Get summary of journal contents. */
  getSummary(limit = 5): JournalSummary {
    const total = (this.db.prepare(`SELECT COUNT(*) as c FROM research_journal`).get() as { c: number }).c;

    const byType = Object.fromEntries(
      (this.db.prepare(`SELECT type, COUNT(*) as c FROM research_journal GROUP BY type`).all() as Array<{ type: string; c: number }>)
        .map(r => [r.type, r.c]),
    );

    const bySignificance = Object.fromEntries(
      (this.db.prepare(`SELECT significance, COUNT(*) as c FROM research_journal GROUP BY significance`).all() as Array<{ significance: string; c: number }>)
        .map(r => [r.significance, r.c]),
    );

    const highlights = (this.db.prepare(`
      SELECT * FROM research_journal
      WHERE significance IN ('notable', 'breakthrough', 'paradigm_shift')
      ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>).map(r => this.rowToEntry(r));

    const dateRange = this.db.prepare(`
      SELECT MIN(created_at) as first, MAX(created_at) as last FROM research_journal
    `).get() as { first: string | null; last: string | null };

    return {
      total_entries: total,
      by_type: byType,
      by_significance: bySignificance,
      recent_highlights: highlights,
      date_range: dateRange.first ? { first: dateRange.first, last: dateRange.last! } : null,
    };
  }

  /** Get only milestones and breakthroughs. */
  getMilestones(limit = 10): JournalEntry[] {
    return (this.db.prepare(`
      SELECT * FROM research_journal
      WHERE significance IN ('breakthrough', 'paradigm_shift') OR type = 'milestone'
      ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>).map(r => this.rowToEntry(r));
  }

  /** Full-text search across journal entries. */
  search(query: string, limit = 20): JournalEntry[] {
    try {
      const ids = this.db.prepare(`
        SELECT rowid FROM journal_fts WHERE journal_fts MATCH ? LIMIT ?
      `).all(query, limit) as Array<{ rowid: number }>;

      if (ids.length === 0) return [];

      const placeholders = ids.map(() => '?').join(',');
      return (this.db.prepare(`
        SELECT * FROM research_journal WHERE id IN (${placeholders})
        ORDER BY timestamp DESC
      `).all(...ids.map(i => i.rowid)) as Array<Record<string, unknown>>).map(r => this.rowToEntry(r));
    } catch {
      // FTS might fail on invalid query — fallback to LIKE
      return (this.db.prepare(`
        SELECT * FROM research_journal
        WHERE title LIKE ? OR content LIKE ?
        ORDER BY timestamp DESC LIMIT ?
      `).all(`%${query}%`, `%${query}%`, limit) as Array<Record<string, unknown>>).map(r => this.rowToEntry(r));
    }
  }

  private cleanup(): void {
    const count = (this.db.prepare(`SELECT COUNT(*) as c FROM research_journal`).get() as { c: number }).c;
    if (count > this.config.maxEntries) {
      // Keep significant entries, delete old routine ones
      this.db.prepare(`
        DELETE FROM research_journal WHERE id IN (
          SELECT id FROM research_journal
          WHERE significance = 'routine'
          ORDER BY timestamp ASC LIMIT ?
        )
      `).run(count - this.config.maxEntries);
    }
  }

  private rowToEntry(row: Record<string, unknown>): JournalEntry {
    return {
      id: row.id as number,
      timestamp: row.timestamp as number,
      type: row.type as JournalEntryType,
      title: row.title as string,
      content: row.content as string,
      tags: JSON.parse((row.tags as string) || '[]'),
      references: JSON.parse((row.ref_ids as string) || '[]'),
      significance: row.significance as Significance,
      data: JSON.parse((row.data as string) || '{}'),
      created_at: row.created_at as string,
    };
  }
}
