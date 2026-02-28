import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { Insight, InsightCreate } from '../../types/post.types.js';

export class InsightRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO insights (type, title, description, confidence, priority, campaign_id, expires_at)
        VALUES (@type, @title, @description, @confidence, @priority, @campaign_id, @expires_at)
      `),
      getById: db.prepare('SELECT * FROM insights WHERE id = ?'),
      listActive: db.prepare(`
        SELECT * FROM insights
        WHERE active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
        ORDER BY priority DESC, confidence DESC
        LIMIT ?
      `),
      listAll: db.prepare('SELECT * FROM insights ORDER BY created_at DESC LIMIT ?'),
      listByType: db.prepare(`
        SELECT * FROM insights WHERE type = ? AND active = 1
        ORDER BY priority DESC LIMIT ?
      `),
      listByCampaign: db.prepare(`
        SELECT * FROM insights WHERE campaign_id = ? AND active = 1
        ORDER BY priority DESC
      `),
      countActive: db.prepare(`
        SELECT COUNT(*) as count FROM insights
        WHERE active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))
      `),
      countAll: db.prepare('SELECT COUNT(*) as count FROM insights'),
      deactivate: db.prepare('UPDATE insights SET active = 0 WHERE id = ?'),
      expireOld: db.prepare(`
        UPDATE insights SET active = 0
        WHERE active = 1 AND expires_at IS NOT NULL AND expires_at <= datetime('now')
      `),
      delete: db.prepare('DELETE FROM insights WHERE id = ?'),
    };
  }

  create(data: InsightCreate): number {
    const result = this.stmts.create.run({
      type: data.type,
      title: data.title,
      description: data.description,
      confidence: data.confidence ?? 0.5,
      priority: data.priority ?? 0,
      campaign_id: data.campaign_id ?? null,
      expires_at: data.expires_at ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): Insight | undefined {
    return this.stmts.getById.get(id) as Insight | undefined;
  }

  listActive(limit: number = 20): Insight[] {
    return this.stmts.listActive.all(limit) as Insight[];
  }

  listAll(limit: number = 50): Insight[] {
    return this.stmts.listAll.all(limit) as Insight[];
  }

  listByType(type: string, limit: number = 20): Insight[] {
    return this.stmts.listByType.all(type, limit) as Insight[];
  }

  listByCampaign(campaignId: number): Insight[] {
    return this.stmts.listByCampaign.all(campaignId) as Insight[];
  }

  deactivate(id: number): void {
    this.stmts.deactivate.run(id);
  }

  expireOld(): number {
    const result = this.stmts.expireOld.run();
    return result.changes;
  }

  countActive(): number {
    const row = this.stmts.countActive.get() as { count: number };
    return row.count;
  }

  countAll(): number {
    const row = this.stmts.countAll.get() as { count: number };
    return row.count;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }
}
