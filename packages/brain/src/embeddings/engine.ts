import path from 'node:path';
import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

export interface EmbeddingConfig {
  enabled: boolean;
  modelName: string;
  cacheDir: string;
  sweepIntervalMs: number;
  batchSize: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pipeline = any;

export class EmbeddingEngine {
  private pipeline: Pipeline = null;
  private ready = false;
  private loading = false;
  private logger = getLogger();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private config: EmbeddingConfig,
    private db: Database.Database,
  ) {}

  async initialize(): Promise<void> {
    if (!this.config.enabled || this.loading || this.ready) return;

    this.loading = true;
    try {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = this.config.cacheDir;

      this.pipeline = await pipeline(
        'feature-extraction',
        this.config.modelName,
        { dtype: 'q8' },
      );

      this.ready = true;
      this.logger.info(`Embedding model loaded: ${this.config.modelName}`);
    } catch (err) {
      this.logger.warn(`Failed to load embedding model (will retry): ${err}`);
      this.ready = false;
    } finally {
      this.loading = false;
    }
  }

  /** Start background embedding sweep */
  start(): void {
    if (!this.config.enabled) return;

    // Initialize model in background
    this.initialize().then(() => {
      if (this.ready) {
        // Run initial sweep
        this.sweep().catch(err => this.logger.error('Embedding sweep error:', err));
      }
    });

    // Periodic sweep for new entries
    this.sweepTimer = setInterval(() => {
      if (this.ready) {
        this.sweep().catch(err => this.logger.error('Embedding sweep error:', err));
      }
    }, this.config.sweepIntervalMs);
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Generate embedding for a single text */
  async embed(text: string): Promise<Float32Array | null> {
    if (!this.ready || !this.pipeline) return null;

    try {
      const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
      const data = output.tolist()[0] as number[];
      return new Float32Array(data);
    } catch (err) {
      this.logger.error(`Embedding error: ${err}`);
      return null;
    }
  }

  /** Generate embeddings for a batch of texts */
  async embedBatch(texts: string[]): Promise<(Float32Array | null)[]> {
    if (!this.ready || !this.pipeline || texts.length === 0) return texts.map(() => null);

    try {
      const output = await this.pipeline(texts, { pooling: 'mean', normalize: true });
      const list = output.tolist() as number[][];
      return list.map(v => new Float32Array(v));
    } catch (err) {
      this.logger.error(`Batch embedding error: ${err}`);
      return texts.map(() => null);
    }
  }

  /** Compute and store embeddings for entries that don't have them yet */
  async sweep(): Promise<{ errors: number; modules: number; memories: number; sessions: number; decisions: number; tasks: number; docs: number }> {
    let errorsProcessed = 0;
    let modulesProcessed = 0;
    let memoriesProcessed = 0;
    let sessionsProcessed = 0;
    let decisionsProcessed = 0;
    let tasksProcessed = 0;
    let docsProcessed = 0;

    // Process errors without embeddings
    const pendingErrors = this.db.prepare(
      'SELECT id, type, message, context FROM errors WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.config.batchSize) as Array<{ id: number; type: string; message: string; context: string | null }>;

    if (pendingErrors.length > 0) {
      const texts = pendingErrors.map(e =>
        [e.type, e.message, e.context].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE errors SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingErrors.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(EmbeddingEngine.serialize(emb), pendingErrors[i]!.id);
          errorsProcessed++;
        }
      }
    }

    // Process code modules without embeddings
    const pendingModules = this.db.prepare(
      'SELECT id, name, description, file_path FROM code_modules WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.config.batchSize) as Array<{ id: number; name: string; description: string | null; file_path: string }>;

    if (pendingModules.length > 0) {
      const texts = pendingModules.map(m =>
        [m.name, m.description, m.file_path].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE code_modules SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingModules.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(EmbeddingEngine.serialize(emb), pendingModules[i]!.id);
          modulesProcessed++;
        }
      }
    }

    // Process memories without embeddings
    const pendingMemories = this.db.prepare(
      'SELECT id, category, key, content FROM memories WHERE embedding IS NULL AND active = 1 ORDER BY id DESC LIMIT ?'
    ).all(this.config.batchSize) as Array<{ id: number; category: string; key: string | null; content: string }>;

    if (pendingMemories.length > 0) {
      const texts = pendingMemories.map(m =>
        [m.category, m.key, m.content].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);
      const updateStmt = this.db.prepare('UPDATE memories SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingMemories.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(EmbeddingEngine.serialize(emb), pendingMemories[i]!.id);
          memoriesProcessed++;
        }
      }
    }

    // Process sessions without embeddings
    const pendingSessions = this.db.prepare(
      'SELECT id, summary, goals FROM sessions WHERE embedding IS NULL AND summary IS NOT NULL ORDER BY id DESC LIMIT ?'
    ).all(this.config.batchSize) as Array<{ id: number; summary: string; goals: string | null }>;

    if (pendingSessions.length > 0) {
      const texts = pendingSessions.map(s =>
        [s.summary, s.goals].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);
      const updateStmt = this.db.prepare('UPDATE sessions SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingSessions.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(EmbeddingEngine.serialize(emb), pendingSessions[i]!.id);
          sessionsProcessed++;
        }
      }
    }

    // Process decisions without embeddings
    const pendingDecisions = this.db.prepare(
      'SELECT id, title, description, alternatives FROM decisions WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.config.batchSize) as Array<{ id: number; title: string; description: string; alternatives: string | null }>;

    if (pendingDecisions.length > 0) {
      const texts = pendingDecisions.map(d =>
        [d.title, d.description, d.alternatives].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);
      const updateStmt = this.db.prepare('UPDATE decisions SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingDecisions.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(EmbeddingEngine.serialize(emb), pendingDecisions[i]!.id);
          decisionsProcessed++;
        }
      }
    }

    // Process tasks without embeddings
    const pendingTasks = this.db.prepare(
      'SELECT id, title, description, notes FROM tasks WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.config.batchSize) as Array<{ id: number; title: string; description: string | null; notes: string | null }>;

    if (pendingTasks.length > 0) {
      const texts = pendingTasks.map(t =>
        [t.title, t.description, t.notes].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);
      const updateStmt = this.db.prepare('UPDATE tasks SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingTasks.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(EmbeddingEngine.serialize(emb), pendingTasks[i]!.id);
          tasksProcessed++;
        }
      }
    }

    // Process project docs without embeddings
    const pendingDocs = this.db.prepare(
      'SELECT id, file_path, content FROM project_docs WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.config.batchSize) as Array<{ id: number; file_path: string; content: string }>;

    if (pendingDocs.length > 0) {
      const texts = pendingDocs.map(d =>
        // Truncate content for embedding (max ~500 chars)
        `${d.file_path} ${d.content.slice(0, 500)}`
      );
      const embeddings = await this.embedBatch(texts);
      const updateStmt = this.db.prepare('UPDATE project_docs SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingDocs.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(EmbeddingEngine.serialize(emb), pendingDocs[i]!.id);
          docsProcessed++;
        }
      }
    }

    const totalProcessed = errorsProcessed + modulesProcessed + memoriesProcessed +
      sessionsProcessed + decisionsProcessed + tasksProcessed + docsProcessed;
    if (totalProcessed > 0) {
      this.logger.info(`Embedding sweep: ${errorsProcessed} errors, ${modulesProcessed} modules, ${memoriesProcessed} memories, ${sessionsProcessed} sessions, ${decisionsProcessed} decisions, ${tasksProcessed} tasks, ${docsProcessed} docs`);
    }

    return { errors: errorsProcessed, modules: modulesProcessed, memories: memoriesProcessed, sessions: sessionsProcessed, decisions: decisionsProcessed, tasks: tasksProcessed, docs: docsProcessed };
  }

  /** Load vector scores for error matching (sync - reads pre-computed embeddings from DB) */
  computeErrorVectorScores(errorId: number, projectId: number): Map<number, number> {
    const scores = new Map<number, number>();

    const errorRow = this.db.prepare(
      'SELECT embedding FROM errors WHERE id = ?'
    ).get(errorId) as { embedding: Buffer | null } | undefined;

    if (!errorRow?.embedding) return scores;

    const incoming = EmbeddingEngine.deserialize(errorRow.embedding);

    const candidates = this.db.prepare(
      'SELECT id, embedding FROM errors WHERE project_id = ? AND id != ? AND embedding IS NOT NULL'
    ).all(projectId, errorId) as Array<{ id: number; embedding: Buffer }>;

    for (const c of candidates) {
      const candidate = EmbeddingEngine.deserialize(c.embedding);
      scores.set(c.id, EmbeddingEngine.similarity(incoming, candidate));
    }

    return scores;
  }

  /** Load vector scores for module-to-module matching (sync - reads pre-computed embeddings from DB) */
  computeModuleVectorScores(moduleId: number, language?: string): Map<number, number> {
    const scores = new Map<number, number>();

    const moduleRow = this.db.prepare(
      'SELECT embedding FROM code_modules WHERE id = ?'
    ).get(moduleId) as { embedding: Buffer | null } | undefined;

    if (!moduleRow?.embedding) return scores;

    const incoming = EmbeddingEngine.deserialize(moduleRow.embedding);

    let sql = 'SELECT id, embedding FROM code_modules WHERE id != ? AND embedding IS NOT NULL';
    const params: unknown[] = [moduleId];
    if (language) {
      sql += ' AND language = ?';
      params.push(language);
    }

    const candidates = this.db.prepare(sql).all(...params) as Array<{ id: number; embedding: Buffer }>;

    for (const c of candidates) {
      const candidate = EmbeddingEngine.deserialize(c.embedding);
      scores.set(c.id, EmbeddingEngine.similarity(incoming, candidate));
    }

    return scores;
  }

  /** Serialize Float32Array to Buffer for SQLite BLOB storage */
  static serialize(embedding: Float32Array): Buffer {
    return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
  }

  /** Deserialize SQLite BLOB to Float32Array */
  static deserialize(buffer: Buffer): Float32Array {
    const copy = Buffer.from(buffer);
    return new Float32Array(copy.buffer, copy.byteOffset, copy.length / 4);
  }

  /** Cosine similarity (embeddings are L2-normalized, so dot product = cosine) */
  static similarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i]! * b[i]!;
    }
    return Math.max(0, Math.min(1, dot));
  }
}
