import type Database from 'better-sqlite3';
import { BaseEmbeddingEngine } from '@timmeck/brain-core';

export interface EmbeddingConfig {
  enabled: boolean;
  modelName: string;
  cacheDir: string;
  sweepIntervalMs: number;
  batchSize: number;
}

/**
 * Brain-specific embedding engine.
 * Extends BaseEmbeddingEngine with sweep logic for brain's domain tables:
 * errors, code_modules, memories, sessions, decisions, tasks, project_docs.
 */
export class EmbeddingEngine extends BaseEmbeddingEngine {
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweepIntervalMs: number;
  private batchSize: number;

  constructor(
    private config: EmbeddingConfig,
    private db: Database.Database,
  ) {
    super({
      enabled: config.enabled,
      modelName: config.modelName,
      cacheDir: config.cacheDir,
    });
    this.sweepIntervalMs = config.sweepIntervalMs;
    this.batchSize = config.batchSize;
  }

  /** Start background embedding sweep */
  start(): void {
    if (!this.config.enabled) return;

    // Initialize model in background
    this.initialize().then(() => {
      if (this.isReady()) {
        // Run initial sweep
        this.sweep().catch(err => this.logger.error('Embedding sweep error:', err));
      }
    }).catch(() => {
      // initialize() already logs warnings
    });

    // Periodic sweep for new entries
    this.sweepTimer = setInterval(() => {
      if (this.isReady()) {
        this.sweep().catch(err => this.logger.error('Embedding sweep error:', err));
      }
    }, this.sweepIntervalMs);
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Generate embedding for a single text, returning null on failure (backward compat) */
  async embedSafe(text: string): Promise<Float32Array | null> {
    if (!this.isReady()) return null;
    try {
      return await this.embed(text);
    } catch {
      return null;
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
    ).all(this.batchSize) as Array<{ id: number; type: string; message: string; context: string | null }>;

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
    ).all(this.batchSize) as Array<{ id: number; name: string; description: string | null; file_path: string }>;

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
    ).all(this.batchSize) as Array<{ id: number; category: string; key: string | null; content: string }>;

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
    ).all(this.batchSize) as Array<{ id: number; summary: string; goals: string | null }>;

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
    ).all(this.batchSize) as Array<{ id: number; title: string; description: string; alternatives: string | null }>;

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
    ).all(this.batchSize) as Array<{ id: number; title: string; description: string | null; notes: string | null }>;

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
    ).all(this.batchSize) as Array<{ id: number; file_path: string; content: string }>;

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
}
