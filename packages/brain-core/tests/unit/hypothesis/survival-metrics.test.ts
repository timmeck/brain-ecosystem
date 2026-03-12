import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { HypothesisEngine } from '../../../src/hypothesis/engine.js';

describe('HypothesisEngine – getSurvivalMetrics()', () => {
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

  // Helper to insert hypotheses directly for controlled testing
  function insertHypothesis(opts: {
    statement: string;
    status: string;
    created_at: string;
    tested_at?: string;
    evidence_for?: number;
    evidence_against?: number;
  }): number {
    const result = db.prepare(`
      INSERT INTO hypotheses (statement, type, source, variables, condition, status,
        evidence_for, evidence_against, confidence, p_value, created_at, tested_at)
      VALUES (?, 'test', 'test', '[]', '{"type":"threshold","params":{}}', ?,
        ?, ?, 0.5, 0.5, ?, ?)
    `).run(
      opts.statement,
      opts.status,
      opts.evidence_for ?? 0,
      opts.evidence_against ?? 0,
      opts.created_at,
      opts.tested_at ?? null,
    );
    return Number(result.lastInsertRowid);
  }

  it('returns nulls when no hypotheses exist', () => {
    const m = engine.getSurvivalMetrics();
    expect(m.medianSurvivalMs).toBeNull();
    expect(m.p90SurvivalMs).toBeNull();
    expect(m.longestSurvivorMs).toBeNull();
    expect(m.longestSurvivorStatement).toBeNull();
    expect(m.totalRejected).toBe(0);
    expect(m.totalConfirmedAlive).toBe(0);
    expect(m.rejectedSurvivalTimes).toEqual([]);
    expect(m.avgRejectedSurvivalMs).toBeNull();
    expect(m.confirmedThenRejected).toBe(0);
  });

  it('computes median and p90 for rejected hypotheses', () => {
    // 3 rejected hypotheses with known survival durations
    insertHypothesis({ statement: 'Fast reject', status: 'rejected', created_at: '2026-03-01 00:00:00', tested_at: '2026-03-01 01:00:00' }); // 1h
    insertHypothesis({ statement: 'Medium reject', status: 'rejected', created_at: '2026-03-01 00:00:00', tested_at: '2026-03-02 00:00:00' }); // 1d
    insertHypothesis({ statement: 'Slow reject', status: 'rejected', created_at: '2026-03-01 00:00:00', tested_at: '2026-03-08 00:00:00' }); // 7d

    const m = engine.getSurvivalMetrics();
    expect(m.totalRejected).toBe(3);
    expect(m.medianSurvivalMs).not.toBeNull();
    expect(m.p90SurvivalMs).not.toBeNull();

    // Median of [1h, 1d, 7d] = 1d = 86400000 ms
    expect(m.medianSurvivalMs).toBe(86_400_000);

    // P90 index = floor(3 * 0.9) = floor(2.7) = 2 → 7d
    expect(m.p90SurvivalMs).toBe(7 * 86_400_000);

    // Average: (3600000 + 86400000 + 604800000) / 3
    expect(m.avgRejectedSurvivalMs).toBeCloseTo((3_600_000 + 86_400_000 + 604_800_000) / 3, -2);
  });

  it('finds longest surviving confirmed hypothesis', () => {
    // Old confirmed hypothesis
    insertHypothesis({ statement: 'Ancient wisdom', status: 'confirmed', created_at: '2026-01-01 00:00:00' });
    // Recent confirmed hypothesis
    insertHypothesis({ statement: 'New idea', status: 'confirmed', created_at: '2026-03-11 00:00:00' });

    const m = engine.getSurvivalMetrics();
    expect(m.totalConfirmedAlive).toBe(2);
    expect(m.longestSurvivorStatement).toBe('Ancient wisdom');
    expect(m.longestSurvivorMs).not.toBeNull();
    expect(m.longestSurvivorMs!).toBeGreaterThan(0);
  });

  it('counts confirmed-then-rejected (pattern drift)', () => {
    // Hypothesis that was confirmed (evidence_for > 0) but later rejected
    insertHypothesis({
      statement: 'Was good, then drifted',
      status: 'rejected',
      created_at: '2026-03-01 00:00:00',
      tested_at: '2026-03-10 00:00:00',
      evidence_for: 5,
      evidence_against: 8,
    });
    // Hypothesis rejected without ever being confirmed
    insertHypothesis({
      statement: 'Never confirmed',
      status: 'rejected',
      created_at: '2026-03-01 00:00:00',
      tested_at: '2026-03-02 00:00:00',
      evidence_for: 0,
      evidence_against: 3,
    });

    const m = engine.getSurvivalMetrics();
    expect(m.confirmedThenRejected).toBe(1);
    expect(m.totalRejected).toBe(2);
  });

  it('computes rejections per day', () => {
    // 4 rejected over 10 days → 0.4/day
    insertHypothesis({ statement: 'R1', status: 'rejected', created_at: '2026-03-01 00:00:00', tested_at: '2026-03-02 00:00:00' });
    insertHypothesis({ statement: 'R2', status: 'rejected', created_at: '2026-03-03 00:00:00', tested_at: '2026-03-05 00:00:00' });
    insertHypothesis({ statement: 'R3', status: 'rejected', created_at: '2026-03-07 00:00:00', tested_at: '2026-03-08 00:00:00' });
    insertHypothesis({ statement: 'R4', status: 'rejected', created_at: '2026-03-10 00:00:00', tested_at: '2026-03-11 00:00:00' });

    const m = engine.getSurvivalMetrics();
    expect(m.totalRejected).toBe(4);
    expect(m.dataSpanDays).toBeGreaterThan(0);
    expect(m.rejectionsPerDay).toBeGreaterThan(0);
    // 4 rejections over ~10 day span
    expect(m.rejectionsPerDay).toBeCloseTo(4 / m.dataSpanDays, 1);
  });

  it('returns sorted survival times array', () => {
    insertHypothesis({ statement: 'S1', status: 'rejected', created_at: '2026-03-01 00:00:00', tested_at: '2026-03-04 00:00:00' }); // 3d
    insertHypothesis({ statement: 'S2', status: 'rejected', created_at: '2026-03-01 00:00:00', tested_at: '2026-03-01 06:00:00' }); // 6h
    insertHypothesis({ statement: 'S3', status: 'rejected', created_at: '2026-03-01 00:00:00', tested_at: '2026-03-02 00:00:00' }); // 1d

    const m = engine.getSurvivalMetrics();
    expect(m.rejectedSurvivalTimes.length).toBe(3);
    // Should be sorted ascending (from the SQL ORDER BY)
    for (let i = 1; i < m.rejectedSurvivalTimes.length; i++) {
      expect(m.rejectedSurvivalTimes[i]!).toBeGreaterThanOrEqual(m.rejectedSurvivalTimes[i - 1]!);
    }
  });

  it('ignores testing/proposed/inconclusive hypotheses in rejection metrics', () => {
    insertHypothesis({ statement: 'Still testing', status: 'testing', created_at: '2026-03-01 00:00:00' });
    insertHypothesis({ statement: 'Just proposed', status: 'proposed', created_at: '2026-03-01 00:00:00' });
    insertHypothesis({ statement: 'Unclear', status: 'inconclusive', created_at: '2026-03-01 00:00:00' });

    const m = engine.getSurvivalMetrics();
    expect(m.totalRejected).toBe(0);
    expect(m.rejectedSurvivalTimes).toEqual([]);
  });

  it('handles single rejected hypothesis', () => {
    insertHypothesis({ statement: 'Solo reject', status: 'rejected', created_at: '2026-03-01 00:00:00', tested_at: '2026-03-03 00:00:00' });

    const m = engine.getSurvivalMetrics();
    expect(m.totalRejected).toBe(1);
    expect(m.medianSurvivalMs).toBe(2 * 86_400_000); // 2 days
    expect(m.p90SurvivalMs).toBe(2 * 86_400_000);
    expect(m.avgRejectedSurvivalMs).toBe(2 * 86_400_000);
  });
});
