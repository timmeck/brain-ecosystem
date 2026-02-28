import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { Post, PostCreate } from '../../types/post.types.js';
import { sha256 } from '../../utils/hash.js';

export class PostRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO posts (campaign_id, platform, content, format, hashtags, url, published_at, fingerprint, status)
        VALUES (@campaign_id, @platform, @content, @format, @hashtags, @url, @published_at, @fingerprint, @status)
      `),
      getById: db.prepare('SELECT * FROM posts WHERE id = ?'),
      getByFingerprint: db.prepare('SELECT * FROM posts WHERE fingerprint = ?'),
      listAll: db.prepare('SELECT * FROM posts ORDER BY created_at DESC LIMIT ?'),
      listByPlatform: db.prepare('SELECT * FROM posts WHERE platform = ? ORDER BY created_at DESC LIMIT ?'),
      listByCampaign: db.prepare('SELECT * FROM posts WHERE campaign_id = ? ORDER BY created_at DESC LIMIT ?'),
      listPublished: db.prepare(`SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT ?`),
      countAll: db.prepare('SELECT COUNT(*) as count FROM posts'),
      countByPlatform: db.prepare('SELECT platform, COUNT(*) as count FROM posts GROUP BY platform'),
      countByStatus: db.prepare('SELECT status, COUNT(*) as count FROM posts GROUP BY status'),
      delete: db.prepare('DELETE FROM posts WHERE id = ?'),
      search: db.prepare(`
        SELECT p.* FROM posts p
        JOIN posts_fts f ON f.rowid = p.id
        WHERE posts_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      recentPublished: db.prepare(`
        SELECT * FROM posts WHERE status = 'published' AND published_at > ? ORDER BY published_at DESC
      `),
    };
  }

  create(data: PostCreate): number {
    const fingerprint = sha256(`${data.platform}:${data.content}`);
    const result = this.stmts.create.run({
      campaign_id: data.campaign_id ?? null,
      platform: data.platform,
      content: data.content,
      format: data.format ?? 'text',
      hashtags: data.hashtags ?? null,
      url: data.url ?? null,
      published_at: data.published_at ?? null,
      fingerprint,
      status: data.status ?? 'draft',
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): Post | undefined {
    return this.stmts.getById.get(id) as Post | undefined;
  }

  getByFingerprint(fingerprint: string): Post | undefined {
    return this.stmts.getByFingerprint.get(fingerprint) as Post | undefined;
  }

  listAll(limit: number = 50): Post[] {
    return this.stmts.listAll.all(limit) as Post[];
  }

  listByPlatform(platform: string, limit: number = 50): Post[] {
    return this.stmts.listByPlatform.all(platform, limit) as Post[];
  }

  listByCampaign(campaignId: number, limit: number = 50): Post[] {
    return this.stmts.listByCampaign.all(campaignId, limit) as Post[];
  }

  listPublished(limit: number = 50): Post[] {
    return this.stmts.listPublished.all(limit) as Post[];
  }

  recentPublished(sinceDate: string): Post[] {
    return this.stmts.recentPublished.all(sinceDate) as Post[];
  }

  update(id: number, data: Partial<Post>): boolean {
    const fields = Object.keys(data).filter(
      (key) => key !== 'id' && key !== 'created_at' && (data as Record<string, unknown>)[key] !== undefined
    );
    if (fields.length === 0) return false;

    const setClauses = fields.map((f) => `${f} = @${f}`).join(', ');
    const stmt = this.db.prepare(
      `UPDATE posts SET ${setClauses}, updated_at = datetime('now') WHERE id = @id`
    );
    const result = stmt.run({ ...data, id });
    return result.changes > 0;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }

  search(query: string, limit: number = 20): Post[] {
    return this.stmts.search.all(query, limit) as Post[];
  }

  countAll(): number {
    const row = this.stmts.countAll.get() as { count: number };
    return row.count;
  }

  countByPlatform(): Record<string, number> {
    const rows = this.stmts.countByPlatform.all() as Array<{ platform: string; count: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) result[row.platform] = row.count;
    return result;
  }

  countByStatus(): Record<string, number> {
    const rows = this.stmts.countByStatus.all() as Array<{ status: string; count: number }>;
    const result: Record<string, number> = {};
    for (const row of rows) result[row.status] = row.count;
    return result;
  }
}
