import { getLogger } from '../utils/logger.js';

/**
 * Configuration for the BaseEmbeddingEngine.
 * Only core embedding settings — no sweep/domain logic.
 */
export interface EmbeddingConfig {
  /** Whether embeddings are enabled */
  enabled: boolean;
  /** HuggingFace model name (default: "Xenova/all-MiniLM-L6-v2") */
  modelName?: string;
  /** Local cache directory for model files */
  cacheDir?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pipeline = any;

/**
 * Generic embedding engine that loads a HuggingFace transformer model
 * and provides text embedding + cosine similarity.
 *
 * `@huggingface/transformers` is an optional peer dependency —
 * it is dynamically imported at initialization time so consumers
 * that don't need embeddings don't pay the cost.
 *
 * Subclasses (brain, trading-brain, marketing-brain) add their own
 * domain-specific sweep / batch-embed logic on top.
 */
export class BaseEmbeddingEngine {
  protected pipeline: Pipeline = null;
  protected ready = false;
  protected loading = false;
  protected logger = getLogger();
  protected modelName: string;
  protected cacheDir: string | undefined;
  protected enabled: boolean;

  constructor(config: EmbeddingConfig) {
    this.enabled = config.enabled;
    this.modelName = config.modelName ?? 'Xenova/all-MiniLM-L6-v2';
    this.cacheDir = config.cacheDir;
  }

  /** Load the transformer model. Safe to call multiple times. */
  async initialize(): Promise<void> {
    if (!this.enabled || this.loading || this.ready) return;

    this.loading = true;
    try {
      // Dynamic import — @huggingface/transformers is an optional peer dep
      let pipelineFn: Pipeline;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let env: any;
      try {
        const transformers = await import('@huggingface/transformers');
        pipelineFn = transformers.pipeline;
        env = transformers.env;
      } catch {
        throw new Error(
          'Embeddings require @huggingface/transformers. Install with: npm install @huggingface/transformers',
        );
      }

      if (this.cacheDir) {
        env.cacheDir = this.cacheDir;
      }

      this.pipeline = await pipelineFn(
        'feature-extraction',
        this.modelName,
        { dtype: 'q8' },
      );

      this.ready = true;
      this.logger.info(`Embedding model loaded: ${this.modelName}`);
    } catch (err) {
      this.logger.warn(`Failed to load embedding model: ${err}`);
      this.ready = false;
      throw err;
    } finally {
      this.loading = false;
    }
  }

  /** Whether the model has been loaded and is ready. */
  isReady(): boolean {
    return this.ready;
  }

  /** Generate an embedding vector for a single text string. */
  async embed(text: string): Promise<Float32Array> {
    if (!this.ready || !this.pipeline) {
      throw new Error('EmbeddingEngine not initialized — call initialize() first');
    }

    const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
    const data = output.tolist()[0] as number[];
    return new Float32Array(data);
  }

  /** Generate embeddings for a batch of texts. */
  async embedBatch(texts: string[]): Promise<(Float32Array | null)[]> {
    if (!this.ready || !this.pipeline || texts.length === 0) {
      return texts.map(() => null);
    }

    try {
      const output = await this.pipeline(texts, { pooling: 'mean', normalize: true });
      const list = output.tolist() as number[][];
      return list.map(v => new Float32Array(v));
    } catch (err) {
      this.logger.error(`Batch embedding error: ${err}`);
      return texts.map(() => null);
    }
  }

  /**
   * Cosine similarity between two L2-normalized embedding vectors.
   * Since the vectors are already normalized, dot product equals cosine.
   */
  static similarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
    }
    return Math.max(0, Math.min(1, dot));
  }

  /** Instance convenience wrapper for static similarity. */
  similarity(a: Float32Array, b: Float32Array): number {
    return BaseEmbeddingEngine.similarity(a, b);
  }

  /** Serialize Float32Array to Buffer for SQLite BLOB storage. */
  static serialize(embedding: Float32Array): Buffer {
    return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  }

  /** Deserialize SQLite BLOB to Float32Array. */
  static deserialize(buffer: Buffer): Float32Array {
    const copy = Buffer.from(buffer);
    return new Float32Array(copy.buffer, copy.byteOffset, copy.length / 4);
  }
}
