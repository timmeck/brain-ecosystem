import type Database from 'better-sqlite3';
import type { Statement } from 'better-sqlite3';

export interface TradeRecord {
  id: number;
  fingerprint: string;
  pair: string;
  bot_type: string;
  regime: string | null;
  profit_pct: number;
  win: number;
  signals_json: string | null;
  created_at: string;
}

export interface CreateTradeData {
  fingerprint: string;
  pair: string;
  bot_type: string;
  regime?: string;
  profit_pct: number;
  win: boolean;
  signals_json?: string;
}

export class TradeRepository {
  private stmts: Record<string, Statement>;

  constructor(private db: Database.Database) {
    this.stmts = {
      create: db.prepare(`
        INSERT INTO trades (fingerprint, pair, bot_type, regime, profit_pct, win, signals_json)
        VALUES (@fingerprint, @pair, @bot_type, @regime, @profit_pct, @win, @signals_json)
      `),
      getById: db.prepare('SELECT * FROM trades WHERE id = ?'),
      count: db.prepare('SELECT COUNT(*) as count FROM trades'),
      getAll: db.prepare('SELECT * FROM trades ORDER BY created_at DESC'),
      getRecent: db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?'),
      getByPair: db.prepare('SELECT * FROM trades WHERE pair = ? ORDER BY created_at DESC'),
      getByFingerprint: db.prepare('SELECT * FROM trades WHERE fingerprint = ? ORDER BY created_at DESC'),
      getByBotType: db.prepare('SELECT * FROM trades WHERE bot_type = ? ORDER BY created_at DESC'),
      getSince: db.prepare('SELECT * FROM trades WHERE created_at > ? ORDER BY created_at DESC'),
      search: db.prepare(`SELECT * FROM trades WHERE fingerprint LIKE ? OR pair LIKE ? OR bot_type LIKE ? ORDER BY created_at DESC LIMIT ?`),
    };
  }

  create(data: CreateTradeData): number {
    const result = this.stmts['create']!.run({
      fingerprint: data.fingerprint,
      pair: data.pair,
      bot_type: data.bot_type,
      regime: data.regime ?? null,
      profit_pct: data.profit_pct,
      win: data.win ? 1 : 0,
      signals_json: data.signals_json ?? null,
    });
    return result.lastInsertRowid as number;
  }

  getById(id: number): TradeRecord | undefined {
    return this.stmts['getById']!.get(id) as TradeRecord | undefined;
  }

  count(): number {
    const row = this.stmts['count']!.get() as { count: number };
    return row.count;
  }

  getAll(): TradeRecord[] {
    return this.stmts['getAll']!.all() as TradeRecord[];
  }

  getRecent(limit: number = 10): TradeRecord[] {
    return this.stmts['getRecent']!.all(limit) as TradeRecord[];
  }

  getByPair(pair: string): TradeRecord[] {
    return this.stmts['getByPair']!.all(pair) as TradeRecord[];
  }

  getByFingerprint(fingerprint: string): TradeRecord[] {
    return this.stmts['getByFingerprint']!.all(fingerprint) as TradeRecord[];
  }

  getByBotType(botType: string): TradeRecord[] {
    return this.stmts['getByBotType']!.all(botType) as TradeRecord[];
  }

  getSince(dateStr: string): TradeRecord[] {
    return this.stmts['getSince']!.all(dateStr) as TradeRecord[];
  }

  search(query: string, limit: number = 50): TradeRecord[] {
    const like = `%${query}%`;
    return this.stmts['search']!.all(like, like, like, limit) as TradeRecord[];
  }
}
