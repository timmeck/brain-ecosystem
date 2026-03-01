import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SynapseRepository } from '../../../src/db/repositories/synapse.repository.js';

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

describe('SynapseRepository', () => {
  let db: Database.Database;
  let repo: SynapseRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new SynapseRepository(db);
  });

  it('creates a synapse and retrieves by id', () => {
    const id = repo.create({
      source_type: 'error',
      source_id: 1,
      target_type: 'solution',
      target_id: 2,
      synapse_type: 'solves',
      weight: 0.8,
      metadata: null,
    });
    expect(id).toBe(1);

    const syn = repo.getById(id);
    expect(syn).toBeDefined();
    expect(syn!.source_type).toBe('error');
    expect(syn!.target_type).toBe('solution');
    expect(syn!.weight).toBe(0.8);
  });

  it('updates a synapse', () => {
    const id = repo.create({
      source_type: 'error', source_id: 1, target_type: 'solution', target_id: 2,
      synapse_type: 'solves', weight: 0.5, metadata: null,
    });

    const updated = repo.update(id, { weight: 0.95 });
    expect(updated).toBe(true);

    const syn = repo.getById(id);
    expect(syn!.weight).toBe(0.95);
  });

  it('update returns false with empty data', () => {
    const id = repo.create({
      source_type: 'error', source_id: 1, target_type: 'solution', target_id: 2,
      synapse_type: 'solves', weight: 0.5, metadata: null,
    });
    const result = repo.update(id, {});
    expect(result).toBe(false);
  });

  it('deletes a synapse', () => {
    const id = repo.create({
      source_type: 'error', source_id: 1, target_type: 'solution', target_id: 2,
      synapse_type: 'solves', weight: 0.5, metadata: null,
    });
    expect(repo.delete(id)).toBe(true);
    expect(repo.getById(id)).toBeUndefined();
    // Deleting non-existent returns false
    expect(repo.delete(id)).toBe(false);
  });

  it('getOutgoing and getIncoming', () => {
    repo.create({ source_type: 'error', source_id: 1, target_type: 'solution', target_id: 10, synapse_type: 'solves', weight: 0.7, metadata: null });
    repo.create({ source_type: 'error', source_id: 1, target_type: 'project', target_id: 20, synapse_type: 'co_occurs', weight: 0.5, metadata: null });
    repo.create({ source_type: 'solution', source_id: 5, target_type: 'error', target_id: 1, synapse_type: 'solves', weight: 0.3, metadata: null });

    const outgoing = repo.getOutgoing('error', 1);
    expect(outgoing).toHaveLength(2);
    // sorted by weight DESC
    expect(outgoing[0]!.weight).toBeGreaterThanOrEqual(outgoing[1]!.weight);

    const incoming = repo.getIncoming('error', 1);
    expect(incoming).toHaveLength(1);
    expect(incoming[0]!.source_type).toBe('solution');
  });

  it('findBySourceTarget returns a specific synapse', () => {
    repo.create({ source_type: 'error', source_id: 1, target_type: 'solution', target_id: 2, synapse_type: 'solves', weight: 0.8, metadata: null });
    repo.create({ source_type: 'error', source_id: 1, target_type: 'solution', target_id: 3, synapse_type: 'solves', weight: 0.6, metadata: null });

    const found = repo.findBySourceTarget('error', 1, 'solution', 2, 'solves');
    expect(found).toBeDefined();
    expect(found!.weight).toBe(0.8);

    const notFound = repo.findBySourceTarget('error', 1, 'solution', 99, 'solves');
    expect(notFound).toBeUndefined();
  });

  it('findByWeight filters by weight range', () => {
    repo.create({ source_type: 'a', source_id: 1, target_type: 'b', target_id: 1, synapse_type: 'x', weight: 0.3, metadata: null });
    repo.create({ source_type: 'a', source_id: 2, target_type: 'b', target_id: 2, synapse_type: 'x', weight: 0.7, metadata: null });
    repo.create({ source_type: 'a', source_id: 3, target_type: 'b', target_id: 3, synapse_type: 'x', weight: 0.9, metadata: null });

    const highWeight = repo.findByWeight(0.6);
    expect(highWeight).toHaveLength(2);

    const range = repo.findByWeight(0.5, 0.8);
    expect(range).toHaveLength(1);
    expect(range[0]!.weight).toBe(0.7);
  });

  it('findConnected returns all synapses for a node', () => {
    repo.create({ source_type: 'error', source_id: 5, target_type: 'solution', target_id: 10, synapse_type: 'solves', weight: 0.8, metadata: null });
    repo.create({ source_type: 'project', source_id: 1, target_type: 'error', target_id: 5, synapse_type: 'co_occurs', weight: 0.5, metadata: null });
    repo.create({ source_type: 'rule', source_id: 1, target_type: 'rule', target_id: 2, synapse_type: 'similar_to', weight: 0.4, metadata: null });

    const connected = repo.findConnected('error', 5);
    expect(connected).toHaveLength(2);
  });

  it('topByWeight returns highest weight synapses', () => {
    repo.create({ source_type: 'a', source_id: 1, target_type: 'b', target_id: 1, synapse_type: 'x', weight: 0.3, metadata: null });
    repo.create({ source_type: 'a', source_id: 2, target_type: 'b', target_id: 2, synapse_type: 'y', weight: 0.9, metadata: null });
    repo.create({ source_type: 'a', source_id: 3, target_type: 'b', target_id: 3, synapse_type: 'z', weight: 0.6, metadata: null });

    const top = repo.topByWeight(2);
    expect(top).toHaveLength(2);
    expect(top[0]!.weight).toBe(0.9);
    expect(top[1]!.weight).toBe(0.6);
  });

  it('countNodes, totalCount, avgWeight, countByType', () => {
    repo.create({ source_type: 'error', source_id: 1, target_type: 'solution', target_id: 2, synapse_type: 'solves', weight: 0.4, metadata: null });
    repo.create({ source_type: 'error', source_id: 1, target_type: 'project', target_id: 3, synapse_type: 'co_occurs', weight: 0.6, metadata: null });

    expect(repo.totalCount()).toBe(2);
    expect(repo.countNodes()).toBeGreaterThanOrEqual(3); // error:1, solution:2, project:3
    expect(repo.avgWeight()).toBeCloseTo(0.5, 1);

    const byType = repo.countByType();
    expect(byType['solves']).toBe(1);
    expect(byType['co_occurs']).toBe(1);
  });

  it('avgWeight returns 0 when no synapses', () => {
    expect(repo.avgWeight()).toBe(0);
  });
});
