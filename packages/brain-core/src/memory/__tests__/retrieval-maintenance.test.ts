import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { RetrievalMaintenanceEngine } from '../retrieval-maintenance.js';
import { runConversationMemoryMigration } from '../conversation-memory.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

describe('RetrievalMaintenanceEngine', () => {
  let db: Database.Database;
  let engine: RetrievalMaintenanceEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    runConversationMemoryMigration(db);
    engine = new RetrievalMaintenanceEngine(db, {
      coldThresholdDays: 30,
      minImportanceForProtection: 4,
      candidateSetSize: 50,
    });
  });

  afterEach(() => {
    engine.stop();
    db.close();
  });

  // ── 1. Status ────────────────────────────────────────────

  it('returns initial status with zero counters', () => {
    const status = engine.getStatus();
    expect(status.lastRunAt).toBeNull();
    expect(status.totalRuns).toBe(0);
    expect(status.totalArchiveCandidates).toBe(0);
    expect(status.candidateSets).toBe(0);
  });

  // ── 2. markArchiveCandidates ─────────────────────────────

  it('marks cold memories as archive candidates', () => {
    // Insert old, unused, low-importance memory
    db.prepare(`
      INSERT INTO conversation_memories (content, importance, source, access_count, use_count, created_at)
      VALUES ('forgotten memory', 2, 'explicit', 0, 0, datetime('now', '-60 days'))
    `).run();

    const marked = engine.markArchiveCandidates();
    expect(marked).toBe(1);

    const row = db.prepare('SELECT archive_candidate FROM conversation_memories WHERE content = ?')
      .get('forgotten memory') as { archive_candidate: number };
    expect(row.archive_candidate).toBe(1);
  });

  it('does not mark accessed memories', () => {
    db.prepare(`
      INSERT INTO conversation_memories (content, importance, source, access_count, use_count, created_at)
      VALUES ('active memory', 2, 'explicit', 5, 0, datetime('now', '-60 days'))
    `).run();

    const marked = engine.markArchiveCandidates();
    expect(marked).toBe(0);
  });

  it('does not mark high-importance memories', () => {
    db.prepare(`
      INSERT INTO conversation_memories (content, importance, source, access_count, use_count, created_at)
      VALUES ('important memory', 8, 'explicit', 0, 0, datetime('now', '-60 days'))
    `).run();

    const marked = engine.markArchiveCandidates();
    expect(marked).toBe(0);
  });

  it('does not mark recent memories', () => {
    db.prepare(`
      INSERT INTO conversation_memories (content, importance, source, access_count, use_count, created_at)
      VALUES ('recent memory', 2, 'explicit', 0, 0, datetime('now'))
    `).run();

    const marked = engine.markArchiveCandidates();
    expect(marked).toBe(0);
  });

  it('resets candidates that were accessed since last run', () => {
    db.prepare(`
      INSERT INTO conversation_memories (content, importance, source, access_count, use_count, archive_candidate, created_at)
      VALUES ('was cold, now warm', 2, 'explicit', 3, 0, 1, datetime('now', '-60 days'))
    `).run();

    engine.markArchiveCandidates();

    const row = db.prepare('SELECT archive_candidate FROM conversation_memories WHERE content = ?')
      .get('was cold, now warm') as { archive_candidate: number };
    expect(row.archive_candidate).toBe(0);
  });

  // ── 3. refreshCandidateSets ──────────────────────────────

  it('creates candidate sets for categories', () => {
    db.prepare(`INSERT INTO conversation_memories (content, category, importance, source) VALUES (?, ?, ?, ?)`).run('my decision', 'decision', 8, 'explicit');
    db.prepare(`INSERT INTO conversation_memories (content, category, importance, source) VALUES (?, ?, ?, ?)`).run('my pref', 'preference', 7, 'explicit');
    db.prepare(`INSERT INTO conversation_memories (content, category, importance, source) VALUES (?, ?, ?, ?)`).run('a constraint', 'constraint', 6, 'explicit');

    const report = engine.refreshCandidateSets();
    expect(report.setsCreated).toBeGreaterThan(0);
    expect(report.totalMemories).toBeGreaterThan(0);
  });

  it('creates intent-based candidate sets', () => {
    db.prepare(`INSERT INTO conversation_memories (content, category, importance, source) VALUES (?, ?, ?, ?)`).run('decided on REST', 'decision', 8, 'explicit');
    db.prepare(`INSERT INTO conversation_memories (content, category, importance, source) VALUES (?, ?, ?, ?)`).run('project context', 'context', 7, 'explicit');

    engine.refreshCandidateSets();

    const decisionIds = engine.getCandidateSet('intent', 'decision_lookup');
    expect(decisionIds.length).toBeGreaterThan(0);

    const contextIds = engine.getCandidateSet('intent', 'project_context');
    expect(contextIds.length).toBeGreaterThan(0);
  });

  // ── 4. runMaintenance ────────────────────────────────────

  it('runs full maintenance cycle and returns report', () => {
    db.prepare(`INSERT INTO conversation_memories (content, importance, source, access_count, use_count, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', '-60 days'))`).run('cold mem', 2, 'explicit', 0, 0);
    db.prepare(`INSERT INTO conversation_memories (content, category, importance, source) VALUES (?, ?, ?, ?)`).run('warm decision', 'decision', 8, 'explicit');

    const report = engine.runMaintenance();
    expect(report.archiveCandidatesMarked).toBeGreaterThanOrEqual(0);
    expect(report.candidateSetsRefreshed).toBeGreaterThan(0);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);

    // Status should reflect one run
    const status = engine.getStatus();
    expect(status.totalRuns).toBe(1);
    expect(status.lastRunAt).not.toBeNull();
  });

  // ── 5. getCandidateSet ───────────────────────────────────

  it('returns empty array for non-existent set', () => {
    const ids = engine.getCandidateSet('intent', 'nonexistent');
    expect(ids).toEqual([]);
  });

  // ── 6. start / stop ─────────────────────────────────────

  it('start and stop lifecycle works', () => {
    engine.start(60_000);
    // Starting again should be a no-op
    engine.start(60_000);
    engine.stop();
    // Stopping again should be safe
    engine.stop();
  });
});
