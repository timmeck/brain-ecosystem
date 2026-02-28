import type Database from 'better-sqlite3';

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE errors ADD COLUMN embedding BLOB DEFAULT NULL;
    ALTER TABLE code_modules ADD COLUMN embedding BLOB DEFAULT NULL;
  `);
}
