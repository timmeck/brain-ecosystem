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
      activation_count INTEGER NOT NULL DEFAULT 1,
      last_activated_at TEXT NOT NULL DEFAULT (datetime('now')),
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id, target_type, target_id, synapse_type)
    );

    CREATE INDEX IF NOT EXISTS idx_synapses_source ON synapses(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_synapses_target ON synapses(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_synapses_type ON synapses(synapse_type);
    CREATE INDEX IF NOT EXISTS idx_synapses_weight ON synapses(weight);
    CREATE INDEX IF NOT EXISTS idx_synapses_last_activated ON synapses(last_activated_at);
  `);
}
