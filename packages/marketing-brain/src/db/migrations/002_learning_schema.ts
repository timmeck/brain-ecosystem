import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      description TEXT NOT NULL,
      approach TEXT,
      outcome TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS marketing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      recommendation TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      trigger_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS content_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      structure TEXT NOT NULL,
      example TEXT,
      platform TEXT,
      avg_engagement REAL NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_strategies_post ON strategies(post_id);
    CREATE INDEX IF NOT EXISTS idx_strategies_confidence ON strategies(confidence);
    CREATE INDEX IF NOT EXISTS idx_rules_active ON marketing_rules(active);
    CREATE INDEX IF NOT EXISTS idx_rules_confidence ON marketing_rules(confidence);
    CREATE INDEX IF NOT EXISTS idx_templates_platform ON content_templates(platform);
    CREATE INDEX IF NOT EXISTS idx_templates_engagement ON content_templates(avg_engagement);
  `);
}
