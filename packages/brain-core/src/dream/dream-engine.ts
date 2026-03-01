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
  `);
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
      replayBatchSize: config.replayBatchSize ?? 20,
      clusterSimilarityThreshold: config.clusterSimilarityThreshold ?? 0.75,
      minClusterSize: config.minClusterSize ?? 3,
      importanceDecayRate: config.importanceDecayRate ?? 0.5,
      importanceDecayAfterDays: config.importanceDecayAfterDays ?? 30,
      archiveImportanceThreshold: config.archiveImportanceThreshold ?? 1,
      dreamPruneThreshold: config.dreamPruneThreshold ?? 0.15,
      dreamLearningRate: config.dreamLearningRate ?? 0.15,
      maxConsolidationsPerCycle: config.maxConsolidationsPerCycle ?? 5,
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
    }

    // 3. Memory Compression
    ts?.emit('dream', 'dreaming', 'Compressing similar memories...');
    const compression = this.consolidator.compressMemories(this.db, this.embeddingEngine, this.config);
    if (compression.memoriesConsolidated > 0) {
      this.log.info(`[dream] Compression: ${compression.memoriesConsolidated} clusters, ${compression.memoriesSuperseded} memories superseded (ratio: ${compression.compressionRatio.toFixed(2)})`);
      ts?.emit('dream', 'dreaming', `Compressed ${compression.memoriesSuperseded} memories into ${compression.memoriesConsolidated} clusters (ratio: ${compression.compressionRatio.toFixed(2)})`, 'notable');
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
          principles_discovered, compression_ratio, journal_entry_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
}
