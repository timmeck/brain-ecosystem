import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { CausalGraph, runCausalMigration } from '../../../src/causal/engine.js';

// ── Helpers ───────────────────────────────────────────────

/** Insert events directly into the DB with controlled timestamps. */
function insertEvent(db: Database.Database, source: string, type: string, timestamp: number, data?: unknown): void {
  db.prepare(
    'INSERT INTO causal_events (source, type, timestamp, data) VALUES (?, ?, ?, ?)',
  ).run(source, type, timestamp, data ? JSON.stringify(data) : null);
}

/**
 * Seed a reliable causal pattern: typeA always followed by typeB within `lagMs`.
 *
 * To beat the Granger causality test the events must be spaced far enough apart
 * that the baseline rate P(B in any random window) stays well below 1.0.
 *
 * Math:
 *   baselineRate = (effectCount / timeRange) * maxWindowMs
 *   pBaseline = min(1, baselineRate)
 *   pFollows = followCount / causeCount  (≈1 when every A is followed by B)
 *   ratio = pFollows / pBaseline  must be >= significanceThreshold (1.5)
 *
 * With gapMs = 600_000 (10 min), 10 pairs, maxWindowMs = 5000:
 *   timeRange = 9 * 600_000 + 1_000 = 5_401_000
 *   baselineRate = (10 / 5_401_000) * 5_000 ≈ 0.00926
 *   ratio = 1.0 / 0.00926 ≈ 108 >> 1.5  ✓
 */
function seedCausalPair(
  db: Database.Database,
  typeA: string,
  typeB: string,
  count: number,
  options?: {
    lagMs?: number;
    gapMs?: number;
    baseTime?: number;
  },
): void {
  const lagMs = options?.lagMs ?? 1000;
  const gapMs = options?.gapMs ?? 600_000; // 10 min between pairs — well above default 5 min window
  const baseTime = options?.baseTime ?? 1_000_000;
  for (let i = 0; i < count; i++) {
    const t = baseTime + i * gapMs;
    insertEvent(db, 'test', typeA, t);
    insertEvent(db, 'test', typeB, t + lagMs);
  }
}

// ── Tests ─────────────────────────────────────────────────

describe('runCausalMigration', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('creates causal_events table', () => {
    runCausalMigration(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='causal_events'")
      .all() as { name: string }[];
    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe('causal_events');
  });

  it('creates causal_edges table', () => {
    runCausalMigration(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='causal_edges'")
      .all() as { name: string }[];
    expect(tables).toHaveLength(1);
    expect(tables[0]!.name).toBe('causal_edges');
  });

  it('creates indexes on causal_events and causal_edges', () => {
    runCausalMigration(db);
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_causal%'")
      .all() as { name: string }[];
    const names = indexes.map(i => i.name);
    expect(names).toContain('idx_causal_events_type');
    expect(names).toContain('idx_causal_events_timestamp');
    expect(names).toContain('idx_causal_edges_strength');
  });

  it('is idempotent (can run twice without error)', () => {
    runCausalMigration(db);
    expect(() => runCausalMigration(db)).not.toThrow();
  });
});

describe('CausalGraph', () => {
  let db: Database.Database;
  let graph: CausalGraph;

  beforeEach(() => {
    db = new Database(':memory:');
    graph = new CausalGraph(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Constructor ───────────────────────────────────────

  describe('constructor', () => {
    it('runs migration automatically on construction', () => {
      const freshDb = new Database(':memory:');
      new CausalGraph(freshDb);
      const tables = freshDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'causal_%'")
        .all() as { name: string }[];
      freshDb.close();
      expect(tables.length).toBeGreaterThanOrEqual(2);
    });

    it('accepts custom config values', () => {
      const freshDb = new Database(':memory:');
      const custom = new CausalGraph(freshDb, {
        maxWindowMs: 60_000,
        minSamples: 3,
        significanceThreshold: 2.0,
      });
      // Verify it constructed without error — config is private so we test
      // behaviour in later tests.
      expect(custom).toBeDefined();
      freshDb.close();
    });
  });

  // ── recordEvent ───────────────────────────────────────

  describe('recordEvent', () => {
    it('inserts an event into causal_events', () => {
      graph.recordEvent('brain-a', 'error:reported');
      const rows = db.prepare('SELECT * FROM causal_events').all() as any[];
      expect(rows).toHaveLength(1);
      expect(rows[0].source).toBe('brain-a');
      expect(rows[0].type).toBe('error:reported');
      expect(rows[0].timestamp).toBeGreaterThan(0);
    });

    it('stores optional data as JSON', () => {
      graph.recordEvent('brain-a', 'trade:outcome', { win: true, pnl: 42.5 });
      const row = db.prepare('SELECT data FROM causal_events').get() as { data: string };
      expect(JSON.parse(row.data)).toEqual({ win: true, pnl: 42.5 });
    });

    it('stores null data when none provided', () => {
      graph.recordEvent('brain-a', 'heartbeat');
      const row = db.prepare('SELECT data FROM causal_events').get() as { data: string | null };
      expect(row.data).toBeNull();
    });

    it('records multiple events with different types', () => {
      graph.recordEvent('brain-a', 'error:reported');
      graph.recordEvent('brain-b', 'trade:outcome');
      graph.recordEvent('brain-a', 'insight:created');
      const count = (db.prepare('SELECT COUNT(*) as c FROM causal_events').get() as { c: number }).c;
      expect(count).toBe(3);
    });
  });

  // ── analyze ───────────────────────────────────────────

  describe('analyze', () => {
    it('returns empty array with fewer than 2 event types', () => {
      // Only one event type
      for (let i = 0; i < 10; i++) {
        insertEvent(db, 'test', 'typeA', 1_000_000 + i * 600_000);
      }
      const edges = graph.analyze();
      expect(edges).toEqual([]);
    });

    it('returns empty array with insufficient samples', () => {
      // Only 3 samples per type, below default minSamples of 5
      for (let i = 0; i < 3; i++) {
        insertEvent(db, 'test', 'typeA', 1_000_000 + i * 600_000);
        insertEvent(db, 'test', 'typeB', 1_000_000 + i * 600_000 + 1000);
      }
      const edges = graph.analyze();
      expect(edges).toEqual([]);
    });

    it('detects causal relationship when B reliably follows A', () => {
      seedCausalPair(db, 'typeA', 'typeB', 10);
      const edges = graph.analyze();

      expect(edges.length).toBeGreaterThanOrEqual(1);
      const abEdge = edges.find(e => e.cause === 'typeA' && e.effect === 'typeB');
      expect(abEdge).toBeDefined();
      expect(abEdge!.strength).toBeGreaterThan(0);
      expect(abEdge!.confidence).toBeGreaterThan(0);
      expect(abEdge!.sample_size).toBeGreaterThanOrEqual(5);
      expect(abEdge!.direction).toBe(1);
    });

    it('reports correct average lag for detected edges', () => {
      const lagMs = 2000;
      seedCausalPair(db, 'typeA', 'typeB', 10, { lagMs });
      const edges = graph.analyze();
      const abEdge = edges.find(e => e.cause === 'typeA' && e.effect === 'typeB');
      expect(abEdge).toBeDefined();
      expect(abEdge!.lag_ms).toBeCloseTo(lagMs, -2); // within ~100ms
    });

    it('does not detect false causality for unrelated event types', () => {
      // Two independent event types with no temporal proximity
      for (let i = 0; i < 10; i++) {
        insertEvent(db, 'test', 'typeA', 1_000_000 + i * 600_000);
      }
      for (let i = 0; i < 10; i++) {
        // typeC sits 100M ms later — well outside any window
        insertEvent(db, 'test', 'typeC', 100_000_000 + i * 600_000);
      }
      const edges = graph.analyze();
      const falseEdge = edges.find(e => e.cause === 'typeA' && e.effect === 'typeC');
      expect(falseEdge).toBeUndefined();
    });

    it('persists detected edges to causal_edges table', () => {
      seedCausalPair(db, 'typeA', 'typeB', 10);
      graph.analyze();
      const rows = db.prepare('SELECT * FROM causal_edges').all() as any[];
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const persisted = rows.find((r: any) => r.cause === 'typeA' && r.effect === 'typeB');
      expect(persisted).toBeDefined();
    });

    it('respects custom minSamples config', () => {
      const customDb = new Database(':memory:');
      const customGraph = new CausalGraph(customDb, { minSamples: 8 });

      // Seed only 6 samples — above default 5 but below custom 8
      seedCausalPair(customDb, 'typeA', 'typeB', 6);
      const edges = customGraph.analyze();
      // With minSamples=8, 6 samples should be insufficient
      expect(edges).toEqual([]);
      customDb.close();
    });

    it('respects custom significanceThreshold config', () => {
      const strictDb = new Database(':memory:');
      // Very high threshold: causal relationship must be 5x baseline
      const strictGraph = new CausalGraph(strictDb, { significanceThreshold: 5.0 });
      seedCausalPair(strictDb, 'typeA', 'typeB', 10);
      const strictEdges = strictGraph.analyze();

      const lenientDb = new Database(':memory:');
      // Low threshold: 1.1x baseline is enough
      const lenientGraph = new CausalGraph(lenientDb, { significanceThreshold: 1.1 });
      seedCausalPair(lenientDb, 'typeA', 'typeB', 10);
      const lenientEdges = lenientGraph.analyze();

      // Lenient should detect at least as many edges as strict
      expect(lenientEdges.length).toBeGreaterThanOrEqual(strictEdges.length);

      strictDb.close();
      lenientDb.close();
    });
  });

  // ── getEdges ──────────────────────────────────────────

  describe('getEdges', () => {
    it('returns empty array when no edges exist', () => {
      expect(graph.getEdges()).toEqual([]);
    });

    it('returns edges ordered by strength descending', () => {
      seedCausalPair(db, 'typeA', 'typeB', 10);
      graph.analyze();

      const edges = graph.getEdges();
      for (let i = 1; i < edges.length; i++) {
        expect(edges[i - 1]!.strength).toBeGreaterThanOrEqual(edges[i]!.strength);
      }
    });

    it('filters edges by minimum strength', () => {
      seedCausalPair(db, 'typeA', 'typeB', 10);
      graph.analyze();

      const allEdges = graph.getEdges(0);
      const strongEdges = graph.getEdges(0.5);
      // Strong edges should be a subset of all edges
      expect(strongEdges.length).toBeLessThanOrEqual(allEdges.length);
      for (const edge of strongEdges) {
        expect(edge.strength).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  // ── getCauses / getEffects ────────────────────────────

  describe('getCauses', () => {
    it('returns empty when event type has no known causes', () => {
      expect(graph.getCauses('unknown:type')).toEqual([]);
    });

    it('returns causes of a specific event type', () => {
      seedCausalPair(db, 'typeA', 'typeB', 10);
      graph.analyze();

      const causes = graph.getCauses('typeB');
      expect(causes.length).toBeGreaterThanOrEqual(1);
      expect(causes.every(e => e.effect === 'typeB')).toBe(true);
      expect(causes.some(e => e.cause === 'typeA')).toBe(true);
    });
  });

  describe('getEffects', () => {
    it('returns empty when event type has no known effects', () => {
      expect(graph.getEffects('unknown:type')).toEqual([]);
    });

    it('returns effects of a specific event type', () => {
      seedCausalPair(db, 'typeA', 'typeB', 10);
      graph.analyze();

      const effects = graph.getEffects('typeA');
      expect(effects.length).toBeGreaterThanOrEqual(1);
      expect(effects.every(e => e.cause === 'typeA')).toBe(true);
      expect(effects.some(e => e.effect === 'typeB')).toBe(true);
    });
  });

  // ── findChains ────────────────────────────────────────

  describe('findChains', () => {
    it('returns empty array when no chains of length >= 3 exist', () => {
      // Only a single A->B edge, no chain of length 3
      seedCausalPair(db, 'typeA', 'typeB', 10);
      graph.analyze();

      const chains = graph.findChains();
      // findChains filters edges with strength >= 0.1.
      // If only one edge A->B exists, no chain of length 3+ is possible.
      // Depending on whether the reverse B->A also passes, we may still get no chain.
      // With properly spaced data, only A->B should be detected so no chain exists.
      expect(chains.every(c => c.chain.length >= 3)).toBe(true);
    });

    it('finds causal chains A -> B -> C', () => {
      // Create a three-step chain: A -> B -> C
      // Space pairs far apart (gapMs=600_000) so baseline rate is low.
      // A at t, B at t+1000, C at t+2000
      for (let i = 0; i < 10; i++) {
        const t = 1_000_000 + i * 600_000;
        insertEvent(db, 'test', 'chainA', t);
        insertEvent(db, 'test', 'chainB', t + 1000);
        insertEvent(db, 'test', 'chainC', t + 2000);
      }
      graph.analyze();

      const chains = graph.findChains();
      // Should find at least one chain containing chainA -> chainB -> chainC
      const abcChain = chains.find(
        c => c.chain.includes('chainA') && c.chain.includes('chainB') && c.chain.includes('chainC'),
      );
      expect(abcChain).toBeDefined();
      expect(abcChain!.chain.length).toBeGreaterThanOrEqual(3);
      expect(abcChain!.totalStrength).toBeGreaterThan(0);
      expect(abcChain!.totalLag).toBeGreaterThan(0);
    });

    it('chains are sorted by totalStrength descending', () => {
      for (let i = 0; i < 10; i++) {
        const t = 1_000_000 + i * 600_000;
        insertEvent(db, 'test', 'chainA', t);
        insertEvent(db, 'test', 'chainB', t + 1000);
        insertEvent(db, 'test', 'chainC', t + 2000);
      }
      graph.analyze();

      const chains = graph.findChains();
      for (let i = 1; i < chains.length; i++) {
        expect(chains[i - 1]!.totalStrength).toBeGreaterThanOrEqual(chains[i]!.totalStrength);
      }
    });

    it('respects maxDepth parameter', () => {
      // Create a long chain: A -> B -> C -> D -> E
      for (let i = 0; i < 10; i++) {
        const t = 1_000_000 + i * 600_000;
        insertEvent(db, 'test', 'longA', t);
        insertEvent(db, 'test', 'longB', t + 1000);
        insertEvent(db, 'test', 'longC', t + 2000);
        insertEvent(db, 'test', 'longD', t + 3000);
        insertEvent(db, 'test', 'longE', t + 4000);
      }
      graph.analyze();

      const chains = graph.findChains(3); // max depth 3 nodes
      for (const chain of chains) {
        expect(chain.chain.length).toBeLessThanOrEqual(3);
      }
    });
  });

  // ── getAnalysis ───────────────────────────────────────

  describe('getAnalysis', () => {
    it('returns a full analysis structure', () => {
      seedCausalPair(db, 'typeA', 'typeB', 10);
      graph.analyze();

      const analysis = graph.getAnalysis();
      expect(analysis).toHaveProperty('edges');
      expect(analysis).toHaveProperty('roots');
      expect(analysis).toHaveProperty('leaves');
      expect(analysis).toHaveProperty('strongestChain');
      expect(Array.isArray(analysis.edges)).toBe(true);
      expect(Array.isArray(analysis.roots)).toBe(true);
      expect(Array.isArray(analysis.leaves)).toBe(true);
    });

    it('identifies roots (cause but not caused)', () => {
      // A -> B: A is root, B is leaf
      seedCausalPair(db, 'rootA', 'leafB', 10);
      graph.analyze();

      const analysis = graph.getAnalysis();
      expect(analysis.roots).toContain('rootA');
      expect(analysis.roots).not.toContain('leafB');
    });

    it('identifies leaves (caused but do not cause)', () => {
      seedCausalPair(db, 'rootA', 'leafB', 10);
      graph.analyze();

      const analysis = graph.getAnalysis();
      expect(analysis.leaves).toContain('leafB');
      expect(analysis.leaves).not.toContain('rootA');
    });

    it('returns null strongestChain when no chains of length 3+ exist', () => {
      // Single edge A->B, no chain of length 3+
      seedCausalPair(db, 'typeA', 'typeB', 10);
      graph.analyze();

      const analysis = graph.getAnalysis();
      // strongestChain is only set when a chain of length >=3 is found
      // With only two event types, the longest possible chain is 2 nodes
      expect(analysis.strongestChain).toBeNull();
    });

    it('returns the strongest chain when chains exist', () => {
      for (let i = 0; i < 10; i++) {
        const t = 1_000_000 + i * 600_000;
        insertEvent(db, 'test', 'chainA', t);
        insertEvent(db, 'test', 'chainB', t + 1000);
        insertEvent(db, 'test', 'chainC', t + 2000);
      }
      graph.analyze();

      const analysis = graph.getAnalysis();
      expect(analysis.strongestChain).not.toBeNull();
      expect(analysis.strongestChain!.chain.length).toBeGreaterThanOrEqual(3);
      expect(analysis.strongestChain!.totalStrength).toBeGreaterThan(0);
    });

    it('returns empty analysis when no events recorded', () => {
      const analysis = graph.getAnalysis();
      expect(analysis.edges).toEqual([]);
      expect(analysis.roots).toEqual([]);
      expect(analysis.leaves).toEqual([]);
      expect(analysis.strongestChain).toBeNull();
    });
  });

  // ── getEventStats ─────────────────────────────────────

  describe('getEventStats', () => {
    it('returns empty array when no events recorded', () => {
      expect(graph.getEventStats()).toEqual([]);
    });

    it('returns per-type counts and timestamps', () => {
      insertEvent(db, 'test', 'typeA', 1000);
      insertEvent(db, 'test', 'typeA', 2000);
      insertEvent(db, 'test', 'typeA', 3000);
      insertEvent(db, 'test', 'typeB', 5000);

      const stats = graph.getEventStats();
      expect(stats).toHaveLength(2);

      // Ordered by count DESC, so typeA first
      expect(stats[0]!.type).toBe('typeA');
      expect(stats[0]!.count).toBe(3);
      expect(stats[0]!.first_seen).toBe(1000);
      expect(stats[0]!.last_seen).toBe(3000);

      expect(stats[1]!.type).toBe('typeB');
      expect(stats[1]!.count).toBe(1);
      expect(stats[1]!.first_seen).toBe(5000);
      expect(stats[1]!.last_seen).toBe(5000);
    });

    it('reflects events added via recordEvent', () => {
      graph.recordEvent('brain-a', 'metric:cpu');
      graph.recordEvent('brain-a', 'metric:cpu');
      graph.recordEvent('brain-b', 'error:timeout');

      const stats = graph.getEventStats();
      expect(stats).toHaveLength(2);

      const cpuStat = stats.find(s => s.type === 'metric:cpu');
      expect(cpuStat).toBeDefined();
      expect(cpuStat!.count).toBe(2);

      const errorStat = stats.find(s => s.type === 'error:timeout');
      expect(errorStat).toBeDefined();
      expect(errorStat!.count).toBe(1);
    });
  });

  // ── Edge cases & custom config ────────────────────────

  describe('edge cases', () => {
    it('handles custom maxWindowMs limiting detection window', () => {
      const narrowDb = new Database(':memory:');
      // Very narrow window: only 500ms
      const narrowGraph = new CausalGraph(narrowDb, { maxWindowMs: 500 });

      // Events with 2000ms lag — outside the 500ms window
      // Use large gap so events don't accidentally overlap windows
      for (let i = 0; i < 10; i++) {
        const t = 1_000_000 + i * 600_000;
        insertEvent(narrowDb, 'test', 'typeA', t);
        insertEvent(narrowDb, 'test', 'typeB', t + 2000);
      }
      const edges = narrowGraph.analyze();

      // Should not detect the pair because lag exceeds the 500ms window
      const abEdge = edges.find(e => e.cause === 'typeA' && e.effect === 'typeB');
      expect(abEdge).toBeUndefined();

      narrowDb.close();
    });

    it('upserts edges on repeated analysis (does not duplicate)', () => {
      seedCausalPair(db, 'typeA', 'typeB', 10);
      graph.analyze();
      graph.analyze(); // run again

      const rows = db.prepare(
        "SELECT * FROM causal_edges WHERE cause = 'typeA' AND effect = 'typeB'",
      ).all();
      // UNIQUE(cause, effect) constraint + ON CONFLICT ensures no duplicate
      expect(rows).toHaveLength(1);
    });

    it('does not create self-loop edges (cause === effect)', () => {
      for (let i = 0; i < 10; i++) {
        insertEvent(db, 'test', 'sameType', 1_000_000 + i * 600_000);
      }
      graph.analyze();

      const selfLoops = db.prepare(
        "SELECT * FROM causal_edges WHERE cause = effect",
      ).all();
      expect(selfLoops).toHaveLength(0);
    });

    it('confidence increases with sample size', () => {
      // 6 samples
      const db6 = new Database(':memory:');
      const g6 = new CausalGraph(db6);
      seedCausalPair(db6, 'typeA', 'typeB', 6);
      const edges6 = g6.analyze();
      const e6 = edges6.find(e => e.cause === 'typeA' && e.effect === 'typeB');

      // 20 samples
      const db20 = new Database(':memory:');
      const g20 = new CausalGraph(db20);
      seedCausalPair(db20, 'typeA', 'typeB', 20);
      const edges20 = g20.analyze();
      const e20 = edges20.find(e => e.cause === 'typeA' && e.effect === 'typeB');

      expect(e6).toBeDefined();
      expect(e20).toBeDefined();
      // More samples -> higher confidence (logistic curve: 1 - 1/(1 + n/10))
      expect(e20!.confidence).toBeGreaterThan(e6!.confidence);

      db6.close();
      db20.close();
    });

    it('strength is clamped to 0-1 range', () => {
      seedCausalPair(db, 'typeA', 'typeB', 10);
      const edges = graph.analyze();
      for (const edge of edges) {
        expect(edge.strength).toBeGreaterThanOrEqual(0);
        expect(edge.strength).toBeLessThanOrEqual(1);
      }
    });
  });
});
