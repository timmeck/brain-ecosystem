import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import { BaseEmbeddingEngine } from '../embeddings/engine.js';
import type {
  DreamEngineConfig,
  MemoryReplayResult,
  SynapsePruneResult,
  MemoryCompressionResult,
  MemoryCluster,
  ImportanceDecayResult,
} from './types.js';

const log = getLogger();

/** Bigram Dice coefficient for text-based similarity (fallback when no embeddings). */
function textSimilarity(a: string, b: string): number {
  const bg = (s: string): Set<string> => {
    const words = s.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const set = new Set<string>();
    for (const w of words) {
      for (let i = 0; i < w.length - 1; i++) set.add(w.slice(i, i + 2));
    }
    return set;
  };
  const aBg = bg(a);
  const bBg = bg(b);
  if (aBg.size === 0 || bBg.size === 0) return 0;
  let intersection = 0;
  for (const x of aBg) { if (bBg.has(x)) intersection++; }
  return (2 * intersection) / (aBg.size + bBg.size);
}

// ── Pure logic class — no timers, no DB ownership ──────

export class DreamConsolidator {

  /**
   * Replay top-importance memories through the synapse network.
   * Strengthens activated paths (spreading activation).
   */
  replayMemories(
    db: Database.Database,
    config: Required<DreamEngineConfig>,
  ): MemoryReplayResult {
    const result: MemoryReplayResult = {
      memoriesReplayed: 0,
      synapsesStrengthened: 0,
      synapsesDecayed: 0,
      topActivations: [],
    };

    // Fetch top-importance active memories
    let memories: Array<{ id: string; importance: number; category: string }>;
    try {
      memories = db.prepare(`
        SELECT id, importance, category FROM memories
        WHERE active = 1
        ORDER BY importance DESC
        LIMIT ?
      `).all(config.replayBatchSize) as Array<{ id: string; importance: number; category: string }>;
    } catch {
      // memories table might not exist
      return result;
    }

    if (memories.length === 0) return result;

    for (const mem of memories) {
      // Find synapses connected to this memory node
      const outgoing = db.prepare(`
        SELECT id, weight FROM synapses
        WHERE source_type = 'memory' AND source_id = ?
      `).all(String(mem.id)) as Array<{ id: number; weight: number }>;

      const incoming = db.prepare(`
        SELECT id, weight FROM synapses
        WHERE target_type = 'memory' AND target_id = ?
      `).all(String(mem.id)) as Array<{ id: number; weight: number }>;

      const allSynapses = [...outgoing, ...incoming];
      let activatedNodes = 0;

      for (const syn of allSynapses) {
        if (syn.weight > 0.1) {
          // Strengthen active paths
          const newWeight = Math.min(1.0, syn.weight + config.dreamLearningRate * syn.weight);
          db.prepare(`UPDATE synapses SET weight = ?, last_activated_at = datetime('now') WHERE id = ?`).run(newWeight, syn.id);
          result.synapsesStrengthened++;
          activatedNodes++;
        } else {
          // Let weak synapses decay further
          const newWeight = syn.weight * 0.9;
          db.prepare(`UPDATE synapses SET weight = ? WHERE id = ?`).run(newWeight, syn.id);
          result.synapsesDecayed++;
        }
      }

      result.memoriesReplayed++;
      result.topActivations.push({
        memoryId: String(mem.id),
        importance: mem.importance,
        activatedNodes,
      });
    }

    return result;
  }

  /**
   * Aggressive synapse pruning — removes weak synapses below dream threshold.
   */
  pruneSynapses(
    db: Database.Database,
    config: Required<DreamEngineConfig>,
  ): SynapsePruneResult {
    let pruned = 0;
    try {
      const weak = db.prepare(`
        SELECT id FROM synapses WHERE weight < ?
      `).all(config.dreamPruneThreshold) as Array<{ id: number }>;

      if (weak.length > 0) {
        const deleteStmt = db.prepare(`DELETE FROM synapses WHERE id = ?`);
        for (const s of weak) {
          deleteStmt.run(s.id);
        }
        pruned = weak.length;
      }
    } catch {
      // synapses table might not exist
    }

    return { synapsesPruned: pruned, threshold: config.dreamPruneThreshold };
  }

  /**
   * Compress similar memories by clustering embeddings.
   * Similar memories are merged into a consolidated memory; originals are superseded (not deleted).
   */
  compressMemories(
    db: Database.Database,
    embeddingEngine: BaseEmbeddingEngine | null,
    config: Required<DreamEngineConfig>,
  ): MemoryCompressionResult {
    const result: MemoryCompressionResult = {
      clustersFound: 0,
      memoriesConsolidated: 0,
      memoriesSuperseded: 0,
      compressionRatio: 1.0,
      clusters: [],
    };

    // Fetch active memories (with or without embeddings)
    let memories: Array<{ id: string; content: string; category: string; importance: number; embedding: Buffer | null }>;
    try {
      memories = db.prepare(`
        SELECT id, content, category, importance, embedding FROM memories
        WHERE active = 1
        ORDER BY importance DESC
        LIMIT 200
      `).all() as typeof memories;
    } catch {
      return result;
    }

    if (memories.length < config.minClusterSize) return result;

    // Use embeddings if available, otherwise fall back to text similarity
    const useEmbeddings = embeddingEngine !== null && memories.some(m => m.embedding !== null);

    type MemEntry = { id: string; content: string; category: string; importance: number; vector: Float32Array | null };
    const memEntries: MemEntry[] = memories.map(m => ({
      id: String(m.id),
      content: m.content,
      category: m.category,
      importance: m.importance,
      vector: (useEmbeddings && m.embedding) ? BaseEmbeddingEngine.deserialize(m.embedding) : null,
    }));

    // Similarity function: embedding cosine if available, else text bigram Dice
    const sim = (a: MemEntry, b: MemEntry): number => {
      if (a.vector && b.vector) return BaseEmbeddingEngine.similarity(a.vector, b.vector);
      return textSimilarity(a.content, b.content);
    };

    // Adjust threshold for text similarity (bigram Dice scores lower than cosine)
    const threshold = useEmbeddings ? config.clusterSimilarityThreshold : Math.min(config.clusterSimilarityThreshold, 0.45);

    // Greedy clustering
    const used = new Set<string>();
    let consolidationsLeft = config.maxConsolidationsPerCycle;

    for (const candidate of memEntries) {
      if (used.has(candidate.id) || consolidationsLeft <= 0) continue;

      const cluster = [candidate];
      for (const other of memEntries) {
        if (other.id === candidate.id || used.has(other.id)) continue;
        if (sim(candidate, other) >= threshold) {
          cluster.push(other);
        }
      }

      if (cluster.length >= config.minClusterSize) {
        for (const m of cluster) used.add(m.id);

        // Pick highest-importance as centroid
        cluster.sort((a, b) => b.importance - a.importance);
        const centroid = cluster[0]!;
        const members = cluster.slice(1);

        // Calculate average similarity
        let simSum = 0;
        for (const m of members) { simSum += sim(centroid, m); }
        const avgSim = members.length > 0 ? simSum / members.length : 1;

        // Consolidate: boost centroid importance, supersede others
        const consolidatedImportance = Math.min(100,
          centroid.importance + members.reduce((s, m) => s + m.importance * 0.3, 0),
        );
        const consolidatedContent = centroid.content +
          `\n[Consolidated from ${members.length} similar memories]`;

        try {
          db.prepare(`
            UPDATE memories SET importance = ?, content = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run(consolidatedImportance, consolidatedContent, centroid.id);

          const supersedeStmt = db.prepare(`
            UPDATE memories SET active = 0, updated_at = datetime('now') WHERE id = ?
          `);
          for (const m of members) { supersedeStmt.run(m.id); }
        } catch (err) {
          log.warn(`[dream] Compression error: ${(err as Error).message}`);
          continue;
        }

        result.memoriesConsolidated++;
        result.memoriesSuperseded += members.length;
        result.clusters.push({
          centroidId: centroid.id,
          memberIds: members.map(m => m.id),
          avgSimilarity: avgSim,
          consolidatedTitle: centroid.content.slice(0, 80),
        });
        consolidationsLeft--;
      }
    }

    result.clustersFound = result.clusters.length;
    const originalCount = memEntries.length;
    const afterCount = originalCount - result.memoriesSuperseded;
    result.compressionRatio = afterCount > 0 ? originalCount / afterCount : 1;

    return result;
  }

  /**
   * Decay importance of old, never-accessed memories.
   * Archive memories that fall below threshold.
   */
  decayImportance(
    db: Database.Database,
    config: Required<DreamEngineConfig>,
  ): ImportanceDecayResult {
    const result: ImportanceDecayResult = {
      memoriesDecayed: 0,
      memoriesArchived: 0,
      avgDecay: 0,
    };

    let oldMemories: Array<{ id: string; importance: number }>;
    try {
      oldMemories = db.prepare(`
        SELECT id, importance FROM memories
        WHERE active = 1
          AND julianday('now') - julianday(COALESCE(updated_at, created_at)) > ?
        ORDER BY importance ASC
        LIMIT 100
      `).all(config.importanceDecayAfterDays) as typeof oldMemories;
    } catch {
      return result;
    }

    if (oldMemories.length === 0) return result;

    let totalDecay = 0;
    const updateStmt = db.prepare(`UPDATE memories SET importance = ?, updated_at = datetime('now') WHERE id = ?`);
    const archiveStmt = db.prepare(`UPDATE memories SET active = 0, updated_at = datetime('now') WHERE id = ?`);

    for (const mem of oldMemories) {
      const newImportance = mem.importance * config.importanceDecayRate;
      totalDecay += mem.importance - newImportance;

      if (newImportance <= config.archiveImportanceThreshold) {
        // Archive — set inactive
        archiveStmt.run(mem.id);
        result.memoriesArchived++;
      } else {
        updateStmt.run(newImportance, mem.id);
      }
      result.memoriesDecayed++;
    }

    result.avgDecay = result.memoriesDecayed > 0 ? totalDecay / result.memoriesDecayed : 0;
    return result;
  }
}
