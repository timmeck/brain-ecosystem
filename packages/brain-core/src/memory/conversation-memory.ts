// ── Conversation Memory ─────────────────────────────────────
//
// Langzeitgedächtnis für Claude Code Sessions.
// Alles was besprochen, entschieden, gebaut wird → persistent gespeichert.
// Jederzeit abrufbar per semantischer Suche oder Keyword-Suche.
//
// Speichert:
//   - Entscheidungen (Architektur, Toolwahl, Patterns)
//   - Präferenzen (Workflow, Coding-Style, Konventionen)
//   - Kontext (Was wurde gebaut, warum, wie)
//   - Fakten (API Keys, Ports, Pfade, Versionen)
//   - Ziele (Was soll erreicht werden)
//   - Lektionen (Was hat funktioniert, was nicht)
//
// Integration:
//   - RAG Engine für semantische Suche (Embeddings)
//   - Journal für chronologische Erfassung
//   - KnowledgeGraph für Entitäten-Verknüpfungen

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { MemoryCategory, MemorySource } from './types.js';

// ── Types ─────────────────────────────────────────────────

export interface ConversationMemoryConfig {
  /** Max memories to keep. Default: 50_000 */
  maxMemories?: number;
  /** Days after which unused low-importance memories decay. Default: 90 */
  decayDays?: number;
  /** Default importance for new memories. Default: 5 */
  defaultImportance?: number;
}

export interface Memory {
  id: number;
  sessionId: string | null;
  category: MemoryCategory;
  content: string;
  key: string | null;
  importance: number;
  source: MemorySource;
  tags: string[];
  accessCount: number;
  lastAccessedAt: string | null;
  createdAt: string;
  updatedAt: string;
  active: boolean;
}

export interface RememberOptions {
  category?: MemoryCategory;
  key?: string;
  importance?: number;
  source?: MemorySource;
  tags?: string[];
  sessionId?: string;
}

export interface RecallOptions {
  category?: MemoryCategory;
  limit?: number;
  minImportance?: number;
  activeOnly?: boolean;
  tags?: string[];
}

export interface SessionSummary {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  goals: string[];
  memoriesCreated: number;
}

export interface MemorySearchResult {
  memory: Memory;
  relevance: number;  // 0-1 for semantic, keyword match count for text
}

export interface ConversationMemoryStatus {
  totalMemories: number;
  activeMemories: number;
  totalSessions: number;
  byCategory: Record<string, number>;
  recentMemories: Memory[];
}

// ── Integration interfaces (injected, not imported) ──────

export interface MemoryRAGAdapter {
  index(collection: string, sourceId: number, text: string, metadata?: Record<string, unknown>): Promise<boolean>;
  search(query: string, options?: { collections?: string[]; limit?: number; threshold?: number }): Promise<Array<{ sourceId: number; similarity: number }>>;
  remove(collection: string, sourceId: number): void;
}

export interface MemoryJournalAdapter {
  recordDiscovery(title: string, description: string, data: Record<string, unknown>, significance: string): unknown;
}

export interface MemoryKnowledgeGraphAdapter {
  addFact(subject: string, predicate: string, object: string, context?: string, confidence?: number, sourceType?: string): unknown;
}

// ── Migration ─────────────────────────────────────────────

export function runConversationMemoryMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      category TEXT NOT NULL DEFAULT 'context',
      key TEXT,
      content TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 5,
      source TEXT NOT NULL DEFAULT 'explicit',
      tags TEXT DEFAULT '[]',
      access_count INTEGER NOT NULL DEFAULT 0,
      last_accessed_at TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_conv_mem_category ON conversation_memories(category);
    CREATE INDEX IF NOT EXISTS idx_conv_mem_session ON conversation_memories(session_id);
    CREATE INDEX IF NOT EXISTS idx_conv_mem_key ON conversation_memories(key);
    CREATE INDEX IF NOT EXISTS idx_conv_mem_active ON conversation_memories(active);
    CREATE INDEX IF NOT EXISTS idx_conv_mem_importance ON conversation_memories(importance DESC);
  `);

  // FTS5 for full-text search
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS conversation_memories_fts USING fts5(
      content, tags, key,
      content='conversation_memories',
      content_rowid='id'
    );
  `);

  // Triggers for FTS sync
  try {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS conv_mem_ai AFTER INSERT ON conversation_memories BEGIN
        INSERT INTO conversation_memories_fts(rowid, content, tags, key) VALUES (new.id, new.content, new.tags, new.key);
      END;
      CREATE TRIGGER IF NOT EXISTS conv_mem_ad AFTER DELETE ON conversation_memories BEGIN
        INSERT INTO conversation_memories_fts(conversation_memories_fts, rowid, content, tags, key) VALUES('delete', old.id, old.content, old.tags, old.key);
      END;
      CREATE TRIGGER IF NOT EXISTS conv_mem_au AFTER UPDATE ON conversation_memories BEGIN
        INSERT INTO conversation_memories_fts(conversation_memories_fts, rowid, content, tags, key) VALUES('delete', old.id, old.content, old.tags, old.key);
        INSERT INTO conversation_memories_fts(rowid, content, tags, key) VALUES (new.id, new.content, new.tags, new.key);
      END;
    `);
  } catch {
    // Triggers already exist
  }

  // Sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      summary TEXT,
      goals TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_conv_sess_id ON conversation_sessions(session_id);
  `);

  // Add last_processed_at for transcript state tracking (replaces flat-file)
  try {
    db.exec(`ALTER TABLE conversation_sessions ADD COLUMN last_processed_at TEXT`);
  } catch {
    // Column already exists
  }
}

// ── Engine ────────────────────────────────────────────────

const RAG_COLLECTION = 'conversation_memory';

export class ConversationMemory {
  private readonly db: Database.Database;
  private readonly config: Required<ConversationMemoryConfig>;
  private readonly log = getLogger();
  private rag: MemoryRAGAdapter | null = null;
  private journal: MemoryJournalAdapter | null = null;
  private kg: MemoryKnowledgeGraphAdapter | null = null;
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;

  // Prepared statements
  private readonly stmtInsert;
  private readonly stmtGetById;
  private readonly stmtSearch;
  private readonly stmtFindByKey;
  private readonly stmtFindByCategory;
  private readonly stmtFindActive;
  private readonly stmtFindRecent;
  private readonly stmtUpdate;
  private readonly stmtDeactivate;
  private readonly stmtRecordAccess;
  private readonly stmtCountByCategory;
  private readonly stmtCountActive;
  private readonly stmtCountTotal;
  private readonly stmtCountSessions;
  private readonly stmtSessionInsert;
  private readonly stmtSessionEnd;
  private readonly stmtSessionGet;
  private readonly stmtSessionCountMemories;

  constructor(db: Database.Database, config: ConversationMemoryConfig = {}) {
    this.db = db;
    this.config = {
      maxMemories: config.maxMemories ?? 30_000,
      decayDays: config.decayDays ?? 60,
      defaultImportance: config.defaultImportance ?? 5,
    };

    runConversationMemoryMigration(db);

    this.stmtInsert = db.prepare(`
      INSERT INTO conversation_memories (session_id, category, key, content, importance, source, tags)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetById = db.prepare('SELECT * FROM conversation_memories WHERE id = ?');

    this.stmtSearch = db.prepare(`
      SELECT m.* FROM conversation_memories m
      JOIN conversation_memories_fts f ON m.id = f.rowid
      WHERE conversation_memories_fts MATCH ? AND m.active = 1
      ORDER BY rank
      LIMIT ?
    `);

    this.stmtFindByKey = db.prepare(
      'SELECT * FROM conversation_memories WHERE key = ? AND active = 1 ORDER BY updated_at DESC LIMIT 1',
    );

    this.stmtFindByCategory = db.prepare(
      'SELECT * FROM conversation_memories WHERE category = ? AND active = 1 ORDER BY importance DESC, updated_at DESC LIMIT ?',
    );

    this.stmtFindActive = db.prepare(
      'SELECT * FROM conversation_memories WHERE active = 1 ORDER BY importance DESC, updated_at DESC LIMIT ?',
    );

    this.stmtFindRecent = db.prepare(
      'SELECT * FROM conversation_memories WHERE active = 1 ORDER BY created_at DESC LIMIT ?',
    );

    this.stmtUpdate = db.prepare(`
      UPDATE conversation_memories SET content = ?, importance = ?, tags = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    this.stmtDeactivate = db.prepare(
      "UPDATE conversation_memories SET active = 0, updated_at = datetime('now') WHERE id = ?",
    );

    this.stmtRecordAccess = db.prepare(`
      UPDATE conversation_memories SET access_count = access_count + 1, last_accessed_at = datetime('now')
      WHERE id = ?
    `);

    this.stmtCountByCategory = db.prepare(
      'SELECT category, COUNT(*) as count FROM conversation_memories WHERE active = 1 GROUP BY category',
    );

    this.stmtCountActive = db.prepare(
      'SELECT COUNT(*) as count FROM conversation_memories WHERE active = 1',
    );

    this.stmtCountTotal = db.prepare(
      'SELECT COUNT(*) as count FROM conversation_memories',
    );

    this.stmtCountSessions = db.prepare(
      'SELECT COUNT(*) as count FROM conversation_sessions',
    );

    this.stmtSessionInsert = db.prepare(
      "INSERT INTO conversation_sessions (session_id, goals, metadata) VALUES (?, ?, ?)",
    );

    this.stmtSessionEnd = db.prepare(
      "UPDATE conversation_sessions SET ended_at = datetime('now'), summary = ? WHERE session_id = ?",
    );

    this.stmtSessionGet = db.prepare(
      'SELECT * FROM conversation_sessions WHERE session_id = ?',
    );

    this.stmtSessionCountMemories = db.prepare(
      'SELECT COUNT(*) as count FROM conversation_memories WHERE session_id = ?',
    );
  }

  // ── Setters ────────────────────────────────────────────

  setRAG(rag: MemoryRAGAdapter): void { this.rag = rag; }
  setJournal(journal: MemoryJournalAdapter): void { this.journal = journal; }
  setKnowledgeGraph(kg: MemoryKnowledgeGraphAdapter): void { this.kg = kg; }

  // ── Remember ──────────────────────────────────────────

  /** Store a memory. Returns memory ID. */
  remember(content: string, options: RememberOptions = {}): number {
    const category = options.category ?? 'context';
    const key = options.key ?? null;
    const importance = options.importance ?? this.config.defaultImportance;
    const source = options.source ?? 'explicit';
    const tags = JSON.stringify(options.tags ?? []);
    const sessionId = options.sessionId ?? null;

    // If key exists, update instead of insert
    if (key) {
      const existing = this.stmtFindByKey.get(key) as Record<string, unknown> | undefined;
      if (existing) {
        const newImportance = Math.max(existing.importance as number, importance);
        this.stmtUpdate.run(content, newImportance, tags, existing.id);
        this.log.debug(`[conversation-memory] Updated memory #${existing.id} (key: ${key})`);

        // Update RAG index
        if (this.rag) {
          this.rag.index(RAG_COLLECTION, existing.id as number, content, { category, key }).catch(() => {});
        }

        return existing.id as number;
      }
    }

    const result = this.stmtInsert.run(sessionId, category, key, content, importance, source, tags);
    const id = result.lastInsertRowid as number;

    // Index in RAG for semantic search
    if (this.rag) {
      this.rag.index(RAG_COLLECTION, id, content, { category, key, tags: options.tags }).catch(() => {});
    }

    // Record in journal for chronological tracking
    if (this.journal && importance >= 7) {
      try {
        this.journal.recordDiscovery(
          `Memory: ${key ?? content.slice(0, 50)}`,
          content.slice(0, 500),
          { memory_id: id, category, source },
          importance >= 9 ? 'notable' : 'routine',
        );
      } catch { /* best effort */ }
    }

    // Add to knowledge graph for relationships
    if (this.kg && key) {
      try {
        this.kg.addFact('brain', `remembers_${category}`, key, content.slice(0, 200), importance / 10, 'conversation');
      } catch { /* best effort */ }
    }

    this.log.debug(`[conversation-memory] Stored memory #${id} (${category}: ${key ?? content.slice(0, 40)})`);
    return id;
  }

  // ── Recall ────────────────────────────────────────────

  /** Semantic search for memories. Uses RAG if available, falls back to FTS5. */
  async recall(query: string, options: RecallOptions = {}): Promise<MemorySearchResult[]> {
    const limit = options.limit ?? 10;

    // Try RAG semantic search first
    if (this.rag) {
      try {
        const ragResults = await this.rag.search(query, {
          collections: [RAG_COLLECTION],
          limit: limit * 2, // Get extra for filtering
          threshold: 0.3,
        });

        const memories: MemorySearchResult[] = [];
        for (const r of ragResults) {
          const row = this.stmtGetById.get(r.sourceId) as Record<string, unknown> | undefined;
          if (!row || !row.active) continue;

          const mem = this.toMemory(row);
          if (options.category && mem.category !== options.category) continue;
          if (options.minImportance && mem.importance < options.minImportance) continue;
          if (options.tags?.length && !options.tags.some(t => mem.tags.includes(t))) continue;

          // Record access
          this.stmtRecordAccess.run(mem.id);

          memories.push({ memory: mem, relevance: r.similarity });
          if (memories.length >= limit) break;
        }

        return memories;
      } catch (err) {
        this.log.debug(`[conversation-memory] RAG recall failed, falling back to FTS: ${(err as Error).message}`);
      }
    }

    // Fallback: FTS5 text search
    return this.searchText(query, options);
  }

  /** Full-text search (FTS5). Always available, no embeddings needed. */
  searchText(query: string, options: RecallOptions = {}): MemorySearchResult[] {
    const limit = options.limit ?? 10;

    // Sanitize query for FTS5
    const ftsQuery = query.replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter(w => w.length > 1).join(' OR ');
    if (!ftsQuery) return [];

    try {
      const rows = this.stmtSearch.all(ftsQuery, limit * 2) as Array<Record<string, unknown>>;
      const results: MemorySearchResult[] = [];

      for (const row of rows) {
        const mem = this.toMemory(row);
        if (options.category && mem.category !== options.category) continue;
        if (options.minImportance && mem.importance < options.minImportance) continue;
        if (options.activeOnly !== false && !mem.active) continue;

        this.stmtRecordAccess.run(mem.id);
        results.push({ memory: mem, relevance: 0.5 }); // FTS doesn't give similarity score
        if (results.length >= limit) break;
      }

      return results;
    } catch {
      // FTS query might fail on edge cases — fallback to LIKE
      const likeRows = this.db.prepare(
        'SELECT * FROM conversation_memories WHERE active = 1 AND content LIKE ? ORDER BY importance DESC LIMIT ?',
      ).all(`%${query}%`, limit) as Array<Record<string, unknown>>;

      return likeRows.map(row => ({
        memory: this.toMemory(row),
        relevance: 0.3,
      }));
    }
  }

  // ── Context Retrieval ─────────────────────────────────

  /** Get recent memories for session context. Perfect for session start. */
  getRecentContext(limit = 20): Memory[] {
    const rows = this.stmtFindRecent.all(limit) as Array<Record<string, unknown>>;
    return rows.map(r => this.toMemory(r));
  }

  /** Get all memories for a category. */
  getByCategory(category: MemoryCategory, limit = 20): Memory[] {
    const rows = this.stmtFindByCategory.all(category, limit) as Array<Record<string, unknown>>;
    return rows.map(r => this.toMemory(r));
  }

  /** Get a specific memory by key. */
  getByKey(key: string): Memory | null {
    const row = this.stmtFindByKey.get(key) as Record<string, unknown> | undefined;
    if (!row) return null;
    this.stmtRecordAccess.run(row.id);
    return this.toMemory(row);
  }

  /** Get the most important memories. */
  getImportant(limit = 10, minImportance = 7): Memory[] {
    const rows = this.db.prepare(
      'SELECT * FROM conversation_memories WHERE active = 1 AND importance >= ? ORDER BY importance DESC, access_count DESC LIMIT ?',
    ).all(minImportance, limit) as Array<Record<string, unknown>>;
    return rows.map(r => this.toMemory(r));
  }

  /** Build a context summary for the LLM (for session start). */
  buildContext(limit = 30): string {
    const parts: string[] = [];
    parts.push('# Brain Memory Context\n');

    // Decisions
    const decisions = this.getByCategory('decision', 5);
    if (decisions.length > 0) {
      parts.push('## Key Decisions');
      for (const m of decisions) parts.push(`- ${m.key ?? m.content.slice(0, 100)}`);
      parts.push('');
    }

    // Preferences
    const prefs = this.getByCategory('preference', 5);
    if (prefs.length > 0) {
      parts.push('## Preferences');
      for (const m of prefs) parts.push(`- ${m.key ?? m.content.slice(0, 100)}`);
      parts.push('');
    }

    // Recent context
    const recent = this.getRecentContext(Math.max(5, limit - decisions.length - prefs.length));
    if (recent.length > 0) {
      parts.push('## Recent Context');
      for (const m of recent) {
        const tag = m.tags.length > 0 ? ` [${m.tags.join(', ')}]` : '';
        parts.push(`- [${m.category}] ${m.content.slice(0, 150)}${tag}`);
      }
      parts.push('');
    }

    // Goals
    const goals = this.getByCategory('goal', 3);
    if (goals.length > 0) {
      parts.push('## Active Goals');
      for (const m of goals) parts.push(`- ${m.content.slice(0, 100)}`);
      parts.push('');
    }

    // Lessons
    const lessons = this.getByCategory('lesson', 5);
    if (lessons.length > 0) {
      parts.push('## Lessons Learned');
      for (const m of lessons) parts.push(`- ${m.content.slice(0, 100)}`);
    }

    return parts.join('\n');
  }

  // ── Sessions ──────────────────────────────────────────

  /** Start a new conversation session. */
  startSession(sessionId: string, goals: string[] = [], metadata: Record<string, unknown> = {}): void {
    this.stmtSessionInsert.run(sessionId, JSON.stringify(goals), JSON.stringify(metadata));
    this.log.info(`[conversation-memory] Session started: ${sessionId}`);
  }

  /** End a conversation session with a summary. */
  endSession(sessionId: string, summary: string): void {
    this.stmtSessionEnd.run(summary, sessionId);

    // Store summary as a high-importance memory
    this.remember(`Session ${sessionId}: ${summary}`, {
      category: 'context',
      key: `session_summary:${sessionId}`,
      importance: 7,
      source: 'inferred',
      tags: ['session', 'summary'],
      sessionId,
    });

    this.log.info(`[conversation-memory] Session ended: ${sessionId}`);
  }

  /** Ensure a session exists (upsert). Returns true if new session was created. */
  ensureSession(sessionId: string): boolean {
    const existing = this.stmtSessionGet.get(sessionId) as Record<string, unknown> | undefined;
    if (existing) return false;
    try {
      this.stmtSessionInsert.run(sessionId, '[]', '{}');
      this.log.info(`[conversation-memory] Session started: ${sessionId}`);
      return true;
    } catch {
      return false; // UNIQUE constraint — session already exists
    }
  }

  /** Get last processed transcript timestamp for a session. */
  getLastProcessedAt(sessionId: string): string {
    const row = this.stmtSessionGet.get(sessionId) as Record<string, unknown> | undefined;
    return (row?.last_processed_at as string) ?? '';
  }

  /** Save last processed transcript timestamp for a session. */
  saveLastProcessedAt(sessionId: string, timestamp: string): void {
    this.db.prepare(
      "UPDATE conversation_sessions SET last_processed_at = ? WHERE session_id = ?",
    ).run(timestamp, sessionId);
  }

  /** Get session info. */
  getSession(sessionId: string): SessionSummary | null {
    const row = this.stmtSessionGet.get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;

    const memCount = (this.stmtSessionCountMemories.get(sessionId) as { count: number }).count;

    return {
      sessionId: row.session_id as string,
      startedAt: row.started_at as string,
      endedAt: row.ended_at as string | null,
      summary: row.summary as string | null,
      goals: JSON.parse((row.goals as string) || '[]'),
      memoriesCreated: memCount,
    };
  }

  // ── Memory Management ─────────────────────────────────

  /** Deactivate a memory (soft delete). */
  forget(id: number): void {
    this.stmtDeactivate.run(id);
    if (this.rag) {
      this.rag.remove(RAG_COLLECTION, id);
    }
  }

  /** Update an existing memory's content. */
  update(id: number, content: string, importance?: number): void {
    const existing = this.stmtGetById.get(id) as Record<string, unknown> | undefined;
    if (!existing) return;

    this.stmtUpdate.run(
      content,
      importance ?? existing.importance,
      existing.tags,
      id,
    );

    if (this.rag) {
      this.rag.index(RAG_COLLECTION, id, content, {
        category: existing.category,
        key: existing.key,
      }).catch(() => {});
    }
  }

  /** Cleanup: decay old unused memories, prune excess. */
  maintenance(): { decayed: number; pruned: number } {
    let decayed = 0;
    let pruned = 0;

    // Decay: reduce importance of memories not accessed in X days
    if (this.config.decayDays > 0) {
      const result = this.db.prepare(`
        UPDATE conversation_memories
        SET importance = MAX(1, importance - 1), updated_at = datetime('now')
        WHERE active = 1
          AND importance > 1
          AND access_count = 0
          AND created_at < datetime('now', '-' || ? || ' days')
      `).run(this.config.decayDays);
      decayed = result.changes;
    }

    // Prune: remove excess low-importance memories
    const total = (this.stmtCountTotal.get() as { count: number }).count;
    if (total > this.config.maxMemories) {
      const excess = total - this.config.maxMemories;
      this.db.prepare(`
        DELETE FROM conversation_memories WHERE id IN (
          SELECT id FROM conversation_memories
          WHERE active = 0 OR importance <= 2
          ORDER BY importance ASC, access_count ASC, created_at ASC
          LIMIT ?
        )
      `).run(excess);
      pruned = excess;
    }

    if (decayed > 0 || pruned > 0) {
      this.log.info(`[conversation-memory] Maintenance: ${decayed} decayed, ${pruned} pruned`);
    }

    return { decayed, pruned };
  }

  // ── Periodic Maintenance ─────────────────────────────

  /** Start periodic maintenance cycle. Default: every 6 hours. */
  startMaintenanceCycle(intervalMs = 6 * 60 * 60 * 1000): void {
    if (this.maintenanceTimer) return;
    this.maintenanceTimer = setInterval(() => {
      try {
        const result = this.maintenance();
        if (result.decayed > 0 || result.pruned > 0) {
          this.log.info(`[memory] Periodic maintenance: ${result.decayed} decayed, ${result.pruned} pruned`);
        }
      } catch (err) {
        this.log.debug(`[memory] Maintenance cycle failed: ${(err as Error).message}`);
      }
    }, intervalMs);
    this.log.info(`[memory] Maintenance cycle started (interval: ${Math.round(intervalMs / 3600000)}h)`);
  }

  /** Stop periodic maintenance cycle. */
  stopMaintenanceCycle(): void {
    if (this.maintenanceTimer) {
      clearInterval(this.maintenanceTimer);
      this.maintenanceTimer = null;
      this.log.info('[memory] Maintenance cycle stopped');
    }
  }

  // ── Status ────────────────────────────────────────────

  getStatus(): ConversationMemoryStatus {
    const total = (this.stmtCountTotal.get() as { count: number }).count;
    const active = (this.stmtCountActive.get() as { count: number }).count;
    const sessions = (this.stmtCountSessions.get() as { count: number }).count;

    const catRows = this.stmtCountByCategory.all() as Array<{ category: string; count: number }>;
    const byCategory: Record<string, number> = {};
    for (const row of catRows) byCategory[row.category] = row.count;

    const recent = this.getRecentContext(5);

    return { totalMemories: total, activeMemories: active, totalSessions: sessions, byCategory, recentMemories: recent };
  }

  // ── Helpers ───────────────────────────────────────────

  private toMemory(row: Record<string, unknown>): Memory {
    return {
      id: row.id as number,
      sessionId: row.session_id as string | null,
      category: row.category as MemoryCategory,
      content: row.content as string,
      key: row.key as string | null,
      importance: row.importance as number,
      source: row.source as MemorySource,
      tags: JSON.parse((row.tags as string) || '[]'),
      accessCount: row.access_count as number,
      lastAccessedAt: row.last_accessed_at as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      active: (row.active as number) === 1,
    };
  }
}
