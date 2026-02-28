/**
 * Generic synapse network types for the Brain ecosystem.
 * Each brain provides its own NodeType/SynapseType string unions,
 * but the record shape and algorithms are shared.
 */

export interface NodeRef {
  type: string;
  id: number;
}

export interface SynapseRecord {
  id: number;
  source_type: string;
  source_id: number;
  target_type: string;
  target_id: number;
  synapse_type: string;
  weight: number;
  activation_count: number;
  last_activated_at: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivationResult {
  node: NodeRef;
  activation: number;
  depth: number;
  path: string[];
}

export interface PathNode {
  type: string;
  id: number;
}

export interface SynapsePath {
  from: PathNode;
  to: PathNode;
  synapses: SynapseRecord[];
  totalWeight: number;
  hops: number;
}

export interface NetworkStats {
  totalNodes: number;
  totalSynapses: number;
  avgWeight: number;
  nodesByType: Record<string, number>;
  synapsesByType: Record<string, number>;
}

export interface HebbianConfig {
  initialWeight: number;
  learningRate: number;
  pruneThreshold: number;
}

export interface DecayConfig {
  decayHalfLifeDays: number;
  decayAfterDays: number;
  pruneThreshold: number;
}

/**
 * Interface that synapse repositories must implement
 * for the shared algorithms to work.
 */
export interface SynapseRepoInterface {
  findBySourceTarget(
    sourceType: string, sourceId: number,
    targetType: string, targetId: number,
    synapseType: string,
  ): SynapseRecord | undefined;

  create(data: {
    source_type: string;
    source_id: number;
    target_type: string;
    target_id: number;
    synapse_type: string;
    weight: number;
    metadata: string | null;
  }): number;

  getById(id: number): SynapseRecord | undefined;
  update(id: number, data: Partial<SynapseRecord>): void;
  delete(id: number): void;

  getOutgoing(nodeType: string, nodeId: number): SynapseRecord[];
  getIncoming(nodeType: string, nodeId: number): SynapseRecord[];

  findInactiveSince(cutoffIso: string): SynapseRecord[];

  topByWeight(limit: number): SynapseRecord[];
  topDiverse(perType: number): SynapseRecord[];

  countNodes(): number;
  totalCount(): number;
  avgWeight(): number;
  countByType(): Record<string, number>;
}
