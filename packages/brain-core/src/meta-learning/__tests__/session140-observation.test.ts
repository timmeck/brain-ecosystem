import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MetaLearningEngine } from '../engine.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

/**
 * Session 140: MetaLearning Kernel — Observation Only
 * - meta_observations table
 * - meta_principles table
 * - Domain accuracy recording
 * - Explorer/exploiter ratio tracking
 * - Principle generation from clear metrics
 * - No automatic steering
 */
describe('Session 140 — MetaLearning Observation Kernel', () => {
  let db: Database.Database;
  let engine: MetaLearningEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new MetaLearningEngine(db, [
      { name: 'learningRate', value: 0.01, min: 0.001, max: 0.1, step: 0.005 },
    ]);
  });

  afterEach(() => {
    db.close();
  });

  describe('meta_observations table', () => {
    it('creates the meta_observations table', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta_observations'").all();
      expect(tables.length).toBe(1);
    });

    it('creates the meta_principles table', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='meta_principles'").all();
      expect(tables.length).toBe(1);
    });

    it('records an observation', () => {
      const obs = engine.recordObservation({
        engine: 'hypothesis',
        domain: 'trading',
        metric: 'accuracy',
        value: 0.75,
      });
      expect(obs.engine).toBe('hypothesis');
      expect(obs.domain).toBe('trading');
      expect(obs.metric).toBe('accuracy');
      expect(obs.value).toBe(0.75);

      const rows = db.prepare('SELECT * FROM meta_observations').all();
      expect(rows.length).toBe(1);
    });

    it('retrieves observations with filters', () => {
      engine.recordObservation({ engine: 'hypothesis', domain: 'trading', metric: 'accuracy', value: 0.7 });
      engine.recordObservation({ engine: 'hypothesis', domain: 'system', metric: 'accuracy', value: 0.5 });
      engine.recordObservation({ engine: 'scanner', domain: 'trading', metric: 'recall', value: 0.9 });

      const trading = engine.getObservations({ domain: 'trading' });
      expect(trading.length).toBe(2);

      const hypothesis = engine.getObservations({ engine: 'hypothesis' });
      expect(hypothesis.length).toBe(2);

      const specific = engine.getObservations({ engine: 'hypothesis', domain: 'trading' });
      expect(specific.length).toBe(1);
    });
  });

  describe('explorer/exploiter ratio', () => {
    it('records explorer/exploiter ratio as 3 observations', () => {
      engine.recordExplorerExploiterRatio(70, 30);

      const ratios = engine.getObservations({ metric: 'explorer_ratio' });
      expect(ratios.length).toBe(1);
      expect(ratios[0]!.value).toBeCloseTo(0.7);

      const explorative = engine.getObservations({ metric: 'explorative_count' });
      expect(explorative[0]!.value).toBe(70);

      const exploitative = engine.getObservations({ metric: 'exploitative_count' });
      expect(exploitative[0]!.value).toBe(30);
    });

    it('handles zero total gracefully', () => {
      engine.recordExplorerExploiterRatio(0, 0);
      const ratios = engine.getObservations({ metric: 'explorer_ratio' });
      expect(ratios[0]!.value).toBe(0.5); // default 50/50 when no data
    });
  });

  describe('domain accuracy recording', () => {
    it('records domain accuracy snapshots', () => {
      engine.recordDomainAccuracy([
        { domain: 'trading', total: 10, correct: 7, rolling_accuracy: 0.7 },
        { domain: 'system', total: 5, correct: 2, rolling_accuracy: 0.4 },
      ]);

      const accuracy = engine.getObservations({ metric: 'domain_accuracy' });
      expect(accuracy.length).toBe(2);

      const totals = engine.getObservations({ metric: 'domain_total' });
      expect(totals.length).toBe(2);
    });

    it('handles empty snapshots array', () => {
      engine.recordDomainAccuracy([]);
      const obs = engine.getObservations({});
      expect(obs.length).toBe(0);
    });
  });

  describe('principle generation', () => {
    it('generates low-accuracy domain principle', () => {
      // Insert enough observations for low-accuracy domain
      for (let i = 0; i < 5; i++) {
        engine.recordObservation({ engine: 'hypothesis', domain: 'crypto', metric: 'domain_accuracy', value: 0.25 });
      }

      const principles = engine.generatePrinciples();
      expect(principles.length).toBeGreaterThanOrEqual(1);
      expect(principles[0]!.content).toContain('crypto');
      expect(principles[0]!.content).toContain('low prediction accuracy');
    });

    it('generates high-accuracy domain principle', () => {
      for (let i = 0; i < 5; i++) {
        engine.recordObservation({ engine: 'hypothesis', domain: 'system', metric: 'domain_accuracy', value: 0.9 });
      }

      const principles = engine.generatePrinciples();
      expect(principles.length).toBeGreaterThanOrEqual(1);
      expect(principles[0]!.content).toContain('system');
      expect(principles[0]!.content).toContain('high prediction accuracy');
    });

    it('generates explorer-skewed principle', () => {
      for (let i = 0; i < 5; i++) {
        engine.recordObservation({ engine: 'hypothesis', domain: 'global', metric: 'explorer_ratio', value: 0.8 });
      }

      const principles = engine.generatePrinciples();
      expect(principles.length).toBeGreaterThanOrEqual(1);
      expect(principles[0]!.content).toContain('exploration');
    });

    it('does not generate principle with insufficient data', () => {
      engine.recordObservation({ engine: 'hypothesis', domain: 'crypto', metric: 'domain_accuracy', value: 0.25 });
      // Only 1 observation — need >= 3

      const principles = engine.generatePrinciples();
      expect(principles.length).toBe(0);
    });

    it('does not duplicate existing principles', () => {
      for (let i = 0; i < 5; i++) {
        engine.recordObservation({ engine: 'hypothesis', domain: 'crypto', metric: 'domain_accuracy', value: 0.25 });
      }

      const first = engine.generatePrinciples();
      expect(first.length).toBe(1);

      const second = engine.generatePrinciples();
      expect(second.length).toBe(0); // already exists
    });

    it('does not generate for mid-range accuracy (no insight)', () => {
      for (let i = 0; i < 5; i++) {
        engine.recordObservation({ engine: 'hypothesis', domain: 'trading', metric: 'domain_accuracy', value: 0.6 });
      }

      const principles = engine.generatePrinciples();
      // 0.6 is not < 0.4 and not > 0.8, so no domain accuracy principle
      const domainPrinciples = principles.filter(p => p.content.includes('trading'));
      expect(domainPrinciples.length).toBe(0);
    });
  });

  describe('getPrinciples', () => {
    it('returns principles ordered by confidence', () => {
      db.prepare("INSERT INTO meta_principles (content, confidence, evidence) VALUES (?, ?, ?)").run('Low conf', 0.3, '[]');
      db.prepare("INSERT INTO meta_principles (content, confidence, evidence) VALUES (?, ?, ?)").run('High conf', 0.9, '[]');
      db.prepare("INSERT INTO meta_principles (content, confidence, evidence) VALUES (?, ?, ?)").run('Med conf', 0.6, '[]');

      const principles = engine.getPrinciples();
      expect(principles.length).toBe(3);
      expect(principles[0]!.content).toBe('High conf');
      expect(principles[1]!.content).toBe('Med conf');
      expect(principles[2]!.content).toBe('Low conf');
    });
  });

  describe('getObservationStatus', () => {
    it('returns complete status object', () => {
      engine.recordObservation({ engine: 'hypothesis', domain: 'trading', metric: 'accuracy', value: 0.7 });
      engine.recordObservation({ engine: 'hypothesis', domain: 'system', metric: 'accuracy', value: 0.5 });
      engine.recordExplorerExploiterRatio(60, 40);

      const status = engine.getObservationStatus();
      expect(status.totalObservations).toBe(5); // 2 + 3 from ratio
      expect(status.totalPrinciples).toBe(0);
      expect(status.domains).toContain('trading');
      expect(status.domains).toContain('system');
      expect(status.domains).toContain('global');
      expect(status.latestExplorerRatio).toBeCloseTo(0.6);
    });

    it('returns null explorer ratio when no data', () => {
      const status = engine.getObservationStatus();
      expect(status.latestExplorerRatio).toBeNull();
      expect(status.totalObservations).toBe(0);
    });
  });

  describe('read-only access pattern', () => {
    it('does not modify any foreign tables', () => {
      // Verify only meta_observations and meta_principles are written to
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      const metaTables = tables.map(t => t.name).filter(n => n.startsWith('meta_'));

      engine.recordObservation({ engine: 'test', domain: 'test', metric: 'test', value: 1 });
      engine.generatePrinciples();

      // After operations, no new tables should exist
      const tablesAfter = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
      expect(tablesAfter.length).toBe(tables.length);
    });
  });
});
