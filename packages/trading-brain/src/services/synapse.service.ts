import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { WeightedGraph, ActivatedNode } from '../graph/weighted-graph.js';

export class SynapseService {
  constructor(
    private synapseManager: SynapseManager,
    private graph: WeightedGraph,
  ) {}

  explore(query: string): ActivatedNode[] {
    // Find matching node (exact or fuzzy)
    let startNode: string | null = null;
    for (const node of Object.values(this.graph.nodes)) {
      if (node.id === query || node.label === query) {
        startNode = node.id;
        break;
      }
    }

    if (!startNode) {
      const queryLower = query.toLowerCase();
      for (const node of Object.values(this.graph.nodes)) {
        if (node.label.toLowerCase().includes(queryLower) || node.id.toLowerCase().includes(queryLower)) {
          startNode = node.id;
          break;
        }
      }
    }

    if (!startNode) return [];
    return this.graph.spreadingActivation(startNode, 1.0, 0.6, 0.05, 4);
  }

  findPath(fromId: string, toId: string): string[] | null {
    return this.graph.findPath(fromId, toId);
  }

  getStats(): {
    totalSynapses: number;
    avgWeight: number;
    graphNodes: number;
    graphEdges: number;
    strongest: Array<{ id: string; weight: number; activations: number }>;
  } {
    const strongest = this.synapseManager.getStrongest(5).map(s => ({
      id: s.id,
      weight: s.weight,
      activations: s.activations,
    }));
    return {
      totalSynapses: this.synapseManager.count(),
      avgWeight: this.synapseManager.getAvgWeight(),
      graphNodes: this.graph.getNodeCount(),
      graphEdges: this.graph.getEdgeCount(),
      strongest,
    };
  }
}
