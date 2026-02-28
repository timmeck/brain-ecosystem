import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { Engagement, EngagementCreate } from '../../types/post.types.js';

export class EngagementRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO engagement (post_id, likes, comments, shares, impressions, clicks, saves, reach)
        VALUES (@post_id, @likes, @comments, @shares, @impressions, @clicks, @saves, @reach)
      `),
      getById: db.prepare('SELECT * FROM engagement WHERE id = ?'),
      getByPost: db.prepare('SELECT * FROM engagement WHERE post_id = ? ORDER BY timestamp DESC LIMIT 1'),
      listByPost: db.prepare('SELECT * FROM engagement WHERE post_id = ? ORDER BY timestamp DESC'),
      getLatestPerPost: db.prepare(`
        SELECT e.* FROM engagement e
        INNER JOIN (
          SELECT post_id, MAX(timestamp) as max_ts FROM engagement GROUP BY post_id
        ) latest ON e.post_id = latest.post_id AND e.timestamp = latest.max_ts
        ORDER BY (e.likes + e.comments + e.shares + e.impressions) DESC
        LIMIT ?
      `),
      topPosts: db.prepare(`
        SELECT e.*, p.platform, p.content, p.published_at FROM engagement e
        INNER JOIN posts p ON p.id = e.post_id
        INNER JOIN (
          SELECT post_id, MAX(timestamp) as max_ts FROM engagement GROUP BY post_id
        ) latest ON e.post_id = latest.post_id AND e.timestamp = latest.max_ts
        WHERE p.status = 'published'
        ORDER BY (e.likes + e.comments * 3 + e.shares * 5 + e.clicks * 2) DESC
        LIMIT ?
      `),
      avgByPlatform: db.prepare(`
        SELECT p.platform,
          AVG(e.likes) as avg_likes,
          AVG(e.comments) as avg_comments,
          AVG(e.shares) as avg_shares,
          AVG(e.impressions) as avg_impressions,
          AVG(e.clicks) as avg_clicks,
          COUNT(DISTINCT e.post_id) as post_count
        FROM engagement e
        INNER JOIN posts p ON p.id = e.post_id
        INNER JOIN (
          SELECT post_id, MAX(timestamp) as max_ts FROM engagement GROUP BY post_id
        ) latest ON e.post_id = latest.post_id AND e.timestamp = latest.max_ts
        GROUP BY p.platform
      `),
      delete: db.prepare('DELETE FROM engagement WHERE id = ?'),
    };
  }

  create(data: EngagementCreate): number {
    const result = this.stmts.create.run({
      post_id: data.post_id,
      likes: data.likes ?? 0,
      comments: data.comments ?? 0,
      shares: data.shares ?? 0,
      impressions: data.impressions ?? 0,
      clicks: data.clicks ?? 0,
      saves: data.saves ?? 0,
      reach: data.reach ?? 0,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): Engagement | undefined {
    return this.stmts.getById.get(id) as Engagement | undefined;
  }

  getLatestByPost(postId: number): Engagement | undefined {
    return this.stmts.getByPost.get(postId) as Engagement | undefined;
  }

  listByPost(postId: number): Engagement[] {
    return this.stmts.listByPost.all(postId) as Engagement[];
  }

  topPosts(limit: number = 10): Array<Engagement & { platform: string; content: string; published_at: string }> {
    return this.stmts.topPosts.all(limit) as Array<Engagement & { platform: string; content: string; published_at: string }>;
  }

  avgByPlatform(): Array<{
    platform: string;
    avg_likes: number;
    avg_comments: number;
    avg_shares: number;
    avg_impressions: number;
    avg_clicks: number;
    post_count: number;
  }> {
    return this.stmts.avgByPlatform.all() as Array<{
      platform: string;
      avg_likes: number;
      avg_comments: number;
      avg_shares: number;
      avg_impressions: number;
      avg_clicks: number;
      post_count: number;
    }>;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }
}
