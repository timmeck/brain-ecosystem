export interface BorgConfig {
  enabled: boolean;
  /** 'selective' = only shareTypes, 'full' = everything */
  mode: 'selective' | 'full';
  /** Sync interval in milliseconds. */
  syncIntervalMs: number;
  /** Only share these types in selective mode. */
  shareTypes: string[];
  /** Minimum confidence to share a rule/insight. */
  minConfidence: number;
  /** Minimum relevance score (0-1) to import from peers. */
  relevanceThreshold: number;
}

export const DEFAULT_BORG_CONFIG: BorgConfig = {
  enabled: false,
  mode: 'selective',
  syncIntervalMs: 60_000,
  shareTypes: ['rule', 'insight'],
  minConfidence: 0.6,
  relevanceThreshold: 0.3,
};

export interface SyncPacket {
  source: string;
  timestamp: string;
  items: SyncItem[];
}

export interface SyncItem {
  type: 'rule' | 'insight' | 'pattern' | 'memory' | 'principle';
  id: string;
  title: string;
  content: string;
  confidence: number;
  source: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface SyncHistoryEntry {
  timestamp: string;
  direction: 'sent' | 'received';
  peer: string;
  itemCount: number;
  accepted: number;
  rejected: number;
}
