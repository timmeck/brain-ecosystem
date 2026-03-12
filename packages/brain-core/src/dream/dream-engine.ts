import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import { DreamConsolidator } from './consolidator.js';
import type { BaseEmbeddingEngine } from '../embeddings/engine.js';
import type { ResearchJournal } from '../research/journal.js';
import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type {
  DreamEngineConfig,
  DreamCycleReport,
  DreamStatus,
  DreamHistoryEntry,
  DreamTrigger,
  DreamRetrospective,
  PruningEfficiency,
  FactExtractionResult,
} from './types.js';

// ── Migration ───────────────────────────────────────────

export function runDreamMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dream_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      trigger TEXT NOT NULL,
      memories_replayed INTEGER NOT NULL DEFAULT 0,
      synapses_strengthened INTEGER NOT NULL DEFAULT 0,
      synapses_pruned INTEGER NOT NULL DEFAULT 0,
      synapses_decayed INTEGER NOT NULL DEFAULT 0,
      memories_consolidated INTEGER NOT NULL DEFAULT 0,
      memories_superseded INTEGER NOT NULL DEFAULT 0,
      memories_archived INTEGER NOT NULL DEFAULT 0,
      importance_decayed INTEGER NOT NULL DEFAULT 0,
      principles_discovered INTEGER NOT NULL DEFAULT 0,
      compression_ratio REAL NOT NULL DEFAULT 1.0,
      journal_entry_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dream_history_ts ON dream_history(timestamp);
    CREATE INDEX IF NOT EXISTS idx_dream_history_cycle ON dream_history(cycle_id);

    CREATE TABLE IF NOT EXISTS dream_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      total_cycles INTEGER NOT NULL DEFAULT 0,
      last_dream_at INTEGER,
      total_memories_consolidated INTEGER NOT NULL DEFAULT 0,
      total_synapses_pruned INTEGER NOT NULL DEFAULT 0,
      total_memories_archived INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO dream_state (id) VALUES (1);

    CREATE TABLE IF NOT EXISTS dream_retrospective (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dream_cycle_id TEXT NOT NULL,
      pruned_items TEXT NOT NULL DEFAULT '[]',
      reappeared_count INTEGER NOT NULL DEFAULT 0,
      regret_score REAL NOT NULL DEFAULT 0,
      lesson TEXT DEFAULT '',
      analyzed_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_dream_retrospective_cycle ON dream_retrospective(dream_cycle_id);
  `);

  // Session 132: Add facts_extracted column to dream_history
  try { db.exec(`ALTER TABLE dream_history ADD COLUMN facts_extracted INTEGER NOT NULL DEFAULT 0`); } catch { /* exists */ }
}

// ── Engine ──────────────────────────────────────────────

export class DreamEngine {
  private db: Database.Database;
  private config: Required<DreamEngineConfig>;
  private consolidator: DreamConsolidator;
  private embeddingEngine: BaseEmbeddingEngine | null = null;
  private journal: ResearchJournal | null = null;
  private knowledgeDistiller: KnowledgeDistiller | null = null;
  private thoughtStream: ThoughtStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastActivityTimestamp = Date.now();
  private cycleCount = 0;
  private ticksSinceLastDream = 0;
  private maxTicksWithoutDream = 3; // Force consolidation after 3 timer ticks (~90 min) even if active
  private log = getLogger();

  constructor(db: Database.Database, config: DreamEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      intervalMs: config.intervalMs ?? 1_800_000,
      idleThresholdMs: config.idleThresholdMs ?? 300_000,
      replayBatchSize: config.replayBatchSize ?? 50,
      clusterSimilarityThreshold: config.clusterSimilarityThreshold ?? 0.35,
      minClusterSize: config.minClusterSize ?? 2,
      importanceDecayRate: config.importanceDecayRate ?? 0.5,
      importanceDecayAfterDays: config.importanceDecayAfterDays ?? 30,
      archiveImportanceThreshold: config.archiveImportanceThreshold ?? 3,
      dreamPruneThreshold: config.dreamPruneThreshold ?? 0.15,
      dreamLearningRate: config.dreamLearningRate ?? 0.15,
      maxConsolidationsPerCycle: config.maxConsolidationsPerCycle ?? 10,
    };
    this.consolidator = new DreamConsolidator();
    runDreamMigration(db);
  }

  /** Set the embedding engine for memory compression (cosine similarity). */
  setEmbeddingEngine(engine: BaseEmbeddingEngine): void {
    this.embeddingEngine = engine;
  }

  /** Set the research journal for dream logging. */
  setJournal(journal: ResearchJournal): void {
    this.journal = journal;
  }

  /** Set the knowledge distiller for periodic distillation during dreams. */
  setKnowledgeDistiller(distiller: KnowledgeDistiller): void {
    this.knowledgeDistiller = distiller;
  }

  /** Set the ThoughtStream for consciousness — emits dream thoughts. */
  setThoughtStream(stream: ThoughtStream): void {
    this.thoughtStream = stream;
  }

  /** Update config values at runtime (for ParameterRegistry sync). */
  updateConfig(partial: Partial<DreamEngineConfig>): void {
    if (partial.replayBatchSize !== undefined) this.config.replayBatchSize = partial.replayBatchSize;
    if (partial.clusterSimilarityThreshold !== undefined) this.config.clusterSimilarityThreshold = partial.clusterSimilarityThreshold;
    if (partial.minClusterSize !== undefined) this.config.minClusterSize = partial.minClusterSize;
    if (partial.importanceDecayRate !== undefined) this.config.importanceDecayRate = partial.importanceDecayRate;
    if (partial.importanceDecayAfterDays !== undefined) this.config.importanceDecayAfterDays = partial.importanceDecayAfterDays;
    if (partial.archiveImportanceThreshold !== undefined) this.config.archiveImportanceThreshold = partial.archiveImportanceThreshold;
    if (partial.dreamPruneThreshold !== undefined) this.config.dreamPruneThreshold = partial.dreamPruneThreshold;
    if (partial.dreamLearningRate !== undefined) this.config.dreamLearningRate = partial.dreamLearningRate;
    if (partial.maxConsolidationsPerCycle !== undefined) this.config.maxConsolidationsPerCycle = partial.maxConsolidationsPerCycle;
  }

  /** Get current config (read-only copy). */
  getConfig(): Readonly<Required<DreamEngineConfig>> {
    return { ...this.config };
  }

  /** Start the periodic dream timer. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.timerCallback();
    }, this.config.intervalMs);
    this.log.info(`[dream] Dream engine started (interval: ${this.config.intervalMs}ms, idle threshold: ${this.config.idleThresholdMs}ms)`);
  }

  /** Stop the dream timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Record activity — resets idle timer. Call this on every event/tool-call. */
  recordActivity(): void {
    this.lastActivityTimestamp = Date.now();
  }

  /**
   * Run a full consolidation cycle.
   * This is the main dream method — runs all 4 phases + optional distillation + journal.
   */
  consolidate(trigger: DreamTrigger = 'manual'): DreamCycleReport {
    this.cycleCount++;
    this.ticksSinceLastDream = 0;
    const cycleId = `dream-${this.config.brainName}-${Date.now()}-${this.cycleCount}`;
    const start = Date.now();
    const ts = this.thoughtStream;

    this.log.info(`[dream] ─── Dream Cycle #${this.cycleCount} (${trigger}) ───`);
    ts?.emit('dream', 'dreaming', `Dream Cycle #${this.cycleCount} starting (${trigger})...`, 'notable');

    // 0. Feed knowledge into memories table so consolidation has data to work with
    const fed = this.feedKnowledgeToMemories();
    if (fed > 0) {
      this.log.info(`[dream] Fed ${fed} knowledge items into memories table`);
      ts?.emit('dream', 'dreaming', `Fed ${fed} knowledge items into memories for consolidation`);
    }

    // 1. Memory Replay
    ts?.emit('dream', 'dreaming', `Replaying top ${this.config.replayBatchSize} memories...`);
    const replay = this.consolidator.replayMemories(this.db, this.config);
    if (replay.memoriesReplayed > 0) {
      this.log.info(`[dream] Replay: ${replay.memoriesReplayed} memories, ${replay.synapsesStrengthened} synapses strengthened`);
      ts?.emit('dream', 'dreaming', `Replayed ${replay.memoriesReplayed} memories, strengthened ${replay.synapsesStrengthened} synapses, decayed ${replay.synapsesDecayed}`);
    }

    // 2. Synapse Pruning
    ts?.emit('dream', 'dreaming', `Pruning weak synapses (threshold: ${this.config.dreamPruneThreshold})...`);
    const pruning = this.consolidator.pruneSynapses(this.db, this.config);
    if (pruning.synapsesPruned > 0) {
      this.log.info(`[dream] Pruning: ${pruning.synapsesPruned} weak synapses removed (threshold: ${pruning.threshold})`);
      ts?.emit('dream', 'dreaming', `Pruned ${pruning.synapsesPruned} weak synapses`);

      // Record pruned items for retrospective analysis
      const prunedItems = Array.from({ length: pruning.synapsesPruned }, (_, i) => ({
        synapseId: i, // IDs not available post-deletion; store count-based placeholders
        weight: pruning.threshold,
      }));
      this.recordPrunedItems(cycleId, prunedItems);
    }

    // 3. Memory Compression
    ts?.emit('dream', 'dreaming', 'Compressing similar memories...');
    const compression = this.consolidator.compressMemories(this.db, this.embeddingEngine, this.config);
    if (compression.memoriesConsolidated > 0) {
      this.log.info(`[dream] Compression: ${compression.memoriesConsolidated} clusters, ${compression.memoriesSuperseded} memories superseded (ratio: ${compression.compressionRatio.toFixed(2)})`);
      ts?.emit('dream', 'dreaming', `Compressed ${compression.memoriesSuperseded} memories into ${compression.memoriesConsolidated} clusters (ratio: ${compression.compressionRatio.toFixed(2)})`, 'notable');
    }

    // 3.5. Fact Extraction (Session 132: DreamEngine v2)
    let factExtraction: FactExtractionResult = { factsCreated: 0, constraintsCreated: 0, questionsCreated: 0 };
    if (compression.clusters.length > 0) {
      ts?.emit('dream', 'dreaming', `Extracting facts from ${compression.clusters.length} clusters...`);
      factExtraction = this.consolidator.extractFacts(this.db, compression.clusters, this.config);
      const totalExtracted = factExtraction.factsCreated + factExtraction.constraintsCreated + factExtraction.questionsCreated;
      if (totalExtracted > 0) {
        this.log.info(`[dream] Fact extraction: ${factExtraction.factsCreated} facts, ${factExtraction.constraintsCreated} constraints, ${factExtraction.questionsCreated} questions`);
        ts?.emit('dream', 'discovering', `Extracted ${totalExtracted} typed memories from dream clusters`, 'notable');
      }
    }

    // 4. Importance Decay
    ts?.emit('dream', 'dreaming', 'Decaying old memory importance...');
    const decay = this.consolidator.decayImportance(this.db, this.config);
    if (decay.memoriesDecayed > 0) {
      this.log.info(`[dream] Decay: ${decay.memoriesDecayed} memories decayed, ${decay.memoriesArchived} archived`);
      ts?.emit('dream', 'dreaming', `Decayed ${decay.memoriesDecayed} memories, archived ${decay.memoriesArchived}`);
    }

    // 5. Knowledge Distillation (optional)
    let principlesDiscovered = 0;
    if (this.knowledgeDistiller) {
      try {
        ts?.emit('dream', 'dreaming', 'Distilling knowledge from dreams...');
        const { principles, antiPatterns, strategies } = this.knowledgeDistiller.distill();
        principlesDiscovered = principles.length + antiPatterns.length + strategies.length;
        if (principlesDiscovered > 0) {
          this.log.info(`[dream] Distillation: ${principlesDiscovered} knowledge items extracted`);
          ts?.emit('dream', 'discovering', `Dream distillation: ${principlesDiscovered} knowledge items extracted`, 'notable');
        }
      } catch (err) {
        this.log.warn(`[dream] Distillation error: ${(err as Error).message}`);
      }
    }

    // 6. Journal Entry
    let journalEntryId: number | null = null;
    if (this.journal) {
      try {
        const entry = this.journal.write({
          type: 'reflection',
          title: `Dream #${this.cycleCount} (${trigger})`,
          content: [
            `Dream cycle completed:`,
            `  Replayed: ${replay.memoriesReplayed} memories, strengthened ${replay.synapsesStrengthened} synapses`,
            `  Pruned: ${pruning.synapsesPruned} weak synapses`,
            `  Compressed: ${compression.memoriesConsolidated} clusters, ${compression.memoriesSuperseded} superseded`,
            `  Decayed: ${decay.memoriesDecayed} memories, ${decay.memoriesArchived} archived`,
            (factExtraction.factsCreated + factExtraction.constraintsCreated + factExtraction.questionsCreated) > 0
              ? `  Extracted: ${factExtraction.factsCreated} facts, ${factExtraction.constraintsCreated} constraints, ${factExtraction.questionsCreated} questions`
              : '',
            principlesDiscovered > 0 ? `  Distilled: ${principlesDiscovered} knowledge items` : '',
          ].filter(Boolean).join('\n'),
          tags: ['dream', this.config.brainName, trigger],
          references: [],
          significance: compression.memoriesConsolidated > 0 || pruning.synapsesPruned > 5 ? 'notable' : 'routine',
          data: {
            cycleId,
            trigger,
            replay: { replayed: replay.memoriesReplayed, strengthened: replay.synapsesStrengthened },
            pruning: { pruned: pruning.synapsesPruned },
            compression: { consolidated: compression.memoriesConsolidated, superseded: compression.memoriesSuperseded },
            decay: { decayed: decay.memoriesDecayed, archived: decay.memoriesArchived },
          },
        });
        journalEntryId = entry.id ?? null;
      } catch (err) {
        this.log.warn(`[dream] Journal error: ${(err as Error).message}`);
      }
    }

    const duration = Date.now() - start;

    // 7. Persist to dream_history + update dream_state
    this.persistCycle({
      cycleId,
      timestamp: start,
      duration,
      trigger,
      replay,
      pruning,
      compression,
      factExtraction,
      decay,
      principlesDiscovered,
      journalEntryId,
    });

    this.log.info(`[dream] ─── Dream Cycle #${this.cycleCount} complete (${duration}ms) ───`);
    ts?.emit('dream', 'dreaming', `Dream Cycle #${this.cycleCount} complete: replayed ${replay.memoriesReplayed}, pruned ${pruning.synapsesPruned}, consolidated ${compression.memoriesConsolidated}, archived ${decay.memoriesArchived} (${duration}ms)`, 'breakthrough');

    return {
      cycleId,
      timestamp: start,
      duration,
      trigger,
      replay,
      pruning,
      compression,
      factExtraction,
      decay,
      principlesDiscovered,
      journalEntryId,
    };
  }

  /** Get current dream engine status. */
  getStatus(): DreamStatus {
    const state = this.db.prepare(`SELECT * FROM dream_state WHERE id = 1`).get() as Record<string, unknown> | undefined;
    return {
      running: this.timer !== null,
      totalCycles: (state?.total_cycles as number) ?? 0,
      lastDreamAt: (state?.last_dream_at as number) ?? null,
      totals: {
        memoriesConsolidated: (state?.total_memories_consolidated as number) ?? 0,
        synapsesPruned: (state?.total_synapses_pruned as number) ?? 0,
        memoriesArchived: (state?.total_memories_archived as number) ?? 0,
      },
    };
  }

  /** Get dream history entries. */
  getHistory(limit = 20): DreamHistoryEntry[] {
    return this.db.prepare(`
      SELECT * FROM dream_history ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as DreamHistoryEntry[];
  }

  // ── Retrospective Analysis ───────────────────────────────

  /** Record pruned synapse items for retrospective analysis. */
  recordPrunedItems(cycleId: string, items: Array<{ synapseId: number; weight: number }>): void {
    if (items.length === 0) return;
    try {
      this.db.prepare(`
        INSERT INTO dream_retrospective (dream_cycle_id, pruned_items)
        VALUES (?, ?)
      `).run(cycleId, JSON.stringify(items));
    } catch (err) {
      this.log.warn(`[dream] recordPrunedItems error: ${(err as Error).message}`);
    }
  }

  /**
   * Analyze recent dream cycles for pruning regret.
   * For each cycle with pruned items, check if synapses were recreated.
   */
  analyzeRetrospective(lastNCycles = 5): DreamRetrospective[] {
    const ts = this.thoughtStream;
    ts?.emit('dream', 'analyzing', `Analyzing retrospective for last ${lastNCycles} cycles...`);

    const results: DreamRetrospective[] = [];

    try {
      const rows = this.db.prepare(`
        SELECT * FROM dream_retrospective
        ORDER BY analyzed_at DESC LIMIT ?
      `).all(lastNCycles) as Record<string, unknown>[];

      for (const row of rows) {
        let prunedItems: Array<{ synapseId: number; weight: number }> = [];
        try { prunedItems = JSON.parse((row.pruned_items as string) || '[]'); } catch { /* ignore */ }

        if (prunedItems.length === 0) {
          results.push(this.toRetrospective(row));
          continue;
        }

        // Check how many pruned synapses reappeared
        let reappearedCount = 0;
        for (const item of prunedItems) {
          // Check if a synapse with similar source/target was recreated
          try {
            const original = this.db.prepare(`
              SELECT source_type, source_id, target_type, target_id FROM synapses WHERE id = ?
            `).get(item.synapseId) as Record<string, unknown> | undefined;

            if (original) {
              // The synapse still exists (wasn't actually pruned or was recreated with same id)
              reappearedCount++;
            } else {
              // Check if a new synapse with same source/target exists
              // The original was deleted, so we look by checking dream_history context
              // Since we can't know source/target post-deletion, count as not reappeared
            }
          } catch { /* synapses table might not exist */ }
        }

        // Also check: look for new synapses created after the pruning
        // Heuristic: count any new synapses with weight < 0.3 created after this cycle
        try {
          const cycleId = row.dream_cycle_id as string;
          const cycleTimestamp = this.db.prepare(`
            SELECT timestamp FROM dream_history WHERE cycle_id = ?
          `).get(cycleId) as { timestamp: number } | undefined;

          if (cycleTimestamp) {
            const newWeakSynapses = this.db.prepare(`
              SELECT COUNT(*) as cnt FROM synapses
              WHERE weight < 0.3
                AND created_at > datetime(?, 'unixepoch')
            `).get(cycleTimestamp.timestamp / 1000) as { cnt: number } | undefined;

            if (newWeakSynapses && newWeakSynapses.cnt > 0) {
              // Some new weak synapses appeared — could be re-creations
              reappearedCount = Math.max(reappearedCount, Math.min(prunedItems.length, newWeakSynapses.cnt));
            }
          }
        } catch { /* ignore */ }

        const regretScore = prunedItems.length > 0 ? reappearedCount / prunedItems.length : 0;

        // Generate lesson
        let lesson = '';
        if (regretScore > 0.5) {
          lesson = `High regret (${(regretScore * 100).toFixed(0)}%): Many pruned synapses were recreated. Consider raising prune threshold.`;
        } else if (regretScore > 0.2) {
          lesson = `Moderate regret (${(regretScore * 100).toFixed(0)}%): Some pruned connections reappeared. Current threshold may be slightly aggressive.`;
        } else {
          lesson = `Low regret (${(regretScore * 100).toFixed(0)}%): Pruning was efficient. Most removed connections stayed removed.`;
        }

        // Update the record
        try {
          this.db.prepare(`
            UPDATE dream_retrospective
            SET reappeared_count = ?, regret_score = ?, lesson = ?, analyzed_at = datetime('now')
            WHERE id = ?
          `).run(reappearedCount, regretScore, lesson, row.id);
        } catch { /* ignore */ }

        results.push({
          id: row.id as number,
          dreamCycleId: row.dream_cycle_id as string,
          prunedItems,
          reappearedCount,
          regretScore,
          lesson,
          analyzedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      this.log.warn(`[dream] analyzeRetrospective error: ${(err as Error).message}`);
    }

    if (results.length > 0) {
      const avgRegret = results.reduce((s, r) => s + r.regretScore, 0) / results.length;
      ts?.emit('dream', 'reflecting',
        `Retrospective: ${results.length} cycles analyzed, avg regret=${(avgRegret * 100).toFixed(0)}%`,
        avgRegret > 0.3 ? 'notable' : 'routine',
      );
    }

    return results;
  }

  /** Get retrospective entries. */
  getRetrospective(limit = 10): DreamRetrospective[] {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM dream_retrospective ORDER BY analyzed_at DESC LIMIT ?
      `).all(limit) as Record<string, unknown>[];
      return rows.map(r => this.toRetrospective(r));
    } catch {
      return [];
    }
  }

  /** Get aggregated pruning efficiency stats. */
  getPruningEfficiency(): PruningEfficiency {
    try {
      const row = this.db.prepare(`
        SELECT
          COUNT(*) as total_records,
          SUM(json_array_length(pruned_items)) as total_pruned,
          SUM(reappeared_count) as total_reappeared,
          AVG(regret_score) as avg_regret
        FROM dream_retrospective
        WHERE regret_score > 0 OR reappeared_count > 0
      `).get() as { total_records: number; total_pruned: number | null; total_reappeared: number | null; avg_regret: number | null };

      const totalPruned = row.total_pruned ?? 0;
      const totalReappeared = row.total_reappeared ?? 0;
      const avgRegretScore = row.avg_regret ?? 0;

      return {
        totalPruned,
        totalReappeared,
        avgRegretScore,
        efficiencyRate: 1 - avgRegretScore,
      };
    } catch {
      return { totalPruned: 0, totalReappeared: 0, avgRegretScore: 0, efficiencyRate: 1 };
    }
  }

  private toRetrospective(row: Record<string, unknown>): DreamRetrospective {
    let prunedItems: Array<{ synapseId: number; weight: number }> = [];
    try { prunedItems = JSON.parse((row.pruned_items as string) || '[]'); } catch { /* ignore */ }

    return {
      id: row.id as number,
      dreamCycleId: row.dream_cycle_id as string,
      prunedItems,
      reappearedCount: (row.reappeared_count as number) ?? 0,
      regretScore: (row.regret_score as number) ?? 0,
      lesson: (row.lesson as string) ?? '',
      analyzedAt: (row.analyzed_at as string) ?? '',
    };
  }

  // ── Private ─────────────────────────────────────────────

  private timerCallback(): void {
    this.ticksSinceLastDream++;
    const idleMs = Date.now() - this.lastActivityTimestamp;

    if (idleMs >= this.config.idleThresholdMs) {
      // Brain is idle — consolidate
      try {
        this.consolidate('idle');
        this.ticksSinceLastDream = 0;
      } catch (err) {
        this.log.error(`[dream] Dream cycle error: ${(err as Error).message}`);
      }
      return;
    }

    // Brain is active but hasn't dreamed in too long — force consolidation
    if (this.ticksSinceLastDream >= this.maxTicksWithoutDream) {
      this.log.info(`[dream] Brain active but ${this.ticksSinceLastDream} ticks without dream — forcing consolidation`);
      try {
        this.consolidate('auto');
        this.ticksSinceLastDream = 0;
      } catch (err) {
        this.log.error(`[dream] Dream cycle error: ${(err as Error).message}`);
      }
      return;
    }

    this.log.debug(`[dream] Brain active (idle ${Math.round(idleMs / 1000)}s < ${Math.round(this.config.idleThresholdMs / 1000)}s, ticks: ${this.ticksSinceLastDream}/${this.maxTicksWithoutDream}) — skipping dream`);
  }

  private persistCycle(report: DreamCycleReport): void {
    try {
      this.db.prepare(`
        INSERT INTO dream_history (
          cycle_id, timestamp, duration, trigger,
          memories_replayed, synapses_strengthened, synapses_pruned, synapses_decayed,
          memories_consolidated, memories_superseded, memories_archived, importance_decayed,
          principles_discovered, compression_ratio, journal_entry_id, facts_extracted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        report.cycleId,
        report.timestamp,
        report.duration,
        report.trigger,
        report.replay.memoriesReplayed,
        report.replay.synapsesStrengthened,
        report.pruning.synapsesPruned,
        report.replay.synapsesDecayed,
        report.compression.memoriesConsolidated,
        report.compression.memoriesSuperseded,
        report.decay.memoriesArchived,
        report.decay.memoriesDecayed,
        report.principlesDiscovered,
        report.compression.compressionRatio,
        report.journalEntryId,
        report.factExtraction.factsCreated + report.factExtraction.constraintsCreated + report.factExtraction.questionsCreated,
      );

      this.db.prepare(`
        UPDATE dream_state SET
          total_cycles = total_cycles + 1,
          last_dream_at = ?,
          total_memories_consolidated = total_memories_consolidated + ?,
          total_synapses_pruned = total_synapses_pruned + ?,
          total_memories_archived = total_memories_archived + ?,
          updated_at = datetime('now')
        WHERE id = 1
      `).run(
        report.timestamp,
        report.compression.memoriesConsolidated,
        report.pruning.synapsesPruned,
        report.decay.memoriesArchived,
      );
    } catch (err) {
      this.log.error(`[dream] Persist error: ${(err as Error).message}`);
    }
  }

  /**
   * Bridge Brain knowledge into the memories table so dream consolidation has data.
   * Converts recent journal entries, principles, and hypotheses into memory records.
   */
  private feedKnowledgeToMemories(): number {
    let fed = 0;

    // Check if memories table with 'key' column exists (full brain migration)
    const sql = `
      INSERT INTO memories (category, key, content, importance, source, tags, active)
      VALUES (?, ?, ?, ?, 'dream_feed', ?, 1)
      ON CONFLICT(project_id, key) WHERE key IS NOT NULL AND active = 1
      DO UPDATE SET content = excluded.content, importance = excluded.importance, updated_at = datetime('now')
    `;
    try {
      // Test that the SQL compiles — memories table may not exist or lack 'key' column
      this.db.prepare(sql);
    } catch {
      return 0; // memories table doesn't exist or has different schema
    }

    // Feed recent journal entries (all significance levels — journal is already sparse)
    if (this.journal) {
      try {
        const entries = this.journal.getEntries(undefined, 50);
        for (const entry of entries) {
          const key = `journal:${entry.id}`;
          const importance = entry.significance === 'breakthrough' ? 9 : entry.significance === 'notable' ? 7 : 5;
          try {
            this.db.prepare(sql).run('journal', key, `${entry.title}: ${entry.content.substring(0, 500)}`, importance, JSON.stringify(entry.tags));
            fed++;
          } catch { /* duplicate or schema mismatch — skip */ }
        }
      } catch { /* journal not available */ }
    }

    // Feed principles from knowledge distiller
    if (this.knowledgeDistiller) {
      try {
        const principles = this.knowledgeDistiller.getPrinciples(undefined, 50);
        for (const p of principles) {
          const key = `principle:${p.id}`;
          const importance = Math.round((p.confidence ?? 0.5) * 10);
          try {
            this.db.prepare(sql).run('principle', key, p.statement, importance, JSON.stringify([p.domain ?? 'general']));
            fed++;
          } catch { /* skip */ }
        }
      } catch { /* not available */ }

      // Feed anti-patterns
      try {
        const antiPatterns = this.knowledgeDistiller.getAntiPatterns(undefined, 30);
        for (const ap of antiPatterns) {
          const key = `antipattern:${ap.id}`;
          try {
            this.db.prepare(sql).run('antipattern', key, `${ap.statement}: ${ap.alternative}`, 6, JSON.stringify([ap.domain ?? 'general']));
            fed++;
          } catch { /* skip */ }
        }
      } catch { /* not available */ }
    }

    return fed;
  }
}
