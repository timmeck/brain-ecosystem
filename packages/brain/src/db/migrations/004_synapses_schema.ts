import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS synapses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      synapse_type TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id, target_type, target_id, synapse_type)
    );

    CREATE TABLE IF NOT EXISTS insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      evidence TEXT NOT NULL DEFAULT '[]',
      priority INTEGER NOT NULL DEFAULT 0,
      project_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      project_id INTEGER,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      acknowledged_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_synapses_source ON synapses(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_synapses_target ON synapses(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_synapses_type ON synapses(synapse_type);
    CREATE INDEX IF NOT EXISTS idx_synapses_weight ON synapses(weight);
    CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
    CREATE INDEX IF NOT EXISTS idx_insights_project ON insights(project_id);
    CREATE INDEX IF NOT EXISTS idx_insights_active ON insights(active);
    CREATE INDEX IF NOT EXISTS idx_insights_priority ON insights(priority);
    CREATE INDEX IF NOT EXISTS idx_notifications_acknowledged ON notifications(acknowledged);
    CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id);
  `);
}
