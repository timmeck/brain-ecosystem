import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { RetentionPolicyEngine } from '../retention-engine.js';

/** Create minimal tables for testing (mimics real schema) */
function setupTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_vectors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      text_hash TEXT NOT NULL,
      text_preview TEXT,
      embedding BLOB NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
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
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT,
      last_retrieval_score REAL,
      archive_candidate INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS compressed_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      collection TEXT NOT NULL,
      member_ids TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'trend',
      description TEXT,
      priority INTEGER DEFAULT 5,
      active INTEGER DEFAULT 1,
      lifecycle TEXT DEFAULT 'provisional',
      rating INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

/** Insert a rag_vector with explicit created_at */
function insertVector(db: Database.Database, opts: { sourceId: number; daysOld: number; collection?: string }): number {
  const createdAt = daysAgo(opts.daysOld);
  const result = db.prepare(
    `INSERT INTO rag_vectors (collection, source_id, text_hash, embedding, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(opts.collection ?? 'conversation_memories', opts.sourceId, `hash_${Date.now()}_${Math.random()}`, Buffer.from('fake'), createdAt);
  return Number(result.lastInsertRowid);
}

/** Insert a conversation_memory */
function insertMemory(db: Database.Database, opts: {
  daysOld: number; importance?: number; useCount?: number; source?: string;
  archiveCandidate?: number; accessCount?: number; lastAccessedDaysAgo?: number;
}): number {
  const createdAt = daysAgo(opts.daysOld);
  const lastAccessed = opts.lastAccessedDaysAgo != null ? daysAgo(opts.lastAccessedDaysAgo) : null;
  const result = db.prepare(`
    INSERT INTO conversation_memories (content, importance, source, use_count, archive_candidate, access_count, last_accessed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'test memory content',
    opts.importance ?? 5,
    opts.source ?? 'explicit',
    opts.useCount ?? 0,
    opts.archiveCandidate ?? 0,
    opts.accessCount ?? 0,
    lastAccessed,
    createdAt,
  );
  return Number(result.lastInsertRowid);
}

/** Insert a compressed_cluster */
function insertCluster(db: Database.Database, daysOld: number): number {
  const createdAt = daysAgo(daysOld);
  const result = db.prepare(
    `INSERT INTO compressed_clusters (collection, member_ids, summary, created_at) VALUES (?, ?, ?, ?)`,
  ).run('test', '[1,2,3]', 'test summary', createdAt);
  return Number(result.lastInsertRowid);
}

/** Insert an insight */
function insertInsight(db: Database.Database, opts: { daysOld: number; lifecycle?: string }): number {
  const createdAt = daysAgo(opts.daysOld);
  const result = db.prepare(
    `INSERT INTO insights (title, lifecycle, created_at) VALUES (?, ?, ?)`,
  ).run('test insight', opts.lifecycle ?? 'provisional', createdAt);
  return Number(result.lastInsertRowid);
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().replace('T', ' ').substring(0, 19);
}

describe('RetentionPolicyEngine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    setupTables(db);
  });
  afterEach(() => { db.close(); });

  // ── Config ────────────────────────────────────────────────

  it('uses default config values', () => {
    const engine = new RetentionPolicyEngine(db);
    const status = engine.getStatus();
    expect(status.config.ragVectorTTLDays).toBe(30);
    expect(status.config.memoryTTLDays).toBe(90);
    expect(status.config.clusterTTLDays).toBe(60);
    expect(status.config.insightTTLDays).toBe(120);
    expect(status.config.batchLimit).toBe(10_000);
    expect(status.config.memoryProtectionImportance).toBe(4);
    expect(status.config.ragVectorProtectionImportance).toBe(6);
  });

  // ── rag_vectors ───────────────────────────────────────────

  it('cleanRagVectors: deletes old vectors without important memories', () => {
    // Memory with low importance
    const memId = insertMemory(db, { daysOld: 0, importance: 2, useCount: 0, archiveCandidate: 1 });
    // Old vector linked to that memory
    insertVector(db, { sourceId: memId, daysOld: 40 });
    // Recent vector (should be kept)
    insertVector(db, { sourceId: memId, daysOld: 5 });

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanRagVectors(false);
    expect(report.affected).toBe(1); // only old one deleted
    expect(report.before).toBe(2);

    const remaining = (db.prepare('SELECT COUNT(*) as cnt FROM rag_vectors').get() as { cnt: number }).cnt;
    expect(remaining).toBe(1);
  });

  it('cleanRagVectors: protects vectors with importance >= threshold', () => {
    const memId = insertMemory(db, { daysOld: 0, importance: 8 }); // high importance
    insertVector(db, { sourceId: memId, daysOld: 40 });

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanRagVectors(false);
    expect(report.affected).toBe(0); // protected by importance
    expect(report.protected).toBeGreaterThan(0);
  });

  it('cleanRagVectors: protects vectors with use_count > 0', () => {
    const memId = insertMemory(db, { daysOld: 0, importance: 2, useCount: 3 }); // low importance but used
    insertVector(db, { sourceId: memId, daysOld: 40 });

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanRagVectors(false);
    expect(report.affected).toBe(0); // protected by use_count
  });

  it('cleanRagVectors: dry-run counts only, does not delete', () => {
    const memId = insertMemory(db, { daysOld: 0, importance: 2, archiveCandidate: 1 });
    insertVector(db, { sourceId: memId, daysOld: 40 });

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanRagVectors(true);
    expect(report.affected).toBe(1);

    // Verify nothing deleted
    const remaining = (db.prepare('SELECT COUNT(*) as cnt FROM rag_vectors').get() as { cnt: number }).cnt;
    expect(remaining).toBe(1);
  });

  // ── conversation_memories ─────────────────────────────────

  it('cleanMemories: deletes archive_candidates with expired TTL', () => {
    insertMemory(db, { daysOld: 100, importance: 2, archiveCandidate: 1 }); // should be deleted
    insertMemory(db, { daysOld: 100, importance: 2, archiveCandidate: 0 }); // not archive candidate

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanMemories(false);
    expect(report.affected).toBe(1);
  });

  it('cleanMemories: protects inferred memories (DreamEngine)', () => {
    insertMemory(db, { daysOld: 100, importance: 2, source: 'inferred', archiveCandidate: 1 });

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanMemories(false);
    expect(report.affected).toBe(0); // protected as inferred
  });

  it('cleanMemories: protects memories with use_count > 0', () => {
    insertMemory(db, { daysOld: 100, importance: 2, useCount: 5, archiveCandidate: 1 });

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanMemories(false);
    expect(report.affected).toBe(0); // protected by use_count
  });

  it('cleanMemories: protects memories with high importance', () => {
    insertMemory(db, { daysOld: 100, importance: 8, archiveCandidate: 1 });

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanMemories(false);
    expect(report.affected).toBe(0); // protected by importance
  });

  // ── compressed_clusters ───────────────────────────────────

  it('cleanClusters: deletes old clusters', () => {
    insertCluster(db, 70); // older than 60d TTL
    insertCluster(db, 10); // recent

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanClusters(false);
    expect(report.affected).toBe(1);
    expect(report.before).toBe(2);
  });

  it('cleanClusters: keeps clusters within TTL', () => {
    insertCluster(db, 30);
    insertCluster(db, 50);

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanClusters(false);
    expect(report.affected).toBe(0);
  });

  // ── insights ──────────────────────────────────────────────

  it('cleanInsights: deletes archived insights past TTL', () => {
    insertInsight(db, { daysOld: 130, lifecycle: 'archived' }); // past 120d TTL
    insertInsight(db, { daysOld: 50, lifecycle: 'archived' }); // within TTL
    insertInsight(db, { daysOld: 130, lifecycle: 'confirmed' }); // not archived

    const engine = new RetentionPolicyEngine(db);
    const report = engine.cleanInsights(false);
    expect(report.affected).toBe(1);
  });

  // ── Combined run ──────────────────────────────────────────

  it('run(): combines all tables in a single report', () => {
    const memId = insertMemory(db, { daysOld: 100, importance: 2, archiveCandidate: 1 });
    insertVector(db, { sourceId: memId, daysOld: 40 });
    insertCluster(db, 70);
    insertInsight(db, { daysOld: 130, lifecycle: 'archived' });

    const engine = new RetentionPolicyEngine(db);
    const report = engine.run(false);
    expect(report.dryRun).toBe(false);
    expect(report.totalRowsAffected).toBeGreaterThanOrEqual(3); // at least memory + cluster + insight
    expect(report.tables.conversation_memories.affected).toBe(1);
    expect(report.tables.compressed_clusters.affected).toBe(1);
    expect(report.tables.insights.affected).toBe(1);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
    expect(report.timestamp).toBeTruthy();
  });

  it('run(true): dry-run does not modify data', () => {
    insertMemory(db, { daysOld: 100, importance: 2, archiveCandidate: 1 });
    insertCluster(db, 70);
    insertInsight(db, { daysOld: 130, lifecycle: 'archived' });

    const engine = new RetentionPolicyEngine(db);
    const report = engine.run(true);
    expect(report.dryRun).toBe(true);
    expect(report.totalRowsAffected).toBeGreaterThanOrEqual(3);

    // Verify nothing actually deleted
    const memCount = (db.prepare('SELECT COUNT(*) as cnt FROM conversation_memories').get() as { cnt: number }).cnt;
    const clusterCount = (db.prepare('SELECT COUNT(*) as cnt FROM compressed_clusters').get() as { cnt: number }).cnt;
    const insightCount = (db.prepare('SELECT COUNT(*) as cnt FROM insights').get() as { cnt: number }).cnt;
    expect(memCount).toBe(1);
    expect(clusterCount).toBe(1);
    expect(insightCount).toBe(1);
  });

  // ── Status & Reports ──────────────────────────────────────

  it('getTableSizes: returns correct row counts', () => {
    insertMemory(db, { daysOld: 1 });
    insertMemory(db, { daysOld: 2 });
    insertCluster(db, 5);

    const engine = new RetentionPolicyEngine(db);
    const sizes = engine.getTableSizes();
    expect(sizes).toHaveLength(4);
    const memTable = sizes.find(s => s.table === 'conversation_memories');
    expect(memTable?.rowCount).toBe(2);
    const clusterTable = sizes.find(s => s.table === 'compressed_clusters');
    expect(clusterTable?.rowCount).toBe(1);
  });

  it('getStatus: returns lastReport and totalRuns', () => {
    const engine = new RetentionPolicyEngine(db);
    expect(engine.getStatus().totalRuns).toBe(0);
    expect(engine.getLastReport()).toBeNull();

    engine.run(true);
    expect(engine.getStatus().totalRuns).toBe(1);
    expect(engine.getLastReport()).not.toBeNull();
    expect(engine.getLastReport()?.dryRun).toBe(true);

    engine.run(false);
    expect(engine.getStatus().totalRuns).toBe(2);
  });
});
