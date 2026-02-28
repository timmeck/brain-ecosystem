import type Database from 'better-sqlite3';
import { BaseEmbeddingEngine } from '@timmeck/brain-core';

export interface TradingEmbeddingConfig {
  enabled: boolean;
  modelName?: string;
  cacheDir?: string;
  sweepIntervalMs: number;
  batchSize: number;
}

/**
 * Trading-brain-specific embedding engine.
 * Extends BaseEmbeddingEngine with sweep logic for trading domain tables:
 * trades, signal_combos, rules, memories, sessions, insights.
 */
export class TradingEmbeddingEngine extends BaseEmbeddingEngine {
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private sweepIntervalMs: number;
  private batchSize: number;

  constructor(
    private config: TradingEmbeddingConfig,
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
        this.sweep().catch(err => this.logger.error('Trading embedding sweep error:', err));
      }
    }).catch(() => {
      // initialize() already logs warnings
    });

    this.sweepTimer = setInterval(() => {
      if (this.isReady()) {
        this.sweep().catch(err => this.logger.error('Trading embedding sweep error:', err));
      }
    }, this.sweepIntervalMs);
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Compute and store embeddings for trading entries that don't have them yet */
  async sweep(): Promise<{ trades: number; signals: number; rules: number; memories: number; sessions: number; insights: number }> {
    let tradesProcessed = 0;
    let signalsProcessed = 0;
    let rulesProcessed = 0;
    let memoriesProcessed = 0;
    let sessionsProcessed = 0;
    let insightsProcessed = 0;

    // Process trades without embeddings
    const pendingTrades = this.db.prepare(
      'SELECT id, pair, bot_type, regime, profit_pct, signals_json FROM trades WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.batchSize) as Array<{ id: number; pair: string; bot_type: string; regime: string | null; profit_pct: number; signals_json: string | null }>;

    if (pendingTrades.length > 0) {
      const texts = pendingTrades.map(t =>
        [t.pair, t.bot_type, t.regime, `profit:${t.profit_pct}`, t.signals_json].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE trades SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingTrades.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(TradingEmbeddingEngine.serialize(emb), pendingTrades[i]!.id);
          tradesProcessed++;
        }
      }
    }

    // Process signal combos without embeddings
    const pendingSignals = this.db.prepare(
      'SELECT id, fingerprint, signals_json, regime FROM signal_combos WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.batchSize) as Array<{ id: number; fingerprint: string; signals_json: string; regime: string | null }>;

    if (pendingSignals.length > 0) {
      const texts = pendingSignals.map(s =>
        [s.fingerprint, s.signals_json, s.regime].filter(Boolean).join(' ')
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE signal_combos SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingSignals.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(TradingEmbeddingEngine.serialize(emb), pendingSignals[i]!.id);
          signalsProcessed++;
        }
      }
    }

    // Process rules without embeddings
    const pendingRules = this.db.prepare(
      'SELECT id, pattern, confidence, win_rate, avg_profit FROM rules WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
    ).all(this.batchSize) as Array<{ id: number; pattern: string; confidence: number; win_rate: number; avg_profit: number }>;

    if (pendingRules.length > 0) {
      const texts = pendingRules.map(r =>
        `${r.pattern} confidence:${r.confidence.toFixed(2)} winrate:${r.win_rate.toFixed(2)} avgprofit:${r.avg_profit.toFixed(2)}`
      );
      const embeddings = await this.embedBatch(texts);

      const updateStmt = this.db.prepare('UPDATE rules SET embedding = ? WHERE id = ?');
      for (let i = 0; i < pendingRules.length; i++) {
        const emb = embeddings[i];
        if (emb) {
          updateStmt.run(TradingEmbeddingEngine.serialize(emb), pendingRules[i]!.id);
          rulesProcessed++;
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
          updateStmt.run(TradingEmbeddingEngine.serialize(emb), pendingMemories[i]!.id);
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
          updateStmt.run(TradingEmbeddingEngine.serialize(emb), pendingSessions[i]!.id);
          sessionsProcessed++;
        }
      }
    }

    // Process insights without embeddings
    const pendingInsights = this.db.prepare(
      'SELECT id, type, title, description FROM insights WHERE embedding IS NULL ORDER BY id DESC LIMIT ?'
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
          updateStmt.run(TradingEmbeddingEngine.serialize(emb), pendingInsights[i]!.id);
          insightsProcessed++;
        }
      }
    }

    const totalProcessed = tradesProcessed + signalsProcessed + rulesProcessed +
      memoriesProcessed + sessionsProcessed + insightsProcessed;
    if (totalProcessed > 0) {
      this.logger.info(`Trading embedding sweep: ${tradesProcessed} trades, ${signalsProcessed} signals, ${rulesProcessed} rules, ${memoriesProcessed} memories, ${sessionsProcessed} sessions, ${insightsProcessed} insights`);
    }

    return { trades: tradesProcessed, signals: signalsProcessed, rules: rulesProcessed, memories: memoriesProcessed, sessions: sessionsProcessed, insights: insightsProcessed };
  }
}
