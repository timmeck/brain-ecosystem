import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';
import type { MarketingRule, RuleCreate } from '../../types/post.types.js';

export class RuleRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO marketing_rules (pattern, recommendation, confidence)
        VALUES (@pattern, @recommendation, @confidence)
      `),
      getById: db.prepare('SELECT * FROM marketing_rules WHERE id = ?'),
      listAll: db.prepare('SELECT * FROM marketing_rules ORDER BY confidence DESC'),
      listActive: db.prepare(`SELECT * FROM marketing_rules WHERE active = 1 ORDER BY confidence DESC`),
      countAll: db.prepare('SELECT COUNT(*) as count FROM marketing_rules'),
      countActive: db.prepare(`SELECT COUNT(*) as count FROM marketing_rules WHERE active = 1`),
      delete: db.prepare('DELETE FROM marketing_rules WHERE id = ?'),
    };
  }

  create(data: RuleCreate): number {
    const result = this.stmts.create.run({
      pattern: data.pattern,
      recommendation: data.recommendation,
      confidence: data.confidence ?? 0.5,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): MarketingRule | undefined {
    return this.stmts.getById.get(id) as MarketingRule | undefined;
  }

  listAll(): MarketingRule[] {
    return this.stmts.listAll.all() as MarketingRule[];
  }

  listActive(): MarketingRule[] {
    return this.stmts.listActive.all() as MarketingRule[];
  }

  update(id: number, data: Partial<MarketingRule>): boolean {
    const fields = Object.keys(data).filter(
      (key) => key !== 'id' && key !== 'created_at' && (data as Record<string, unknown>)[key] !== undefined
    );
    if (fields.length === 0) return false;

    const setClauses = fields.map((f) => `${f} = @${f}`).join(', ');
    const stmt = this.db.prepare(
      `UPDATE marketing_rules SET ${setClauses}, updated_at = datetime('now') WHERE id = @id`
    );
    const result = stmt.run({ ...data, id });
    return result.changes > 0;
  }

  incrementTrigger(id: number, success: boolean): void {
    const rule = this.getById(id);
    if (!rule) return;
    const data: Record<string, unknown> = {
      trigger_count: rule.trigger_count + 1,
      id,
    };
    if (success) data['success_count'] = rule.success_count + 1;

    const stmt = this.db.prepare(
      `UPDATE marketing_rules SET trigger_count = @trigger_count${success ? ', success_count = @success_count' : ''}, updated_at = datetime('now') WHERE id = @id`
    );
    stmt.run(data);
  }

  countAll(): number {
    const row = this.stmts.countAll.get() as { count: number };
    return row.count;
  }

  countActive(): number {
    const row = this.stmts.countActive.get() as { count: number };
    return row.count;
  }

  delete(id: number): boolean {
    const result = this.stmts.delete.run(id);
    return result.changes > 0;
  }
}
