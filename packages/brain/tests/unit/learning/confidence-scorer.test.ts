import { describe, it, expect } from 'vitest';
import { wilsonScore, timeDecayedConfidence, computeConfidence } from '../../../src/learning/confidence-scorer.js';

describe('wilsonScore', () => {
  it('returns 0 for 0 trials', () => {
    expect(wilsonScore(0, 0)).toBe(0);
  });

  it('returns low score for single success', () => {
    const score = wilsonScore(1, 1);
    // 1/1 = 100% but Wilson should be conservative
    expect(score).toBeLessThan(0.9);
    expect(score).toBeGreaterThan(0);
  });

  it('increases with more samples', () => {
    const score5 = wilsonScore(5, 5);
    const score50 = wilsonScore(50, 50);
    expect(score50).toBeGreaterThan(score5);
  });

  it('reflects success rate', () => {
    const high = wilsonScore(9, 10);
    const low = wilsonScore(1, 10);
    expect(high).toBeGreaterThan(low);
  });

  it('returns value between 0 and 1', () => {
    const score = wilsonScore(7, 10);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('timeDecayedConfidence', () => {
  it('recent usage has higher confidence', () => {
    const now = new Date().toISOString();
    const recent = timeDecayedConfidence(8, 10, now, 30);

    const oldDate = new Date(Date.now() - 90 * 86400000).toISOString();
    const old = timeDecayedConfidence(8, 10, oldDate, 30);

    expect(recent).toBeGreaterThan(old);
  });
});

describe('computeConfidence', () => {
  it('combines success rate and time decay', () => {
    const now = new Date().toISOString();
    const conf = computeConfidence(8, 2, now);
    expect(conf).toBeGreaterThan(0);
    expect(conf).toBeLessThanOrEqual(1);
  });

  it('zero successes gives low confidence', () => {
    const now = new Date().toISOString();
    const conf = computeConfidence(0, 5, now);
    expect(conf).toBeLessThan(0.3);
  });
});
