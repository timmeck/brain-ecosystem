import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';

export function createConnection(dbPath: string): Database.Database {
  const logger = getLogger();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  logger.info(`Opening database at ${dbPath}`);
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('cache_size = 10000');
  db.pragma('foreign_keys = ON');

  return db;
}
