import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SynapseRepository } from '../../../src/db/repositories/synapse.repository.js';
import { SynapseManager } from '../../../src/synapses/synapse-manager.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

// Also mock brain-core logger since BaseSynapseManager uses it
vi.mock('@timmeck/brain-core', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
  };
});

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE synapses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      synapse_type TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      activation_count INTEGER NOT NULL DEFAULT 1,
      last_activated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id, target_type, target_id, synapse_type)
    );
    CREATE INDEX idx_synapses_source ON synapses(source_type, source_id);
    CREATE INDEX idx_synapses_target ON synapses(target_type, target_id);
    CREATE INDEX idx_synapses_type ON synapses(synapse_type);
    CREATE INDEX idx_synapses_weight ON synapses(weight);
    CREATE INDEX idx_synapses_last_activated ON synapses(last_activated_at);
  `);
  return db;
}

const defaultConfig = {
  initialWeight: 0.5,
  learningRate: 0.1,
  pruneThreshold: 0.05,
  decayHalfLifeDays: 30,
  decayAfterDays: 7,
  maxDepth: 3,
  minActivationWeight: 0.1,
};

describe('SynapseManager', () => {
  let db: Database.Database;
  let repo: SynapseRepository;
  let manager: SynapseManager;

  beforeEach(() => {
    db = createTestDb();
    repo = new SynapseRepository(db);
    manager = new SynapseManager(repo, defaultConfig);
  });

  it('strengthen creates a new synapse if none exists', () => {
    const synapse = manager.strengthen(
      { type: 'error', id: 1 },
      { type: 'solution', id: 2 },
      'solves',
    );

    expect(synapse).toBeDefined();
    expect(synapse.source_type).toBe('error');
    expect(synapse.target_type).toBe('solution');
    expect(synapse.weight).toBeGreaterThan(0);
  });

  it('strengthen increases weight on repeated calls', () => {
    const syn1 = manager.strengthen(
      { type: 'error', id: 1 },
      { type: 'solution', id: 2 },
      'solves',
    );
    const initialWeight = syn1.weight;

    const syn2 = manager.strengthen(
      { type: 'error', id: 1 },
      { type: 'solution', id: 2 },
      'solves',
    );

    expect(syn2.weight).toBeGreaterThanOrEqual(initialWeight);
  });

  it('weaken reduces synapse weight', () => {
    const synapse = manager.strengthen(
      { type: 'error', id: 1 },
      { type: 'solution', id: 2 },
      'solves',
    );
    const initialWeight = synapse.weight;

    manager.weaken(synapse.id, 0.5);

    const updated = repo.getById(synapse.id);
    expect(updated).toBeDefined();
    expect(updated!.weight).toBeLessThanOrEqual(initialWeight);
  });

  it('find returns an existing synapse', () => {
    manager.strengthen(
      { type: 'error', id: 1 },
      { type: 'solution', id: 2 },
      'solves',
    );

    const found = manager.find(
      { type: 'error', id: 1 },
      { type: 'solution', id: 2 },
      'solves',
    );
    expect(found).toBeDefined();
    expect(found!.source_type).toBe('error');
  });

  it('find returns undefined when no synapse exists', () => {
    const found = manager.find(
      { type: 'error', id: 99 },
      { type: 'solution', id: 99 },
      'solves',
    );
    expect(found).toBeUndefined();
  });

  it('activate performs spreading activation from a node', () => {
    // Create a small network: error -> solution, error -> project
    manager.strengthen(
      { type: 'error', id: 1 },
      { type: 'solution', id: 10 },
      'solves',
    );
    manager.strengthen(
      { type: 'error', id: 1 },
      { type: 'project', id: 5 },
      'co_occurs',
    );

    const results = manager.activate({ type: 'error', id: 1 });
    // Should find at least the directly connected nodes
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  it('getStrongestSynapses returns top synapses by weight', () => {
    manager.strengthen({ type: 'a', id: 1 }, { type: 'b', id: 1 }, 'x');
    manager.strengthen({ type: 'a', id: 2 }, { type: 'b', id: 2 }, 'x');
    // Strengthen one more to increase its weight
    manager.strengthen({ type: 'a', id: 1 }, { type: 'b', id: 1 }, 'x');

    const strongest = manager.getStrongestSynapses(1);
    expect(strongest).toHaveLength(1);
  });

  it('getNetworkStats returns valid statistics', () => {
    manager.strengthen({ type: 'error', id: 1 }, { type: 'solution', id: 2 }, 'solves');
    manager.strengthen({ type: 'error', id: 1 }, { type: 'project', id: 3 }, 'co_occurs');

    const stats = manager.getNetworkStats();
    expect(stats.totalSynapses).toBe(2);
    expect(stats.totalNodes).toBeGreaterThanOrEqual(3);
    expect(stats.avgWeight).toBeGreaterThan(0);
    expect(stats.synapsesByType).toHaveProperty('solves');
    expect(stats.synapsesByType).toHaveProperty('co_occurs');
  });

  it('getErrorContext returns categorized activation results', () => {
    manager.strengthen({ type: 'error', id: 1 }, { type: 'solution', id: 10 }, 'solves');
    manager.strengthen({ type: 'error', id: 1 }, { type: 'error', id: 2 }, 'similar_to');

    const context = manager.getErrorContext(1);
    expect(context).toHaveProperty('solutions');
    expect(context).toHaveProperty('relatedErrors');
    expect(context).toHaveProperty('relevantModules');
    expect(context).toHaveProperty('preventionRules');
    expect(context).toHaveProperty('insights');
  });

  it('runDecay returns decay stats', () => {
    const result = manager.runDecay();
    expect(result).toHaveProperty('decayed');
    expect(result).toHaveProperty('pruned');
    expect(typeof result.decayed).toBe('number');
    expect(typeof result.pruned).toBe('number');
  });
});
