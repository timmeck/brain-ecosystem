import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      data_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
    CREATE INDEX IF NOT EXISTS idx_insights_severity ON insights(severity);

    CREATE VIRTUAL TABLE IF NOT EXISTS insights_fts USING fts5(
      title, description, content=insights, content_rowid=id
    );

    CREATE TRIGGER IF NOT EXISTS insights_ai AFTER INSERT ON insights BEGIN
      INSERT INTO insights_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
    END;

    CREATE TRIGGER IF NOT EXISTS insights_ad AFTER DELETE ON insights BEGIN
      INSERT INTO insights_fts(insights_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
    END;
  `);
}
