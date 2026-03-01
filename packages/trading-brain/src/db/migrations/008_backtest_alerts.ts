import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  // Add timeframe column to trades
  db.exec(`ALTER TABLE trades ADD COLUMN timeframe TEXT DEFAULT NULL`);

  // Alerts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      condition_type TEXT NOT NULL,
      condition_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      webhook_url TEXT DEFAULT NULL,
      last_triggered_at TEXT DEFAULT NULL,
      trigger_count INTEGER NOT NULL DEFAULT 0,
      cooldown_minutes INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Alert history
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_id INTEGER NOT NULL REFERENCES alerts(id),
      trade_id INTEGER DEFAULT NULL,
      message TEXT NOT NULL,
      data_json TEXT DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
