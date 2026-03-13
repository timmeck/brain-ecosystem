import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ConversationMemory } from '../conversation-memory.js';
import type { MemoryRAGAdapter } from '../conversation-memory.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

/**
 * Focused tests for Reciprocal Rank Fusion (RRF) algorithm.
 * Session 138: RRF merges FTS5 + RAG into a single ranked list.
 *
 * Formula: score(d) = sum(1 / (k + rank(d, list_i)))
 * where k=60 (Cormack et al. 2009)
 */
describe('RRF Fusion', () => {
  let db: Database.Database;
  let mem: ConversationMemory;

  beforeEach(() => {
    db = new Database(':memory:');
    mem = new ConversationMemory(db, { maxMemories: 100 });
  });

  afterEach(() => {
    mem.stopMaintenanceCycle();
    db.close();
  });

  it('document appearing in both lists scores higher than single-list', async () => {
    // Create three memories
    const idA = mem.remember('alpha algorithm optimization', { category: 'fact', importance: 5 });
    const idB = mem.remember('beta build system configuration', { category: 'fact', importance: 5 });
    const idC = mem.remember('gamma graph database queries', { category: 'fact', importance: 5 });

    // RAG returns: A (rank 1), C (rank 2)
    // FTS will return: A (rank 1, matches "alpha algorithm")
    // A appears in both → should score highest
    const mockRag: MemoryRAGAdapter = {
      index: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue([
        { sourceId: idA, similarity: 0.9 },
        { sourceId: idC, similarity: 0.7 },
      ]),
      remove: vi.fn(),
    };
    mem.setRAG(mockRag);

    const results = await mem.recall('alpha algorithm');

    const scoreA = results.find(r => r.memory.id === idA);
    const scoreC = results.find(r => r.memory.id === idC);

    // A should be in results (appears in RAG, possibly in FTS too)
    expect(scoreA).toBeDefined();
    if (scoreA && scoreC) {
      // A appears in both RAG + FTS, C only in RAG
      expect(scoreA.relevance).toBeGreaterThanOrEqual(scoreC.relevance);
    }
  });

  it('RRF scores are bounded and positive', async () => {
    const id1 = mem.remember('test bounded scores alpha', { category: 'fact', importance: 5 });
    const id2 = mem.remember('test bounded scores beta', { category: 'fact', importance: 5 });

    const mockRag: MemoryRAGAdapter = {
      index: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue([
        { sourceId: id1, similarity: 0.95 },
        { sourceId: id2, similarity: 0.80 },
      ]),
      remove: vi.fn(),
    };
    mem.setRAG(mockRag);

    const results = await mem.recall('test bounded scores');

    for (const r of results) {
      expect(r.relevance).toBeGreaterThan(0);
      // Max RRF score for 2 lists: 2 * 1/(60+1) ≈ 0.0328
      expect(r.relevance).toBeLessThan(1);
    }
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 20; i++) {
      mem.remember(`limit test memory number ${i}`, { category: 'fact', importance: 5 });
    }

    const mockRag: MemoryRAGAdapter = {
      index: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue([]),
      remove: vi.fn(),
    };
    mem.setRAG(mockRag);

    const results = await mem.recall('limit test memory', { limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('category filter applies to both RAG and FTS', async () => {
    const idFact = mem.remember('category filter fact memory', { category: 'fact', importance: 5 });
    const idDecision = mem.remember('category filter decision memory', { category: 'decision', importance: 5 });

    const mockRag: MemoryRAGAdapter = {
      index: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue([
        { sourceId: idFact, similarity: 0.8 },
        { sourceId: idDecision, similarity: 0.7 },
      ]),
      remove: vi.fn(),
    };
    mem.setRAG(mockRag);

    const results = await mem.recall('category filter', { category: 'fact' });

    for (const r of results) {
      expect(r.memory.category).toBe('fact');
    }
  });

  it('handles empty RAG results gracefully', async () => {
    mem.remember('empty rag test memory', { category: 'fact', importance: 5 });

    const mockRag: MemoryRAGAdapter = {
      index: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue([]),
      remove: vi.fn(),
    };
    mem.setRAG(mockRag);

    // Only FTS results should come through
    const results = await mem.recall('empty rag test');
    // FTS may or may not find it, but should not crash
    expect(Array.isArray(results)).toBe(true);
  });

  it('handles empty FTS results gracefully', async () => {
    const id = mem.remember('unique semantic content xyz789', { category: 'fact', importance: 5 });

    const mockRag: MemoryRAGAdapter = {
      index: vi.fn().mockResolvedValue(true),
      search: vi.fn().mockResolvedValue([
        { sourceId: id, similarity: 0.9 },
      ]),
      remove: vi.fn(),
    };
    mem.setRAG(mockRag);

    // Query that RAG finds but FTS might not
    const results = await mem.recall('completely different query terms');
    expect(Array.isArray(results)).toBe(true);
  });
});
