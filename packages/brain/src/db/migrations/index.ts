import type Database from 'better-sqlite3';
import { getLogger } from '../../utils/logger.js';
import { up as coreSchema } from './001_core_schema.js';
import { up as learningSchema } from './002_learning_schema.js';
import { up as codeSchema } from './003_code_schema.js';
import { up as synapsesSchema } from './004_synapses_schema.js';
import { up as ftsIndexes } from './005_fts_indexes.js';
import { up as synapsesPhase3 } from './006_synapses_phase3.js';
import { up as feedbackSchema } from './007_feedback.js';
import { up as gitIntegration } from './008_git_integration.js';
import { up as embeddings } from './009_embeddings.js';
import { up as memorySchema } from './010_memory_schema.js';
import { up as memoryFts } from './011_memory_fts.js';
import { up as decisionsChangelog } from './012_decisions_changelog.js';
import { up as tasks } from './013_tasks.js';
import { up as projectDocs } from './014_project_docs.js';
import { up as insightLifecycle } from './015_insight_lifecycle.js';

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
  { version: 1, name: '001_core_schema', up: coreSchema },
  { version: 2, name: '002_learning_schema', up: learningSchema },
  { version: 3, name: '003_code_schema', up: codeSchema },
  { version: 4, name: '004_synapses_schema', up: synapsesSchema },
  { version: 5, name: '005_fts_indexes', up: ftsIndexes },
  { version: 6, name: '006_synapses_phase3', up: synapsesPhase3 },
  { version: 7, name: '007_feedback', up: feedbackSchema },
  { version: 8, name: '008_git_integration', up: gitIntegration },
  { version: 9, name: '009_embeddings', up: embeddings },
  { version: 10, name: '010_memory_schema', up: memorySchema },
  { version: 11, name: '011_memory_fts', up: memoryFts },
  { version: 12, name: '012_decisions_changelog', up: decisionsChangelog },
  { version: 13, name: '013_tasks', up: tasks },
  { version: 14, name: '014_project_docs', up: projectDocs },
  { version: 15, name: '015_insight_lifecycle', up: insightLifecycle },
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
