import type Database from 'better-sqlite3';
import { getLogger } from '../../utils/logger.js';
import { up as coreSchema } from './001_core.js';
import { up as synapsesSchema } from './002_synapses.js';
import { up as learningSchema } from './003_learning.js';
import { up as researchSchema } from './004_research.js';
import { up as memorySchema } from './005_memory_schema.js';
import { up as memoryFts } from './006_memory_fts.js';
import { up as calibrationHistory } from './007_calibration_history.js';
import { up as backtestAlerts } from './008_backtest_alerts.js';

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  { version: 1, name: '001_core', up: coreSchema },
  { version: 2, name: '002_synapses', up: synapsesSchema },
  { version: 3, name: '003_learning', up: learningSchema },
  { version: 4, name: '004_research', up: researchSchema },
  { version: 5, name: '005_memory_schema', up: memorySchema },
  { version: 6, name: '006_memory_fts', up: memoryFts },
  { version: 7, name: '007_calibration_history', up: calibrationHistory },
  { version: 8, name: '008_backtest_alerts', up: backtestAlerts },
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
