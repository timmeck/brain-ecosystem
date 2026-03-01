import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
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

describe('SynapseRepository', () => {
  let db: Database.Database;
  let repo: SynapseRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    applyMigrations(db);
    repo = new SynapseRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should create a synapse and return its id', () => {
    const id = repo.create({
      source_type: 'post', source_id: 1,
      target_type: 'campaign', target_id: 2,
      synapse_type: 'belongs_to', weight: 0.7, metadata: null,
    });
    expect(id).toBe(1);
  });

  it('should retrieve a synapse by id', () => {
    const id = repo.create({
      source_type: 'post', source_id: 1,
      target_type: 'campaign', target_id: 2,
      synapse_type: 'belongs_to', weight: 0.7, metadata: null,
    });
    const syn = repo.getById(id);
    expect(syn).toBeDefined();
    expect(syn!.source_type).toBe('post');
    expect(syn!.source_id).toBe(1);
    expect(syn!.target_type).toBe('campaign');
    expect(syn!.target_id).toBe(2);
    expect(syn!.weight).toBe(0.7);
  });

  it('should return undefined for non-existent synapse id', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('should find a synapse by source, target, and type', () => {
    repo.create({
      source_type: 'post', source_id: 1,
      target_type: 'campaign', target_id: 2,
      synapse_type: 'belongs_to', weight: 0.5, metadata: null,
    });

    const found = repo.findBySourceTarget('post', 1, 'campaign', 2, 'belongs_to');
    expect(found).toBeDefined();
    expect(found!.source_id).toBe(1);
  });

  it('should return undefined when source-target combo not found', () => {
    const found = repo.findBySourceTarget('post', 99, 'campaign', 99, 'belongs_to');
    expect(found).toBeUndefined();
  });

  it('should get outgoing synapses', () => {
    repo.create({ source_type: 'post', source_id: 1, target_type: 'campaign', target_id: 2, synapse_type: 'belongs_to', weight: 0.5, metadata: null });
    repo.create({ source_type: 'post', source_id: 1, target_type: 'strategy', target_id: 3, synapse_type: 'improves', weight: 0.8, metadata: null });
    repo.create({ source_type: 'campaign', source_id: 2, target_type: 'post', target_id: 1, synapse_type: 'belongs_to', weight: 0.3, metadata: null });

    const outgoing = repo.getOutgoing('post', 1);
    expect(outgoing).toHaveLength(2);
  });

  it('should get incoming synapses', () => {
    repo.create({ source_type: 'post', source_id: 1, target_type: 'campaign', target_id: 2, synapse_type: 'belongs_to', weight: 0.5, metadata: null });
    repo.create({ source_type: 'strategy', source_id: 3, target_type: 'campaign', target_id: 2, synapse_type: 'improves', weight: 0.6, metadata: null });

    const incoming = repo.getIncoming('campaign', 2);
    expect(incoming).toHaveLength(2);
  });

  it('should find all connected synapses for a node', () => {
    repo.create({ source_type: 'post', source_id: 1, target_type: 'campaign', target_id: 2, synapse_type: 'belongs_to', weight: 0.5, metadata: null });
    repo.create({ source_type: 'strategy', source_id: 3, target_type: 'post', target_id: 1, synapse_type: 'improves', weight: 0.6, metadata: null });
    repo.create({ source_type: 'campaign', source_id: 2, target_type: 'strategy', target_id: 3, synapse_type: 'recommends', weight: 0.4, metadata: null });

    const connected = repo.findConnected('post', 1);
    expect(connected).toHaveLength(2);
  });

  it('should update a synapse', () => {
    const id = repo.create({
      source_type: 'post', source_id: 1,
      target_type: 'campaign', target_id: 2,
      synapse_type: 'belongs_to', weight: 0.5, metadata: null,
    });
    const updated = repo.update(id, { weight: 0.9 });
    expect(updated).toBe(true);

    const syn = repo.getById(id);
    expect(syn!.weight).toBe(0.9);
  });

  it('should delete a synapse', () => {
    const id = repo.create({
      source_type: 'post', source_id: 1,
      target_type: 'campaign', target_id: 2,
      synapse_type: 'belongs_to', weight: 0.5, metadata: null,
    });
    expect(repo.delete(id)).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
  });

  it('should get top synapses by weight', () => {
    repo.create({ source_type: 'post', source_id: 1, target_type: 'campaign', target_id: 2, synapse_type: 'belongs_to', weight: 0.3, metadata: null });
    repo.create({ source_type: 'post', source_id: 2, target_type: 'campaign', target_id: 3, synapse_type: 'belongs_to', weight: 0.9, metadata: null });

    const top = repo.topByWeight(1);
    expect(top).toHaveLength(1);
    expect(top[0]!.weight).toBe(0.9);
  });

  it('should count total synapses', () => {
    expect(repo.totalCount()).toBe(0);
    repo.create({ source_type: 'post', source_id: 1, target_type: 'campaign', target_id: 2, synapse_type: 'belongs_to', weight: 0.5, metadata: null });
    expect(repo.totalCount()).toBe(1);
  });

  it('should compute average weight', () => {
    repo.create({ source_type: 'post', source_id: 1, target_type: 'campaign', target_id: 2, synapse_type: 'belongs_to', weight: 0.4, metadata: null });
    repo.create({ source_type: 'post', source_id: 2, target_type: 'campaign', target_id: 3, synapse_type: 'belongs_to', weight: 0.8, metadata: null });

    expect(repo.avgWeight()).toBeCloseTo(0.6, 1);
  });

  it('should return 0 for avg weight when no synapses exist', () => {
    expect(repo.avgWeight()).toBe(0);
  });

  it('should count unique nodes', () => {
    repo.create({ source_type: 'post', source_id: 1, target_type: 'campaign', target_id: 2, synapse_type: 'belongs_to', weight: 0.5, metadata: null });
    // nodes: post:1, campaign:2 => 2 unique nodes
    expect(repo.countNodes()).toBe(2);
  });

  it('should count synapses by type', () => {
    repo.create({ source_type: 'post', source_id: 1, target_type: 'campaign', target_id: 2, synapse_type: 'belongs_to', weight: 0.5, metadata: null });
    repo.create({ source_type: 'post', source_id: 2, target_type: 'campaign', target_id: 3, synapse_type: 'belongs_to', weight: 0.5, metadata: null });
    repo.create({ source_type: 'post', source_id: 1, target_type: 'strategy', target_id: 1, synapse_type: 'improves', weight: 0.5, metadata: null });

    const counts = repo.countByType();
    expect(counts['belongs_to']).toBe(2);
    expect(counts['improves']).toBe(1);
  });
});
