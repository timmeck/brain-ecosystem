import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { NodeType } from '../types/synapse.types.js';

export class SynapseService {
  constructor(private synapseManager: SynapseManager) {}

  getPostContext(postId: number) {
    return this.synapseManager.getPostContext(postId);
  }

  findPath(fromType: NodeType, fromId: number, toType: NodeType, toId: number) {
    return this.synapseManager.findPath(
      { type: fromType, id: fromId },
      { type: toType, id: toId },
    );
  }

  getRelated(opts: { nodeType: NodeType; nodeId: number; maxDepth?: number }) {
    return this.synapseManager.activate(
      { type: opts.nodeType, id: opts.nodeId },
      opts.maxDepth,
    );
  }

  getNetworkStats() {
    return this.synapseManager.getNetworkStats();
  }

  getStrongest(limit?: number) {
    return this.synapseManager.getStrongestSynapses(limit);
  }
}
