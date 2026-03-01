import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { GraphRepository } from '../../../src/db/repositories/graph.repository.js';

function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      activation REAL NOT NULL DEFAULT 0,
      total_activations INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type);

    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      activations INTEGER NOT NULL DEFAULT 0,
      last_activated TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source) REFERENCES graph_nodes(id),
      FOREIGN KEY (target) REFERENCES graph_nodes(id)
    );
    CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target);
  `);
}

describe('GraphRepository', () => {
  let db: Database.Database;
  let repo: GraphRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    createSchema(db);
    repo = new GraphRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsertNode', () => {
    it('should insert a new node', () => {
      repo.upsertNode({ id: 'sig_rsi_neutral', type: 'signal', label: 'neutral', activation: 0, total_activations: 0 });

      const node = repo.getNode('sig_rsi_neutral');
      expect(node).toBeDefined();
      expect(node!.type).toBe('signal');
      expect(node!.label).toBe('neutral');
    });

    it('should update activation on conflict', () => {
      repo.upsertNode({ id: 'n1', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'n1', type: 'signal', label: 'a', activation: 0.8, total_activations: 5 });

      const node = repo.getNode('n1');
      expect(node!.activation).toBeCloseTo(0.8);
      expect(node!.total_activations).toBe(5);
    });
  });

  describe('upsertEdge', () => {
    it('should insert a new edge', () => {
      repo.upsertNode({ id: 'a', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'b', type: 'signal', label: 'b', activation: 0, total_activations: 0 });
      repo.upsertEdge({ id: 'a->b', source: 'a', target: 'b', weight: 0.5, activations: 0, last_activated: '2026-01-01T00:00:00' });

      const edge = repo.getEdge('a->b');
      expect(edge).toBeDefined();
      expect(edge!.source).toBe('a');
      expect(edge!.target).toBe('b');
      expect(edge!.weight).toBeCloseTo(0.5);
    });

    it('should update weight on conflict', () => {
      repo.upsertNode({ id: 'a', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'b', type: 'signal', label: 'b', activation: 0, total_activations: 0 });
      repo.upsertEdge({ id: 'a->b', source: 'a', target: 'b', weight: 0.5, activations: 0, last_activated: '2026-01-01T00:00:00' });
      repo.upsertEdge({ id: 'a->b', source: 'a', target: 'b', weight: 0.9, activations: 3, last_activated: '2026-02-01T00:00:00' });

      const edge = repo.getEdge('a->b');
      expect(edge!.weight).toBeCloseTo(0.9);
      expect(edge!.activations).toBe(3);
    });
  });

  describe('getAllNodes / getAllEdges', () => {
    it('should return all nodes', () => {
      repo.upsertNode({ id: 'n1', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'n2', type: 'regime', label: 'b', activation: 0, total_activations: 0 });

      const nodes = repo.getAllNodes();
      expect(nodes).toHaveLength(2);
    });

    it('should return all edges', () => {
      repo.upsertNode({ id: 'a', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'b', type: 'signal', label: 'b', activation: 0, total_activations: 0 });
      repo.upsertEdge({ id: 'a->b', source: 'a', target: 'b', weight: 0.5, activations: 0, last_activated: '2026-01-01' });

      const edges = repo.getAllEdges();
      expect(edges).toHaveLength(1);
    });
  });

  describe('getEdgesFrom', () => {
    it('should return edges originating from a node', () => {
      repo.upsertNode({ id: 'a', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'b', type: 'signal', label: 'b', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'c', type: 'signal', label: 'c', activation: 0, total_activations: 0 });
      repo.upsertEdge({ id: 'a->b', source: 'a', target: 'b', weight: 0.5, activations: 0, last_activated: '2026-01-01' });
      repo.upsertEdge({ id: 'a->c', source: 'a', target: 'c', weight: 0.6, activations: 0, last_activated: '2026-01-01' });
      repo.upsertEdge({ id: 'b->c', source: 'b', target: 'c', weight: 0.7, activations: 0, last_activated: '2026-01-01' });

      const edgesFromA = repo.getEdgesFrom('a');
      expect(edgesFromA).toHaveLength(2);
      expect(edgesFromA.every(e => e.source === 'a')).toBe(true);
    });
  });

  describe('getEdgesFor', () => {
    it('should return edges connected to a node (source or target)', () => {
      repo.upsertNode({ id: 'a', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'b', type: 'signal', label: 'b', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'c', type: 'signal', label: 'c', activation: 0, total_activations: 0 });
      repo.upsertEdge({ id: 'a->b', source: 'a', target: 'b', weight: 0.5, activations: 0, last_activated: '2026-01-01' });
      repo.upsertEdge({ id: 'c->b', source: 'c', target: 'b', weight: 0.6, activations: 0, last_activated: '2026-01-01' });

      const edgesForB = repo.getEdgesFor('b');
      expect(edgesForB).toHaveLength(2);
    });
  });

  describe('nodeCount / edgeCount', () => {
    it('should return 0 when empty', () => {
      expect(repo.nodeCount()).toBe(0);
      expect(repo.edgeCount()).toBe(0);
    });

    it('should return correct counts', () => {
      repo.upsertNode({ id: 'a', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'b', type: 'signal', label: 'b', activation: 0, total_activations: 0 });
      repo.upsertEdge({ id: 'a->b', source: 'a', target: 'b', weight: 0.5, activations: 0, last_activated: '2026-01-01' });

      expect(repo.nodeCount()).toBe(2);
      expect(repo.edgeCount()).toBe(1);
    });
  });

  describe('updateEdgeWeight', () => {
    it('should update edge weight and increment activations', () => {
      repo.upsertNode({ id: 'a', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'b', type: 'signal', label: 'b', activation: 0, total_activations: 0 });
      repo.upsertEdge({ id: 'a->b', source: 'a', target: 'b', weight: 0.5, activations: 0, last_activated: '2026-01-01' });

      repo.updateEdgeWeight('a->b', 0.9);

      const edge = repo.getEdge('a->b');
      expect(edge!.weight).toBeCloseTo(0.9);
      expect(edge!.activations).toBe(1);
    });
  });

  describe('clearAll', () => {
    it('should remove all nodes and edges', () => {
      repo.upsertNode({ id: 'a', type: 'signal', label: 'a', activation: 0, total_activations: 0 });
      repo.upsertNode({ id: 'b', type: 'signal', label: 'b', activation: 0, total_activations: 0 });
      repo.upsertEdge({ id: 'a->b', source: 'a', target: 'b', weight: 0.5, activations: 0, last_activated: '2026-01-01' });

      repo.clearAll();

      expect(repo.nodeCount()).toBe(0);
      expect(repo.edgeCount()).toBe(0);
    });
  });
});
