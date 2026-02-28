import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface ChainRecord {
  id: number;
  pair: string;
  type: string;
  length: number;
  fingerprints_json: string;
  total_profit: number;
  created_at: string;
}

export class ChainRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO chains (pair, type, length, fingerprints_json, total_profit)
        VALUES (@pair, @type, @length, @fingerprints_json, @total_profit)
      `),
      getAll: db.prepare('SELECT * FROM chains ORDER BY created_at DESC'),
      getRecent: db.prepare('SELECT * FROM chains ORDER BY created_at DESC LIMIT ?'),
      getByPair: db.prepare('SELECT * FROM chains WHERE pair = ? ORDER BY created_at DESC'),
      getByType: db.prepare('SELECT * FROM chains WHERE type = ? ORDER BY created_at DESC'),
      count: db.prepare('SELECT COUNT(*) as count FROM chains'),
      deleteOldest: db.prepare('DELETE FROM chains WHERE id IN (SELECT id FROM chains ORDER BY created_at ASC LIMIT ?)'),
    };
  }

  create(data: { pair: string; type: string; length: number; fingerprints: string[]; total_profit: number }): number {
    const result = this.stmts['create']!.run({
      pair: data.pair,
      type: data.type,
      length: data.length,
      fingerprints_json: JSON.stringify(data.fingerprints),
      total_profit: data.total_profit,
    });
    return result.lastInsertRowid as number;
  }

  getAll(): ChainRecord[] {
    return this.stmts['getAll']!.all() as ChainRecord[];
  }

  getRecent(limit: number = 10): ChainRecord[] {
    return this.stmts['getRecent']!.all(limit) as ChainRecord[];
  }

  getByPair(pair: string): ChainRecord[] {
    return this.stmts['getByPair']!.all(pair) as ChainRecord[];
  }

  getByType(type: string): ChainRecord[] {
    return this.stmts['getByType']!.all(type) as ChainRecord[];
  }

  count(): number {
    const row = this.stmts['count']!.get() as { count: number };
    return row.count;
  }

  pruneOldest(keepCount: number): void {
    const total = this.count();
    if (total > keepCount) {
      this.stmts['deleteOldest']!.run(total - keepCount);
    }
  }
}
