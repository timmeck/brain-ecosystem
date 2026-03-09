// ── Dream Mode Types ───────────────────────────────────

export interface DreamEngineConfig {
  brainName: string;
  /** Interval between dream cycles in ms. Default: 1_800_000 (30 min) */
  intervalMs?: number;
  /** Brain must be idle this long before dreaming. Default: 300_000 (5 min) */
  idleThresholdMs?: number;
  /** How many top-importance memories to replay per cycle. Default: 50 */
  replayBatchSize?: number;
  /** Cosine similarity threshold for clustering. Default: 0.35 */
  clusterSimilarityThreshold?: number;
  /** Minimum cluster size to trigger compression. Default: 2 */
  minClusterSize?: number;
  /** Importance decay multiplier for old memories. Default: 0.5 */
  importanceDecayRate?: number;
  /** Days since last access before importance decay applies. Default: 30 */
  importanceDecayAfterDays?: number;
  /** Archive threshold — memories at or below this importance get archived. Default: 3 */
  archiveImportanceThreshold?: number;
  /** Synapse weight threshold for dream pruning (more aggressive than normal). Default: 0.15 */
  dreamPruneThreshold?: number;
  /** Learning rate for strengthening activated synapses during replay. Default: 0.15 */
  dreamLearningRate?: number;
  /** Max memory clusters to consolidate per cycle. Default: 10 */
  maxConsolidationsPerCycle?: number;
}

export type DreamTrigger = 'auto' | 'manual' | 'idle';

export interface DreamCycleReport {
  cycleId: string;
  timestamp: number;
  duration: number;
  trigger: DreamTrigger;
  replay: MemoryReplayResult;
  pruning: SynapsePruneResult;
  compression: MemoryCompressionResult;
  decay: ImportanceDecayResult;
  principlesDiscovered: number;
  journalEntryId: number | null;
}

export interface DreamStatus {
  running: boolean;
  totalCycles: number;
  lastDreamAt: number | null;
  totals: {
    memoriesConsolidated: number;
    synapsesPruned: number;
    memoriesArchived: number;
  };
}

export interface DreamHistoryEntry {
  id: number;
  cycle_id: string;
  timestamp: number;
  duration: number;
  trigger: DreamTrigger;
  memories_replayed: number;
  synapses_strengthened: number;
  synapses_pruned: number;
  synapses_decayed: number;
  memories_consolidated: number;
  memories_superseded: number;
  memories_archived: number;
  importance_decayed: number;
  principles_discovered: number;
  compression_ratio: number;
  journal_entry_id: number | null;
  created_at: string;
}

export interface MemoryReplayResult {
  memoriesReplayed: number;
  synapsesStrengthened: number;
  synapsesDecayed: number;
  topActivations: Array<{ memoryId: string; importance: number; activatedNodes: number }>;
}

export interface SynapsePruneResult {
  synapsesPruned: number;
  threshold: number;
}

export interface MemoryCompressionResult {
  clustersFound: number;
  memoriesConsolidated: number;
  memoriesSuperseded: number;
  compressionRatio: number;
  clusters: MemoryCluster[];
}

export interface MemoryCluster {
  centroidId: string;
  memberIds: string[];
  avgSimilarity: number;
  consolidatedTitle: string;
}

export interface ImportanceDecayResult {
  memoriesDecayed: number;
  memoriesArchived: number;
  avgDecay: number;
}

export interface DreamRetrospective {
  id?: number;
  dreamCycleId: string;
  prunedItems: Array<{ synapseId: number; weight: number }>;
  reappearedCount: number;
  regretScore: number;
  lesson: string;
  analyzedAt: string;
}

export interface PruningEfficiency {
  totalPruned: number;
  totalReappeared: number;
  avgRegretScore: number;
  efficiencyRate: number;
}
