import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import { SynapseRepository } from '../../../src/db/repositories/synapse.repository.js';

function applyMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS synapses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      synapse_type TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      activation_count INTEGER NOT NULL DEFAULT 1,
      last_activated_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id, target_type, target_id, synapse_type)
    );

    CREATE INDEX IF NOT EXISTS idx_synapses_source ON synapses(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_synapses_target ON synapses(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_synapses_type ON synapses(synapse_type);
    CREATE INDEX IF NOT EXISTS idx_synapses_weight ON synapses(weight);
    CREATE INDEX IF NOT EXISTS idx_synapses_last_activated ON synapses(last_activated_at);
  `);
}

const defaultConfig = {
  initialWeight: 0.5,
  learningRate: 0.1,
  pruneThreshold: 0.05,
  decayHalfLifeDays: 7,
  decayAfterDays: 3,
  maxDepth: 3,
  minActivationWeight: 0.1,
};

describe('SynapseManager', () => {
  let db: Database.Database;
  let repo: SynapseRepository;
  let manager: SynapseManager;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new SynapseRepository(db);
    manager = new SynapseManager(repo, defaultConfig);
  });

  afterEach(() => {
    db.close();
  });

  it('should strengthen a new synapse', () => {
    const syn = manager.strengthen(
      { type: 'post', id: 1 },
      { type: 'campaign', id: 2 },
      'belongs_to',
    );
    expect(syn).toBeDefined();
    expect(syn.source_type).toBe('post');
    expect(syn.target_type).toBe('campaign');
    expect(syn.weight).toBeGreaterThan(0);
  });

  it('should strengthen an existing synapse (increase weight)', () => {
    manager.strengthen({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    const first = repo.findBySourceTarget('post', 1, 'campaign', 2, 'belongs_to');
    const firstWeight = first!.weight;

    manager.strengthen({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    const second = repo.findBySourceTarget('post', 1, 'campaign', 2, 'belongs_to');
    expect(second!.weight).toBeGreaterThan(firstWeight);
  });

  it('should weaken a synapse', () => {
    const syn = manager.strengthen({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    const originalWeight = syn.weight;

    manager.weaken(syn.id, 0.5);
    const weakened = repo.getById(syn.id);
    expect(weakened!.weight).toBeLessThan(originalWeight);
  });

  it('should find a synapse by source, target, and type', () => {
    manager.strengthen({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    const found = manager.find({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    expect(found).toBeDefined();
    expect(found!.source_type).toBe('post');
  });

  it('should return undefined when finding non-existent synapse', () => {
    const found = manager.find({ type: 'post', id: 99 }, { type: 'campaign', id: 99 }, 'belongs_to');
    expect(found).toBeUndefined();
  });

  it('should activate and spread through the network', () => {
    manager.strengthen({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    manager.strengthen({ type: 'post', id: 1 }, { type: 'strategy', id: 3 }, 'improves');

    const activations = manager.activate({ type: 'post', id: 1 });
    expect(activations.length).toBeGreaterThan(0);
  });

  it('should get network stats', () => {
    manager.strengthen({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    const stats = manager.getNetworkStats();
    expect(stats.totalSynapses).toBe(1);
    expect(stats.totalNodes).toBe(2);
    expect(stats.avgWeight).toBeGreaterThan(0);
  });

  it('should get strongest synapses', () => {
    manager.strengthen({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    manager.strengthen({ type: 'post', id: 3 }, { type: 'campaign', id: 4 }, 'belongs_to');

    const strongest = manager.getStrongestSynapses(10);
    expect(strongest.length).toBe(2);
  });

  it('should get post context organized by node type', () => {
    manager.strengthen({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    manager.strengthen({ type: 'post', id: 1 }, { type: 'strategy', id: 3 }, 'improves');

    const context = manager.getPostContext(1);
    expect(context).toHaveProperty('campaigns');
    expect(context).toHaveProperty('similarPosts');
    expect(context).toHaveProperty('strategies');
    expect(context).toHaveProperty('rules');
    expect(context).toHaveProperty('templates');
    expect(context).toHaveProperty('insights');
    expect(context.campaigns.length).toBeGreaterThanOrEqual(1);
  });

  it('should run decay and return results', () => {
    manager.strengthen({ type: 'post', id: 1 }, { type: 'campaign', id: 2 }, 'belongs_to');
    const result = manager.runDecay();
    expect(result).toHaveProperty('decayed');
    expect(result).toHaveProperty('pruned');
  });
});
