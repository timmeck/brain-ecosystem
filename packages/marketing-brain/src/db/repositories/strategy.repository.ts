import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { Strategy, StrategyCreate } from '../../types/post.types.js';

export class StrategyRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO strategies (post_id, description, approach, outcome, confidence)
        VALUES (@post_id, @description, @approach, @outcome, @confidence)
      `),
      getById: db.prepare('SELECT * FROM strategies WHERE id = ?'),
      listAll: db.prepare('SELECT * FROM strategies ORDER BY confidence DESC LIMIT ?'),
      listByPost: db.prepare('SELECT * FROM strategies WHERE post_id = ? ORDER BY confidence DESC'),
      countAll: db.prepare('SELECT COUNT(*) as count FROM strategies'),
      search: db.prepare(`
        SELECT s.* FROM strategies s
        JOIN strategies_fts f ON f.rowid = s.id
        WHERE strategies_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `),
      topByConfidence: db.prepare('SELECT * FROM strategies WHERE confidence >= ? ORDER BY confidence DESC LIMIT ?'),
      delete: db.prepare('DELETE FROM strategies WHERE id = ?'),
    };
  }

  create(data: StrategyCreate): number {
    const result = this.stmts.create.run({
      post_id: data.post_id ?? null,
      description: data.description,
      approach: data.approach ?? null,
      outcome: data.outcome ?? null,
      confidence: 0.5,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): Strategy | undefined {
    return this.stmts.getById.get(id) as Strategy | undefined;
  }

  listAll(limit: number = 50): Strategy[] {
    return this.stmts.listAll.all(limit) as Strategy[];
  }

  listByPost(postId: number): Strategy[] {
    return this.stmts.listByPost.all(postId) as Strategy[];
  }

  search(query: string, limit: number = 20): Strategy[] {
    return this.stmts.search.all(query, limit) as Strategy[];
  }

  topByConfidence(minConfidence: number = 0.7, limit: number = 20): Strategy[] {
    return this.stmts.topByConfidence.all(minConfidence, limit) as Strategy[];
  }

  update(id: number, data: Partial<Strategy>): boolean {
    const fields = Object.keys(data).filter(
      (key) => key !== 'id' && key !== 'created_at' && (data as Record<string, unknown>)[key] !== undefined
    );
    if (fields.length === 0) return false;

    const setClauses = fields.map((f) => `${f} = @${f}`).join(', ');
    const stmt = this.db.prepare(`UPDATE strategies SET ${setClauses} WHERE id = @id`);
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
