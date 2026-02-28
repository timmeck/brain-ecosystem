import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE insights ADD COLUMN rating INTEGER DEFAULT NULL;
    ALTER TABLE insights ADD COLUMN rating_comment TEXT DEFAULT NULL;
    ALTER TABLE insights ADD COLUMN rated_at TEXT DEFAULT NULL;

    ALTER TABLE rules ADD COLUMN rating INTEGER DEFAULT NULL;
    ALTER TABLE rules ADD COLUMN rating_comment TEXT DEFAULT NULL;
    ALTER TABLE rules ADD COLUMN rated_at TEXT DEFAULT NULL;
  `);
}
