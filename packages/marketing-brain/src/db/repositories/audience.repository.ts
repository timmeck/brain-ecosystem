import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { Audience } from '../../types/post.types.js';

export class AudienceRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO audiences (name, platform, demographics, interests)
        VALUES (@name, @platform, @demographics, @interests)
      `),
      getById: db.prepare('SELECT * FROM audiences WHERE id = ?'),
      getByName: db.prepare('SELECT * FROM audiences WHERE name = ?'),
      listAll: db.prepare('SELECT * FROM audiences ORDER BY created_at DESC'),
      countAll: db.prepare('SELECT COUNT(*) as count FROM audiences'),
      delete: db.prepare('DELETE FROM audiences WHERE id = ?'),
    };
  }

  create(data: { name: string; platform?: string; demographics?: string; interests?: string }): number {
    const result = this.stmts.create.run({
      name: data.name,
      platform: data.platform ?? null,
      demographics: data.demographics ?? null,
      interests: data.interests ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): Audience | undefined {
    return this.stmts.getById.get(id) as Audience | undefined;
  }

  getByName(name: string): Audience | undefined {
    return this.stmts.getByName.get(name) as Audience | undefined;
  }

  listAll(): Audience[] {
    return this.stmts.listAll.all() as Audience[];
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
