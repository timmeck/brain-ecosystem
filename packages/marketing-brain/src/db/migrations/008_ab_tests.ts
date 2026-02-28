import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    -- A/B Tests: Track content variant experiments
    CREATE TABLE IF NOT EXISTS ab_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      variant_a TEXT NOT NULL,
      variant_b TEXT NOT NULL,
      metric TEXT NOT NULL DEFAULT 'engagement',
      status TEXT NOT NULL DEFAULT 'running',
      winner TEXT,
      a_samples INTEGER NOT NULL DEFAULT 0,
      b_samples INTEGER NOT NULL DEFAULT 0,
      a_metric_sum REAL NOT NULL DEFAULT 0,
      b_metric_sum REAL NOT NULL DEFAULT 0,
      significance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    -- A/B Test Data Points: Individual observations
    CREATE TABLE IF NOT EXISTS ab_test_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      variant TEXT NOT NULL,
      metric_value REAL NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (test_id) REFERENCES ab_tests(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
    CREATE INDEX IF NOT EXISTS idx_ab_test_data_test ON ab_test_data(test_id);
    CREATE INDEX IF NOT EXISTS idx_ab_test_data_variant ON ab_test_data(test_id, variant);
  `);
}
