import { describe, it, expect, beforeEach } from 'vitest';
import { WeightedGraph } from '../../../src/graph/weighted-graph.js';

describe('WeightedGraph', () => {
  let graph: WeightedGraph;

  beforeEach(() => {
    graph = new WeightedGraph();
  });

  describe('addNode', () => {
    it('should add a new node and return it', () => {
      const node = graph.addNode('sig_rsi_neutral', 'signal', 'neutral');

      expect(node.id).toBe('sig_rsi_neutral');
      expect(node.type).toBe('signal');
      expect(node.label).toBe('neutral');
      expect(node.activation).toBe(0);
      expect(node.totalActivations).toBe(0);
    });

    it('should return existing node if id already exists', () => {
      graph.addNode('n1', 'signal', 'first');
      const second = graph.addNode('n1', 'regime', 'second');

      // Should return existing, not overwrite
      expect(second.type).toBe('signal');
      expect(second.label).toBe('first');
    });

    it('should increment node count', () => {
      expect(graph.getNodeCount()).toBe(0);
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'regime', 'b');
      expect(graph.getNodeCount()).toBe(2);
    });
  });

  describe('addEdge', () => {
    it('should create bidirectional edges', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.5);

      expect(graph.edges['a->b']).toBeDefined();
      expect(graph.edges['b->a']).toBeDefined();
    });

    it('should not overwrite existing edges', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.5);

      const original = graph.edges['a->b'];
      graph.addEdge('a', 'b', 0.9);

      expect(graph.edges['a->b']).toBe(original);
      expect(graph.edges['a->b']!.weight).toBe(0.5);
    });

    it('should default weight to 0.5', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b');

      expect(graph.edges['a->b']!.weight).toBe(0.5);
    });
  });

  describe('strengthenEdge', () => {
    it('should increase weight asymptotically toward 1.0', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.5);

      graph.strengthenEdge('a', 'b', 0.1);

      const edge = graph.edges['a->b']!;
      // weight += (1.0 - 0.5) * 0.1 = 0.5 + 0.05 = 0.55
      expect(edge.weight).toBeCloseTo(0.55);
      expect(edge.activations).toBe(1);
    });

    it('should strengthen both directions', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.5);

      graph.strengthenEdge('a', 'b', 0.2);

      expect(graph.edges['a->b']!.weight).toBeCloseTo(0.6);
      expect(graph.edges['b->a']!.weight).toBeCloseTo(0.6);
    });

    it('should not exceed 1.0', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.99);

      graph.strengthenEdge('a', 'b', 1.0);

      expect(graph.edges['a->b']!.weight).toBeLessThanOrEqual(1.0);
    });
  });

  describe('weakenEdge', () => {
    it('should multiply weight by factor', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.5);

      graph.weakenEdge('a', 'b', 0.8);

      expect(graph.edges['a->b']!.weight).toBeCloseTo(0.4);
      expect(graph.edges['b->a']!.weight).toBeCloseTo(0.4);
    });

    it('should do nothing for non-existent edges', () => {
      // Should not throw
      graph.weakenEdge('nonexistent', 'also_nonexistent');
    });
  });

  describe('spreadingActivation', () => {
    it('should return empty array for non-existent start node', () => {
      const result = graph.spreadingActivation('nonexistent');
      expect(result).toHaveLength(0);
    });

    it('should activate the start node with initial energy', () => {
      graph.addNode('a', 'signal', 'a');

      const result = graph.spreadingActivation('a', 1.0);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('a');
      expect(result[0].activation).toBe(1.0);
    });

    it('should propagate energy through edges', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.8);

      const result = graph.spreadingActivation('a', 1.0, 0.6, 0.01);

      expect(result.length).toBeGreaterThanOrEqual(2);
      const nodeB = result.find(n => n.id === 'b');
      expect(nodeB).toBeDefined();
      // energy = 1.0 * 0.8 * 0.6 = 0.48
      expect(nodeB!.activation).toBeCloseTo(0.48);
    });

    it('should stop propagation below threshold', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addNode('c', 'signal', 'c');
      graph.addEdge('a', 'b', 0.1);
      graph.addEdge('b', 'c', 0.1);

      const result = graph.spreadingActivation('a', 1.0, 0.6, 0.1);

      // b gets 1.0 * 0.1 * 0.6 = 0.06 < 0.1 threshold, so b and c should not be activated
      expect(result).toHaveLength(1); // Only 'a'
    });

    it('should sort results by activation descending', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addNode('c', 'signal', 'c');
      graph.addEdge('a', 'b', 0.9);
      graph.addEdge('a', 'c', 0.3);

      const result = graph.spreadingActivation('a', 1.0, 0.6, 0.01);

      expect(result[0].id).toBe('a');
      if (result.length > 2) {
        expect(result[1].activation).toBeGreaterThanOrEqual(result[2].activation);
      }
    });

    it('should respect maxDepth', () => {
      // Create a chain: a -> b -> c -> d -> e
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addNode('c', 'signal', 'c');
      graph.addNode('d', 'signal', 'd');
      graph.addNode('e', 'signal', 'e');
      // Only add forward edges (a->b creates b->a too, but we only care about forward)
      graph.addEdge('a', 'b', 1.0);
      graph.addEdge('b', 'c', 1.0);
      graph.addEdge('c', 'd', 1.0);
      graph.addEdge('d', 'e', 1.0);

      const result = graph.spreadingActivation('a', 1.0, 1.0, 0.001, 2);

      const nodeIds = result.map(n => n.id);
      expect(nodeIds).toContain('a');
      expect(nodeIds).toContain('b');
      expect(nodeIds).toContain('c');
      // d and e should not be reached at maxDepth=2
      expect(nodeIds).not.toContain('d');
      expect(nodeIds).not.toContain('e');
    });
  });

  describe('getEdgesFor', () => {
    it('should return all edges connected to a node', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addNode('c', 'signal', 'c');
      graph.addEdge('a', 'b');
      graph.addEdge('c', 'a');

      // a->b, b->a, c->a, a->c  =  4 edges total, all involving a
      const edges = graph.getEdgesFor('a');
      expect(edges.length).toBe(4);
    });
  });

  describe('decayEdges', () => {
    it('should decay edges older than halfLife', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.8);

      // Set lastActivated to 2 half-lives ago
      const halfLifeMs = 1000;
      graph.edges['a->b']!.lastActivated = Date.now() - 2 * halfLifeMs;

      graph.decayEdges(halfLifeMs);

      // After 2 half-lives: 0.8 * 0.5^2 = 0.2
      expect(graph.edges['a->b']!.weight).toBeCloseTo(0.2, 1);
    });

    it('should not decay edges within halfLife', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.8);

      graph.edges['a->b']!.lastActivated = Date.now(); // Just activated

      graph.decayEdges(86400000);

      expect(graph.edges['a->b']!.weight).toBeCloseTo(0.8);
    });

    it('should not decay below 0.01', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addEdge('a', 'b', 0.02);

      graph.edges['a->b']!.lastActivated = Date.now() - 100 * 1000;

      graph.decayEdges(1000); // 100 half-lives

      expect(graph.edges['a->b']!.weight).toBe(0.01);
    });
  });

  describe('findPath', () => {
    it('should find a path between connected nodes', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addNode('c', 'signal', 'c');
      graph.addEdge('a', 'b');
      graph.addEdge('b', 'c');

      const path = graph.findPath('a', 'c');
      expect(path).toEqual(['a', 'b', 'c']);
    });

    it('should return [fromId] when from equals to', () => {
      graph.addNode('a', 'signal', 'a');
      expect(graph.findPath('a', 'a')).toEqual(['a']);
    });

    it('should return null for disconnected nodes', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');

      expect(graph.findPath('a', 'b')).toBeNull();
    });

    it('should return null for non-existent nodes', () => {
      expect(graph.findPath('x', 'y')).toBeNull();
    });

    it('should respect maxDepth', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'signal', 'b');
      graph.addNode('c', 'signal', 'c');
      graph.addNode('d', 'signal', 'd');
      graph.addEdge('a', 'b');
      graph.addEdge('b', 'c');
      graph.addEdge('c', 'd');

      // Path a->b->c->d has length 4 (4 nodes), maxDepth 2 means path length limited
      const path = graph.findPath('a', 'd', 2);
      expect(path).toBeNull();
    });
  });

  describe('serialize / deserialize', () => {
    it('should round-trip nodes and edges', () => {
      graph.addNode('a', 'signal', 'a');
      graph.addNode('b', 'regime', 'bull');
      graph.addEdge('a', 'b', 0.7);

      const serialized = graph.serialize();
      expect(serialized.nodes).toHaveLength(2);
      expect(serialized.edges).toHaveLength(2); // bidirectional

      const graph2 = new WeightedGraph();
      graph2.deserialize(serialized);

      expect(graph2.getNodeCount()).toBe(2);
      expect(graph2.getEdgeCount()).toBe(2);
      expect(graph2.nodes['a']!.type).toBe('signal');
    });
  });
});
