import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      occurrences INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      project_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS antipatterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning',
      suggestion TEXT,
      occurrences INTEGER NOT NULL DEFAULT 0,
      project_id INTEGER,
      global INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rules_pattern ON rules(pattern);
    CREATE INDEX IF NOT EXISTS idx_rules_active ON rules(active);
    CREATE INDEX IF NOT EXISTS idx_rules_project ON rules(project_id);
    CREATE INDEX IF NOT EXISTS idx_antipatterns_project ON antipatterns(project_id);
    CREATE INDEX IF NOT EXISTS idx_antipatterns_global ON antipatterns(global);
  `);
}
