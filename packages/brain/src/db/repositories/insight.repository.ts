import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { InsightRecord } from '../../types/research.types.js';

type InsightCreate = Omit<InsightRecord, 'id' | 'created_at'>;
type InsightUpdate = Partial<Omit<InsightRecord, 'id' | 'created_at'>>;

export class InsightRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO insights (type, title, description, evidence, priority, project_id, active, expires_at)
        VALUES (@type, @title, @description, @evidence, @priority, @project_id, @active, @expires_at)
      `),
      getById: db.prepare('SELECT * FROM insights WHERE id = ?'),
      delete: db.prepare('DELETE FROM insights WHERE id = ?'),
      findActiveAll: db.prepare(
        'SELECT * FROM insights WHERE active = 1 ORDER BY priority DESC, created_at DESC'
      ),
      findActiveByProject: db.prepare(
        'SELECT * FROM insights WHERE active = 1 AND project_id = ? ORDER BY priority DESC, created_at DESC'
      ),
      findByType: db.prepare('SELECT * FROM insights WHERE type = ? ORDER BY priority DESC'),
      findByPriority: db.prepare(
        'SELECT * FROM insights WHERE priority >= ? ORDER BY priority DESC, created_at DESC'
      ),
      expire: db.prepare(
        `UPDATE insights SET active = 0 WHERE active = 1 AND expires_at IS NOT NULL AND expires_at < datetime('now')`
      ),
    };
  }

  create(data: InsightCreate): number {
    const result = this.stmts.create.run(data);
    return result.lastInsertRowid as number;
  }

  getById(id: number): InsightRecord | undefined {
    return this.stmts.getById.get(id) as InsightRecord | undefined;
  }

  update(id: number, data: InsightUpdate): boolean {
    const fields = Object.keys(data).filter((key) => (data as Record<string, unknown>)[key] !== undefined);
    if (fields.length === 0) return false;

    const setClauses = fields.map((field) => `${field} = @${field}`).join(', ');
    const stmt = this.db.prepare(`UPDATE insights SET ${setClauses} WHERE id = @id`);
    const result = stmt.run({ ...data, id });
    return result.changes > 0;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }

  findActive(projectId?: number): InsightRecord[] {
    if (projectId !== undefined) {
      return this.stmts.findActiveByProject.all(projectId) as InsightRecord[];
    }
    return this.stmts.findActiveAll.all() as InsightRecord[];
  }

  findByType(type: string): InsightRecord[] {
    return this.stmts.findByType.all(type) as InsightRecord[];
  }

  findByPriority(minPriority: number): InsightRecord[] {
    return this.stmts.findByPriority.all(minPriority) as InsightRecord[];
  }

  expire(): number {
    const result = this.stmts.expire.run();
    return result.changes;
  }

  rate(id: number, rating: number, comment?: string): boolean {
    const stmt = this.db.prepare(
      `UPDATE insights SET rating = ?, rating_comment = ?, rated_at = datetime('now') WHERE id = ?`
    );
    const result = stmt.run(rating, comment ?? null, id);
    return result.changes > 0;
  }

  findRated(minRating?: number): InsightRecord[] {
    if (minRating !== undefined) {
      const stmt = this.db.prepare(
        'SELECT * FROM insights WHERE rating IS NOT NULL AND rating >= ? ORDER BY rating DESC'
      );
      return stmt.all(minRating) as InsightRecord[];
    }
    const stmt = this.db.prepare(
      'SELECT * FROM insights WHERE rating IS NOT NULL ORDER BY rating DESC'
    );
    return stmt.all() as InsightRecord[];
  }
}
