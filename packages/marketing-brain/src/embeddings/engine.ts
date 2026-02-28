import type Database from 'better-sqlite3';
import { BaseEmbeddingEngine } from '@timmeck/brain-core';

export interface MarketingEmbeddingConfig {
  enabled: boolean;
  modelName?: string;
  cacheDir?: string;
  sweepIntervalMs: number;
  batchSize: number;
}

/**
 * Marketing-brain-specific embedding engine.
 * Extends BaseEmbeddingEngine with sweep logic for marketing domain tables:
 * posts, campaigns, strategies, content_templates, insights, memories, sessions.
 */
export class MarketingEmbeddingEngine extends BaseEmbeddingEngine {
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweepIntervalMs: number;
  private batchSize: number;

  constructor(
    private config: MarketingEmbeddingConfig,
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

    this.initialize().then(() => {
      if (this.isReady()) {
        this.sweep().catch(err => this.logger.error('Marketing embedding sweep error:', err));
      }
    }).catch(() => {
      // initialize() already logs warnings
    });

    this.sweepTimer = setInterval(() => {
      if (this.isReady()) {
        this.sweep().catch(err => this.logger.error('Marketing embedding sweep error:', err));
      }
    }, this.sweepIntervalMs);
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Compute and store embeddings for marketing entries that don't have them yet */
  async sweep(): Promise<{ posts: number; campaigns: number; strategies: number; templates: number; insights: number; memories: number; sessions: number }> {
    let postsProcessed = 0;
    let campaignsProcessed = 0;
    let strategiesProcessed = 0;
    let templatesProcessed = 0;
    let insightsProcessed = 0;
    let memoriesProcessed = 0;
    let sessionsProcessed = 0;

    // Process posts without embeddings
    const pendingPosts = this.db.prepare(
      'SELECT id, platform, content, format, hashtags FROM posts WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.batchSize) as Array<{ id: number; platform: string; content: string; format: string; hashtags: string | null }>;

    if (pendingPosts.length > 0) {
      const texts = pendingPosts.map(p =>
        [p.platform, p.format, p.content.slice(0, 500), p.hashtags].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE posts SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingPosts.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(MarketingEmbeddingEngine.serialize(emb), pendingPosts[i]!.id);
          postsProcessed++;
        }
      }
    }

    // Process campaigns without embeddings
    const pendingCampaigns = this.db.prepare(
      'SELECT id, name, brand, goal, platform FROM campaigns WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.batchSize) as Array<{ id: number; name: string; brand: string | null; goal: string | null; platform: string | null }>;

    if (pendingCampaigns.length > 0) {
      const texts = pendingCampaigns.map(c =>
        [c.name, c.brand, c.goal, c.platform].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE campaigns SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingCampaigns.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(MarketingEmbeddingEngine.serialize(emb), pendingCampaigns[i]!.id);
          campaignsProcessed++;
        }
      }
    }

    // Process strategies without embeddings
    const pendingStrategies = this.db.prepare(
      'SELECT id, description, approach, outcome FROM strategies WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.batchSize) as Array<{ id: number; description: string; approach: string | null; outcome: string | null }>;

    if (pendingStrategies.length > 0) {
      const texts = pendingStrategies.map(s =>
        [s.description, s.approach, s.outcome].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE strategies SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingStrategies.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(MarketingEmbeddingEngine.serialize(emb), pendingStrategies[i]!.id);
          strategiesProcessed++;
        }
      }
    }

    // Process content templates without embeddings
    const pendingTemplates = this.db.prepare(
      'SELECT id, name, structure, example, platform FROM content_templates WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.batchSize) as Array<{ id: number; name: string; structure: string; example: string | null; platform: string | null }>;

    if (pendingTemplates.length > 0) {
      const texts = pendingTemplates.map(t =>
        [t.name, t.platform, t.structure, t.example?.slice(0, 300)].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE content_templates SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingTemplates.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(MarketingEmbeddingEngine.serialize(emb), pendingTemplates[i]!.id);
          templatesProcessed++;
        }
      }
    }

    // Process insights without embeddings
    const pendingInsights = this.db.prepare(
      'SELECT id, type, title, description FROM insights WHERE embedding IS NULL AND active = 1 ORDER BY id DESC LIMIT ?'
    ).all(this.batchSize) as Array<{ id: number; type: string; title: string; description: string }>;

    if (pendingInsights.length > 0) {
      const texts = pendingInsights.map(i =>
        [i.type, i.title, i.description].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE insights SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingInsights.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(MarketingEmbeddingEngine.serialize(emb), pendingInsights[i]!.id);
          insightsProcessed++;
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
          updateStmt.run(MarketingEmbeddingEngine.serialize(emb), pendingMemories[i]!.id);
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
          updateStmt.run(MarketingEmbeddingEngine.serialize(emb), pendingSessions[i]!.id);
          sessionsProcessed++;
        }
      }
    }

    const totalProcessed = postsProcessed + campaignsProcessed + strategiesProcessed +
      templatesProcessed + insightsProcessed + memoriesProcessed + sessionsProcessed;
    if (totalProcessed > 0) {
      this.logger.info(`Marketing embedding sweep: ${postsProcessed} posts, ${campaignsProcessed} campaigns, ${strategiesProcessed} strategies, ${templatesProcessed} templates, ${insightsProcessed} insights, ${memoriesProcessed} memories, ${sessionsProcessed} sessions`);
    }

    return { posts: postsProcessed, campaigns: campaignsProcessed, strategies: strategiesProcessed, templates: templatesProcessed, insights: insightsProcessed, memories: memoriesProcessed, sessions: sessionsProcessed };
  }
}
