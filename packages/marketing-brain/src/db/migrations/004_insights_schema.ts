import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      priority INTEGER NOT NULL DEFAULT 0,
      campaign_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      campaign_id INTEGER,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      acknowledged_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
    CREATE INDEX IF NOT EXISTS idx_insights_campaign ON insights(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_insights_active ON insights(active);
    CREATE INDEX IF NOT EXISTS idx_insights_priority ON insights(priority);
    CREATE INDEX IF NOT EXISTS idx_notifications_acknowledged ON notifications(acknowledged);
  `);
}
