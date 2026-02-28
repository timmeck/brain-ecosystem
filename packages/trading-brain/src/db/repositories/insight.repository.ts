import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface InsightRecord {
  id: number;
  type: string;
  severity: string;
  title: string;
  description: string;
  data_json: string | null;
  created_at: string;
}

export class InsightRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO insights (type, severity, title, description, data_json)
        VALUES (@type, @severity, @title, @description, @data_json)
      `),
      getAll: db.prepare('SELECT * FROM insights ORDER BY created_at DESC'),
      getRecent: db.prepare('SELECT * FROM insights ORDER BY created_at DESC LIMIT ?'),
      getByType: db.prepare('SELECT * FROM insights WHERE type = ? ORDER BY created_at DESC'),
      getBySeverity: db.prepare('SELECT * FROM insights WHERE severity = ? ORDER BY created_at DESC'),
      count: db.prepare('SELECT COUNT(*) as count FROM insights'),
      search: db.prepare('SELECT insights.* FROM insights_fts JOIN insights ON insights_fts.rowid = insights.id WHERE insights_fts MATCH ? LIMIT ?'),
      deleteOldest: db.prepare('DELETE FROM insights WHERE id IN (SELECT id FROM insights ORDER BY created_at ASC LIMIT ?)'),
      deleteAll: db.prepare('DELETE FROM insights'),
    };
  }

  create(data: { type: string; severity: string; title: string; description: string; data?: unknown }): number {
    const result = this.stmts['create']!.run({
      type: data.type,
      severity: data.severity,
      title: data.title,
      description: data.description,
      data_json: data.data ? JSON.stringify(data.data) : null,
    });
    return result.lastInsertRowid as number;
  }

  getAll(): InsightRecord[] {
    return this.stmts['getAll']!.all() as InsightRecord[];
  }

  getRecent(limit: number = 10): InsightRecord[] {
    return this.stmts['getRecent']!.all(limit) as InsightRecord[];
  }

  getByType(type: string): InsightRecord[] {
    return this.stmts['getByType']!.all(type) as InsightRecord[];
  }

  getBySeverity(severity: string): InsightRecord[] {
    return this.stmts['getBySeverity']!.all(severity) as InsightRecord[];
  }

  count(): number {
    const row = this.stmts['count']!.get() as { count: number };
    return row.count;
  }

  search(query: string, limit: number = 20): InsightRecord[] {
    return this.stmts['search']!.all(query, limit) as InsightRecord[];
  }

  pruneOldest(keepCount: number): void {
    const total = this.count();
    if (total > keepCount) {
      this.stmts['deleteOldest']!.run(total - keepCount);
    }
  }

  deleteAll(): void {
    this.stmts['deleteAll']!.run();
  }
}
