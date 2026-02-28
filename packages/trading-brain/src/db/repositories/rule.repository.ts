import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface RuleRecord {
  id: number;
  pattern: string;
  confidence: number;
  sample_count: number;
  win_rate: number;
  avg_profit: number;
  created_at: string;
  updated_at: string;
}

export class RuleRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO rules (pattern, confidence, sample_count, win_rate, avg_profit)
        VALUES (@pattern, @confidence, @sample_count, @win_rate, @avg_profit)
      `),
      getAll: db.prepare('SELECT * FROM rules ORDER BY confidence DESC'),
      getById: db.prepare('SELECT * FROM rules WHERE id = ?'),
      count: db.prepare('SELECT COUNT(*) as count FROM rules'),
      deleteAll: db.prepare('DELETE FROM rules'),
      deleteById: db.prepare('DELETE FROM rules WHERE id = ?'),
    };
  }

  create(data: { pattern: string; confidence: number; sample_count: number; win_rate: number; avg_profit: number }): number {
    const result = this.stmts['create']!.run(data);
    return result.lastInsertRowid as number;
  }

  getAll(): RuleRecord[] {
    return this.stmts['getAll']!.all() as RuleRecord[];
  }

  getById(id: number): RuleRecord | undefined {
    return this.stmts['getById']!.get(id) as RuleRecord | undefined;
  }

  count(): number {
    const row = this.stmts['count']!.get() as { count: number };
    return row.count;
  }

  deleteAll(): void {
    this.stmts['deleteAll']!.run();
  }

  delete(id: number): void {
    this.stmts['deleteById']!.run(id);
  }

  replaceAll(rules: { pattern: string; confidence: number; sample_count: number; win_rate: number; avg_profit: number }[]): void {
    const tx = this.db.transaction(() => {
      this.stmts['deleteAll']!.run();
      for (const rule of rules) {
        this.stmts['create']!.run(rule);
      }
    });
    tx();
  }
}
