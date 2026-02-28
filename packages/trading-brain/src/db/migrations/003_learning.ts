import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      confidence REAL NOT NULL,
      sample_count INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      avg_profit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_rules_pattern ON rules(pattern);
    CREATE INDEX IF NOT EXISTS idx_rules_confidence ON rules(confidence);

    CREATE TABLE IF NOT EXISTS chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pair TEXT NOT NULL,
      type TEXT NOT NULL,
      length INTEGER NOT NULL,
      fingerprints_json TEXT NOT NULL,
      total_profit REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chains_pair ON chains(pair);
    CREATE INDEX IF NOT EXISTS idx_chains_type ON chains(type);

    CREATE TABLE IF NOT EXISTS calibration (
      id TEXT PRIMARY KEY DEFAULT 'main',
      learning_rate REAL NOT NULL,
      weaken_penalty REAL NOT NULL,
      decay_half_life_days INTEGER NOT NULL,
      pattern_extraction_interval INTEGER NOT NULL,
      pattern_min_samples INTEGER NOT NULL,
      pattern_wilson_threshold REAL NOT NULL,
      wilson_z REAL NOT NULL,
      spreading_activation_decay REAL NOT NULL,
      spreading_activation_threshold REAL NOT NULL,
      min_activations_for_weight INTEGER NOT NULL,
      min_outcomes_for_weights INTEGER NOT NULL,
      last_calibration TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
