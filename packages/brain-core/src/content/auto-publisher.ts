import { getLogger } from '../utils/logger.js';
import type { ContentForge } from './content-forge.js';

// ── Types ──────────────────────────────────────────────────

export interface AutoPublisherConfig {
  maxPublishPerHour: number;
  minTimeBetweenPostsMs: number;
  engagementCheckDelayMs: number;
  requireLLMPolish: boolean;
}

export interface AutoPublisherStats {
  publishedToday: number;
  avgEngagement: number;
  lastPublishAt: string | null;
  checksRun: number;
}

const DEFAULT_CONFIG: AutoPublisherConfig = {
  maxPublishPerHour: 2,
  minTimeBetweenPostsMs: 1_800_000, // 30 min
  engagementCheckDelayMs: 3_600_000, // 1 hour
  requireLLMPolish: false,
};

// ── AutoPublisher ──────────────────────────────────────────

const log = getLogger();

export class AutoPublisher {
  private readonly config: AutoPublisherConfig;
  private publishedThisHour = 0;
  private lastPublishAt: number = 0;
  private publishedToday = 0;
  private checksRun = 0;
  private hourResetTimer: ReturnType<typeof setInterval> | null = null;
  private pendingEngagementChecks: Array<{ pieceId: number; checkAt: number }> = [];

  constructor(
    private contentForge: ContentForge,
    config?: Partial<AutoPublisherConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check for due scheduled content and publish it.
   * Returns count of published and skipped pieces.
   */
  async checkAndPublish(): Promise<{ published: number; skipped: number }> {
    this.checksRun++;
    const now = Date.now();
    let published = 0;
    let skipped = 0;

    // Rate limit: max per hour
    if (this.publishedThisHour >= this.config.maxPublishPerHour) {
      log.info(`[auto-publisher] Rate limit reached (${this.publishedThisHour}/${this.config.maxPublishPerHour} per hour)`);
      return { published: 0, skipped: 0 };
    }

    // Rate limit: min time between posts
    if (now - this.lastPublishAt < this.config.minTimeBetweenPostsMs) {
      return { published: 0, skipped: 0 };
    }

    // Get scheduled content that's due
    const scheduled = this.contentForge.getSchedule();
    const nowIso = new Date().toISOString();

    for (const piece of scheduled) {
      if (this.publishedThisHour >= this.config.maxPublishPerHour) break;
      if (now - this.lastPublishAt < this.config.minTimeBetweenPostsMs && published > 0) break;

      // Only publish if scheduled time has passed
      if (piece.scheduledFor && piece.scheduledFor > nowIso) {
        skipped++;
        continue;
      }

      try {
        const result = await this.contentForge.publishNow(piece.id);
        if (result.success) {
          published++;
          this.publishedThisHour++;
          this.publishedToday++;
          this.lastPublishAt = Date.now();

          // Schedule engagement check
          this.pendingEngagementChecks.push({
            pieceId: piece.id,
            checkAt: Date.now() + this.config.engagementCheckDelayMs,
          });

          log.info(`[auto-publisher] Published #${piece.id}: ${piece.title} → ${result.postId ?? 'ok'}`);
        } else {
          skipped++;
        }
      } catch (err) {
        log.warn(`[auto-publisher] Failed to publish #${piece.id}: ${(err as Error).message}`);
        skipped++;
      }
    }

    // Also publish high-confidence drafts (not yet scheduled)
    const drafts = this.contentForge.getByStatus('draft', 5);
    for (const draft of drafts) {
      if (this.publishedThisHour >= this.config.maxPublishPerHour) break;
      if (now - this.lastPublishAt < this.config.minTimeBetweenPostsMs && published > 0) break;

      // Auto-schedule draft at optimal time
      const optimalTime = this.contentForge.getOptimalTime(draft.platform);
      const today = new Date().toISOString().split('T')[0];
      this.contentForge.schedule(draft.id, `${today}T${optimalTime}:00Z`);
      skipped++; // Scheduled for later, not published now
    }

    return { published, skipped };
  }

  /**
   * Check engagement for recently published content.
   * Calls the provided refresh function for each piece whose check time has arrived.
   */
  async refreshEngagement(socialService?: { getEngagement?: (postId: string) => Promise<{ likes: number; reposts: number; replies: number }> }): Promise<number> {
    const now = Date.now();
    const due = this.pendingEngagementChecks.filter(c => c.checkAt <= now);
    let refreshed = 0;

    for (const check of due) {
      try {
        const piece = this.contentForge.getPiece(check.pieceId);
        if (piece && piece.status === 'published') {
          // If we have a social service with getEngagement, use it
          if (socialService?.getEngagement) {
            // We'd need the postId — for now just record placeholder
            log.info(`[auto-publisher] Engagement check for #${check.pieceId} scheduled`);
          }
          refreshed++;
        }
      } catch (err) {
        log.warn(`[auto-publisher] Engagement refresh error for #${check.pieceId}: ${(err as Error).message}`);
      }
    }

    // Remove processed checks
    this.pendingEngagementChecks = this.pendingEngagementChecks.filter(c => c.checkAt > now);

    return refreshed;
  }

  /** Start hourly rate-limit reset timer */
  start(): void {
    this.hourResetTimer = setInterval(() => {
      this.publishedThisHour = 0;
    }, 3_600_000);
  }

  /** Stop timer */
  stop(): void {
    if (this.hourResetTimer) {
      clearInterval(this.hourResetTimer);
      this.hourResetTimer = null;
    }
  }

  /** Reset daily counter (call at midnight) */
  resetDaily(): void {
    this.publishedToday = 0;
  }

  /** Get statistics */
  getStats(): AutoPublisherStats {
    return {
      publishedToday: this.publishedToday,
      avgEngagement: this.contentForge.getStatus().avgEngagement,
      lastPublishAt: this.lastPublishAt > 0 ? new Date(this.lastPublishAt).toISOString() : null,
      checksRun: this.checksRun,
    };
  }
}
