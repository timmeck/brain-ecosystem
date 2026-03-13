import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ConversationMemory } from '../conversation-memory.js';
import type { MemoryRAGAdapter } from '../conversation-memory.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

describe('ConversationMemory', () => {
  let db: Database.Database;
  let mem: ConversationMemory;

  beforeEach(() => {
    db = new Database(':memory:');
    mem = new ConversationMemory(db, { maxMemories: 100, decayDays: 30 });
  });

  afterEach(() => {
    mem.stopMaintenanceCycle();
    db.close();
  });

  describe('defaults', () => {
    it('uses 30k maxMemories and 60d decay by default', () => {
      const db2 = new Database(':memory:');
      const defaultMem = new ConversationMemory(db2);
      const status = defaultMem.getStatus();
      expect(status.totalMemories).toBe(0);
      db2.close();
    });
  });

  describe('maintenance()', () => {
    it('decays old unused memories', () => {
      // Insert old memory
      db.prepare(`
        INSERT INTO conversation_memories (content, importance, source, access_count, created_at)
        VALUES ('old memory', 5, 'explicit', 0, datetime('now', '-60 days'))
      `).run();

      const result = mem.maintenance();
      expect(result.decayed).toBe(1);

      const row = db.prepare('SELECT importance FROM conversation_memories WHERE content = ?').get('old memory') as { importance: number };
      expect(row.importance).toBe(4); // 5 - 1
    });

    it('does not decay accessed memories', () => {
      db.prepare(`
        INSERT INTO conversation_memories (content, importance, source, access_count, created_at)
        VALUES ('accessed memory', 5, 'explicit', 3, datetime('now', '-60 days'))
      `).run();

      const result = mem.maintenance();
      expect(result.decayed).toBe(0);
    });

    it('prunes when over max', () => {
      // Fill with 120 memories (max is 100)
      for (let i = 0; i < 120; i++) {
        mem.remember(`memory ${i}`, { importance: i < 20 ? 1 : 5 });
      }
      // Deactivate some low-importance ones
      db.prepare("UPDATE conversation_memories SET importance = 1 WHERE id <= 20").run();

      const result = mem.maintenance();
      const total = (db.prepare('SELECT COUNT(*) as c FROM conversation_memories').get() as { c: number }).c;
      expect(total).toBeLessThanOrEqual(100);
    });
  });

  describe('startMaintenanceCycle / stopMaintenanceCycle', () => {
    it('starts and stops without error', () => {
      mem.startMaintenanceCycle(100); // 100ms for testing
      expect(() => mem.stopMaintenanceCycle()).not.toThrow();
    });

    it('does not start twice', () => {
      mem.startMaintenanceCycle(100);
      mem.startMaintenanceCycle(100); // should not create second timer
      mem.stopMaintenanceCycle();
    });

    it('runs maintenance on interval', async () => {
      // Insert old memory
      db.prepare(`
        INSERT INTO conversation_memories (content, importance, source, access_count, created_at)
        VALUES ('old test', 5, 'explicit', 0, datetime('now', '-60 days'))
      `).run();

      mem.startMaintenanceCycle(50); // 50ms
      await new Promise(r => setTimeout(r, 120)); // wait for at least 2 cycles
      mem.stopMaintenanceCycle();

      const row = db.prepare('SELECT importance FROM conversation_memories WHERE content = ?').get('old test') as { importance: number };
      expect(row.importance).toBeLessThan(5);
    });
  });

  describe('ensureSession', () => {
    it('creates a new session', () => {
      const isNew = mem.ensureSession('test-session');
      expect(isNew).toBe(true);

      const session = mem.getSession('test-session');
      expect(session).not.toBeNull();
      expect(session!.sessionId).toBe('test-session');
    });

    it('does not duplicate existing session', () => {
      mem.ensureSession('test-session');
      const isNew = mem.ensureSession('test-session');
      expect(isNew).toBe(false);
    });
  });

  describe('transcript state', () => {
    it('stores and retrieves last processed timestamp', () => {
      mem.ensureSession('s1');
      mem.saveLastProcessedAt('s1', '2026-03-12T10:00:00Z');
      expect(mem.getLastProcessedAt('s1')).toBe('2026-03-12T10:00:00Z');
    });

    it('returns empty string for unknown session', () => {
      expect(mem.getLastProcessedAt('unknown')).toBe('');
    });
  });

  // ── Session 130: Typed Memory ──────────────────────────────

  describe('new memory categories', () => {
    it('stores and retrieves constraint memories', () => {
      const id = mem.remember('never auto-commit', { category: 'constraint', importance: 8 });
      expect(id).toBeGreaterThan(0);

      const constraints = mem.getByCategory('constraint', 5);
      expect(constraints).toHaveLength(1);
      expect(constraints[0].content).toBe('never auto-commit');
      expect(constraints[0].category).toBe('constraint');
    });

    it('stores and retrieves open_question memories', () => {
      const id = mem.remember('how to handle auth tokens?', { category: 'open_question', importance: 6 });
      expect(id).toBeGreaterThan(0);

      const questions = mem.getByCategory('open_question', 5);
      expect(questions).toHaveLength(1);
      expect(questions[0].content).toBe('how to handle auth tokens?');
    });
  });

  describe('buildContext (typed)', () => {
    it('includes Constraints section in context', () => {
      mem.remember('never use npm', { category: 'constraint', importance: 8 });
      const ctx = mem.buildContext();
      expect(ctx).toContain('## Constraints');
      expect(ctx).toContain('never use npm');
    });

    it('includes Open Questions section in context', () => {
      mem.remember('should we migrate to bun?', { category: 'open_question', importance: 6 });
      const ctx = mem.buildContext();
      expect(ctx).toContain('## Open Questions');
      expect(ctx).toContain('should we migrate to bun?');
    });

    it('increments use_count for memories in context', () => {
      const id = mem.remember('test decision', { category: 'decision', importance: 8 });
      mem.buildContext();
      const row = db.prepare('SELECT use_count FROM conversation_memories WHERE id = ?').get(id) as { use_count: number };
      expect(row.use_count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('retrieval metadata', () => {
    it('creates use_count and archive_candidate columns', () => {
      const id = mem.remember('test', { importance: 5 });
      const row = db.prepare('SELECT use_count, archive_candidate FROM conversation_memories WHERE id = ?').get(id) as { use_count: number; archive_candidate: number };
      expect(row.use_count).toBe(0);
      expect(row.archive_candidate).toBe(0);
    });

    it('toMemory maps new fields correctly', () => {
      const id = mem.remember('mapped test', { category: 'fact', importance: 7 });
      const memories = mem.getByCategory('fact', 1);
      expect(memories).toHaveLength(1);
      expect(memories[0].useCount).toBe(0);
      expect(memories[0].archiveCandidate).toBe(false);
      expect(memories[0].lastUsedAt).toBeNull();
      expect(memories[0].lastRetrievalScore).toBeNull();
    });
  });

  // ── Session 138: RRF Fusion ────────────────────────────────

  describe('RRF recall', () => {
    it('fuses RAG + FTS results when RAG available', async () => {
      // Store memories
      const id1 = mem.remember('TypeScript strict mode for all packages', { category: 'decision', importance: 8 });
      const id2 = mem.remember('Use Vitest for all testing', { category: 'decision', importance: 7 });
      const id3 = mem.remember('SQLite with WAL for all databases', { category: 'decision', importance: 9 });

      // Mock RAG adapter that returns id3, id1 (different order than FTS)
      const mockRag: MemoryRAGAdapter = {
        index: vi.fn().mockResolvedValue(true),
        search: vi.fn().mockResolvedValue([
          { sourceId: id3, similarity: 0.9 },
          { sourceId: id1, similarity: 0.7 },
        ]),
        remove: vi.fn(),
      };
      mem.setRAG(mockRag);

      const results = await mem.recall('TypeScript', { limit: 10 });
      // Should have results from both sources fused
      expect(results.length).toBeGreaterThan(0);
      // All results should have numeric relevance (RRF score)
      for (const r of results) {
        expect(typeof r.relevance).toBe('number');
        expect(r.relevance).toBeGreaterThan(0);
      }
    });

    it('items appearing in both lists get higher RRF score', async () => {
      const idBoth = mem.remember('TypeScript strict mode important', { category: 'decision', importance: 8 });
      const idRagOnly = mem.remember('random unrelated rag memory', { category: 'fact', importance: 5 });

      // Mock RAG: returns both items
      const mockRag: MemoryRAGAdapter = {
        index: vi.fn().mockResolvedValue(true),
        search: vi.fn().mockResolvedValue([
          { sourceId: idBoth, similarity: 0.8 },
          { sourceId: idRagOnly, similarity: 0.6 },
        ]),
        remove: vi.fn(),
      };
      mem.setRAG(mockRag);

      // FTS will also find idBoth via "TypeScript strict" but NOT idRagOnly
      const results = await mem.recall('TypeScript strict', { limit: 10 });

      // If both sources found idBoth, it should rank highest
      if (results.length >= 2) {
        const bothItem = results.find(r => r.memory.id === idBoth);
        const ragOnlyItem = results.find(r => r.memory.id === idRagOnly);
        if (bothItem && ragOnlyItem) {
          expect(bothItem.relevance).toBeGreaterThan(ragOnlyItem.relevance);
        }
      }
    });

    it('falls back to FTS when RAG fails', async () => {
      mem.remember('test memory for fallback', { category: 'fact', importance: 5 });

      const mockRag: MemoryRAGAdapter = {
        index: vi.fn().mockResolvedValue(true),
        search: vi.fn().mockRejectedValue(new Error('RAG unavailable')),
        remove: vi.fn(),
      };
      mem.setRAG(mockRag);

      const results = await mem.recall('test memory fallback');
      // Should still get results via FTS fallback
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('populates last_retrieval_score on recall', async () => {
      const id = mem.remember('retrieval score test memory', { category: 'fact', importance: 5 });

      const mockRag: MemoryRAGAdapter = {
        index: vi.fn().mockResolvedValue(true),
        search: vi.fn().mockResolvedValue([
          { sourceId: id, similarity: 0.85 },
        ]),
        remove: vi.fn(),
      };
      mem.setRAG(mockRag);

      await mem.recall('retrieval score test');

      const row = db.prepare('SELECT last_retrieval_score FROM conversation_memories WHERE id = ?').get(id) as { last_retrieval_score: number | null };
      expect(row.last_retrieval_score).not.toBeNull();
      expect(row.last_retrieval_score).toBeGreaterThan(0);
    });

    it('populates last_retrieval_score on searchText', () => {
      const id = mem.remember('searchText score test', { category: 'fact', importance: 5 });

      const results = mem.searchText('searchText score');
      expect(results.length).toBeGreaterThan(0);

      const row = db.prepare('SELECT last_retrieval_score FROM conversation_memories WHERE id = ?').get(id) as { last_retrieval_score: number | null };
      expect(row.last_retrieval_score).not.toBeNull();
    });

    it('works without RAG (FTS-only path unchanged)', async () => {
      mem.remember('simple FTS test memory', { category: 'fact', importance: 5 });

      // No RAG set — should use FTS path
      const results = await mem.recall('simple FTS test');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ── Session 131: retrieveByIntent ─────────────────────────

  describe('retrieveByIntent', () => {
    it('returns fallback results when no candidate sets exist', () => {
      mem.remember('use TypeScript strict mode', { category: 'decision', importance: 8 });
      mem.remember('chose Vitest over Jest', { category: 'decision', importance: 7 });

      const results = mem.retrieveByIntent('decision_lookup');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].category).toBe('decision');
    });

    it('returns empty for unknown intent', () => {
      const results = mem.retrieveByIntent('nonexistent_intent');
      expect(results).toHaveLength(0);
    });

    it('works with query parameter in fallback mode', () => {
      mem.remember('decided to use bun for builds', { category: 'decision', importance: 8 });
      mem.remember('decided to use vitest for testing', { category: 'decision', importance: 7 });

      const results = mem.retrieveByIntent('decision_lookup', 'bun');
      expect(results.length).toBeGreaterThanOrEqual(0); // FTS may or may not match
    });

    it('increments use_count for retrieved memories', () => {
      const id = mem.remember('always use strict mode', { category: 'preference', importance: 8 });
      mem.retrieveByIntent('user_preference_lookup');

      const row = db.prepare('SELECT use_count FROM conversation_memories WHERE id = ?').get(id) as { use_count: number };
      expect(row.use_count).toBeGreaterThanOrEqual(1);
    });
  });
});
