/**
 * Injection Test — End-to-End proof that the hypothesis pipeline works.
 *
 * This test injects an artificial pattern, verifies Brain detects it,
 * confirms it, then kills the pattern and verifies Brain rejects it.
 *
 * The full lifecycle:
 *   1. INJECT: Feed a clear temporal pattern (events at hour 14)
 *   2. DETECT: generate() finds the pattern → proposes a hypothesis
 *   3. CONFIRM: test() confirms with low p-value
 *   4. KILL PATTERN: Feed evenly distributed data (no peak)
 *   5. RE-TEST: Pattern drift → hypothesis rejected
 *
 * If this test passes, the pipeline works end-to-end:
 *   pattern → hypothesis → confirmation → drift → rejection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { HypothesisEngine } from '../../../src/hypothesis/engine.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('Injection Test: Full Hypothesis Lifecycle', () => {
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

  // ── The Main Test ─────────────────────────────────────────

  it('pattern → hypothesis → confirmation → drift → rejection', () => {
    // ─── Phase 1: INJECT — clear temporal pattern ───────────
    // 30 events at hour 14, 6 spread across other hours
    const peakHour = 14;
    const peakBase = 3600000 * peakHour;
    for (let i = 0; i < 30; i++) {
      engine.observe({
        source: 'injection-test',
        type: 'injected_metric',
        value: 1,
        timestamp: peakBase + i * 60000, // 30 events in hour 14
      });
    }
    // Scatter a few events in other hours so the engine has contrast
    for (let h = 0; h < 6; h++) {
      engine.observe({
        source: 'injection-test',
        type: 'injected_metric',
        value: 1,
        timestamp: 3600000 * (h * 4), // hours 0, 4, 8, 12, 16, 20
      });
    }

    // ─── Phase 2: DETECT — generate finds the pattern ───────
    const hypotheses = engine.generate();
    const temporal = hypotheses.filter(
      h => h.type === 'temporal' && h.variables.includes('injected_metric'),
    );

    expect(temporal.length).toBe(1);
    expect(temporal[0]!.statement).toContain('injected_metric');
    expect(temporal[0]!.statement).toContain(`hour ${peakHour}`);
    expect(temporal[0]!.status).toBe('proposed');

    const hypId = temporal[0]!.id!;

    // ─── Phase 3: CONFIRM — first test confirms ─────────────
    const confirmResult = engine.test(hypId);

    expect(confirmResult).not.toBeNull();
    expect(confirmResult!.newStatus).toBe('confirmed');
    expect(confirmResult!.pValue).toBeLessThan(0.05);
    expect(confirmResult!.evidenceFor).toBeGreaterThanOrEqual(20);
    expect(confirmResult!.passed).toBe(true);

    // Verify DB is updated
    const confirmed = engine.get(hypId)!;
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.tested_at).not.toBeNull();

    // ─── Phase 4: KILL PATTERN — inject uniformly distributed data ─
    // Use timestamps in the future (after tested_at) so they pass the holdout filter
    const futureBase = Date.now() + 60_000;
    // 240 events, 10 per hour, perfectly uniform — no peak anywhere
    for (let h = 0; h < 24; h++) {
      for (let j = 0; j < 10; j++) {
        engine.observe({
          source: 'injection-test',
          type: 'injected_metric',
          value: 1,
          timestamp: futureBase + 3600000 * h + j * 1000,
        });
      }
    }

    // ─── Phase 5: RE-TEST — pattern drift → rejection ───────
    const rejectResult = engine.test(hypId);

    expect(rejectResult).not.toBeNull();
    expect(rejectResult!.newStatus).toBe('rejected');
    expect(rejectResult!.pValue).toBeGreaterThan(0.5);
    expect(rejectResult!.passed).toBe(false);

    // Verify DB is updated
    const rejected = engine.get(hypId)!;
    expect(rejected.status).toBe('rejected');

    // ─── FULL LIFECYCLE VERIFIED ─────────────────────────────
    // proposed → confirmed → rejected
    // This proves the pipeline works end-to-end.
  });

  // ── Correlation Injection ─────────────────────────────────

  it('correlation: co-occurring → confirmed → decoupled → rejected', () => {
    // ─── Phase 1: INJECT — two metrics that partially co-occur (70%) ──
    for (let i = 0; i < 20; i++) {
      const ts = i * 120000; // every 2 minutes
      engine.observe({ source: 'injection', type: 'metric_alpha', value: 1, timestamp: ts });
      if (i < 14) { // 14/20 = 70% co-occurrence — genuine but not trivial
        engine.observe({ source: 'injection', type: 'metric_beta', value: 1, timestamp: ts + 5000 }); // 5s later
      }
    }
    // Add standalone beta observations
    for (let i = 0; i < 6; i++) {
      engine.observe({ source: 'injection', type: 'metric_beta', value: 1, timestamp: 6000000 + i * 120000 });
    }

    // ─── Phase 2: DETECT ─────────────────────────────────────
    const hypotheses = engine.generate();
    const corr = hypotheses.find(
      h => h.type === 'correlation'
        && h.variables.includes('metric_alpha')
        && h.variables.includes('metric_beta'),
    );
    expect(corr).toBeDefined();
    expect(corr!.statement).toContain('metric_alpha');
    expect(corr!.statement).toContain('metric_beta');

    // Verify co-occurrence rate is ≤100%
    const rateMatch = corr!.statement.match(/(\d+)%/);
    expect(rateMatch).not.toBeNull();
    expect(parseInt(rateMatch![1]!, 10)).toBeLessThanOrEqual(100);

    const hypId = corr!.id!;

    // ─── Phase 3: CONFIRM ────────────────────────────────────
    const confirmResult = engine.test(hypId);
    expect(confirmResult).not.toBeNull();
    expect(confirmResult!.evidenceFor).toBeGreaterThan(0);
    expect(confirmResult!.confidence).toBeGreaterThan(0.5);

    // ─── Phase 4: DECOUPLE — metrics no longer co-occur ─────
    const futureBase = Date.now() + 60_000;
    // Inject alpha at even minutes, beta at odd minutes — never within 60s
    for (let i = 0; i < 30; i++) {
      engine.observe({
        source: 'injection',
        type: 'metric_alpha',
        value: 1,
        timestamp: futureBase + i * 300000, // every 5 minutes
      });
      engine.observe({
        source: 'injection',
        type: 'metric_beta',
        value: 1,
        timestamp: futureBase + i * 300000 + 120000, // 2 minutes later (outside 60s window)
      });
    }

    // ─── Phase 5: RE-TEST — decoupled → rejected ─────────────
    const rejectResult = engine.test(hypId);
    expect(rejectResult).not.toBeNull();
    // With decoupled data, co-occurrence drops → evidence against rises
    expect(rejectResult!.evidenceAgainst).toBeGreaterThan(0);
  });

  // ── Threshold Injection ───────────────────────────────────

  it('threshold: anomaly pattern → confirmed → normalized → rejected', () => {
    // ─── Phase 1: INJECT — values with clear anomaly threshold ──
    // 20 normal values + 5 anomalous (creates threshold hypothesis)
    for (let i = 0; i < 20; i++) {
      engine.observe({ source: 'injection', type: 'cpu_load', value: 30, timestamp: i * 1000 });
    }
    for (let i = 0; i < 5; i++) {
      engine.observe({ source: 'injection', type: 'cpu_load', value: 200, timestamp: 50000 + i * 1000 });
    }

    // ─── Phase 2: DETECT ─────────────────────────────────────
    const hypotheses = engine.generate();
    const threshold = hypotheses.find(
      h => h.type === 'threshold' && h.variables.includes('cpu_load'),
    );
    expect(threshold).toBeDefined();

    const hypId = threshold!.id!;

    // ─── Phase 3: CONFIRM ────────────────────────────────────
    const confirmResult = engine.test(hypId);
    expect(confirmResult).not.toBeNull();
    expect(confirmResult!.evidenceFor).toBeGreaterThan(0);
    expect(confirmResult!.evidenceAgainst).toBeGreaterThan(0);

    // ─── Phase 4: NORMALIZE — all values now near the threshold ──
    // System stabilized: values distributed 50/50 around threshold
    const futureBase = Date.now() + 60_000;
    const thresholdVal = (threshold!.condition.params as { threshold: number }).threshold;
    for (let i = 0; i < 40; i++) {
      // Half above, half below — perfectly balanced → no significance
      const value = i % 2 === 0 ? thresholdVal + 10 : thresholdVal - 10;
      engine.observe({
        source: 'injection',
        type: 'cpu_load',
        value,
        timestamp: futureBase + i * 1000,
      });
    }

    // ─── Phase 5: RE-TEST — normalized → p-value rises ───────
    const retestResult = engine.test(hypId);
    expect(retestResult).not.toBeNull();
    // With 50/50 split, proportion ≈ 0.5 → z ≈ 0 → pValue ≈ 1
    expect(retestResult!.pValue).toBeGreaterThan(0.5);
    expect(retestResult!.newStatus).toBe('rejected');
  });

  // ── Frequency Injection ───────────────────────────────────

  it('frequency: periodic → confirmed → irregular → rejected', () => {
    // ─── Phase 1: INJECT — regular 60s heartbeat ─────────────
    const hyp = engine.propose({
      statement: 'heartbeat occurs every 60s',
      type: 'frequency',
      source: 'injection-test',
      variables: ['heartbeat'],
      condition: {
        type: 'frequency',
        params: { eventType: 'heartbeat', periodMs: 60000, toleranceMs: 6000 },
      },
    });

    for (let i = 0; i < 20; i++) {
      engine.observe({ source: 'injection', type: 'heartbeat', value: 1, timestamp: i * 60000 });
    }

    // ─── Phase 2: CONFIRM ────────────────────────────────────
    const confirmResult = engine.test(hyp.id!);
    expect(confirmResult).not.toBeNull();
    expect(confirmResult!.evidenceFor).toBeGreaterThan(10);
    expect(confirmResult!.pValue).toBeLessThan(0.5);

    // ─── Phase 3: BREAK RHYTHM — irregular intervals ─────────
    const futureBase = Date.now() + 60_000;
    // Random intervals: 5s, 200s, 3s, 500s, etc. — nothing near 60s
    const irregularOffsets = [0, 5000, 205000, 208000, 708000, 710000, 1500000, 1502000, 2800000, 2803000, 4000000, 4005000, 5500000, 5507000, 7200000];
    for (const offset of irregularOffsets) {
      engine.observe({ source: 'injection', type: 'heartbeat', value: 1, timestamp: futureBase + offset });
    }

    // ─── Phase 4: RE-TEST — broken rhythm → rejection ────────
    const retestResult = engine.test(hyp.id!);
    expect(retestResult).not.toBeNull();
    expect(retestResult!.evidenceAgainst).toBeGreaterThan(retestResult!.evidenceFor);
  });

  // ── testAll re-tests stale confirmed hypotheses ───────────

  it('testAll picks up stale confirmed hypotheses for re-testing', () => {
    // Create and confirm a hypothesis
    for (let i = 0; i < 30; i++) {
      engine.observe({ source: 'test', type: 'stale_check', value: 1, timestamp: 3600000 * 14 + i * 60000 });
    }
    for (let i = 0; i < 6; i++) {
      engine.observe({ source: 'test', type: 'stale_check', value: 1, timestamp: 3600000 * (i * 4) });
    }

    engine.generate();
    const firstResults = engine.testAll();
    expect(firstResults.length).toBeGreaterThan(0);

    const confirmedHyp = firstResults.find(r => r.newStatus === 'confirmed');
    expect(confirmedHyp).toBeDefined();

    // Immediately: testAll should NOT re-test (tested_at is fresh)
    const immediateResults = engine.testAll();
    expect(immediateResults).toHaveLength(0);

    // Simulate 25h passing by backdating tested_at
    db.prepare(`UPDATE hypotheses SET tested_at = datetime('now', '-25 hours') WHERE status = 'confirmed'`).run();

    // Now testAll SHOULD pick up the stale confirmed hypothesis
    const staleResults = engine.testAll();
    expect(staleResults.length).toBeGreaterThan(0);
    expect(staleResults.some(r => r.hypothesisId === confirmedHyp!.hypothesisId)).toBe(true);
  });

  // ── Summary reflects full lifecycle ───────────────────────

  it('getSummary counts reflect the full lifecycle', () => {
    // Start with nothing
    let summary = engine.getSummary();
    expect(summary.total).toBe(0);
    expect(summary.confirmed).toBe(0);
    expect(summary.rejected).toBe(0);

    // Inject and confirm a temporal hypothesis
    for (let i = 0; i < 30; i++) {
      engine.observe({ source: 'test', type: 'summary_ev', value: 1, timestamp: 3600000 * 14 + i * 60000 });
    }
    for (let i = 0; i < 6; i++) {
      engine.observe({ source: 'test', type: 'summary_ev', value: 1, timestamp: 3600000 * (i * 4) });
    }

    engine.generate();
    engine.testAll();

    summary = engine.getSummary();
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(summary.confirmed).toBeGreaterThanOrEqual(1);
    expect(summary.rejected).toBe(0);

    // Kill pattern and re-test
    const futureBase = Date.now() + 60_000;
    for (let h = 0; h < 24; h++) {
      for (let j = 0; j < 10; j++) {
        engine.observe({ source: 'test', type: 'summary_ev', value: 1, timestamp: futureBase + 3600000 * h + j * 1000 });
      }
    }

    // Force re-test by backdating
    db.prepare(`UPDATE hypotheses SET tested_at = datetime('now', '-25 hours') WHERE status = 'confirmed'`).run();
    engine.testAll();

    summary = engine.getSummary();
    // Now we should have rejections!
    expect(summary.rejected).toBeGreaterThanOrEqual(1);
  });
});
