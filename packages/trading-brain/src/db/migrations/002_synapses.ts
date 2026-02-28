import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS synapses (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      activations INTEGER NOT NULL DEFAULT 0,
      total_profit REAL NOT NULL DEFAULT 0,
      last_activated TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_synapses_fingerprint ON synapses(fingerprint);
    CREATE INDEX IF NOT EXISTS idx_synapses_weight ON synapses(weight);

    CREATE TABLE IF NOT EXISTS graph_nodes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      activation REAL NOT NULL DEFAULT 0,
      total_activations INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON graph_nodes(type);

    CREATE TABLE IF NOT EXISTS graph_edges (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      activations INTEGER NOT NULL DEFAULT 0,
      last_activated TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (source) REFERENCES graph_nodes(id),
      FOREIGN KEY (target) REFERENCES graph_nodes(id)
    );

    CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source);
    CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target);
  `);
}
