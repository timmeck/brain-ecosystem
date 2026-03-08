import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface ContentPiece {
  id: number;
  sourceType: 'insight' | 'mission' | 'trend' | 'principle' | 'manual';
  sourceId?: number;
  platform: 'bluesky' | 'reddit' | 'telegram' | 'discord';
  title: string;
  body: string;
  hashtags: string[];
  scheduledFor?: string;
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  engagement?: ContentEngagement;
  createdAt?: string;
}

export interface ContentEngagement {
  likes: number;
  reposts: number;
  replies: number;
}

export interface ContentForgeConfig {
  brainName: string;
  defaultPlatform?: ContentPiece['platform'];
  maxDraftsPerCycle?: number;
}

export interface ContentForgeStatus {
  drafts: number;
  scheduled: number;
  published: number;
  avgEngagement: number;
}

// ── Migration ──────────────────────────────────────────────

export function runContentForgeMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_pieces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER,
      platform TEXT NOT NULL DEFAULT 'bluesky',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      hashtags TEXT DEFAULT '[]',
      scheduled_for TEXT,
      status TEXT DEFAULT 'draft',
      engagement TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_content_status ON content_pieces(status);
    CREATE INDEX IF NOT EXISTS idx_content_platform ON content_pieces(platform);
    CREATE INDEX IF NOT EXISTS idx_content_scheduled ON content_pieces(scheduled_for);
  `);
}

// ── Engine ──────────────────────────────────────────────────

export class ContentForge {
  private readonly db: Database.Database;
  private readonly config: Required<ContentForgeConfig>;
  private readonly log = getLogger();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private llmService: any = null;
  private socialService: { post: (platform: string, content: string) => Promise<{ id: string }> } | null = null;
  private actionBridge: import('../action/action-bridge.js').ActionBridgeEngine | null = null;

  // Prepared statements
  private readonly stmtInsert;
  private readonly stmtGetById;
  private readonly stmtUpdateStatus;
  private readonly stmtSetSchedule;
  private readonly stmtSetEngagement;
  private readonly stmtGetByStatus;
  private readonly stmtGetSchedule;
  private readonly stmtGetBest;
  private readonly stmtCountByStatus;
  private readonly stmtAvgEngagement;

  constructor(db: Database.Database, config: ContentForgeConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      defaultPlatform: config.defaultPlatform ?? 'bluesky',
      maxDraftsPerCycle: config.maxDraftsPerCycle ?? 5,
    };
    runContentForgeMigration(db);

    this.stmtInsert = db.prepare(`
      INSERT INTO content_pieces (source_type, source_id, platform, title, body, hashtags, status)
      VALUES (?, ?, ?, ?, ?, ?, 'draft')
    `);
    this.stmtGetById = db.prepare(`SELECT * FROM content_pieces WHERE id = ?`);
    this.stmtUpdateStatus = db.prepare(`UPDATE content_pieces SET status = ? WHERE id = ?`);
    this.stmtSetSchedule = db.prepare(`UPDATE content_pieces SET scheduled_for = ?, status = 'scheduled' WHERE id = ?`);
    this.stmtSetEngagement = db.prepare(`UPDATE content_pieces SET engagement = ? WHERE id = ?`);
    this.stmtGetByStatus = db.prepare(`SELECT * FROM content_pieces WHERE status = ? ORDER BY created_at DESC LIMIT ?`);
    this.stmtGetSchedule = db.prepare(`SELECT * FROM content_pieces WHERE status = 'scheduled' ORDER BY scheduled_for ASC`);
    this.stmtGetBest = db.prepare(`SELECT * FROM content_pieces WHERE status = 'published' AND engagement IS NOT NULL ORDER BY json_extract(engagement, '$.likes') + json_extract(engagement, '$.reposts') + json_extract(engagement, '$.replies') DESC LIMIT ?`);
    this.stmtCountByStatus = db.prepare(`SELECT status, COUNT(*) as count FROM content_pieces GROUP BY status`);
    this.stmtAvgEngagement = db.prepare(`SELECT AVG(json_extract(engagement, '$.likes') + json_extract(engagement, '$.reposts') + json_extract(engagement, '$.replies')) as avg FROM content_pieces WHERE status = 'published' AND engagement IS NOT NULL`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setLLMService(service: any): void { this.llmService = service; }
  setSocialService(service: { post: (platform: string, content: string) => Promise<{ id: string }> }): void { this.socialService = service; }
  setActionBridge(bridge: import('../action/action-bridge.js').ActionBridgeEngine): void { this.actionBridge = bridge; }

  /** Generate content from an insight */
  generateFromInsight(insight: { id?: number; insight: string; noveltyScore: number }, platform?: ContentPiece['platform']): ContentPiece {
    const plat = platform ?? this.config.defaultPlatform;
    const title = insight.insight.substring(0, 80);
    const body = insight.insight;
    const hashtags = this.extractHashtags(body);
    return this.storePiece('insight', insight.id, plat, title, body, hashtags);
  }

  /** Generate content from a mission report */
  generateFromMission(mission: { id?: number; topic: string; summary?: string }, platform?: ContentPiece['platform']): ContentPiece {
    const plat = platform ?? this.config.defaultPlatform;
    const title = `Research: ${mission.topic.substring(0, 60)}`;
    const body = mission.summary ?? mission.topic;
    const hashtags = this.extractHashtags(body);
    return this.storePiece('mission', mission.id, plat, title, body, hashtags);
  }

  /** Generate content from a tech trend */
  generateFromTrend(trend: { name: string; description?: string; category?: string }, platform?: ContentPiece['platform']): ContentPiece {
    const plat = platform ?? this.config.defaultPlatform;
    const title = `Trend: ${trend.name}`;
    const body = trend.description ?? trend.name;
    const hashtags = [trend.category ?? 'tech', trend.name.toLowerCase().replace(/\s+/g, '')];
    return this.storePiece('trend', undefined, plat, title, body, hashtags);
  }

  /** Generate content from a principle */
  generateFromPrinciple(principle: { id?: number; statement: string; domain?: string }, platform?: ContentPiece['platform']): ContentPiece {
    const plat = platform ?? this.config.defaultPlatform;
    const title = principle.statement.substring(0, 80);
    const body = principle.statement;
    const hashtags = [principle.domain ?? 'knowledge'].filter(Boolean);
    return this.storePiece('principle', principle.id, plat, title, body, hashtags);
  }

  /** Schedule a piece for later publication */
  schedule(pieceId: number, when: string): void {
    const row = this.stmtGetById.get(pieceId) as RawContent | undefined;
    if (!row) throw new Error(`Content #${pieceId} not found`);
    this.stmtSetSchedule.run(when, pieceId);
    this.log.info(`[content-forge] Scheduled #${pieceId} for ${when}`);
  }

  /** Publish immediately */
  async publishNow(pieceId: number): Promise<{ success: boolean; postId?: string }> {
    const row = this.stmtGetById.get(pieceId) as RawContent | undefined;
    if (!row) throw new Error(`Content #${pieceId} not found`);

    if (!this.socialService) {
      this.stmtUpdateStatus.run('failed', pieceId);
      return { success: false };
    }

    try {
      const result = await this.socialService.post(row.platform, row.body);
      this.stmtUpdateStatus.run('published', pieceId);
      this.log.info(`[content-forge] Published #${pieceId} on ${row.platform}`);
      return { success: true, postId: result.id };
    } catch (err) {
      this.stmtUpdateStatus.run('failed', pieceId);
      this.log.warn(`[content-forge] Publish failed for #${pieceId}: ${(err as Error).message}`);
      return { success: false };
    }
  }

  /** Get scheduled content */
  getSchedule(): ContentPiece[] {
    return (this.stmtGetSchedule.all() as RawContent[]).map(deserializeContent);
  }

  /** Record engagement metrics */
  recordEngagement(pieceId: number, metrics: ContentEngagement): void {
    this.stmtSetEngagement.run(JSON.stringify(metrics), pieceId);
  }

  /** Get best performing published content */
  getBestPerforming(limit?: number): ContentPiece[] {
    return (this.stmtGetBest.all(limit ?? 10) as RawContent[]).map(deserializeContent);
  }

  /** Get optimal posting time for a platform (placeholder — learns from engagement data) */
  getOptimalTime(platform: string): string {
    // Simple heuristic: best engagement windows by platform
    const defaults: Record<string, string> = {
      bluesky: '10:00',
      reddit: '08:00',
      telegram: '12:00',
      discord: '18:00',
    };
    return defaults[platform] ?? '10:00';
  }

  /** Get content pieces by status */
  getByStatus(status: string, limit?: number): ContentPiece[] {
    return (this.stmtGetByStatus.all(status, limit ?? 50) as RawContent[]).map(deserializeContent);
  }

  /** Get a single piece by ID */
  getPiece(id: number): ContentPiece | null {
    const row = this.stmtGetById.get(id) as RawContent | undefined;
    return row ? deserializeContent(row) : null;
  }

  /** Auto-schedule a piece at optimal time and create ActionBridge publish proposal */
  autoScheduleAndPublish(pieceId: number): void {
    const piece = this.getPiece(pieceId);
    if (!piece) return;

    const optimalTime = this.getOptimalTime(piece.platform);
    const today = new Date().toISOString().split('T')[0];
    this.schedule(pieceId, `${today}T${optimalTime}:00Z`);

    if (this.actionBridge) {
      this.actionBridge.propose({
        source: 'creative',
        type: 'publish_content',
        title: `Publish: ${piece.title}`,
        description: `Auto-scheduled content #${pieceId} for ${piece.platform}`,
        confidence: 0.85,
        payload: { pieceId, platform: piece.platform, title: piece.title },
      });
    }
  }

  /** Get status overview */
  getStatus(): ContentForgeStatus {
    const counts = this.stmtCountByStatus.all() as Array<{ status: string; count: number }>;
    const countMap: Record<string, number> = {};
    for (const c of counts) countMap[c.status] = c.count;

    const avgRow = this.stmtAvgEngagement.get() as { avg: number | null };

    return {
      drafts: countMap['draft'] ?? 0,
      scheduled: countMap['scheduled'] ?? 0,
      published: countMap['published'] ?? 0,
      avgEngagement: avgRow?.avg ?? 0,
    };
  }

  // ── Private ──────────────────────────────────────────────

  private storePiece(sourceType: ContentPiece['sourceType'], sourceId: number | undefined, platform: ContentPiece['platform'], title: string, body: string, hashtags: string[]): ContentPiece {
    const result = this.stmtInsert.run(sourceType, sourceId ?? null, platform, title, body, JSON.stringify(hashtags));
    const id = Number(result.lastInsertRowid);
    this.log.info(`[content-forge] Created #${id}: ${title} (${sourceType}→${platform})`);
    return { id, sourceType, sourceId, platform, title, body, hashtags, status: 'draft' };
  }

  private extractHashtags(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const tags: string[] = [];
    for (const w of words) {
      if (w.startsWith('#')) tags.push(w.replace(/[^a-z0-9]/g, ''));
    }
    if (tags.length === 0) {
      // Extract key terms
      const keywords = words.filter(w => w.length > 5).slice(0, 3);
      return keywords;
    }
    return tags.slice(0, 5);
  }
}

// ── Helpers ──────────────────────────────────────────────────

interface RawContent {
  id: number;
  source_type: string;
  source_id: number | null;
  platform: string;
  title: string;
  body: string;
  hashtags: string;
  scheduled_for: string | null;
  status: string;
  engagement: string | null;
  created_at: string;
}

function deserializeContent(row: RawContent): ContentPiece {
  return {
    id: row.id,
    sourceType: row.source_type as ContentPiece['sourceType'],
    sourceId: row.source_id ?? undefined,
    platform: row.platform as ContentPiece['platform'],
    title: row.title,
    body: row.body,
    hashtags: JSON.parse(row.hashtags || '[]'),
    scheduledFor: row.scheduled_for ?? undefined,
    status: row.status as ContentPiece['status'],
    engagement: row.engagement ? JSON.parse(row.engagement) : undefined,
    createdAt: row.created_at,
  };
}
