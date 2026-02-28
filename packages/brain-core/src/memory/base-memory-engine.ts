import { getLogger } from '../utils/logger.js';
import { BaseEmbeddingEngine } from '../embeddings/engine.js';
import type { MemoryRecord, MemoryEngineConfig } from './types.js';

/**
 * Abstract base class for memory engines.
 * Handles timer lifecycle for periodic memory maintenance:
 * - Expiry checks (deactivate expired memories)
 * - Consolidation (merge similar memories)
 * - Importance decay (reduce importance of never-recalled memories)
 *
 * Optionally supports semantic recall via BaseEmbeddingEngine.
 * Subclasses implement runCycle() and may override semanticRecall().
 */
export abstract class BaseMemoryEngine {
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected logger = getLogger();
  protected embeddingEngine: BaseEmbeddingEngine | null = null;

  constructor(protected config: MemoryEngineConfig) {}

  /** Attach an embedding engine for semantic recall support. */
  setEmbeddingEngine(engine: BaseEmbeddingEngine): void {
    this.embeddingEngine = engine;
  }

  start(): void {
    this.timer = setInterval(() => {
      try {
        this.runCycle();
      } catch (err) {
        this.logger.error('Memory engine cycle error', { error: String(err) });
      }
    }, this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Recall memories semantically similar to the query.
   *
   * Default implementation:
   *   - If an embedding engine is available and ready, embeds the query and
   *     compares against memory embeddings via cosine similarity.
   *   - Falls back to textSearch() if embeddings are unavailable.
   *
   * Subclasses may override for domain-specific retrieval.
   */
  async semanticRecall(query: string, limit = 10): Promise<MemoryRecord[]> {
    // Try embedding-based recall first
    if (this.embeddingEngine?.isReady()) {
      try {
        const queryVec = await this.embeddingEngine.embed(query);
        const memories = this.getActiveMemoriesWithEmbeddings();

        const scored = memories
          .map(m => ({
            memory: m,
            score: BaseEmbeddingEngine.similarity(
              queryVec,
              BaseEmbeddingEngine.deserialize(m.embedding!),
            ),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);

        return scored.map(s => s.memory);
      } catch (err) {
        this.logger.warn(`Semantic recall failed, falling back to text search: ${err}`);
      }
    }

    // Fallback: text-based search
    return this.textSearch(query, limit);
  }

  /**
   * Return active memories that have pre-computed embeddings.
   * Subclasses must implement this to query their database.
   */
  protected abstract getActiveMemoriesWithEmbeddings(): MemoryRecord[];

  /**
   * Text-based fallback search for memories.
   * Subclasses must implement this to query their database (e.g. FTS).
   */
  protected abstract textSearch(query: string, limit: number): MemoryRecord[];

  abstract runCycle(): unknown;
}
