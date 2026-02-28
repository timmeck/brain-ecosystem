import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { ContentTemplate, ContentTemplateCreate } from '../../types/post.types.js';

export class TemplateRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO content_templates (name, structure, example, platform)
        VALUES (@name, @structure, @example, @platform)
      `),
      getById: db.prepare('SELECT * FROM content_templates WHERE id = ?'),
      listAll: db.prepare('SELECT * FROM content_templates ORDER BY avg_engagement DESC LIMIT ?'),
      listByPlatform: db.prepare('SELECT * FROM content_templates WHERE platform = ? ORDER BY avg_engagement DESC LIMIT ?'),
      countAll: db.prepare('SELECT COUNT(*) as count FROM content_templates'),
      search: db.prepare(`
        SELECT t.* FROM content_templates t
        JOIN content_templates_fts f ON f.rowid = t.id
        WHERE content_templates_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      delete: db.prepare('DELETE FROM content_templates WHERE id = ?'),
    };
  }

  create(data: ContentTemplateCreate): number {
    const result = this.stmts.create.run({
      name: data.name,
      structure: data.structure,
      example: data.example ?? null,
      platform: data.platform ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): ContentTemplate | undefined {
    return this.stmts.getById.get(id) as ContentTemplate | undefined;
  }

  listAll(limit: number = 50): ContentTemplate[] {
    return this.stmts.listAll.all(limit) as ContentTemplate[];
  }

  listByPlatform(platform: string, limit: number = 20): ContentTemplate[] {
    return this.stmts.listByPlatform.all(platform, limit) as ContentTemplate[];
  }

  search(query: string, limit: number = 20): ContentTemplate[] {
    return this.stmts.search.all(query, limit) as ContentTemplate[];
  }

  incrementUseCount(id: number): void {
    this.db.prepare(
      `UPDATE content_templates SET use_count = use_count + 1 WHERE id = ?`
    ).run(id);
  }

  updateAvgEngagement(id: number, avgEngagement: number): void {
    this.db.prepare(
      `UPDATE content_templates SET avg_engagement = ? WHERE id = ?`
    ).run(avgEngagement, id);
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
