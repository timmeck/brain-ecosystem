import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      pair TEXT NOT NULL,
      bot_type TEXT NOT NULL,
      regime TEXT,
      profit_pct REAL NOT NULL,
      win INTEGER NOT NULL DEFAULT 0,
      signals_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_trades_fingerprint ON trades(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_trades_pair ON trades(pair);
    CREATE INDEX IF NOT EXISTS idx_trades_bot_type ON trades(bot_type);
    CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
    CREATE INDEX IF NOT EXISTS idx_trades_win ON trades(win);

    CREATE TABLE IF NOT EXISTS signal_combos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fingerprint TEXT NOT NULL,
      signals_json TEXT NOT NULL,
      regime TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_combos_fingerprint ON signal_combos(fingerprint);

    CREATE TABLE IF NOT EXISTS pairs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      total_trades INTEGER NOT NULL DEFAULT 0,
      total_wins INTEGER NOT NULL DEFAULT 0,
      total_profit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
