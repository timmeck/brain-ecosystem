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

import { DataMiner, runDataMinerMigration } from '../../../src/research/data-miner.js';
import type { DataMinerAdapter, DataMinerEngines, MinedObservation, MinedCausalEvent, MinedMetric, MinedHypothesisObservation, MinedCrossDomainEvent } from '../../../src/research/data-miner.js';
import { SelfObserver } from '../../../src/research/self-observer.js';
import { AnomalyDetective } from '../../../src/research/anomaly-detective.js';
import { CrossDomainEngine } from '../../../src/research/cross-domain-engine.js';

// ── Mock Adapter ────────────────────────────────────────

class MockAdapter implements DataMinerAdapter {
  readonly name = 'test-brain';

  observations: MinedObservation[] = [];
  causalEvents: MinedCausalEvent[] = [];
  metrics: MinedMetric[] = [];
  hypothesisObservations: MinedHypothesisObservation[] = [];
  crossDomainEvents: MinedCrossDomainEvent[] = [];

  lastSince = 0;

  mineObservations(_db: Database.Database, since: number): MinedObservation[] {
    this.lastSince = since;
    return this.observations;
  }

  mineCausalEvents(_db: Database.Database, since: number): MinedCausalEvent[] {
    this.lastSince = since;
    return this.causalEvents;
  }

  mineMetrics(_db: Database.Database, since: number): MinedMetric[] {
    this.lastSince = since;
    return this.metrics;
  }

  mineHypothesisObservations(_db: Database.Database, since: number): MinedHypothesisObservation[] {
    this.lastSince = since;
    return this.hypothesisObservations;
  }

  mineCrossDomainEvents(_db: Database.Database, since: number): MinedCrossDomainEvent[] {
    this.lastSince = since;
    return this.crossDomainEvents;
  }
}

// ── Setup ───────────────────────────────────────────────

function createTestDb(): Database.Database {
  return new Database(':memory:');
}

function createEngines(db: Database.Database): DataMinerEngines {
  return {
    selfObserver: new SelfObserver(db, { brainName: 'test' }),
    anomalyDetective: new AnomalyDetective(db, { brainName: 'test' }),
    crossDomain: new CrossDomainEngine(db),
  };
}

// ── Tests ───────────────────────────────────────────────

describe('DataMiner', () => {
  let db: Database.Database;
  let adapter: MockAdapter;
  let engines: DataMinerEngines;

  beforeEach(() => {
    db = createTestDb();
    adapter = new MockAdapter();
    engines = createEngines(db);
  });

  describe('migration', () => {
    it('creates data_miner_state table', () => {
      runDataMinerMigration(db);
      const row = db.prepare('SELECT * FROM data_miner_state WHERE id = 1').get() as Record<string, unknown>;
      expect(row).toBeDefined();
      expect(row.last_mined_at).toBe(0);
      expect(row.bootstrap_complete).toBe(0);
    });

    it('is idempotent', () => {
      runDataMinerMigration(db);
      runDataMinerMigration(db);
      const count = db.prepare('SELECT COUNT(*) as cnt FROM data_miner_state').get() as { cnt: number };
      expect(count.cnt).toBe(1);
    });
  });

  describe('bootstrap', () => {
    it('feeds observations into SelfObserver', () => {
      adapter.observations = [
        { category: 'tool_usage', event_type: 'test:event', metrics: { count: 5 } },
        { category: 'resolution_rate', event_type: 'test:resolve', metrics: { rate: 0.8 } },
      ];

      const miner = new DataMiner(db, adapter, engines);
      miner.bootstrap();

      const state = miner.getState();
      expect(state.bootstrap_complete).toBe(true);
      expect(state.total_observations_mined).toBe(2);
    });

    it('feeds metrics into AnomalyDetective', () => {
      adapter.metrics = [
        { name: 'error_count', value: 42 },
        { name: 'resolution_rate', value: 0.75 },
      ];

      const spy = vi.spyOn(engines.anomalyDetective, 'recordMetric');
      const miner = new DataMiner(db, adapter, engines);
      miner.bootstrap();

      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenCalledWith('error_count', 42);
      expect(spy).toHaveBeenCalledWith('resolution_rate', 0.75);
    });

    it('feeds cross-domain events into CrossDomainEngine', () => {
      adapter.crossDomainEvents = [
        { brain: 'brain', eventType: 'error:batch', data: { count: 10 } },
      ];

      const spy = vi.spyOn(engines.crossDomain, 'recordEvent');
      const miner = new DataMiner(db, adapter, engines);
      miner.bootstrap();

      expect(spy).toHaveBeenCalledWith('brain', 'error:batch', { count: 10 });
    });

    it('only runs once', () => {
      adapter.observations = [
        { category: 'tool_usage', event_type: 'test:event', metrics: { count: 1 } },
      ];

      const miner = new DataMiner(db, adapter, engines);
      miner.bootstrap();
      const spy = vi.spyOn(engines.selfObserver, 'record');
      miner.bootstrap(); // second time — should skip

      expect(spy).not.toHaveBeenCalled();
      expect(miner.getState().total_observations_mined).toBe(1);
    });

    it('passes since=0 for bootstrap', () => {
      const miner = new DataMiner(db, adapter, engines);
      miner.bootstrap();
      expect(adapter.lastSince).toBe(0);
    });
  });

  describe('mine (incremental)', () => {
    it('passes correct since timestamp', () => {
      const miner = new DataMiner(db, adapter, engines);
      miner.bootstrap();

      const stateAfterBootstrap = miner.getState();
      expect(stateAfterBootstrap.last_mined_at).toBeGreaterThan(0);

      // On next mine, since should be the bootstrap timestamp
      adapter.observations = [
        { category: 'tool_usage', event_type: 'new:event', metrics: { val: 1 } },
      ];
      miner.mine();

      expect(adapter.lastSince).toBe(stateAfterBootstrap.last_mined_at);
    });

    it('accumulates mined counts', () => {
      adapter.observations = [
        { category: 'tool_usage', event_type: 'initial', metrics: {} },
      ];
      const miner = new DataMiner(db, adapter, engines);
      miner.bootstrap();

      adapter.observations = [
        { category: 'tool_usage', event_type: 'new1', metrics: {} },
        { category: 'tool_usage', event_type: 'new2', metrics: {} },
      ];
      miner.mine();

      expect(miner.getState().total_observations_mined).toBe(3);
    });
  });

  describe('state persistence', () => {
    it('persists state across DataMiner instances', () => {
      adapter.observations = [
        { category: 'tool_usage', event_type: 'persistent', metrics: { x: 1 } },
      ];
      const miner1 = new DataMiner(db, adapter, engines);
      miner1.bootstrap();

      // Create new DataMiner instance on same DB
      const miner2 = new DataMiner(db, adapter, engines);
      expect(miner2.getState().bootstrap_complete).toBe(true);
      expect(miner2.getState().total_observations_mined).toBe(1);
    });
  });

  describe('error handling', () => {
    it('continues mining other categories if one fails', () => {
      const failingAdapter: DataMinerAdapter = {
        name: 'failing',
        mineObservations: () => { throw new Error('obs fail'); },
        mineCausalEvents: () => [],
        mineMetrics: () => [{ name: 'still_works', value: 1 }],
        mineHypothesisObservations: () => [],
        mineCrossDomainEvents: () => [],
      };

      const spy = vi.spyOn(engines.anomalyDetective, 'recordMetric');
      const miner = new DataMiner(db, failingAdapter, engines);
      miner.bootstrap();

      // Metrics should still be recorded despite observations failing
      expect(spy).toHaveBeenCalledWith('still_works', 1);
    });
  });
});
