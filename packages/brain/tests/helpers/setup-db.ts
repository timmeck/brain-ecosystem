import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrations/index.js';
import { ProjectRepository } from '../../src/db/repositories/project.repository.js';
import { ErrorRepository } from '../../src/db/repositories/error.repository.js';
import { SolutionRepository } from '../../src/db/repositories/solution.repository.js';
import { RuleRepository } from '../../src/db/repositories/rule.repository.js';
import { AntipatternRepository } from '../../src/db/repositories/antipattern.repository.js';
import { TerminalRepository } from '../../src/db/repositories/terminal.repository.js';
import { CodeModuleRepository } from '../../src/db/repositories/code-module.repository.js';
import { SynapseRepository } from '../../src/db/repositories/synapse.repository.js';
import { NotificationRepository } from '../../src/db/repositories/notification.repository.js';
import { InsightRepository } from '../../src/db/repositories/insight.repository.js';

export interface TestDb {
  db: Database.Database;
  repos: {
    project: ProjectRepository;
    error: ErrorRepository;
    solution: SolutionRepository;
    rule: RuleRepository;
    antipattern: AntipatternRepository;
    terminal: TerminalRepository;
    codeModule: CodeModuleRepository;
    synapse: SynapseRepository;
    notification: NotificationRepository;
    insight: InsightRepository;
  };
}

export function createTestDb(): TestDb {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return {
    db,
    repos: {
      project: new ProjectRepository(db),
      error: new ErrorRepository(db),
      solution: new SolutionRepository(db),
      rule: new RuleRepository(db),
      antipattern: new AntipatternRepository(db),
      terminal: new TerminalRepository(db),
      codeModule: new CodeModuleRepository(db),
      synapse: new SynapseRepository(db),
      notification: new NotificationRepository(db),
      insight: new InsightRepository(db),
    },
  };
}
