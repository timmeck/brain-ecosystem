import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { HypothesisEngine } from '../engine.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

describe('HypothesisEngine — stale detection', () => {
  let db: Database.Database;
  let engine: HypothesisEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new HypothesisEngine(db, { minEvidence: 10 });
  });

  it('marks old testing hypotheses as stale', () => {
    // Insert hypothesis stuck in testing for 20 days with insufficient evidence
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, tested_at, created_at)
      VALUES ('test hyp', 'temporal', 'test', '[]', '{}', 'testing', 3, 2, datetime('now', '-20 days'), datetime('now', '-30 days'))
    `).run();

    const staleCount = engine.markStale(14);
    expect(staleCount).toBe(1);

    const hyp = engine.list('stale');
    expect(hyp).toHaveLength(1);
    expect(hyp[0]!.statement).toBe('test hyp');
  });

  it('does not mark testing hypotheses with enough evidence as stale', () => {
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, tested_at, created_at)
      VALUES ('good hyp', 'temporal', 'test', '[]', '{}', 'testing', 8, 5, datetime('now', '-20 days'), datetime('now', '-30 days'))
    `).run();

    const staleCount = engine.markStale(14);
    expect(staleCount).toBe(0); // 8+5=13 >= minEvidence(10)
  });

  it('does not mark recent testing hypotheses as stale', () => {
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, tested_at, created_at)
      VALUES ('recent hyp', 'temporal', 'test', '[]', '{}', 'testing', 2, 1, datetime('now', '-3 days'), datetime('now', '-5 days'))
    `).run();

    const staleCount = engine.markStale(14);
    expect(staleCount).toBe(0);
  });

  it('includes stale in getSummary()', () => {
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, confidence, p_value)
      VALUES ('stale 1', 'temporal', 'test', '[]', '{}', 'stale', 2, 1, 0.5, 0.3)
    `).run();

    const summary = engine.getSummary();
    expect(summary.stale).toBe(1);
  });

  it('testAll() calls markStale() first', () => {
    // Insert a stale-candidate hypothesis
    db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status, evidence_for, evidence_against, tested_at, created_at)
      VALUES ('will be stale', 'temporal', 'test', '["test_type"]', '{"type":"temporal","params":{"eventType":"test_type","peakHour":12,"expectedRatio":2}}', 'testing', 1, 0, datetime('now', '-20 days'), datetime('now', '-30 days'))
    `).run();

    engine.testAll();

    // The hypothesis should be stale (not enough evidence after 20 days)
    const summary = engine.getSummary();
    expect(summary.stale).toBe(1);
  });
});
