import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { Campaign, CampaignCreate } from '../../types/post.types.js';

export class CampaignRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO campaigns (name, brand, goal, platform)
        VALUES (@name, @brand, @goal, @platform)
      `),
      getById: db.prepare('SELECT * FROM campaigns WHERE id = ?'),
      getByName: db.prepare('SELECT * FROM campaigns WHERE name = ?'),
      listAll: db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC'),
      listActive: db.prepare(`SELECT * FROM campaigns WHERE status = 'active' ORDER BY created_at DESC`),
      countAll: db.prepare('SELECT COUNT(*) as count FROM campaigns'),
      delete: db.prepare('DELETE FROM campaigns WHERE id = ?'),
    };
  }

  create(data: CampaignCreate): number {
    const result = this.stmts.create.run({
      name: data.name,
      brand: data.brand ?? null,
      goal: data.goal ?? null,
      platform: data.platform ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): Campaign | undefined {
    return this.stmts.getById.get(id) as Campaign | undefined;
  }

  getByName(name: string): Campaign | undefined {
    return this.stmts.getByName.get(name) as Campaign | undefined;
  }

  listAll(): Campaign[] {
    return this.stmts.listAll.all() as Campaign[];
  }

  listActive(): Campaign[] {
    return this.stmts.listActive.all() as Campaign[];
  }

  update(id: number, data: Partial<Campaign>): boolean {
    const fields = Object.keys(data).filter(
      (key) => key !== 'id' && key !== 'created_at' && (data as Record<string, unknown>)[key] !== undefined
    );
    if (fields.length === 0) return false;

    const setClauses = fields.map((f) => `${f} = @${f}`).join(', ');
    const stmt = this.db.prepare(
      `UPDATE campaigns SET ${setClauses}, updated_at = datetime('now') WHERE id = @id`
    );
    const result = stmt.run({ ...data, id });
    return result.changes > 0;
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
