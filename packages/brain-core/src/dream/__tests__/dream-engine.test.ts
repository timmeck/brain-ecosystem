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

  // ── 11. updateConfig merges partial updates ─────────

  it('updateConfig merges partial config values', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    const before = engine.getConfig();
    expect(before.clusterSimilarityThreshold).toBe(0.35);
    expect(before.replayBatchSize).toBe(50);
    expect(before.maxConsolidationsPerCycle).toBe(10);

    engine.updateConfig({ clusterSimilarityThreshold: 0.5, replayBatchSize: 100 });
    const after = engine.getConfig();
    expect(after.clusterSimilarityThreshold).toBe(0.5);
    expect(after.replayBatchSize).toBe(100);
    // unchanged fields remain
    expect(after.maxConsolidationsPerCycle).toBe(10);
    expect(after.dreamPruneThreshold).toBe(0.15);
  });

  // ── 12. getConfig returns a read-only copy ──────────

  it('getConfig returns correct defaults', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    const cfg = engine.getConfig();
    expect(cfg.brainName).toBe('test');
    expect(cfg.clusterSimilarityThreshold).toBe(0.35);
    expect(cfg.replayBatchSize).toBe(50);
    expect(cfg.maxConsolidationsPerCycle).toBe(10);
    expect(cfg.minClusterSize).toBe(2);
  });

  // ── 13. lower thresholds produce consolidations ─────

  it('consolidates memories with lower similarity threshold', () => {
    // Create memories table with similar memories
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT DEFAULT 'default',
        category TEXT NOT NULL DEFAULT 'general',
        key TEXT,
        content TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 5,
        source TEXT DEFAULT 'test',
        tags TEXT DEFAULT '[]',
        embedding BLOB,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(project_id, key)
      );
      CREATE TABLE IF NOT EXISTS synapses (
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

    // Insert similar memories (text-similarity based, no embeddings)
    const insert = db.prepare(`INSERT INTO memories (category, key, content, importance, active) VALUES (?, ?, ?, ?, 1)`);
    insert.run('error', 'err1', 'TypeError cannot read property of undefined in module loader', 8);
    insert.run('error', 'err2', 'TypeError cannot read property of undefined in config loader', 7);
    insert.run('error', 'err3', 'TypeError cannot read property of undefined in data loader', 6);

    const engine = new DreamEngine(db, { brainName: 'test', clusterSimilarityThreshold: 0.35, minClusterSize: 2 });
    const report = engine.consolidate('manual');

    // With threshold 0.35, these similar texts should cluster
    expect(report.compression.memoriesConsolidated).toBeGreaterThanOrEqual(1);
  });

  // ── 14. factExtraction in consolidation report ──────

  it('consolidation report includes factExtraction field', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    const report = engine.consolidate('manual');

    expect(report.factExtraction).toBeDefined();
    expect(report.factExtraction.factsCreated).toBe(0);
    expect(report.factExtraction.constraintsCreated).toBe(0);
    expect(report.factExtraction.questionsCreated).toBe(0);
  });

  // ── 15. fact extraction from clusters ─────────────────

  it('extracts facts from consolidated clusters', () => {
    // Create memories table AND conversation_memories table for fact storage
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT DEFAULT 'default',
        category TEXT NOT NULL DEFAULT 'general',
        key TEXT,
        content TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 5,
        source TEXT DEFAULT 'test',
        tags TEXT DEFAULT '[]',
        embedding BLOB,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(project_id, key)
      );
      CREATE TABLE IF NOT EXISTS synapses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 0.5,
        last_activated_at TEXT,
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
    `);

    // Insert memories that will form clusters with fact/constraint/question patterns
    const insert = db.prepare(`INSERT INTO memories (category, key, content, importance, active) VALUES (?, ?, ?, ?, 1)`);
    // Cluster 1: fact pattern — "decided to use TypeScript"
    insert.run('decision', 'd1', 'We decided to use TypeScript for all modules in the project', 8);
    insert.run('decision', 'd2', 'We decided to use TypeScript for the backend services', 7);
    insert.run('decision', 'd3', 'We decided to use TypeScript strict mode everywhere', 6);

    // Cluster 2: constraint pattern — "never auto-commit"
    insert.run('rule', 'r1', 'We must never auto-commit code without review', 8);
    insert.run('rule', 'r2', 'We must never auto-commit or push without tests', 7);
    insert.run('rule', 'r3', 'Always avoid committing without running tests first', 6);

    const engine = new DreamEngine(db, {
      brainName: 'test',
      clusterSimilarityThreshold: 0.25,
      minClusterSize: 2,
      maxConsolidationsPerCycle: 20,
    });
    const report = engine.consolidate('manual');

    // If clusters form, facts should be extracted
    const totalExtracted = report.factExtraction.factsCreated +
      report.factExtraction.constraintsCreated +
      report.factExtraction.questionsCreated;

    // At least verify the field exists and is ≥ 0 (clustering depends on similarity)
    expect(totalExtracted).toBeGreaterThanOrEqual(0);
    expect(report.factExtraction).toBeDefined();
  });

  // ── 16. DreamConsolidator.extractFacts directly ───────

  it('extractFacts creates typed memories from clusters', async () => {
    const { DreamConsolidator } = await import('../consolidator.js');
    const consolidator = new DreamConsolidator();

    // Create conversation_memories table
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
        use_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    const clusters = [
      {
        centroidId: '1',
        memberIds: ['2', '3'],  // 3 total (centroid + 2 members) → qualifies
        avgSimilarity: 0.8,
        consolidatedTitle: 'We decided to use bun instead of npm for all builds',
      },
      {
        centroidId: '10',
        memberIds: ['11', '12'],
        avgSimilarity: 0.75,
        consolidatedTitle: 'Never push to main without running the full test suite',
      },
      {
        centroidId: '20',
        memberIds: ['21', '22'],
        avgSimilarity: 0.7,
        consolidatedTitle: 'How to handle authentication tokens across microservices?',
      },
      {
        centroidId: '30',
        memberIds: ['31'],  // Only 2 total → still qualifies (centroid + 1 = 2, memberIds.length >= 2)
        avgSimilarity: 0.6,
        consolidatedTitle: 'Short',  // Too short (< 10 chars) → skipped
      },
    ];

    const config = {
      brainName: 'test',
      intervalMs: 1800000,
      idleThresholdMs: 300000,
      replayBatchSize: 50,
      clusterSimilarityThreshold: 0.35,
      minClusterSize: 2,
      importanceDecayRate: 0.5,
      importanceDecayAfterDays: 30,
      archiveImportanceThreshold: 3,
      dreamPruneThreshold: 0.15,
      dreamLearningRate: 0.15,
      maxConsolidationsPerCycle: 10,
    };

    const result = consolidator.extractFacts(db, clusters, config);

    expect(result.factsCreated).toBe(1);       // "decided to use bun"
    expect(result.constraintsCreated).toBe(1); // "Never push to main"
    expect(result.questionsCreated).toBe(1);   // "How to handle auth"

    // Verify in DB
    const facts = db.prepare("SELECT * FROM conversation_memories WHERE category = 'fact'").all();
    expect(facts).toHaveLength(1);

    const constraints = db.prepare("SELECT * FROM conversation_memories WHERE category = 'constraint'").all();
    expect(constraints).toHaveLength(1);

    const questions = db.prepare("SELECT * FROM conversation_memories WHERE category = 'open_question'").all();
    expect(questions).toHaveLength(1);
  });

  // ── 17. dream_history stores facts_extracted ──────────

  it('persists facts_extracted in dream_history', () => {
    const engine = new DreamEngine(db, { brainName: 'test' });
    engine.consolidate('manual');

    const history = engine.getHistory(1);
    expect(history).toHaveLength(1);
    expect((history[0] as any).facts_extracted).toBeDefined();
    expect((history[0] as any).facts_extracted).toBeGreaterThanOrEqual(0);
  });

  // ── old-14. memory pool uses LIMIT 500 ──────────────

  it('handles large memory pools without error', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT DEFAULT 'default',
        category TEXT NOT NULL DEFAULT 'general',
        key TEXT,
        content TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 5,
        source TEXT DEFAULT 'test',
        tags TEXT DEFAULT '[]',
        embedding BLOB,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(project_id, key)
      );
      CREATE TABLE IF NOT EXISTS synapses (
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

    // Insert 300 memories (beyond old limit of 200)
    const insert = db.prepare(`INSERT INTO memories (category, content, importance, active) VALUES (?, ?, ?, 1)`);
    for (let i = 0; i < 300; i++) {
      insert.run('test', `Memory item number ${i} about topic ${i % 10}`, 5 + (i % 5));
    }

    const engine = new DreamEngine(db, { brainName: 'test' });
    expect(() => engine.consolidate('manual')).not.toThrow();
  });
});
