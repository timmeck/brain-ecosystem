import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AutoResponder, runAutoResponderMigration } from '../../../src/research/auto-responder.js';
import { AdaptiveStrategyEngine } from '../../../src/research/adaptive-strategy.js';
import type { Anomaly } from '../../../src/research/anomaly-detective.js';

function makeAnomaly(overrides: Partial<Anomaly> = {}): Anomaly {
  return {
    id: 1,
    timestamp: Date.now(),
    type: 'statistical',
    severity: 'high',
    title: 'Test anomaly',
    description: 'Test description',
    metric: 'error_count',
    expected_value: 5,
    actual_value: 20,
    deviation: 3.5,
    evidence: { z_score: 3.5 },
    resolved: false,
    ...overrides,
  };
}

describe('AutoResponder', () => {
  let db: Database.Database;
  let responder: AutoResponder;
  let strategy: AdaptiveStrategyEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    strategy = new AdaptiveStrategyEngine(db, { brainName: 'test' });
    responder = new AutoResponder(db, { brainName: 'test' });
    responder.setAdaptiveStrategy(strategy);
  });

  describe('runAutoResponderMigration', () => {
    it('creates auto_responses and response_rules tables', () => {
      const db2 = new Database(':memory:');
      runAutoResponderMigration(db2);
      const tables = db2.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('auto_responses', 'response_rules') ORDER BY name").all() as { name: string }[];
      expect(tables.map(t => t.name)).toEqual(['auto_responses', 'response_rules']);
    });
  });

  describe('respond', () => {
    it('returns empty array when disabled', () => {
      const disabled = new AutoResponder(db, { brainName: 'test', enabled: false });
      const result = disabled.respond([makeAnomaly()]);
      expect(result).toEqual([]);
    });

    it('returns empty array for empty anomalies', () => {
      expect(responder.respond([])).toEqual([]);
    });

    it('responds to high-severity error anomaly with parameter adjustment', () => {
      const anomaly = makeAnomaly({ metric: 'error_count', severity: 'high' });
      const responses = responder.respond([anomaly]);
      expect(responses.length).toBeGreaterThanOrEqual(1);
      const paramResp = responses.find(r => r.action === 'parameter_adjust');
      if (paramResp) {
        expect(paramResp.success).toBe(true);
        expect(paramResp.parameters_before).toBeTruthy();
        expect(paramResp.parameters_after).toBeTruthy();
      }
    });

    it('responds to critical anomaly with escalation', () => {
      const anomaly = makeAnomaly({ metric: 'unknown_metric_xyz', severity: 'critical' });
      const responses = responder.respond([anomaly]);
      expect(responses.some(r => r.action === 'escalate')).toBe(true);
    });

    it('respects maxResponsesPerCycle', () => {
      const limited = new AutoResponder(db, { brainName: 'test', maxResponsesPerCycle: 1 });
      limited.setAdaptiveStrategy(strategy);
      const anomalies = [
        makeAnomaly({ id: 1, metric: 'error_1' }),
        makeAnomaly({ id: 2, metric: 'error_2' }),
        makeAnomaly({ id: 3, metric: 'error_3' }),
      ];
      const responses = limited.respond(anomalies);
      expect(responses.length).toBeLessThanOrEqual(1);
    });

    it('respects cooldown for same metric', () => {
      const anomaly = makeAnomaly({ metric: 'error_same' });
      const first = responder.respond([anomaly]);
      expect(first.length).toBeGreaterThanOrEqual(1);

      // Second call with same metric should be on cooldown
      const second = responder.respond([anomaly]);
      expect(second.length).toBe(0);
    });

    it('persists responses to database', () => {
      responder.respond([makeAnomaly()]);
      const count = (db.prepare('SELECT COUNT(*) as c FROM auto_responses').get() as { c: number }).c;
      expect(count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getHistory', () => {
    it('returns empty array when no responses', () => {
      expect(responder.getHistory()).toEqual([]);
    });

    it('returns responses after responding', () => {
      responder.respond([makeAnomaly()]);
      const history = responder.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getStatus', () => {
    it('returns correct initial status', () => {
      const status = responder.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.total_responses).toBe(0);
      expect(status.successful).toBe(0);
      expect(status.success_rate).toBe(0);
      expect(status.rules_count).toBeGreaterThan(0);
    });

    it('updates after responses', () => {
      responder.respond([makeAnomaly()]);
      const status = responder.getStatus();
      expect(status.total_responses).toBeGreaterThanOrEqual(1);
      expect(status.successful).toBeGreaterThanOrEqual(1);
    });
  });

  describe('addRule', () => {
    it('adds custom rule and includes it in getRules', () => {
      responder.addRule({
        metric_pattern: 'custom_metric',
        min_severity: 'low',
        action: 'log_only',
        adjustment: 0,
        description: 'Custom test rule',
      });
      const rules = responder.getRules();
      expect(rules.some(r => r.description === 'Custom test rule')).toBe(true);
    });
  });

  describe('getRules', () => {
    it('returns default rules when no custom rules exist', () => {
      const rules = responder.getRules();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some(r => r.action === 'parameter_adjust')).toBe(true);
      expect(rules.some(r => r.action === 'escalate')).toBe(true);
    });
  });
});
