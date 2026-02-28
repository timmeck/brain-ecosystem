export const NODE_TYPES = {
  SIGNAL: 'signal',
  REGIME: 'regime',
  OUTCOME: 'outcome',
  PAIR: 'pair',
  BOT_TYPE: 'bot_type',
  TIME: 'time',
  COMBO: 'combo',
} as const;

export type NodeType = typeof NODE_TYPES[keyof typeof NODE_TYPES];

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  activation: number;
  totalActivations: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  activations: number;
  lastActivated: number;
}

export interface ActivatedNode {
  id: string;
  type: string;
  label: string;
  activation: number;
}

export class WeightedGraph {
  nodes: Record<string, GraphNode> = {};
  edges: Record<string, GraphEdge> = {};

  addNode(id: string, type: string, label: string): GraphNode {
    if (!this.nodes[id]) {
      this.nodes[id] = { id, type, label, activation: 0, totalActivations: 0 };
    }
    return this.nodes[id]!;
  }

  addEdge(sourceId: string, targetId: string, weight: number = 0.5): GraphEdge {
    const edgeId = `${sourceId}->${targetId}`;
    const reverseId = `${targetId}->${sourceId}`;
    if (!this.edges[edgeId]) {
      this.edges[edgeId] = { source: sourceId, target: targetId, weight, activations: 0, lastActivated: 0 };
    }
    if (!this.edges[reverseId]) {
      this.edges[reverseId] = { source: targetId, target: sourceId, weight, activations: 0, lastActivated: 0 };
    }
    return this.edges[edgeId]!;
  }

  strengthenEdge(sourceId: string, targetId: string, amount: number = 0.1): void {
    const edgeId = `${sourceId}->${targetId}`;
    const reverseId = `${targetId}->${sourceId}`;
    for (const id of [edgeId, reverseId]) {
      const edge = this.edges[id];
      if (edge) {
        edge.weight = Math.min(1.0, edge.weight + (1.0 - edge.weight) * amount);
        edge.activations++;
        edge.lastActivated = Date.now();
      }
    }
  }

  weakenEdge(sourceId: string, targetId: string, factor: number = 0.8): void {
    const edgeId = `${sourceId}->${targetId}`;
    const reverseId = `${targetId}->${sourceId}`;
    for (const id of [edgeId, reverseId]) {
      const edge = this.edges[id];
      if (edge) {
        edge.weight *= factor;
      }
    }
  }

  /**
   * Spreading Activation — BFS energy propagation through the graph.
   * Returns activated nodes sorted by activation level descending.
   */
  spreadingActivation(
    startNodeId: string,
    initialEnergy: number = 1.0,
    decayFactor: number = 0.6,
    threshold: number = 0.05,
    maxDepth: number = 4,
  ): ActivatedNode[] {
    // Reset activations
    for (const node of Object.values(this.nodes)) {
      node.activation = 0;
    }

    if (!this.nodes[startNodeId]) return [];

    const queue: Array<{ nodeId: string; energy: number; depth: number }> = [
      { nodeId: startNodeId, energy: initialEnergy, depth: 0 },
    ];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, energy, depth } = queue.shift()!;

      if (visited.has(nodeId) || energy < threshold || depth > maxDepth) continue;
      visited.add(nodeId);

      const node = this.nodes[nodeId];
      if (!node) continue;

      node.activation += energy;
      node.totalActivations++;

      // Find outgoing edges
      for (const edge of Object.values(this.edges)) {
        if (edge.source === nodeId && !visited.has(edge.target)) {
          const propagatedEnergy = energy * edge.weight * decayFactor;
          if (propagatedEnergy >= threshold) {
            queue.push({ nodeId: edge.target, energy: propagatedEnergy, depth: depth + 1 });
          }
        }
      }
    }

    return Object.values(this.nodes)
      .filter(n => n.activation > 0)
      .sort((a, b) => b.activation - a.activation)
      .map(n => ({ id: n.id, type: n.type, label: n.label, activation: n.activation }));
  }

  getEdgesFor(nodeId: string): GraphEdge[] {
    return Object.values(this.edges).filter(e => e.source === nodeId || e.target === nodeId);
  }

  /** Apply temporal decay to all edges */
  decayEdges(halfLifeMs: number): void {
    const now = Date.now();
    for (const edge of Object.values(this.edges)) {
      if (edge.lastActivated > 0) {
        const age = now - edge.lastActivated;
        if (age > halfLifeMs) {
          const periods = age / halfLifeMs;
          edge.weight = Math.max(0.01, edge.weight * Math.pow(0.5, periods));
        }
      }
    }
  }

  /** Find shortest path between two nodes using BFS */
  findPath(fromId: string, toId: string, maxDepth: number = 6): string[] | null {
    if (!this.nodes[fromId] || !this.nodes[toId]) return null;
    if (fromId === toId) return [fromId];

    const queue: Array<{ nodeId: string; path: string[] }> = [{ nodeId: fromId, path: [fromId] }];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const { nodeId, path } = queue.shift()!;
      if (visited.has(nodeId) || path.length > maxDepth) continue;
      visited.add(nodeId);

      for (const edge of Object.values(this.edges)) {
        if (edge.source === nodeId && !visited.has(edge.target)) {
          const newPath = [...path, edge.target];
          if (edge.target === toId) return newPath;
          queue.push({ nodeId: edge.target, path: newPath });
        }
      }
    }

    return null;
  }

  serialize(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    return {
      nodes: Object.values(this.nodes),
      edges: Object.values(this.edges),
    };
  }

  deserialize(data: { nodes: GraphNode[]; edges: GraphEdge[] }): void {
    this.nodes = {};
    this.edges = {};
    if (data.nodes) data.nodes.forEach(n => { this.nodes[n.id] = n; });
    if (data.edges) data.edges.forEach(e => { this.edges[`${e.source}->${e.target}`] = e; });
  }

  getNodeCount(): number { return Object.keys(this.nodes).length; }
  getEdgeCount(): number { return Object.keys(this.edges).length; }
}
