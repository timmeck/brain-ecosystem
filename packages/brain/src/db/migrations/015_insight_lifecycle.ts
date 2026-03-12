import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  // Add lifecycle column: provisional → confirmed → archived → deleted
  db.exec(`
    ALTER TABLE insights ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'provisional';
  `);

  // Mark existing active insights as 'confirmed' (they've survived long enough)
  db.exec(`
    UPDATE insights SET lifecycle = 'confirmed' WHERE active = 1;
  `);

  // Mark existing inactive insights as 'archived'
  db.exec(`
    UPDATE insights SET lifecycle = 'archived' WHERE active = 0;
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_insights_lifecycle ON insights(lifecycle);
  `);
}
