import { describe, it, expect } from 'vitest';
import { wilsonScore } from '../wilson-score.js';

describe('wilsonScore', () => {
  it('returns 0 for zero trials', () => {
    expect(wilsonScore(0, 0)).toBe(0);
  });

  it('returns low confidence for single success', () => {
    const score = wilsonScore(1, 1);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.8);
  });

  it('converges toward actual rate with large samples', () => {
    const score = wilsonScore(950, 1000);
    expect(score).toBeGreaterThan(0.93);
    expect(score).toBeLessThan(0.96);
  });

  it('penalizes small sample sizes', () => {
    const small = wilsonScore(5, 5);
    const large = wilsonScore(500, 500);
    expect(large).toBeGreaterThan(small);
  });

  it('returns higher confidence with lower z-score', () => {
    const z90 = wilsonScore(7, 10, 1.64);
    const z95 = wilsonScore(7, 10, 1.96);
    const z99 = wilsonScore(7, 10, 2.33);
    expect(z90).toBeGreaterThan(z95);
    expect(z95).toBeGreaterThan(z99);
  });

  it('handles 0 successes', () => {
    const score = wilsonScore(0, 10);
    expect(score).toBe(0);
  });

  it('handles 50/50 split', () => {
    const score = wilsonScore(50, 100);
    expect(score).toBeGreaterThan(0.39);
    expect(score).toBeLessThan(0.51);
  });

  it('never returns negative', () => {
    expect(wilsonScore(0, 1)).toBeGreaterThanOrEqual(0);
    expect(wilsonScore(0, 100)).toBeGreaterThanOrEqual(0);
  });
});
