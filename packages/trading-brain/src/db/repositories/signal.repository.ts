import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface SignalComboRecord {
  id: number;
  fingerprint: string;
  signals_json: string;
  regime: string | null;
  created_at: string;
}

export class SignalRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO signal_combos (fingerprint, signals_json, regime)
        VALUES (@fingerprint, @signals_json, @regime)
      `),
      getByFingerprint: db.prepare('SELECT * FROM signal_combos WHERE fingerprint = ? ORDER BY created_at DESC'),
      getAll: db.prepare('SELECT * FROM signal_combos ORDER BY created_at DESC'),
      count: db.prepare('SELECT COUNT(*) as count FROM signal_combos'),
    };
  }

  create(fingerprint: string, signalsJson: string, regime?: string): number {
    const result = this.stmts['create']!.run({
      fingerprint,
      signals_json: signalsJson,
      regime: regime ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getByFingerprint(fingerprint: string): SignalComboRecord[] {
    return this.stmts['getByFingerprint']!.all(fingerprint) as SignalComboRecord[];
  }

  getAll(): SignalComboRecord[] {
    return this.stmts['getAll']!.all() as SignalComboRecord[];
  }

  count(): number {
    const row = this.stmts['count']!.get() as { count: number };
    return row.count;
  }
}
