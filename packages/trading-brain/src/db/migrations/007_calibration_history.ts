import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS calibration_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_count INTEGER NOT NULL,
      synapse_count INTEGER NOT NULL,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
