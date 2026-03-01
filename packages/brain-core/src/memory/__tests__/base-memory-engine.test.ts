import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../embeddings/engine.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../embeddings/engine.js')>();
  return {
    ...actual,
    BaseEmbeddingEngine: actual.BaseEmbeddingEngine,
  };
});

import { BaseMemoryEngine } from '../base-memory-engine.js';
import { BaseEmbeddingEngine } from '../../embeddings/engine.js';
import type { MemoryRecord, MemoryEngineConfig } from '../types.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_CONFIG: MemoryEngineConfig = {
  intervalMs: 1000,
  expiryCheckEnabled: true,
  consolidationEnabled: true,
  importanceDecayDays: 30,
};

/** Build a minimal MemoryRecord with overrides. */
function makeMemory(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: 1,
    project_id: null,
    session_id: null,
    category: 'fact',
    key: null,
    content: 'test memory',
    importance: 5,
    source: 'explicit',
    tags: null,
    expires_at: null,
    superseded_by: null,
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    embedding: null,
    ...overrides,
  };
}

/**
 * Concrete subclass of the abstract BaseMemoryEngine for testing.
 * Allows tests to control what getActiveMemoriesWithEmbeddings() and textSearch() return.
 */
class TestMemoryEngine extends BaseMemoryEngine {
  cycleCount = 0;
  memoriesWithEmbeddings: MemoryRecord[] = [];
  textSearchResults: MemoryRecord[] = [];
  textSearchCalls: { query: string; limit: number }[] = [];

  runCycle(): void {
    this.cycleCount++;
  }

  protected getActiveMemoriesWithEmbeddings(): MemoryRecord[] {
    return this.memoriesWithEmbeddings;
  }

  protected textSearch(query: string, limit: number): MemoryRecord[] {
    this.textSearchCalls.push({ query, limit });
    return this.textSearchResults.slice(0, limit);
  }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */

describe('BaseMemoryEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /* ---------- Timer lifecycle ---------- */

  it('start() runs cycles at the configured interval', () => {
    const engine = new TestMemoryEngine(DEFAULT_CONFIG);
    engine.start();
    expect(engine.cycleCount).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(engine.cycleCount).toBe(1);

    vi.advanceTimersByTime(2000);
    expect(engine.cycleCount).toBe(3);
    engine.stop();
  });

  it('stop() halts the timer so no further cycles run', () => {
    const engine = new TestMemoryEngine({ ...DEFAULT_CONFIG, intervalMs: 500 });
    engine.start();
    vi.advanceTimersByTime(500);
    expect(engine.cycleCount).toBe(1);

    engine.stop();
    vi.advanceTimersByTime(5000);
    expect(engine.cycleCount).toBe(1);
  });

  it('stop() is safe to call multiple times', () => {
    const engine = new TestMemoryEngine(DEFAULT_CONFIG);
    engine.start();
    engine.stop();
    expect(() => engine.stop()).not.toThrow();
  });

  it('stop() is safe to call without start()', () => {
    const engine = new TestMemoryEngine(DEFAULT_CONFIG);
    expect(() => engine.stop()).not.toThrow();
  });

  it('errors in runCycle are caught and do not crash the timer', () => {
    class FailingEngine extends BaseMemoryEngine {
      protected getActiveMemoriesWithEmbeddings(): MemoryRecord[] {
        return [];
      }
      protected textSearch(): MemoryRecord[] {
        return [];
      }
      runCycle(): void {
        throw new Error('cycle explosion');
      }
    }

    const engine = new FailingEngine(DEFAULT_CONFIG);
    engine.start();

    // Should not throw despite runCycle throwing
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    engine.stop();
  });

  /* ---------- setEmbeddingEngine ---------- */

  it('setEmbeddingEngine attaches an embedding engine', () => {
    const engine = new TestMemoryEngine(DEFAULT_CONFIG);
    const embeddingEngine = new BaseEmbeddingEngine({ enabled: true });

    engine.setEmbeddingEngine(embeddingEngine);
    // Verify it was set (access via semanticRecall behavior below)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((engine as any).embeddingEngine).toBe(embeddingEngine);
  });

  /* ---------- semanticRecall ---------- */

  it('semanticRecall falls back to textSearch when no embedding engine is set', async () => {
    vi.useRealTimers();

    const engine = new TestMemoryEngine(DEFAULT_CONFIG);
    const expected = [makeMemory({ id: 1, content: 'hello' })];
    engine.textSearchResults = expected;

    const results = await engine.semanticRecall('hello', 5);
    expect(results).toEqual(expected);
    expect(engine.textSearchCalls).toEqual([{ query: 'hello', limit: 5 }]);
  });

  it('semanticRecall falls back to textSearch when embedding engine is not ready', async () => {
    vi.useRealTimers();

    const engine = new TestMemoryEngine(DEFAULT_CONFIG);
    const embeddingEngine = new BaseEmbeddingEngine({ enabled: true });
    // isReady() returns false because we never initialized
    engine.setEmbeddingEngine(embeddingEngine);

    const expected = [makeMemory({ id: 2, content: 'fallback' })];
    engine.textSearchResults = expected;

    const results = await engine.semanticRecall('query');
    expect(results).toEqual(expected);
    expect(engine.textSearchCalls.length).toBe(1);
  });

  it('semanticRecall uses embeddings and sorts by similarity when engine is ready', async () => {
    vi.useRealTimers();

    const engine = new TestMemoryEngine(DEFAULT_CONFIG);

    // Create a mock embedding engine that is "ready"
    const mockEmbeddingEngine = {
      isReady: () => true,
      embed: vi.fn(),
    } as unknown as BaseEmbeddingEngine;

    // Query vector: [1, 0]
    const queryVec = new Float32Array([1, 0]);
    (mockEmbeddingEngine.embed as ReturnType<typeof vi.fn>).mockResolvedValue(queryVec);

    engine.setEmbeddingEngine(mockEmbeddingEngine);

    // Memory A embedding: [0, 1] -> similarity = 0
    // Memory B embedding: [0.6, 0.8] -> similarity = 0.6
    // Memory C embedding: [1, 0] -> similarity = 1.0
    const memA = makeMemory({
      id: 1,
      content: 'orthogonal',
      embedding: BaseEmbeddingEngine.serialize(new Float32Array([0, 1])),
    });
    const memB = makeMemory({
      id: 2,
      content: 'partial',
      embedding: BaseEmbeddingEngine.serialize(new Float32Array([0.6, 0.8])),
    });
    const memC = makeMemory({
      id: 3,
      content: 'identical',
      embedding: BaseEmbeddingEngine.serialize(new Float32Array([1, 0])),
    });

    engine.memoriesWithEmbeddings = [memA, memB, memC];

    const results = await engine.semanticRecall('test query', 10);

    // Should be sorted by similarity descending: C, B, A
    expect(results.map(r => r.id)).toEqual([3, 2, 1]);
    // textSearch should NOT have been called
    expect(engine.textSearchCalls.length).toBe(0);
  });

  it('semanticRecall respects the limit parameter', async () => {
    vi.useRealTimers();

    const engine = new TestMemoryEngine(DEFAULT_CONFIG);

    const mockEmbeddingEngine = {
      isReady: () => true,
      embed: vi.fn().mockResolvedValue(new Float32Array([1, 0])),
    } as unknown as BaseEmbeddingEngine;

    engine.setEmbeddingEngine(mockEmbeddingEngine);

    engine.memoriesWithEmbeddings = [
      makeMemory({ id: 1, embedding: BaseEmbeddingEngine.serialize(new Float32Array([1, 0])) }),
      makeMemory({ id: 2, embedding: BaseEmbeddingEngine.serialize(new Float32Array([0.9, 0.1])) }),
      makeMemory({ id: 3, embedding: BaseEmbeddingEngine.serialize(new Float32Array([0.5, 0.5])) }),
    ];

    const results = await engine.semanticRecall('query', 2);
    expect(results.length).toBe(2);
  });

  it('semanticRecall falls back to textSearch when embed() throws', async () => {
    vi.useRealTimers();

    const engine = new TestMemoryEngine(DEFAULT_CONFIG);

    const mockEmbeddingEngine = {
      isReady: () => true,
      embed: vi.fn().mockRejectedValue(new Error('embedding failed')),
    } as unknown as BaseEmbeddingEngine;

    engine.setEmbeddingEngine(mockEmbeddingEngine);

    const expected = [makeMemory({ id: 10, content: 'text fallback' })];
    engine.textSearchResults = expected;

    const results = await engine.semanticRecall('broken query', 5);
    expect(results).toEqual(expected);
    expect(engine.textSearchCalls).toEqual([{ query: 'broken query', limit: 5 }]);
  });

  it('semanticRecall uses default limit of 10', async () => {
    vi.useRealTimers();

    const engine = new TestMemoryEngine(DEFAULT_CONFIG);
    engine.textSearchResults = [];

    await engine.semanticRecall('query');
    expect(engine.textSearchCalls).toEqual([{ query: 'query', limit: 10 }]);
  });
});
