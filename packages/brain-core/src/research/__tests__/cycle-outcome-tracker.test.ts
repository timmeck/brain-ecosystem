import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { CycleOutcomeTracker, fingerprint } from '../cycle-outcome-tracker.js';
import type { CycleOutcomeRecord } from '../cycle-outcome-tracker.js';

function createTestDb(): Database.Database {
  return new BetterSqlite3(':memory:');
}

function makeOutcome(overrides: Partial<CycleOutcomeRecord> = {}): CycleOutcomeRecord {
  return {
    cycle: 1,
    timestamp: Date.now(),
    durationMs: 5000,
    tokensUsed: 1000,
    insightsFound: 0,
    rulesLearned: 0,
    hypothesesConfirmed: 0,
    experimentsCompleted: 0,
    actionsExecuted: 0,
    errored: false,
    outputFingerprints: [],
    ...overrides,
  };
}

describe('CycleOutcomeTracker', () => {
  let db: Database.Database;
  let tracker: CycleOutcomeTracker;

  beforeEach(() => {
    db = createTestDb();
    tracker = new CycleOutcomeTracker(db);
  });

  afterEach(() => {
    db.close();
  });

  // ── Classification ────────────────────────────────────

  it('classifies cycle with outputs as productive', () => {
    const cls = tracker.recordOutcome(makeOutcome({
      cycle: 1, insightsFound: 2, rulesLearned: 1, tokensUsed: 500,
    }));
    expect(cls).toBe('productive');
  });

  it('classifies errored cycle as failed', () => {
    const cls = tracker.recordOutcome(makeOutcome({
      cycle: 1, errored: true, insightsFound: 3, // even with outputs, error = failed
    }));
    expect(cls).toBe('failed');
  });

  it('classifies tokens consumed with zero output as failed', () => {
    const cls = tracker.recordOutcome(makeOutcome({
      cycle: 1, tokensUsed: 2000, insightsFound: 0, rulesLearned: 0,
    }));
    expect(cls).toBe('failed');
  });

  it('classifies zero tokens + zero output as idle', () => {
    const cls = tracker.recordOutcome(makeOutcome({
      cycle: 1, tokensUsed: 0, insightsFound: 0,
    }));
    expect(cls).toBe('idle');
  });

  // ── Rates ─────────────────────────────────────────────

  it('getRates returns zeros when no data', () => {
    const rates = tracker.getRates();
    expect(rates.totalCycles).toBe(0);
    expect(rates.productiveRate).toBe(0);
    expect(rates.failedRate).toBe(0);
  });

  it('getRates computes correct rates', () => {
    // 2 productive, 1 failed, 1 idle = 4 total
    tracker.recordOutcome(makeOutcome({ cycle: 1, insightsFound: 3, tokensUsed: 500 }));
    tracker.recordOutcome(makeOutcome({ cycle: 2, rulesLearned: 1, tokensUsed: 300 }));
    tracker.recordOutcome(makeOutcome({ cycle: 3, tokensUsed: 1000, insightsFound: 0 })); // failed
    tracker.recordOutcome(makeOutcome({ cycle: 4, tokensUsed: 0 })); // idle

    const rates = tracker.getRates();
    expect(rates.totalCycles).toBe(4);
    expect(rates.productiveRate).toBe(0.5);  // 2/4
    expect(rates.failedRate).toBe(0.25);     // 1/4
  });

  it('getRates efficiency is outputs per 1k tokens', () => {
    // 5 outputs, 2000 tokens → 5/2 * 1000 = 2500 per 1k? No: 5/2000 * 1000 = 2.5
    tracker.recordOutcome(makeOutcome({ cycle: 1, insightsFound: 3, rulesLearned: 2, tokensUsed: 2000 }));

    const rates = tracker.getRates();
    expect(rates.efficiencyRate).toBeCloseTo(2.5, 1);
  });

  // ── Novelty ───────────────────────────────────────────

  it('all outputs are novel on first cycle', () => {
    const fp1 = fingerprint('New insight about caching');
    const fp2 = fingerprint('Rule: always retry on 503');
    tracker.recordOutcome(makeOutcome({
      cycle: 1, insightsFound: 2, tokensUsed: 500,
      outputFingerprints: [fp1, fp2],
    }));

    const recent = tracker.getRecent(1);
    expect(recent[0].novel_outputs).toBe(2);
  });

  it('repeated fingerprints are not novel', () => {
    const fp = fingerprint('Same insight repeated');

    tracker.recordOutcome(makeOutcome({
      cycle: 1, insightsFound: 1, tokensUsed: 500,
      outputFingerprints: [fp],
    }));
    tracker.recordOutcome(makeOutcome({
      cycle: 2, insightsFound: 1, tokensUsed: 500,
      outputFingerprints: [fp], // same fingerprint
    }));

    const recent = tracker.getRecent(2);
    const cycle2 = recent.find(r => r.cycle === 2)!;
    expect(cycle2.novel_outputs).toBe(0); // repeat, not novel
  });

  it('noveltyRate reflects proportion of novel productive cycles', () => {
    const fp1 = fingerprint('Insight A');
    const fp2 = fingerprint('Insight B');

    // Cycle 1: productive + novel
    tracker.recordOutcome(makeOutcome({
      cycle: 1, insightsFound: 1, tokensUsed: 500, outputFingerprints: [fp1],
    }));
    // Cycle 2: productive but repeated
    tracker.recordOutcome(makeOutcome({
      cycle: 2, insightsFound: 1, tokensUsed: 500, outputFingerprints: [fp1],
    }));
    // Cycle 3: productive + novel
    tracker.recordOutcome(makeOutcome({
      cycle: 3, insightsFound: 1, tokensUsed: 500, outputFingerprints: [fp2],
    }));

    const rates = tracker.getRates();
    expect(rates.productiveRate).toBe(1.0); // all 3 productive
    // 2 of 3 productive cycles had novel outputs
    expect(rates.noveltyRate).toBeCloseTo(2 / 3, 2);
  });

  // ── History ───────────────────────────────────────────

  it('getRecent returns cycles in reverse order', () => {
    for (let i = 1; i <= 5; i++) {
      tracker.recordOutcome(makeOutcome({ cycle: i, tokensUsed: 0 }));
    }
    const recent = tracker.getRecent(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].cycle).toBe(5);
    expect(recent[2].cycle).toBe(3);
  });

  it('getRateHistory groups by day', () => {
    const now = Date.now();
    // Two cycles "today"
    tracker.recordOutcome(makeOutcome({ cycle: 1, timestamp: now, insightsFound: 1, tokensUsed: 100 }));
    tracker.recordOutcome(makeOutcome({ cycle: 2, timestamp: now, tokensUsed: 100 })); // failed

    const history = tracker.getRateHistory(7);
    expect(history.length).toBeGreaterThanOrEqual(1);
    const today = history[history.length - 1];
    expect(today.totalCycles).toBe(2);
    expect(today.productiveRate).toBe(0.5);
  });

  // ── Long sequence ─────────────────────────────────────

  it('handles 50 cycles without drift', () => {
    for (let i = 1; i <= 50; i++) {
      const productive = i % 3 !== 0; // ~33 productive, ~17 failed
      tracker.recordOutcome(makeOutcome({
        cycle: i,
        timestamp: Date.now(),
        tokensUsed: productive ? 500 : 200,
        insightsFound: productive ? 1 : 0,
        outputFingerprints: productive ? [fingerprint(`Insight cycle ${i}`)] : [],
      }));
    }

    const rates = tracker.getRates();
    expect(rates.totalCycles).toBe(50);
    // ~34 productive (cycles not divisible by 3), ~16 failed
    expect(rates.productiveRate).toBeGreaterThan(0.5);
    expect(rates.failedRate).toBeGreaterThan(0.1);
    expect(rates.noveltyRate).toBe(1.0); // all unique fingerprints
    expect(rates.efficiencyRate).toBeGreaterThan(0);
  });

  // ── fingerprint utility ───────────────────────────────

  it('fingerprint is deterministic and normalized', () => {
    expect(fingerprint('Hello World')).toBe(fingerprint('hello  world'));
    expect(fingerprint('A')).not.toBe(fingerprint('B'));
    expect(fingerprint('test').length).toBe(16); // 16 hex chars
  });

  // ── RED TEAM: Adversarial metric tests ────────────────
  // These tests document KNOWN WEAKNESSES in the current metrics.
  // Each test simulates an adversarial agent pattern and verifies whether
  // the metrics correctly detect it — or fail (documented as known gaps).

  describe('Red Team: Trivial-Insight Agent', () => {
    // Agent spams many small, banale insights per cycle.
    // EXPECTED: productive_rate goes up (KNOWN WEAKNESS — no quality filter)
    // EXPECTED: efficiency_rate goes up (KNOWN WEAKNESS — rewards quantity)
    it('inflates productive_rate with trivial insights (known weakness)', () => {
      // "Good" agent: 1 meaningful insight per cycle, 1000 tokens
      for (let i = 1; i <= 10; i++) {
        tracker.recordOutcome(makeOutcome({
          cycle: i, insightsFound: 1, tokensUsed: 1000,
          outputFingerprints: [fingerprint(`Real insight ${i}`)],
        }));
      }
      const goodRates = tracker.getRates();

      // Reset with new tracker
      db.close();
      db = createTestDb();
      tracker = new CycleOutcomeTracker(db);

      // "Spammy" agent: 10 trivial insights per cycle, 1000 tokens
      for (let i = 1; i <= 10; i++) {
        const fps = Array.from({ length: 10 }, (_, j) => fingerprint(`Trivial thing ${i}-${j}`));
        tracker.recordOutcome(makeOutcome({
          cycle: i, insightsFound: 10, tokensUsed: 1000,
          outputFingerprints: fps,
        }));
      }
      const spammyRates = tracker.getRates();

      // Both have 100% productive_rate — metrics can't distinguish
      expect(goodRates.productiveRate).toBe(1.0);
      expect(spammyRates.productiveRate).toBe(1.0);
      // Spammy agent has HIGHER efficiency — known weakness
      expect(spammyRates.efficiencyRate).toBeGreaterThan(goodRates.efficiencyRate);
      // DOCUMENTED: Current metrics reward quantity. Future weighted_efficiency needed.
    });
  });

  describe('Red Team: Duplicate-Rewriter Agent', () => {
    // Agent rephrases old knowledge with slightly different wording.
    // Fingerprints differ → passes novelty check.
    it('bypasses novelty_rate with rephrased content (known weakness)', () => {
      // Original insight
      tracker.recordOutcome(makeOutcome({
        cycle: 1, insightsFound: 1, tokensUsed: 500,
        outputFingerprints: [fingerprint('Caching reduces API latency significantly')],
      }));
      // Rephrased — semantically identical, different fingerprint
      tracker.recordOutcome(makeOutcome({
        cycle: 2, insightsFound: 1, tokensUsed: 500,
        outputFingerprints: [fingerprint('API latency is significantly reduced by caching')],
      }));

      const rates = tracker.getRates();
      // Both are "novel" because fingerprints differ — known weakness
      expect(rates.noveltyRate).toBe(1.0);
      // DOCUMENTED: Fingerprint dedup catches exact repeats, not semantic duplicates.
      // Future: embedding similarity check needed.
    });
  });

  describe('Red Team: Busy-Loop Agent', () => {
    // Agent burns lots of tokens, produces some outputs, but nothing confirmed.
    // insightsFound > 0 makes it "productive" even without confirmed results.
    it('appears productive despite no confirmed results (known weakness)', () => {
      for (let i = 1; i <= 20; i++) {
        tracker.recordOutcome(makeOutcome({
          cycle: i,
          insightsFound: 2,            // raw insights, never confirmed
          rulesLearned: 0,             // nothing distilled
          hypothesesConfirmed: 0,      // nothing confirmed
          experimentsCompleted: 0,     // nothing completed
          tokensUsed: 5000,            // heavy token usage
          outputFingerprints: [fingerprint(`Busy output ${i}`)],
        }));
      }

      const rates = tracker.getRates();
      // Appears 100% productive — known weakness
      expect(rates.productiveRate).toBe(1.0);
      // Low efficiency (2 outputs / 5000 tokens * 1000 = 0.4)
      expect(rates.efficiencyRate).toBeLessThan(1.0);
      // DOCUMENTED: productive_rate doesn't distinguish raw insights from confirmed results.
      // Future: meaningful_productive_rate counting only confirmed/distilled outputs.
    });
  });

  describe('Red Team: Sparse-but-High-Value Agent', () => {
    // Agent rarely produces output, but when it does, it's high-value.
    // 2 productive cycles out of 20 → low productive_rate despite high quality.
    it('is penalized for low frequency despite high quality (known weakness)', () => {
      for (let i = 1; i <= 20; i++) {
        const isBreakthrough = i === 7 || i === 15;
        tracker.recordOutcome(makeOutcome({
          cycle: i,
          insightsFound: isBreakthrough ? 1 : 0,
          rulesLearned: isBreakthrough ? 1 : 0,
          hypothesesConfirmed: isBreakthrough ? 2 : 0,
          tokensUsed: isBreakthrough ? 3000 : 100,
          outputFingerprints: isBreakthrough
            ? [fingerprint(`Breakthrough ${i}`)]
            : [],
        }));
      }

      const rates = tracker.getRates();
      // Only 10% productive — looks terrible despite high-value outputs
      expect(rates.productiveRate).toBe(0.1);
      // 18 "failed" cycles (tokens > 0 but no output) — harsh
      expect(rates.failedRate).toBe(0.9);
      // But novelty is perfect
      expect(rates.noveltyRate).toBe(1.0);
      // DOCUMENTED: Current metrics penalize sparse-but-valuable agents.
      // Future: value-weighted productive_rate that accounts for output significance.
    });
  });
});
