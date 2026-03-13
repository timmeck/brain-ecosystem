import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { HypothesisEngine, runHypothesisMigration } from '../../../src/hypothesis/engine.js';
import type { Observation } from '../../../src/hypothesis/engine.js';

describe('HypothesisEngine', () => {
  let db: Database.Database;
  let engine: HypothesisEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    engine = new HypothesisEngine(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Migration ───────────────────────────────────────

  describe('runHypothesisMigration', () => {
    it('creates hypotheses and observations tables', () => {
      const freshDb = new Database(':memory:');
      runHypothesisMigration(freshDb);

      const tables = freshDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[];
      const tableNames = tables.map(t => t.name);

      expect(tableNames).toContain('hypotheses');
      expect(tableNames).toContain('observations');
      freshDb.close();
    });

    it('is idempotent (can run twice without error)', () => {
      const freshDb = new Database(':memory:');
      runHypothesisMigration(freshDb);
      expect(() => runHypothesisMigration(freshDb)).not.toThrow();
      freshDb.close();
    });

    it('creates expected indexes', () => {
      const freshDb = new Database(':memory:');
      runHypothesisMigration(freshDb);

      const indexes = freshDb
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
        .all() as { name: string }[];
      const indexNames = indexes.map(i => i.name);

      expect(indexNames).toContain('idx_hypotheses_status');
      expect(indexNames).toContain('idx_hypotheses_confidence');
      expect(indexNames).toContain('idx_observations_type');
      expect(indexNames).toContain('idx_observations_timestamp');
      freshDb.close();
    });
  });

  // ── observe ─────────────────────────────────────────

  describe('observe', () => {
    it('records an observation with required fields', () => {
      engine.observe({ source: 'test', type: 'cpu_usage', value: 85, timestamp: 1000 });

      const row = db.prepare('SELECT * FROM observations WHERE type = ?').get('cpu_usage') as any;
      expect(row).toBeDefined();
      expect(row.source).toBe('test');
      expect(row.type).toBe('cpu_usage');
      expect(row.value).toBe(85);
      expect(row.timestamp).toBe(1000);
      expect(row.metadata).toBeNull();
    });

    it('records an observation with metadata', () => {
      engine.observe({
        source: 'brain-a',
        type: 'request',
        value: 200,
        timestamp: 5000,
        metadata: { endpoint: '/api/data', method: 'GET' },
      });

      const row = db.prepare('SELECT * FROM observations WHERE type = ?').get('request') as any;
      expect(row.metadata).not.toBeNull();
      const meta = JSON.parse(row.metadata);
      expect(meta.endpoint).toBe('/api/data');
      expect(meta.method).toBe('GET');
    });

    it('stores multiple observations of the same type', () => {
      for (let i = 0; i < 5; i++) {
        engine.observe({ source: 'test', type: 'metric', value: i * 10, timestamp: i * 1000 });
      }

      const count = (db.prepare('SELECT COUNT(*) as c FROM observations WHERE type = ?').get('metric') as { c: number }).c;
      expect(count).toBe(5);
    });
  });

  // ── propose ─────────────────────────────────────────

  describe('propose', () => {
    it('creates a hypothesis with proposed status and default values', () => {
      const hyp = engine.propose({
        statement: 'CPU usage peaks at 14:00 UTC',
        type: 'temporal',
        source: 'test',
        variables: ['cpu_usage'],
        condition: { type: 'temporal', params: { peakHour: 14 } },
      });

      expect(hyp.id).toBe(1);
      expect(hyp.statement).toBe('CPU usage peaks at 14:00 UTC');
      expect(hyp.type).toBe('temporal');
      expect(hyp.source).toBe('test');
      expect(hyp.variables).toEqual(['cpu_usage']);
      expect(hyp.status).toBe('proposed');
      expect(hyp.evidence_for).toBe(0);
      expect(hyp.evidence_against).toBe(0);
      expect(hyp.confidence).toBe(0);
      expect(hyp.p_value).toBe(1);
    });

    it('assigns incrementing IDs to multiple hypotheses', () => {
      const h1 = engine.propose({
        statement: 'Hypothesis 1',
        type: 'temporal',
        source: 'test',
        variables: ['a'],
        condition: { type: 'temporal', params: {} },
      });
      const h2 = engine.propose({
        statement: 'Hypothesis 2',
        type: 'correlation',
        source: 'test',
        variables: ['a', 'b'],
        condition: { type: 'correlation', params: {} },
      });

      expect(h1.id).toBe(1);
      expect(h2.id).toBe(2);
    });
  });

  // ── generate (no data) ─────────────────────────────

  describe('generate', () => {
    it('returns empty array when no observations exist', () => {
      const hypotheses = engine.generate();
      expect(hypotheses).toEqual([]);
    });

    // ── Temporal hypothesis generation ──────────────

    it('generates a temporal hypothesis when events concentrate in one hour', () => {
      // 20 events in hour 14
      const baseTimestamp = 3600000 * 14; // hour 14 UTC
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'event_a', value: 1, timestamp: baseTimestamp + i * 60000 });
      }
      // 4 events spread across hours 0-3
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'event_a', value: 1, timestamp: 3600000 * i });
      }

      const hypotheses = engine.generate();
      const temporal = hypotheses.filter(h => h.type === 'temporal');

      expect(temporal.length).toBeGreaterThanOrEqual(1);
      expect(temporal[0].statement).toContain('event_a');
      expect(temporal[0].statement).toContain('hour 14');
      expect(temporal[0].condition.type).toBe('temporal');
      expect((temporal[0].condition.params as any).peakHour).toBe(14);
      expect(temporal[0].status).toBe('proposed');
    });

    it('does not generate temporal hypothesis when events are evenly distributed', () => {
      // Spread 24 events evenly: one per hour
      for (let hour = 0; hour < 24; hour++) {
        engine.observe({ source: 'test', type: 'even_event', value: 1, timestamp: 3600000 * hour });
      }

      const hypotheses = engine.generate();
      const temporal = hypotheses.filter(h => h.type === 'temporal');
      expect(temporal).toHaveLength(0);
    });

    // ── Correlation hypothesis generation ───────────

    it('generates a correlation hypothesis for co-occurring events', () => {
      // Create partially co-occurring events: 10/15 event_x have a nearby event_y (67%)
      // This is a genuine partial correlation, not trivial same-cycle co-occurrence (>90%)
      for (let i = 0; i < 15; i++) {
        const baseTs = i * 120000; // 2 minute intervals
        engine.observe({ source: 'test', type: 'event_x', value: 1, timestamp: baseTs });
        if (i < 10) {
          engine.observe({ source: 'test', type: 'event_y', value: 1, timestamp: baseTs + 10000 });
        }
      }
      // Add standalone event_y observations to ensure enough data
      for (let i = 0; i < 5; i++) {
        engine.observe({ source: 'test', type: 'event_y', value: 1, timestamp: 5000000 + i * 120000 });
      }

      const hypotheses = engine.generate();
      const correlation = hypotheses.filter(h => h.type === 'correlation');

      expect(correlation.length).toBeGreaterThanOrEqual(1);
      expect(correlation[0].statement).toContain('event_x');
      expect(correlation[0].statement).toContain('event_y');
      expect(correlation[0].condition.type).toBe('correlation');
      expect(correlation[0].variables).toContain('event_x');
      expect(correlation[0].variables).toContain('event_y');
    });

    // ── Threshold hypothesis generation ─────────────

    it('generates a threshold hypothesis for anomalous values', () => {
      // Create observations where most are low-value with a few high outliers
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'latency', value: 50 + Math.random() * 10, timestamp: i * 1000 });
      }
      // Add anomalous high values (fewer than 30% of total, but at least 3)
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'latency', value: 200, timestamp: 100000 + i * 1000 });
      }

      const hypotheses = engine.generate();
      const threshold = hypotheses.filter(h => h.type === 'threshold');

      expect(threshold.length).toBeGreaterThanOrEqual(1);
      expect(threshold[0].statement).toContain('latency');
      expect(threshold[0].condition.type).toBe('threshold');
      expect((threshold[0].condition.params as any).eventType).toBe('latency');
    });

    // ── Duplicate prevention ────────────────────────

    it('does not create duplicate hypotheses on second generate call', () => {
      // Set up data for a temporal hypothesis
      const baseTimestamp = 3600000 * 14;
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'event_dup', value: 1, timestamp: baseTimestamp + i * 60000 });
      }
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'event_dup', value: 1, timestamp: 3600000 * i });
      }

      const first = engine.generate();
      const second = engine.generate();

      expect(first.length).toBeGreaterThanOrEqual(1);
      expect(second).toHaveLength(0); // no new hypotheses generated

      // Verify only one hypothesis exists in the DB
      const allHypotheses = engine.list();
      const temporalForDup = allHypotheses.filter(
        h => h.type === 'temporal' && h.variables.includes('event_dup'),
      );
      expect(temporalForDup).toHaveLength(1);
    });
  });

  // ── test (statistical testing) ──────────────────────

  describe('test', () => {
    it('returns null for non-existent hypothesis', () => {
      const result = engine.test(999);
      expect(result).toBeNull();
    });

    it('tests a temporal hypothesis and confirms it with concentrated data', () => {
      // Create observations concentrated in hour 14
      const baseTimestamp = 3600000 * 14;
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'event_a', value: 1, timestamp: baseTimestamp + i * 60000 });
      }
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'event_a', value: 1, timestamp: 3600000 * i });
      }

      // Generate and test
      const hypotheses = engine.generate();
      const temporal = hypotheses.find(h => h.type === 'temporal')!;
      expect(temporal).toBeDefined();

      const result = engine.test(temporal.id!);
      expect(result).not.toBeNull();
      expect(result!.hypothesisId).toBe(temporal.id);
      expect(result!.evidenceFor).toBe(20); // 20 events in peak hour
      expect(result!.pValue).toBeLessThan(0.05); // statistically significant
      expect(result!.newStatus).toBe('confirmed');
      expect(result!.passed).toBe(true);
      expect(result!.confidence).toBeGreaterThan(0);
    });

    it('tests a correlation hypothesis with co-occurring events', () => {
      // Create partially co-occurring events (~67% rate, not trivial >90%)
      for (let i = 0; i < 15; i++) {
        const baseTs = i * 120000;
        engine.observe({ source: 'test', type: 'event_x', value: 1, timestamp: baseTs });
        if (i < 10) {
          engine.observe({ source: 'test', type: 'event_y', value: 1, timestamp: baseTs + 5000 });
        }
      }
      for (let i = 0; i < 5; i++) {
        engine.observe({ source: 'test', type: 'event_y', value: 1, timestamp: 5000000 + i * 120000 });
      }

      const hypotheses = engine.generate();
      const correlation = hypotheses.find(h => h.type === 'correlation')!;
      expect(correlation).toBeDefined();

      const result = engine.test(correlation.id!);
      expect(result).not.toBeNull();
      expect(result!.hypothesisId).toBe(correlation.id);
      expect(result!.evidenceFor).toBeGreaterThan(0);
      // With tight co-occurrence, the observed rate should be high
      expect(result!.confidence).toBeGreaterThan(0);
    });

    it('tests a threshold hypothesis', () => {
      // Most values low, a few very high
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'metric_t', value: 10, timestamp: i * 1000 });
      }
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'metric_t', value: 100, timestamp: 100000 + i * 1000 });
      }

      const hypotheses = engine.generate();
      const threshold = hypotheses.find(h => h.type === 'threshold')!;
      expect(threshold).toBeDefined();

      const result = engine.test(threshold.id!);
      expect(result).not.toBeNull();
      expect(result!.hypothesisId).toBe(threshold.id);
      // Evidence for = count above threshold, evidence against = count below
      expect(result!.evidenceFor).toBeGreaterThan(0);
      expect(result!.evidenceAgainst).toBeGreaterThan(0);
      // Threshold splits unevenly (4 vs 20), so proportion is far from 0.5
      // p-value should be low = significant = confirmed
      expect(result!.pValue).toBeLessThan(1);
    });

    it('updates hypothesis status and stats in the database after testing', () => {
      const baseTimestamp = 3600000 * 14;
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'db_check', value: 1, timestamp: baseTimestamp + i * 60000 });
      }
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'db_check', value: 1, timestamp: 3600000 * i });
      }

      const hypotheses = engine.generate();
      const hyp = hypotheses.find(h => h.type === 'temporal')!;
      engine.test(hyp.id!);

      // Re-fetch from DB
      const updated = engine.get(hyp.id!)!;
      expect(updated.evidence_for).toBeGreaterThan(0);
      expect(updated.p_value).toBeLessThan(1);
      expect(updated.tested_at).not.toBeNull();
      expect(['confirmed', 'rejected', 'inconclusive', 'testing']).toContain(updated.status);
    });

    it('rejects a hypothesis when data does not support it', () => {
      // Manually propose a temporal hypothesis for hour 14.
      // Then add 240 evenly distributed events (10 per hour).
      // With 10 events at the peak hour and expected = 240/24 = 10,
      // chiSq = 0 and pValue = 1.0, which exceeds rejectThreshold (0.5).
      // evidenceFor = inPeak = 10, evidenceAgainst = max(0, 10-10) = 0,
      // totalEvidence = 10, which meets minEvidence = 10.
      const hyp = engine.propose({
        statement: 'Events peak at hour 14',
        type: 'temporal',
        source: 'test',
        variables: ['spread_event'],
        condition: { type: 'temporal', params: { eventType: 'spread_event', peakHour: 14 } },
      });

      // 10 events per hour across all 24 hours = 240 total
      for (let hour = 0; hour < 24; hour++) {
        for (let j = 0; j < 10; j++) {
          engine.observe({ source: 'test', type: 'spread_event', value: 1, timestamp: 3600000 * hour + j * 1000 });
        }
      }

      const result = engine.test(hyp.id!);
      expect(result).not.toBeNull();
      expect(result!.pValue).toBeGreaterThan(0.5);
      expect(result!.newStatus).toBe('rejected');
      expect(result!.passed).toBe(false);
    });
  });

  // ── testAll ─────────────────────────────────────────

  describe('testAll', () => {
    it('tests all proposed and testing hypotheses', () => {
      // Create data for temporal hypothesis
      const baseTimestamp = 3600000 * 14;
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'event_all', value: 1, timestamp: baseTimestamp + i * 60000 });
      }
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'event_all', value: 1, timestamp: 3600000 * i });
      }

      // Generate hypotheses
      engine.generate();

      const results = engine.testAll();
      expect(results.length).toBeGreaterThanOrEqual(1);
      for (const result of results) {
        expect(result.hypothesisId).toBeDefined();
        expect(result.pValue).toBeDefined();
        expect(result.newStatus).toBeDefined();
      }
    });

    it('does not test already confirmed or rejected hypotheses', () => {
      // Create and confirm a hypothesis
      const baseTimestamp = 3600000 * 14;
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'event_done', value: 1, timestamp: baseTimestamp + i * 60000 });
      }
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'event_done', value: 1, timestamp: 3600000 * i });
      }

      engine.generate();
      engine.testAll(); // first pass: should confirm

      // Second testAll should return empty (no proposed/testing left)
      const results = engine.testAll();
      expect(results).toHaveLength(0);
    });

    it('returns empty array when no hypotheses exist', () => {
      const results = engine.testAll();
      expect(results).toEqual([]);
    });
  });

  // ── list ────────────────────────────────────────────

  describe('list', () => {
    it('returns all hypotheses when no status filter', () => {
      engine.propose({
        statement: 'H1',
        type: 'temporal',
        source: 'test',
        variables: ['a'],
        condition: { type: 'temporal', params: {} },
      });
      engine.propose({
        statement: 'H2',
        type: 'correlation',
        source: 'test',
        variables: ['a', 'b'],
        condition: { type: 'correlation', params: {} },
      });

      const all = engine.list();
      expect(all).toHaveLength(2);
    });

    it('filters by status', () => {
      engine.propose({
        statement: 'Proposed',
        type: 'temporal',
        source: 'test',
        variables: ['a'],
        condition: { type: 'temporal', params: {} },
      });

      // Manually create a confirmed entry
      db.prepare(`
        INSERT INTO hypotheses (statement, type, source, variables, condition, status, confidence)
        VALUES ('Confirmed', 'temporal', 'test', '["a"]', '{"type":"temporal","params":{}}', 'confirmed', 0.9)
      `).run();

      const proposed = engine.list('proposed');
      expect(proposed).toHaveLength(1);
      expect(proposed[0].statement).toBe('Proposed');

      const confirmed = engine.list('confirmed');
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].statement).toBe('Confirmed');
    });

    it('returns empty array when no hypotheses exist', () => {
      expect(engine.list()).toEqual([]);
    });

    it('orders by confidence descending', () => {
      db.prepare(`
        INSERT INTO hypotheses (statement, type, source, variables, condition, status, confidence)
        VALUES ('Low', 'temporal', 'test', '["a"]', '{"type":"temporal","params":{}}', 'proposed', 0.2)
      `).run();
      db.prepare(`
        INSERT INTO hypotheses (statement, type, source, variables, condition, status, confidence)
        VALUES ('High', 'temporal', 'test', '["a"]', '{"type":"temporal","params":{}}', 'proposed', 0.9)
      `).run();
      db.prepare(`
        INSERT INTO hypotheses (statement, type, source, variables, condition, status, confidence)
        VALUES ('Mid', 'temporal', 'test', '["a"]', '{"type":"temporal","params":{}}', 'proposed', 0.5)
      `).run();

      const all = engine.list();
      expect(all[0].statement).toBe('High');
      expect(all[1].statement).toBe('Mid');
      expect(all[2].statement).toBe('Low');
    });
  });

  // ── get ─────────────────────────────────────────────

  describe('get', () => {
    it('returns a hypothesis by ID with parsed fields', () => {
      const proposed = engine.propose({
        statement: 'Test get',
        type: 'temporal',
        source: 'test',
        variables: ['metric_a', 'metric_b'],
        condition: { type: 'temporal', params: { peakHour: 10 } },
      });

      const fetched = engine.get(proposed.id!)!;
      expect(fetched).toBeDefined();
      expect(fetched.statement).toBe('Test get');
      expect(fetched.variables).toEqual(['metric_a', 'metric_b']);
      expect(fetched.condition).toEqual({ type: 'temporal', params: { peakHour: 10 } });
    });

    it('returns null for non-existent ID', () => {
      expect(engine.get(999)).toBeNull();
    });
  });

  // ── getSummary ──────────────────────────────────────

  describe('getSummary', () => {
    it('returns zeroes when no data exists', () => {
      const summary = engine.getSummary();
      expect(summary.total).toBe(0);
      expect(summary.proposed).toBe(0);
      expect(summary.testing).toBe(0);
      expect(summary.confirmed).toBe(0);
      expect(summary.rejected).toBe(0);
      expect(summary.inconclusive).toBe(0);
      expect(summary.totalObservations).toBe(0);
      expect(summary.topConfirmed).toEqual([]);
    });

    it('returns correct counts for mixed statuses', () => {
      // Insert hypotheses with various statuses directly
      const insertStmt = db.prepare(`
        INSERT INTO hypotheses (statement, type, source, variables, condition, status, confidence)
        VALUES (?, 'temporal', 'test', '["a"]', '{"type":"temporal","params":{}}', ?, ?)
      `);
      insertStmt.run('H1', 'proposed', 0);
      insertStmt.run('H2', 'proposed', 0);
      insertStmt.run('H3', 'testing', 0.3);
      insertStmt.run('H4', 'confirmed', 0.95);
      insertStmt.run('H5', 'confirmed', 0.88);
      insertStmt.run('H6', 'rejected', 0.1);
      insertStmt.run('H7', 'inconclusive', 0.4);

      // Add some observations
      for (let i = 0; i < 5; i++) {
        engine.observe({ source: 'test', type: 'obs', value: i, timestamp: i * 1000 });
      }

      const summary = engine.getSummary();
      expect(summary.total).toBe(7);
      expect(summary.proposed).toBe(2);
      expect(summary.testing).toBe(1);
      expect(summary.confirmed).toBe(2);
      expect(summary.rejected).toBe(1);
      expect(summary.inconclusive).toBe(1);
      expect(summary.totalObservations).toBe(5);
      expect(summary.topConfirmed).toHaveLength(2);
      // topConfirmed should be ordered by confidence desc
      expect(summary.topConfirmed[0].confidence).toBeGreaterThanOrEqual(summary.topConfirmed[1].confidence);
    });
  });

  // ── Re-test & Rejection Pipeline ────────────────────

  describe('re-test and rejection pipeline', () => {
    it('re-tests confirmed hypotheses older than 24h via testAll', () => {
      // Propose and confirm a hypothesis
      const hyp = engine.propose({
        statement: 'Events peak at hour 14',
        type: 'temporal',
        source: 'test',
        variables: ['retest_event'],
        condition: { type: 'temporal', params: { eventType: 'retest_event', peakHour: 14 } },
      });

      // Add concentrated data and confirm
      const baseTimestamp = 3600000 * 14;
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'retest_event', value: 1, timestamp: baseTimestamp + i * 60000 });
      }
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'retest_event', value: 1, timestamp: 3600000 * i });
      }

      const result = engine.test(hyp.id!);
      expect(result!.newStatus).toBe('confirmed');

      // Manually set tested_at to 25h ago to simulate stale confirmation
      db.prepare(`UPDATE hypotheses SET tested_at = datetime('now', '-25 hours') WHERE id = ?`).run(hyp.id);

      // testAll should now include the confirmed hypothesis for re-testing
      const results = engine.testAll();
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some(r => r.hypothesisId === hyp.id)).toBe(true);
    });

    it('rejects confirmed hypothesis when pattern stops on re-test', () => {
      // Propose a hypothesis that events peak at hour 14
      const hyp = engine.propose({
        statement: 'Events peak at hour 14',
        type: 'temporal',
        source: 'test',
        variables: ['drift_event'],
        condition: { type: 'temporal', params: { eventType: 'drift_event', peakHour: 14 } },
      });

      // Add concentrated data → confirm
      for (let i = 0; i < 20; i++) {
        engine.observe({ source: 'test', type: 'drift_event', value: 1, timestamp: 3600000 * 14 + i * 60000 });
      }
      for (let i = 0; i < 4; i++) {
        engine.observe({ source: 'test', type: 'drift_event', value: 1, timestamp: 3600000 * i });
      }
      const firstResult = engine.test(hyp.id!);
      expect(firstResult!.newStatus).toBe('confirmed');

      // Now add evenly distributed NEW data (pattern stops) with timestamps AFTER tested_at
      // tested_at is datetime('now'), so future timestamps will pass the holdout
      const futureBase = Date.now() + 60_000; // 1 minute in the future
      for (let h = 0; h < 24; h++) {
        for (let j = 0; j < 10; j++) {
          engine.observe({ source: 'test', type: 'drift_event', value: 1, timestamp: futureBase + 3600000 * h + j * 1000 });
        }
      }

      // Re-test: holdout means only future data is used → evenly distributed → p-value high → rejected
      const retest = engine.test(hyp.id!);
      expect(retest).not.toBeNull();
      expect(retest!.pValue).toBeGreaterThan(0.5);
      expect(retest!.newStatus).toBe('rejected');
    });

    it('co-occurrence rate is always bounded 0-100%', () => {
      // Create events where each A event has many nearby B events
      // This previously caused >100% rates
      for (let i = 0; i < 5; i++) {
        engine.observe({ source: 'test', type: 'rare_a', value: 1, timestamp: i * 120000 });
        // Add 10 B events within 60s of each A
        for (let j = 0; j < 10; j++) {
          engine.observe({ source: 'test', type: 'common_b', value: 1, timestamp: i * 120000 + j * 5000 });
        }
      }

      const hypotheses = engine.generate();
      const correlation = hypotheses.find(h =>
        h.type === 'correlation' &&
        h.variables.includes('rare_a') &&
        h.variables.includes('common_b'),
      );

      if (correlation) {
        // Verify the rate in the statement is ≤100%
        const rateMatch = correlation.statement.match(/(\d+)%/);
        expect(rateMatch).not.toBeNull();
        const rate = parseInt(rateMatch![1]!, 10);
        expect(rate).toBeLessThanOrEqual(100);
      }
    });
  });

  // ── frequency hypothesis testing ──────────────────

  describe('frequency hypothesis testing', () => {
    it('confirms a frequency hypothesis with regular intervals', () => {
      const hyp = engine.propose({
        statement: 'heartbeat events occur every 60s',
        type: 'frequency',
        source: 'test',
        variables: ['heartbeat'],
        condition: {
          type: 'frequency',
          params: { eventType: 'heartbeat', periodMs: 60000, toleranceMs: 6000 },
        },
      });

      // Add 15 events at regular 60s intervals
      for (let i = 0; i < 15; i++) {
        engine.observe({ source: 'test', type: 'heartbeat', value: 1, timestamp: i * 60000 });
      }

      const result = engine.test(hyp.id!);
      expect(result).not.toBeNull();
      expect(result!.evidenceFor).toBeGreaterThan(0);
      expect(result!.pValue).toBeLessThan(0.5);
    });

    it('rejects a frequency hypothesis with random intervals', () => {
      const hyp = engine.propose({
        statement: 'random events occur every 60s',
        type: 'frequency',
        source: 'test',
        variables: ['random_ev'],
        condition: {
          type: 'frequency',
          params: { eventType: 'random_ev', periodMs: 60000, toleranceMs: 6000 },
        },
      });

      // Add events at random intervals (not periodic)
      const timestamps = [0, 15000, 90000, 95000, 200000, 500000, 502000, 800000, 1200000, 1201000];
      for (const ts of timestamps) {
        engine.observe({ source: 'test', type: 'random_ev', value: 1, timestamp: ts });
      }

      const result = engine.test(hyp.id!);
      expect(result).not.toBeNull();
      // Random intervals shouldn't match 60s period consistently
      expect(result!.evidenceAgainst).toBeGreaterThan(result!.evidenceFor);
    });

    it('returns testing status with insufficient data', () => {
      const hyp = engine.propose({
        statement: 'test with too few events',
        type: 'frequency',
        source: 'test',
        variables: ['sparse'],
        condition: {
          type: 'frequency',
          params: { eventType: 'sparse', periodMs: 60000 },
        },
      });

      // Only 2 events (need at least 3 for meaningful intervals)
      engine.observe({ source: 'test', type: 'sparse', value: 1, timestamp: 0 });
      engine.observe({ source: 'test', type: 'sparse', value: 1, timestamp: 60000 });

      const result = engine.test(hyp.id!);
      expect(result).not.toBeNull();
      expect(result!.newStatus).toBe('testing'); // insufficient evidence
    });
  });

  // ── Constructor config ──────────────────────────────

  describe('constructor config', () => {
    it('uses default config values when none provided', () => {
      // Test that defaults (minEvidence=10, confirmThreshold=0.05, rejectThreshold=0.5) apply.
      // With 240 evenly distributed events (10 per hour) and peakHour=0:
      // inPeak=10, expected=10, chiSq=0, pValue=1.0 > rejectThreshold(0.5) -> rejected
      // evidenceFor=10, evidenceAgainst=0, totalEvidence=10 >= minEvidence(10)
      const hyp = engine.propose({
        statement: 'Even events at hour 0',
        type: 'temporal',
        source: 'test',
        variables: ['even_type'],
        condition: { type: 'temporal', params: { eventType: 'even_type', peakHour: 0 } },
      });

      for (let h = 0; h < 24; h++) {
        for (let j = 0; j < 10; j++) {
          engine.observe({ source: 'test', type: 'even_type', value: 1, timestamp: 3600000 * h + j * 1000 });
        }
      }

      const result = engine.test(hyp.id!);
      expect(result).not.toBeNull();
      // totalEvidence meets minEvidence, pValue is 1.0 > 0.5, so should be rejected
      expect(result!.newStatus).toBe('rejected');
      expect(result!.pValue).toBe(1);
    });

    it('respects custom minEvidence threshold', () => {
      const customEngine = new HypothesisEngine(db, { minEvidence: 100 });

      const hyp = customEngine.propose({
        statement: 'Custom min evidence test',
        type: 'temporal',
        source: 'test',
        variables: ['custom_ev'],
        condition: { type: 'temporal', params: { eventType: 'custom_ev', peakHour: 14 } },
      });

      // Add 20 observations (below minEvidence=100)
      const baseTimestamp = 3600000 * 14;
      for (let i = 0; i < 20; i++) {
        customEngine.observe({ source: 'test', type: 'custom_ev', value: 1, timestamp: baseTimestamp + i * 60000 });
      }

      const result = customEngine.test(hyp.id!);
      expect(result).not.toBeNull();
      // Total evidence (for + against) is below minEvidence (100), so status stays 'testing'
      expect(result!.newStatus).toBe('testing');
    });
  });
});
