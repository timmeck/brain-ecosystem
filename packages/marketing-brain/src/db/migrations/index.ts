import type Database from 'better-sqlite3';
import { getLogger } from '../../utils/logger.js';
import { up as coreSchema } from './001_core_schema.js';
import { up as learningSchema } from './002_learning_schema.js';
import { up as synapseSchema } from './003_synapse_schema.js';
import { up as insightsSchema } from './004_insights_schema.js';
import { up as ftsIndexes } from './005_fts_indexes.js';
import { up as memorySchema } from './006_memory_schema.js';
import { up as memoryFts } from './007_memory_fts.js';

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  { version: 1, name: '001_core_schema', up: coreSchema },
  { version: 2, name: '002_learning_schema', up: learningSchema },
  { version: 3, name: '003_synapse_schema', up: synapseSchema },
  { version: 4, name: '004_insights_schema', up: insightsSchema },
  { version: 5, name: '005_fts_indexes', up: ftsIndexes },
  { version: 6, name: '006_memory_schema', up: memorySchema },
  { version: 7, name: '007_memory_fts', up: memoryFts },
];

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getCurrentVersion(db: Database.Database): number {
  const row = db.prepare('SELECT MAX(version) as version FROM migrations').get() as { version: number | null } | undefined;
  return row?.version ?? 0;
}

export function runMigrations(db: Database.Database): void {
  const logger = getLogger();
  ensureMigrationsTable(db);

  const currentVersion = getCurrentVersion(db);
  const pending = migrations.filter(m => m.version > currentVersion);

  if (pending.length === 0) {
    logger.info('Database is up to date');
    return;
  }

  logger.info(`Running ${pending.length} migration(s) from version ${currentVersion}`);

  const runAll = db.transaction(() => {
    for (const migration of pending) {
      logger.info(`Applying migration ${migration.name}`);
      migration.up(db);
      db.prepare('INSERT INTO migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
    }
  });

  runAll();
  logger.info(`Migrations complete. Now at version ${pending[pending.length - 1]!.version}`);
}
