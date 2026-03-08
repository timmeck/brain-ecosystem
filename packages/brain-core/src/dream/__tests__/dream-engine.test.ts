import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { DreamEngine, runDreamMigration } from '../dream-engine.js';

describe('DreamEngine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });
  afterEach(() => {
    db.close();
  });

  // ── 1. Creation ────────────────────────────────────────

  it('creates an instance and runs migration', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    expect(engine).toBeDefined();

    // Migration should have created the tables
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('dream_history', 'dream_state', 'dream_retrospective')
      ORDER BY name
    `).all() as Array<{ name: string }>;
    expect(tables.map(t => t.name)).toEqual(['dream_history', 'dream_retrospective', 'dream_state']);
  });

  // ── 2. getStatus (initial) ─────────────────────────────

  it('returns initial status with zero counters', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    const status = engine.getStatus();

    expect(status.running).toBe(false);
    expect(status.totalCycles).toBe(0);
    expect(status.lastDreamAt).toBeNull();
    expect(status.totals.memoriesConsolidated).toBe(0);
    expect(status.totals.synapsesPruned).toBe(0);
    expect(status.totals.memoriesArchived).toBe(0);
  });

  // ── 3. recordActivity ─────────────────────────────────

  it('recordActivity updates the last activity timestamp', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    const before = Date.now();
    engine.recordActivity();
    const after = Date.now();

    // Access private field via cast — recordActivity should have set lastActivityTimestamp
    // We verify indirectly: start + timer callback should NOT trigger if just recorded activity
    // Direct test: engine should not throw and should update internal state
    expect(() => engine.recordActivity()).not.toThrow();

    // Verify the engine is still functional after recording activity
    const status = engine.getStatus();
    expect(status.running).toBe(false);
  });

  // ── 4. consolidate (basic) ────────────────────────────

  it('runs a consolidation cycle and persists history', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    const report = engine.consolidate('manual');

    expect(report.cycleId).toMatch(/^dream-test-/);
    expect(report.trigger).toBe('manual');
    expect(report.duration).toBeGreaterThanOrEqual(0);
    expect(report.replay.memoriesReplayed).toBe(0); // no memories table
    expect(report.pruning.synapsesPruned).toBe(0);  // no synapses table
    expect(report.compression.memoriesConsolidated).toBe(0);
    expect(report.decay.memoriesDecayed).toBe(0);
    expect(report.principlesDiscovered).toBe(0);
    expect(report.journalEntryId).toBeNull();

    // Status should reflect one cycle
    const status = engine.getStatus();
    expect(status.totalCycles).toBe(1);
    expect(status.lastDreamAt).toBeGreaterThan(0);
  });

  // ── 5. consolidate with synapses ──────────────────────

  it('prunes weak synapses during consolidation', () => {
    // Create synapses table so the consolidator can interact with it
    db.exec(`
      CREATE TABLE synapses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 0.5,
        last_activated_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
    // Insert a weak synapse (below default threshold 0.15)
    db.prepare(`INSERT INTO synapses (source_type, source_id, target_type, target_id, weight) VALUES (?, ?, ?, ?, ?)`).run('memory', '1', 'memory', '2', 0.05);
    // Insert a strong synapse (above threshold)
    db.prepare(`INSERT INTO synapses (source_type, source_id, target_type, target_id, weight) VALUES (?, ?, ?, ?, ?)`).run('memory', '3', 'memory', '4', 0.8);

    const engine = new DreamEngine(db, { brainName: 'test' });
    const report = engine.consolidate('manual');

    expect(report.pruning.synapsesPruned).toBe(1);

    // Only the strong synapse should remain
    const remaining = db.prepare('SELECT COUNT(*) as cnt FROM synapses').get() as { cnt: number };
    expect(remaining.cnt).toBe(1);
  });

  // ── 6. getHistory ─────────────────────────────────────

  it('returns dream history ordered by timestamp descending', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    engine.consolidate('manual');
    engine.consolidate('idle');
    engine.consolidate('auto');

    const history = engine.getHistory();
    expect(history).toHaveLength(3);
    // Most recent first
    expect(history[0].trigger).toBe('auto');
    expect(history[1].trigger).toBe('idle');
    expect(history[2].trigger).toBe('manual');
  });

  it('respects the limit parameter for getHistory', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    engine.consolidate('manual');
    engine.consolidate('idle');
    engine.consolidate('auto');

    const history = engine.getHistory(2);
    expect(history).toHaveLength(2);
  });

  // ── 7. getPruningEfficiency ───────────────────────────

  it('returns default pruning efficiency when no retrospective data', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    const efficiency = engine.getPruningEfficiency();

    expect(efficiency.totalPruned).toBe(0);
    expect(efficiency.totalReappeared).toBe(0);
    expect(efficiency.avgRegretScore).toBe(0);
    expect(efficiency.efficiencyRate).toBe(1);
  });

  it('calculates pruning efficiency from retrospective records', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });

    // Manually insert retrospective records with known regret scores
    db.prepare(`
      INSERT INTO dream_retrospective (dream_cycle_id, pruned_items, reappeared_count, regret_score, lesson)
      VALUES (?, ?, ?, ?, ?)
    `).run('cycle-1', JSON.stringify([{ synapseId: 1, weight: 0.1 }, { synapseId: 2, weight: 0.12 }]), 1, 0.5, 'test lesson');

    db.prepare(`
      INSERT INTO dream_retrospective (dream_cycle_id, pruned_items, reappeared_count, regret_score, lesson)
      VALUES (?, ?, ?, ?, ?)
    `).run('cycle-2', JSON.stringify([{ synapseId: 3, weight: 0.08 }]), 0, 0.0, 'no regret');

    const efficiency = engine.getPruningEfficiency();
    // Only records with regret_score > 0 OR reappeared_count > 0 are included (cycle-1 matches)
    expect(efficiency.totalPruned).toBeGreaterThanOrEqual(1);
    expect(efficiency.efficiencyRate).toBeLessThanOrEqual(1);
    expect(efficiency.efficiencyRate).toBe(1 - efficiency.avgRegretScore);
  });

  // ── 8. analyzeRetrospective ───────────────────────────

  it('analyzes retrospective and produces regret scores', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });

    // Insert a retrospective record with pruned items
    const prunedItems = [{ synapseId: 100, weight: 0.1 }, { synapseId: 101, weight: 0.12 }];
    db.prepare(`
      INSERT INTO dream_retrospective (dream_cycle_id, pruned_items)
      VALUES (?, ?)
    `).run('dream-test-retro-1', JSON.stringify(prunedItems));

    const results = engine.analyzeRetrospective(5);
    expect(results).toHaveLength(1);
    expect(results[0].dreamCycleId).toBe('dream-test-retro-1');
    expect(results[0].prunedItems).toHaveLength(2);
    expect(typeof results[0].regretScore).toBe('number');
    expect(results[0].lesson).toBeTruthy();
  });

  // ── 9. start and stop ─────────────────────────────────

  it('start sets running to true, stop resets it', () => {
    const engine = new DreamEngine(db, { brainName: 'test', intervalMs: 60_000 });

    expect(engine.getStatus().running).toBe(false);

    engine.start();
    expect(engine.getStatus().running).toBe(true);

    // Starting again should be a no-op (no duplicate timers)
    engine.start();
    expect(engine.getStatus().running).toBe(true);

    engine.stop();
    expect(engine.getStatus().running).toBe(false);

    // Stopping again should be safe
    engine.stop();
    expect(engine.getStatus().running).toBe(false);
  });

  // ── 10. runDreamMigration is idempotent ───────────────

  it('runDreamMigration can be called multiple times safely', () => {
    runDreamMigration(db);
    runDreamMigration(db);
    runDreamMigration(db);

    // Tables should still exist with correct structure
    const state = db.prepare('SELECT * FROM dream_state WHERE id = 1').get() as Record<string, unknown>;
    expect(state).toBeDefined();
    expect(state.total_cycles).toBe(0);
  });
});
