import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { BootstrapService, runBootstrapMigration } from '../../../src/research/bootstrap-service.js';
import type { BootstrapConfig, BootstrapEngines } from '../../../src/research/bootstrap-service.js';
import { SelfObserver } from '../../../src/research/self-observer.js';
import { AnomalyDetective } from '../../../src/research/anomaly-detective.js';
import { ResearchJournal } from '../../../src/research/journal.js';
import { HypothesisEngine } from '../../../src/hypothesis/engine.js';
import { PredictionEngine } from '../../../src/prediction/prediction-engine.js';
import { ParameterRegistry } from '../../../src/metacognition/parameter-registry.js';

// ── Helpers ─────────────────────────────────────────────

function createTestDb(): Database.Database {
  return new Database(':memory:');
}

const defaultConfig: BootstrapConfig = {
  brainName: 'test-brain',
  engineCount: 30,
  mcpToolCount: 134,
  version: '3.33.0',
};

function createEngines(db: Database.Database): BootstrapEngines {
  return {
    selfObserver: new SelfObserver(db, { brainName: 'test' }),
    anomalyDetective: new AnomalyDetective(db, { brainName: 'test' }),
    journal: new ResearchJournal(db, { brainName: 'test' }),
    hypothesisEngine: new HypothesisEngine(db, { minEvidence: 5 }),
    predictionEngine: new PredictionEngine(db, { horizonMs: 300_000 }),
    parameterRegistry: new ParameterRegistry(db),
  };
}

// ── Tests ───────────────────────────────────────────────

describe('BootstrapService', () => {
  let db: Database.Database;
  let engines: BootstrapEngines;

  beforeEach(() => {
    db = createTestDb();
    engines = createEngines(db);
  });

  describe('migration', () => {
    it('creates bootstrap_state table', () => {
      runBootstrapMigration(db);
      const row = db.prepare('SELECT * FROM bootstrap_state WHERE id = 1').get() as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.bootstrapped).toBe(0);
      expect(row.observations_seeded).toBe(0);
    });

    it('is idempotent', () => {
      runBootstrapMigration(db);
      runBootstrapMigration(db);
      const count = db.prepare('SELECT COUNT(*) as cnt FROM bootstrap_state').get() as { cnt: number };
      expect(count.cnt).toBe(1);
    });
  });

  describe('bootstrap()', () => {
    it('seeds observations into SelfObserver', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines(engines);
      const result = service.bootstrap();

      expect(result.alreadyBootstrapped).toBe(false);
      // At minimum: 5 system observations + some table sizes
      expect(result.observations).toBeGreaterThanOrEqual(5);

      // Verify observations are in the DB
      const obsCount = (db.prepare('SELECT COUNT(*) as cnt FROM self_observations').get() as { cnt: number }).cnt;
      expect(obsCount).toBe(result.observations);
    });

    it('seeds journal entries', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines(engines);
      const result = service.bootstrap();

      // At least 3 entries (init, baseline, cold-start complete) + possibly parameter entry
      expect(result.journalEntries).toBeGreaterThanOrEqual(3);

      const journalCount = (db.prepare('SELECT COUNT(*) as cnt FROM research_journal').get() as { cnt: number }).cnt;
      expect(journalCount).toBe(result.journalEntries);
    });

    it('seeds hypotheses', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines(engines);
      const result = service.bootstrap();

      expect(result.hypotheses).toBe(4);

      const hypoCount = (db.prepare("SELECT COUNT(*) as cnt FROM hypotheses WHERE source = 'bootstrap'").get() as { cnt: number }).cnt;
      expect(hypoCount).toBe(4);
    });

    it('seeds prediction metrics', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines(engines);
      const result = service.bootstrap();

      // 3 metrics × 5 data points = 15
      expect(result.predictions).toBe(15);

      const metricCount = (db.prepare('SELECT COUNT(*) as cnt FROM prediction_metrics').get() as { cnt: number }).cnt;
      expect(metricCount).toBe(15);
    });

    it('seeds anomaly baseline metrics', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines(engines);
      const result = service.bootstrap();

      // 5 metrics × 5 data points = 25
      expect(result.metrics).toBe(25);

      const metricCount = (db.prepare('SELECT COUNT(*) as cnt FROM metric_history').get() as { cnt: number }).cnt;
      expect(metricCount).toBe(25);
    });

    it('is idempotent — second call returns alreadyBootstrapped', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines(engines);
      const result1 = service.bootstrap();
      expect(result1.alreadyBootstrapped).toBe(false);
      expect(result1.observations).toBeGreaterThan(0);

      const result2 = service.bootstrap();
      expect(result2.alreadyBootstrapped).toBe(true);
      expect(result2.observations).toBe(0);
      expect(result2.journalEntries).toBe(0);
    });

    it('persists state across instances', () => {
      const service1 = new BootstrapService(db, defaultConfig);
      service1.setEngines(engines);
      service1.bootstrap();

      const service2 = new BootstrapService(db, defaultConfig);
      service2.setEngines(engines);
      const result = service2.bootstrap();
      expect(result.alreadyBootstrapped).toBe(true);
    });
  });

  describe('graceful degradation', () => {
    it('skips phases when engines are missing', () => {
      const service = new BootstrapService(db, defaultConfig);
      // No engines set
      const result = service.bootstrap();

      expect(result.alreadyBootstrapped).toBe(false);
      expect(result.observations).toBe(0);
      expect(result.journalEntries).toBe(0);
      expect(result.hypotheses).toBe(0);
      expect(result.predictions).toBe(0);
      expect(result.metrics).toBe(0);
    });

    it('works with only selfObserver', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines({ selfObserver: engines.selfObserver });
      const result = service.bootstrap();

      expect(result.observations).toBeGreaterThanOrEqual(5);
      expect(result.journalEntries).toBe(0);
      expect(result.hypotheses).toBe(0);
    });

    it('works with only journal', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines({ journal: engines.journal });
      const result = service.bootstrap();

      expect(result.observations).toBe(0);
      expect(result.journalEntries).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getState()', () => {
    it('returns initial state', () => {
      const service = new BootstrapService(db, defaultConfig);
      const state = service.getState();
      expect(state.bootstrapped).toBe(false);
      expect(state.bootstrapped_at).toBeNull();
      expect(state.observations_seeded).toBe(0);
    });

    it('returns updated state after bootstrap', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines(engines);
      service.bootstrap();

      const state = service.getState();
      expect(state.bootstrapped).toBe(true);
      expect(state.bootstrapped_at).toBeGreaterThan(0);
      expect(state.observations_seeded).toBeGreaterThan(0);
      expect(state.journal_entries_seeded).toBeGreaterThanOrEqual(3);
      expect(state.hypotheses_seeded).toBe(4);
      expect(state.predictions_seeded).toBe(15);
    });
  });

  describe('parameter seeding', () => {
    it('seeds parameter observations when registry has parameters', () => {
      const registry = engines.parameterRegistry!;
      registry.register({ engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.05, max: 0.5, description: 'test', category: 'dream' });
      registry.register({ engine: 'attention', name: 'decay_rate', value: 0.1, min: 0.01, max: 0.5, description: 'test', category: 'attention' });

      const service = new BootstrapService(db, defaultConfig);
      service.setEngines(engines);
      const result = service.bootstrap();

      // Should include 2 parameter observations + other observations
      expect(result.observations).toBeGreaterThanOrEqual(7); // 5 system + 2 params

      // Journal should include parameter count entry
      expect(result.journalEntries).toBe(4); // 3 base + 1 param entry
    });
  });

  describe('hypothesis deduplication', () => {
    it('does not seed duplicate hypotheses', () => {
      const service = new BootstrapService(db, defaultConfig);
      service.setEngines(engines);

      // Manually propose one of the seed hypotheses first
      engines.hypothesisEngine!.propose({
        statement: 'Higher dream.prune_threshold leads to fewer but higher-quality memories',
        type: 'correlation',
        source: 'manual',
        variables: ['dream.prune_threshold', 'memory_quality'],
        condition: { type: 'correlation', params: {} },
      });

      const result = service.bootstrap();
      // Should only seed 3 (one was already there)
      expect(result.hypotheses).toBe(3);
    });
  });
});
