import type { NodeType } from '../types/synapse.types.js';
import type { NetworkStats } from '../types/synapse.types.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { ActivationResult, SynapsePath, SynapseRecord } from '@timmeck/brain-core';

export interface ErrorContext {
  solutions: ActivationResult[];
  relatedErrors: ActivationResult[];
  relevantModules: ActivationResult[];
  preventionRules: ActivationResult[];
  insights: ActivationResult[];
}

export interface RelatedQuery {
  nodeType: NodeType;
  nodeId: number;
  maxDepth?: number;
  minWeight?: number;
}

export class SynapseService {
  constructor(private manager: SynapseManager) {}

  getErrorContext(errorId: number): ErrorContext {
    return this.manager.getErrorContext(errorId);
  }

  findPath(
    fromType: NodeType,
    fromId: number,
    toType: NodeType,
    toId: number,
  ): SynapsePath | null {
    return this.manager.findPath(
      { type: fromType, id: fromId },
      { type: toType, id: toId },
    );
  }

  getRelated(query: RelatedQuery): ActivationResult[] {
    return this.manager.activate(
      { type: query.nodeType, id: query.nodeId },
      query.maxDepth,
      query.minWeight,
    );
  }

  getNetworkStats(): NetworkStats {
    return this.manager.getNetworkStats();
  }

  getStrongestSynapses(limit?: number): SynapseRecord[] {
    return this.manager.getStrongestSynapses(limit);
  }

  runDecay(): { decayed: number; pruned: number } {
    return this.manager.runDecay();
  }
}
