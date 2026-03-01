import type Database from 'better-sqlite3';
import type { DataMinerAdapter, MinedObservation, MinedCausalEvent, MinedMetric, MinedHypothesisObservation, MinedCrossDomainEvent } from '../data-miner.js';

/**
 * DataMiner adapter for Marketing Brain.
 * Mines: posts + engagement (platform/format performance), campaigns (goal achievement),
 *        content_templates (template effectiveness), competitor_posts (benchmarks).
 */
export class MarketingDataMinerAdapter implements DataMinerAdapter {
  readonly name = 'marketing-brain';

  mineObservations(db: Database.Database, since: number): MinedObservation[] {
    const observations: MinedObservation[] = [];

    // Post performance by platform
    const platformStats = safeAll<{ platform: string; cnt: number; avg_likes: number; avg_shares: number; avg_comments: number }>(
      db,
      `SELECT p.platform, COUNT(*) as cnt,
              AVG(COALESCE(e.likes, 0)) as avg_likes,
              AVG(COALESCE(e.shares, 0)) as avg_shares,
              AVG(COALESCE(e.comments, 0)) as avg_comments
       FROM posts p LEFT JOIN engagement e ON e.post_id = p.id
       WHERE p.created_at > ? GROUP BY p.platform`,
      [isoFromTs(since)],
    );
    for (const s of platformStats) {
      observations.push({
        category: 'tool_usage',
        event_type: 'post:platform_stats',
        metrics: { platform: s.platform, count: s.cnt, avg_likes: s.avg_likes, avg_shares: s.avg_shares, avg_comments: s.avg_comments },
      });
    }

    // Post performance by format
    const formatStats = safeAll<{ format: string; cnt: number; avg_likes: number }>(
      db,
      `SELECT p.format, COUNT(*) as cnt, AVG(COALESCE(e.likes, 0)) as avg_likes
       FROM posts p LEFT JOIN engagement e ON e.post_id = p.id
       WHERE p.format IS NOT NULL AND p.created_at > ? GROUP BY p.format`,
      [isoFromTs(since)],
    );
    for (const f of formatStats) {
      observations.push({
        category: 'tool_usage',
        event_type: 'post:format_stats',
        metrics: { format: f.format, count: f.cnt, avg_likes: f.avg_likes },
      });
    }

    // Campaign goal achievement
    const campaigns = safeAll<{ id: number; name: string; status: string; goal_type: string; goal_target: number; goal_current: number }>(
      db,
      `SELECT id, name, status, COALESCE(goal_type, 'unknown') as goal_type,
              COALESCE(goal_target, 0) as goal_target, COALESCE(goal_current, 0) as goal_current
       FROM campaigns WHERE updated_at > ?`,
      [isoFromTs(since)],
    );
    for (const c of campaigns) {
      observations.push({
        category: 'query_quality',
        event_type: 'campaign:goal_progress',
        metrics: {
          campaign_id: c.id, name: c.name, status: c.status,
          goal_type: c.goal_type, goal_target: c.goal_target, goal_current: c.goal_current,
          achievement_rate: c.goal_target > 0 ? c.goal_current / c.goal_target : 0,
        },
      });
    }

    // Template effectiveness
    const templates = safeAll<{ id: number; name: string; use_count: number; avg_engagement: number }>(
      db,
      `SELECT id, name, COALESCE(use_count, 0) as use_count, COALESCE(avg_engagement, 0) as avg_engagement
       FROM content_templates WHERE updated_at > ?`,
      [isoFromTs(since)],
    );
    for (const t of templates) {
      observations.push({
        category: 'tool_usage',
        event_type: 'template:effectiveness',
        metrics: { template_id: t.id, name: t.name, use_count: t.use_count, avg_engagement: t.avg_engagement },
      });
    }

    // Competitor benchmarks
    const competitors = safeAll<{ competitor_name: string; cnt: number; avg_likes: number }>(
      db,
      `SELECT competitor_name, COUNT(*) as cnt, AVG(COALESCE(likes, 0)) as avg_likes
       FROM competitor_posts WHERE created_at > ? GROUP BY competitor_name`,
      [isoFromTs(since)],
    );
    for (const c of competitors) {
      observations.push({
        category: 'cross_brain',
        event_type: 'competitor:benchmark',
        metrics: { competitor: c.competitor_name, post_count: c.cnt, avg_likes: c.avg_likes },
      });
    }

    return observations;
  }

  mineCausalEvents(db: Database.Database, since: number): MinedCausalEvent[] {
    const events: MinedCausalEvent[] = [];

    // Post publications as causal events
    const posts = safeAll<{ id: number; platform: string; format: string; campaign_id: number }>(
      db,
      `SELECT id, platform, COALESCE(format, 'unknown') as format, campaign_id
       FROM posts WHERE published_at IS NOT NULL AND created_at > ? ORDER BY created_at LIMIT 500`,
      [isoFromTs(since)],
    );
    for (const p of posts) {
      events.push({
        source: 'marketing-brain',
        type: 'post:published',
        data: { postId: p.id, platform: p.platform, format: p.format, campaignId: p.campaign_id },
      });
    }

    // Campaign lifecycle events
    const campaigns = safeAll<{ id: number; name: string; status: string }>(
      db,
      `SELECT id, name, status FROM campaigns WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    for (const c of campaigns) {
      events.push({
        source: 'marketing-brain',
        type: `campaign:${c.status}`,
        data: { campaignId: c.id, name: c.name },
      });
    }

    return events;
  }

  mineMetrics(db: Database.Database, since: number): MinedMetric[] {
    const metrics: MinedMetric[] = [];

    // Total post count
    const postCount = safeGet<{ cnt: number }>(
      db,
      `SELECT COUNT(*) as cnt FROM posts WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (postCount) {
      metrics.push({ name: 'post_count', value: postCount.cnt });
    }

    // Average engagement (likes + shares + comments)
    const avgEng = safeGet<{ avg_total: number }>(
      db,
      `SELECT AVG(COALESCE(likes, 0) + COALESCE(shares, 0) + COALESCE(comments, 0)) as avg_total
       FROM engagement WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (avgEng?.avg_total != null) {
      metrics.push({ name: 'avg_engagement', value: avgEng.avg_total });
    }

    // Active campaigns
    const activeCampaigns = safeGet<{ cnt: number }>(
      db,
      `SELECT COUNT(*) as cnt FROM campaigns WHERE status = 'active'`,
      [],
    );
    if (activeCampaigns) {
      metrics.push({ name: 'active_campaigns', value: activeCampaigns.cnt });
    }

    // Template count
    const templateCount = safeGet<{ cnt: number }>(
      db,
      `SELECT COUNT(*) as cnt FROM content_templates WHERE updated_at > ?`,
      [isoFromTs(since)],
    );
    if (templateCount) {
      metrics.push({ name: 'template_count', value: templateCount.cnt });
    }

    // Competitor post count
    const compCount = safeGet<{ cnt: number }>(
      db,
      `SELECT COUNT(*) as cnt FROM competitor_posts WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (compCount) {
      metrics.push({ name: 'competitor_posts', value: compCount.cnt });
    }

    return metrics;
  }

  mineHypothesisObservations(db: Database.Database, since: number): MinedHypothesisObservation[] {
    const observations: MinedHypothesisObservation[] = [];

    // Post publications by platform
    const posts = safeAll<{ platform: string; cnt: number }>(
      db,
      `SELECT platform, COUNT(*) as cnt FROM posts WHERE published_at IS NOT NULL AND created_at > ? GROUP BY platform`,
      [isoFromTs(since)],
    );
    for (const p of posts) {
      observations.push({
        source: 'marketing-brain',
        type: 'post:published',
        value: p.cnt,
        metadata: { platform: p.platform },
      });
    }

    // Engagement by platform
    const engagement = safeAll<{ platform: string; avg_engagement: number }>(
      db,
      `SELECT p.platform, AVG(COALESCE(e.likes, 0) + COALESCE(e.shares, 0) + COALESCE(e.comments, 0)) as avg_engagement
       FROM posts p JOIN engagement e ON e.post_id = p.id
       WHERE p.created_at > ? GROUP BY p.platform`,
      [isoFromTs(since)],
    );
    for (const e of engagement) {
      observations.push({
        source: 'marketing-brain',
        type: 'engagement:platform',
        value: e.avg_engagement,
        metadata: { platform: e.platform },
      });
    }

    return observations;
  }

  mineCrossDomainEvents(db: Database.Database, since: number): MinedCrossDomainEvent[] {
    const events: MinedCrossDomainEvent[] = [];

    // Post batch summary
    const summary = safeGet<{ total: number; published: number }>(
      db,
      `SELECT COUNT(*) as total, SUM(CASE WHEN published_at IS NOT NULL THEN 1 ELSE 0 END) as published
       FROM posts WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (summary && summary.total > 0) {
      events.push({
        brain: 'marketing-brain',
        eventType: 'post:batch',
        data: { count: summary.total, published: summary.published },
      });
    }

    // Campaign summary
    const campaignSummary = safeGet<{ total: number; active: number }>(
      db,
      `SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
       FROM campaigns WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (campaignSummary && campaignSummary.total > 0) {
      events.push({
        brain: 'marketing-brain',
        eventType: 'campaign:batch',
        data: { count: campaignSummary.total, active: campaignSummary.active },
      });
    }

    return events;
  }
}

// ── Helpers ─────────────────────────────────────────────

function isoFromTs(ts: number): string {
  return ts > 0 ? new Date(ts).toISOString() : '1970-01-01T00:00:00.000Z';
}

function safeAll<T>(db: Database.Database, sql: string, params: unknown[]): T[] {
  try {
    return db.prepare(sql).all(...params) as T[];
  } catch {
    return [];
  }
}

function safeGet<T>(db: Database.Database, sql: string, params: unknown[]): T | undefined {
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } catch {
    return undefined;
  }
}
