export type NodeType =
  | 'post'
  | 'campaign'
  | 'strategy'
  | 'template'
  | 'rule'
  | 'audience'
  | 'insight'
  | 'memory'
  | 'session';

export type SynapseType =
  | 'belongs_to'
  | 'similar_to'
  | 'engages_with'
  | 'improves'
  | 'prevents'
  | 'recommends'
  | 'generated_from'
  | 'cross_promotes'
  | 'informs'
  | 'co_occurs'
  | 'remembers';

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

export interface NetworkStats {
  totalNodes: number;
  totalSynapses: number;
  avgWeight: number;
  nodesByType: Record<NodeType, number>;
  synapsesByType: Record<SynapseType, number>;
}
