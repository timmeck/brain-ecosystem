import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface FeedbackSource {
  name: string;
  /** Fetch actionable items from this source */
  fetch: () => FeedbackItem[] | Promise<FeedbackItem[]>;
}

export interface FeedbackItem {
  source: string;
  type: 'ab_winner' | 'competitor_insight' | 'user_pattern' | 'engagement_feedback' | 'custom';
  data: Record<string, unknown>;
  confidence: number;
}

export interface FeedbackAction {
  type: string;
  payload: Record<string, unknown>;
  source: string;
  confidence: number;
}

export interface FeedbackRouterStatus {
  sources: number;
  totalProcessed: number;
  totalActions: number;
  lastRunAt: string | null;
}

type ActionHandler = (action: FeedbackAction) => void | Promise<void>;

// ── Migration ──────────────────────────────────────────────

export function runFeedbackRouterMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback_router_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      action_type TEXT,
      payload TEXT DEFAULT '{}',
      confidence REAL DEFAULT 0,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_frl_source ON feedback_router_log(source);
    CREATE INDEX IF NOT EXISTS idx_frl_timestamp ON feedback_router_log(timestamp);
  `);
}

// ── Router ──────────────────────────────────────────────────

const log = getLogger();

/**
 * FeedbackRouter — collects feedback from multiple sources (ABTest, Competitor, UserModel, etc.)
 * and generates ActionBridge proposals or direct engine adjustments.
 */
export class FeedbackRouter {
  private readonly db: Database.Database;
  private readonly sources: FeedbackSource[] = [];
  private actionHandler: ActionHandler | null = null;

  private readonly stmtInsert;
  private readonly stmtCount;
  private readonly stmtLastRun;

  constructor(db: Database.Database) {
    this.db = db;
    runFeedbackRouterMigration(db);

    this.stmtInsert = db.prepare(`INSERT INTO feedback_router_log (source, type, action_type, payload, confidence, timestamp) VALUES (?, ?, ?, ?, ?, ?)`);
    this.stmtCount = db.prepare(`SELECT COUNT(*) as count FROM feedback_router_log`);
    this.stmtLastRun = db.prepare(`SELECT MAX(timestamp) as ts FROM feedback_router_log`);
  }

  /** Register a feedback source */
  addSource(source: FeedbackSource): void {
    this.sources.push(source);
  }

  /** Set handler for generated actions (typically ActionBridge.propose) */
  setActionHandler(handler: ActionHandler): void {
    this.actionHandler = handler;
  }

  /** Process all sources and generate actions */
  async processAll(): Promise<{ items: number; actions: number }> {
    let totalItems = 0;
    let totalActions = 0;

    for (const source of this.sources) {
      try {
        const items = await source.fetch();
        totalItems += items.length;

        for (const item of items) {
          const actions = this.routeItem(item);
          for (const action of actions) {
            this.stmtInsert.run(item.source, item.type, action.type, JSON.stringify(action.payload), action.confidence, Date.now());
            if (this.actionHandler) {
              try { await this.actionHandler(action); } catch (err) {
                log.warn(`[feedback-router] Action handler error: ${(err as Error).message}`);
              }
            }
            totalActions++;
          }

          // Log items that didn't produce actions
          if (actions.length === 0) {
            this.stmtInsert.run(item.source, item.type, null, JSON.stringify(item.data), item.confidence, Date.now());
          }
        }
      } catch (err) {
        log.warn(`[feedback-router] Source "${source.name}" error: ${(err as Error).message}`);
      }
    }

    log.info(`[feedback-router] Processed ${totalItems} items → ${totalActions} actions`);
    return { items: totalItems, actions: totalActions };
  }

  /** Get status */
  getStatus(): FeedbackRouterStatus {
    const count = (this.stmtCount.get() as { count: number }).count;
    const lastTs = (this.stmtLastRun.get() as { ts: number | null }).ts;
    const actionCount = (this.db.prepare(`SELECT COUNT(*) as count FROM feedback_router_log WHERE action_type IS NOT NULL`).get() as { count: number }).count;

    return {
      sources: this.sources.length,
      totalProcessed: count,
      totalActions: actionCount,
      lastRunAt: lastTs ? new Date(lastTs).toISOString() : null,
    };
  }

  // ── Private ──────────────────────────────────────────────

  /** Route a feedback item to concrete actions */
  private routeItem(item: FeedbackItem): FeedbackAction[] {
    const actions: FeedbackAction[] = [];

    switch (item.type) {
      case 'ab_winner': {
        // AB test winner → adjust content parameters
        const winner = item.data.winner as string;
        const metric = item.data.metric as string;
        if (winner && item.confidence >= 0.7) {
          actions.push({
            type: 'adjust_parameter',
            payload: {
              parameter: metric ?? 'content_template',
              value: winner,
              reason: `AB test winner: variant ${winner}`,
              testId: item.data.testId,
            },
            source: item.source,
            confidence: item.confidence,
          });
        }
        break;
      }
      case 'competitor_insight': {
        // Competitor insight → creative seed or frequency adjustment
        const verdict = item.data.verdict as string;
        if (verdict && item.confidence >= 0.5) {
          actions.push({
            type: 'adjust_parameter',
            payload: {
              parameter: 'posting_frequency',
              reason: `Competitor analysis: ${verdict}`,
              competitorId: item.data.competitorId,
            },
            source: item.source,
            confidence: item.confidence,
          });
        }
        if (item.data.topicSeed) {
          actions.push({
            type: 'creative_seed',
            payload: {
              topic: item.data.topicSeed,
              reason: 'Trending competitor topic',
            },
            source: item.source,
            confidence: item.confidence,
          });
        }
        break;
      }
      case 'user_pattern': {
        // User model pattern → schedule optimization
        const activeHours = item.data.activeHours as number[];
        if (activeHours && activeHours.length > 0) {
          actions.push({
            type: 'adjust_parameter',
            payload: {
              parameter: 'optimal_posting_hours',
              value: activeHours,
              reason: 'User activity pattern',
            },
            source: item.source,
            confidence: item.confidence,
          });
        }
        break;
      }
      case 'engagement_feedback': {
        // Engagement data → content strategy adjustment
        const avgEngagement = item.data.avgEngagement as number;
        if (typeof avgEngagement === 'number') {
          actions.push({
            type: 'adjust_parameter',
            payload: {
              parameter: 'engagement_baseline',
              value: avgEngagement,
              reason: 'Engagement trend update',
            },
            source: item.source,
            confidence: item.confidence,
          });
        }
        break;
      }
      default:
        // Custom items pass through if high confidence
        if (item.confidence >= 0.8 && item.data.actionType) {
          actions.push({
            type: item.data.actionType as string,
            payload: item.data,
            source: item.source,
            confidence: item.confidence,
          });
        }
    }

    return actions;
  }
}
