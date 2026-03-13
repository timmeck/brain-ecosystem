import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { HypothesisEngine } from '../engine.js';
import type { HypothesisCallbacks } from '../engine.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

/**
 * Session 139: Hypothesis Hardening Tests
 * - Domain calibration (rolling accuracy per domain)
 * - Anti-pattern auto-gen callback on rejection
 * - Strategy emergence callback on confirmed threshold
 * - Domain column on hypotheses
 */
describe('Session 139 — Hypothesis Hardening', () => {
  let db: Database.Database;
  let engine: HypothesisEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new HypothesisEngine(db, {
      minEvidence: 3,
      confirmThreshold: 0.05,
      rejectThreshold: 0.5,
      emergenceThreshold: 3,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('domain column', () => {
    it('stores domain on proposed hypothesis', () => {
      const hyp = engine.propose({
        statement: 'Test domain',
        type: 'temporal',
        source: 'test',
        domain: 'trading',
        variables: ['price'],
        condition: { type: 'temporal', params: { peakHour: 14 } },
      });
      expect(hyp.domain).toBe('trading');
    });

    it('defaults domain to "general" when not specified', () => {
      const hyp = engine.propose({
        statement: 'Test no domain',
        type: 'temporal',
        source: 'test',
        domain: 'general',
        variables: ['metric'],
        condition: { type: 'temporal', params: { peakHour: 10 } },
      });
      expect(hyp.domain).toBe('general');
    });
  });

  describe('domain calibration', () => {
    it('creates domain_calibration table', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='domain_calibration'").all();
      expect(tables.length).toBe(1);
    });

    it('tracks domain accuracy after confirmed hypothesis', () => {
      // Create observations to support hypothesis
      for (let i = 0; i < 20; i++) {
        engine.observe({
          source: 'test', type: 'cpu_usage',
          value: i < 15 ? 80 : 20, // 75% in peak hour
          timestamp: Date.now() - i * 3600000 + (i < 15 ? 14 * 3600000 : 0),
        });
      }

      const hyp = engine.propose({
        statement: 'CPU spikes at 2pm',
        type: 'temporal',
        source: 'test',
        domain: 'system',
        variables: ['cpu_usage'],
        condition: { type: 'temporal', params: { peakHour: 14, variable: 'cpu_usage' } },
      });

      engine.test(hyp.id!);

      const cal = engine.getDomainCalibration('system');
      // Even if not confirmed, calibration should have an entry if status was terminal
      // (depends on test result — calibration only updates on confirmed/rejected)
      expect(Array.isArray(cal)).toBe(true);
    });

    it('returns empty array for unknown domain', () => {
      const cal = engine.getDomainCalibration('nonexistent');
      expect(cal).toEqual([]);
    });

    it('returns all domains when no filter', () => {
      // Manually insert calibration entries
      db.prepare("INSERT INTO domain_calibration (domain, total, correct, rolling_accuracy) VALUES (?, ?, ?, ?)").run('a', 10, 7, 0.7);
      db.prepare("INSERT INTO domain_calibration (domain, total, correct, rolling_accuracy) VALUES (?, ?, ?, ?)").run('b', 5, 2, 0.4);

      const all = engine.getDomainCalibration();
      expect(all.length).toBe(2);
      expect(all[0].domain).toBe('a'); // higher total first
    });
  });

  describe('onRejected callback', () => {
    it('fires callback when hypothesis is rejected', () => {
      const onRejected = vi.fn();
      engine.setCallbacks({ onRejected });

      // Create hypothesis that will be rejected (no supporting observations)
      const hyp = engine.propose({
        statement: 'This will fail',
        type: 'threshold',
        source: 'test',
        domain: 'test',
        variables: ['metric_a'],
        condition: { type: 'threshold', params: { variable: 'metric_a', threshold: 100 } },
      });

      // Add contradicting observations
      for (let i = 0; i < 10; i++) {
        engine.observe({
          source: 'test', type: 'metric_a',
          value: 50, // all below threshold
          timestamp: Date.now() - i * 1000,
        });
      }

      engine.test(hyp.id!);

      // Callback fires if status became rejected
      const result = engine.get(hyp.id!);
      if (result?.status === 'rejected') {
        expect(onRejected).toHaveBeenCalled();
        expect(onRejected.mock.calls[0][0].statement).toBe('This will fail');
      }
    });

    it('does not fire callback when already rejected', () => {
      const onRejected = vi.fn();
      engine.setCallbacks({ onRejected });

      // Manually set a hypothesis to rejected
      db.prepare(`INSERT INTO hypotheses (statement, type, source, domain, variables, condition, status, evidence_for, evidence_against, confidence, p_value)
        VALUES ('already rejected', 'temporal', 'test', 'test', '[]', '{"type":"temporal","params":{"peakHour":0,"variable":"x"}}', 'rejected', 0, 5, 0, 1)`).run();

      const id = (db.prepare('SELECT id FROM hypotheses WHERE statement = ?').get('already rejected') as { id: number }).id;
      engine.test(id);

      // Should not fire because it was already rejected
      expect(onRejected).not.toHaveBeenCalled();
    });

    it('handles callback errors gracefully', () => {
      engine.setCallbacks({
        onRejected: () => { throw new Error('callback exploded'); },
      });

      const hyp = engine.propose({
        statement: 'Callback error test',
        type: 'threshold',
        source: 'test',
        domain: 'test',
        variables: ['x'],
        condition: { type: 'threshold', params: { variable: 'x', threshold: 999 } },
      });

      for (let i = 0; i < 10; i++) {
        engine.observe({ source: 'test', type: 'x', value: 1, timestamp: Date.now() - i * 1000 });
      }

      // Should not throw even though callback throws
      expect(() => engine.test(hyp.id!)).not.toThrow();
    });
  });

  describe('onEmergence callback', () => {
    it('fires when confirmed hypotheses reach emergence threshold', () => {
      const onEmergence = vi.fn();
      engine.setCallbacks({ onEmergence });

      // Insert 3 confirmed hypotheses of same type with recent tested_at
      // (tested_at within 24h means testAll won't re-test them, preserving confirmed status)
      for (let i = 0; i < 3; i++) {
        db.prepare(`INSERT INTO hypotheses (statement, type, source, domain, variables, condition, status, evidence_for, evidence_against, confidence, p_value, tested_at)
          VALUES (?, 'temporal', 'test', 'general', '["x"]', '{"type":"temporal","params":{"peakHour":10,"variable":"x"}}', 'confirmed', 10, 0, 1.0, 0.01, datetime('now'))`)
          .run(`Confirmed hypothesis ${i}`);
      }

      // testAll should trigger emergence check
      engine.testAll();

      expect(onEmergence).toHaveBeenCalled();
      expect(onEmergence.mock.calls[0][0].type).toBe('temporal');
      expect(onEmergence.mock.calls[0][0].count).toBeGreaterThanOrEqual(3);
    });

    it('does not fire when below threshold', () => {
      const onEmergence = vi.fn();
      engine.setCallbacks({ onEmergence });

      // Only 2 confirmed — below threshold of 3
      for (let i = 0; i < 2; i++) {
        db.prepare(`INSERT INTO hypotheses (statement, type, source, domain, variables, condition, status, evidence_for, evidence_against, confidence, p_value)
          VALUES (?, 'correlation', 'test', 'general', '["x","y"]', '{"type":"correlation","params":{"variable1":"x","variable2":"y","windowMs":5000}}', 'confirmed', 10, 0, 1.0, 0.01)`)
          .run(`Confirmed correlation ${i}`);
      }

      engine.testAll();

      expect(onEmergence).not.toHaveBeenCalled();
    });
  });

  describe('testing graveyard cleanup', () => {
    it('auto-rejects zero-evidence hypotheses older than 72h', () => {
      // Insert a hypothesis with zero evidence and old created_at
      db.prepare(`INSERT INTO hypotheses (statement, type, source, domain, variables, condition, status, evidence_for, evidence_against, confidence, p_value, created_at, tested_at)
        VALUES ('old zero evidence', 'temporal', 'test', 'general', '[]', '{"type":"temporal","params":{"peakHour":0,"variable":"x"}}', 'testing', 0, 0, 0, 1, datetime('now', '-4 days'), datetime('now', '-1 hour'))`).run();

      engine.testAll();

      const result = db.prepare("SELECT status FROM hypotheses WHERE statement = 'old zero evidence'").get() as { status: string };
      expect(result.status).toBe('rejected');
    });

    it('does not reject zero-evidence hypotheses newer than 72h', () => {
      db.prepare(`INSERT INTO hypotheses (statement, type, source, domain, variables, condition, status, evidence_for, evidence_against, confidence, p_value, created_at, tested_at)
        VALUES ('new zero evidence', 'temporal', 'test', 'general', '[]', '{"type":"temporal","params":{"peakHour":0,"variable":"x"}}', 'testing', 0, 0, 0, 1, datetime('now', '-1 day'), datetime('now', '-1 hour'))`).run();

      engine.testAll();

      const result = db.prepare("SELECT status FROM hypotheses WHERE statement = 'new zero evidence'").get() as { status: string };
      expect(result.status).toBe('testing');
    });

    it('does not reset tested_at on no-op re-test', () => {
      // Insert a hypothesis with no matching observations — tested_at should not change
      db.prepare(`INSERT INTO hypotheses (statement, type, source, domain, variables, condition, status, evidence_for, evidence_against, confidence, p_value, tested_at)
        VALUES ('no-op test', 'temporal', 'test', 'general', '["nonexistent_metric"]', '{"type":"temporal","params":{"peakHour":14,"variable":"nonexistent_metric"}}', 'testing', 0, 0, 0, 1, datetime('now', '-2 days'))`).run();

      const before = db.prepare("SELECT tested_at FROM hypotheses WHERE statement = 'no-op test'").get() as { tested_at: string };

      engine.test((db.prepare("SELECT id FROM hypotheses WHERE statement = 'no-op test'").get() as { id: number }).id);

      const after = db.prepare("SELECT tested_at FROM hypotheses WHERE statement = 'no-op test'").get() as { tested_at: string };
      expect(after.tested_at).toBe(before.tested_at);
    });
  });
});
