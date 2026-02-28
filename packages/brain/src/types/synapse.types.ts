export type NodeType =
  | 'error' | 'solution' | 'code_module' | 'rule' | 'antipattern' | 'project' | 'insight'
  | 'memory' | 'session' | 'decision' | 'changelog_entry' | 'task' | 'doc';

export type SynapseType =
  | 'solves'
  | 'causes'
  | 'similar_to'
  | 'uses_module'
  | 'depends_on'
  | 'derived_from'
  | 'co_occurs'
  | 'prevents'
  | 'improves'
  | 'generalizes'
  | 'cross_project'
  | 'remembers'
  | 'relates_to'
  | 'informs';

export interface SynapseRecord {
  id: number;
  source_type: NodeType;
  source_id: number;
  target_type: NodeType;
  target_id: number;
  synapse_type: SynapseType;
  weight: number;
  activation_count: number;
  last_activated_at: string;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivationResult {
  nodeType: NodeType;
  nodeId: number;
  activationStrength: number;
  path: SynapsePath;
}

export interface SynapsePath {
  nodes: Array<{ type: NodeType; id: number }>;
  totalWeight: number;
  hops: number;
}

export interface NetworkStats {
  totalNodes: number;
  totalSynapses: number;
  avgWeight: number;
  nodesByType: Record<NodeType, number>;
  synapsesByType: Record<SynapseType, number>;
}
