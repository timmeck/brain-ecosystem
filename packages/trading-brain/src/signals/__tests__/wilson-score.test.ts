import { describe, it, expect } from 'vitest';
import { wilsonScore } from '../wilson-score.js';

describe('wilsonScore', () => {
  it('returns 0 when total is 0', () => {
    expect(wilsonScore(0, 0)).toBe(0);
  });

  it('returns 0 when there are 0 wins', () => {
    expect(wilsonScore(0, 10)).toBe(0);
  });

  it('returns a value between 0 and 1', () => {
    const score = wilsonScore(7, 10);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('penalizes small sample sizes (lower bound is lower)', () => {
    const smallSample = wilsonScore(8, 10);   // 80% from 10 trades
    const largeSample = wilsonScore(80, 100);  // 80% from 100 trades
    // Same win rate but larger sample should have higher lower bound
    expect(largeSample).toBeGreaterThan(smallSample);
  });

  it('higher win rate gives higher score for same sample size', () => {
    const lower = wilsonScore(6, 10);
    const higher = wilsonScore(9, 10);
    expect(higher).toBeGreaterThan(lower);
  });

  it('perfect win rate (all wins) returns a value less than 1', () => {
    // Wilson score accounts for uncertainty, so even 10/10 should be < 1
    const score = wilsonScore(10, 10);
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0.5);
  });

  it('uses default z=1.96 (95% confidence)', () => {
    const defaultZ = wilsonScore(7, 10);
    const explicitZ = wilsonScore(7, 10, 1.96);
    expect(defaultZ).toBe(explicitZ);
  });

  it('lower z-score gives higher lower bound (less conservative)', () => {
    const z90 = wilsonScore(7, 10, 1.64);   // 90% confidence
    const z95 = wilsonScore(7, 10, 1.96);   // 95% confidence
    const z99 = wilsonScore(7, 10, 2.33);   // 99% confidence
    // Higher confidence = wider interval = lower lower-bound
    expect(z90).toBeGreaterThan(z95);
    expect(z95).toBeGreaterThan(z99);
  });

  it('converges toward raw win rate as sample grows', () => {
    const rawRate = 0.7;
    const score1000 = wilsonScore(700, 1000);
    const score10000 = wilsonScore(7000, 10000);
    // With large n, Wilson lower bound should approach the raw rate
    expect(Math.abs(score10000 - rawRate)).toBeLessThan(Math.abs(score1000 - rawRate));
  });

  it('never returns negative', () => {
    // Edge case: 1 win out of 1 trade
    expect(wilsonScore(1, 1)).toBeGreaterThanOrEqual(0);
    // Edge case: 0 wins out of 1 trade
    expect(wilsonScore(0, 1)).toBeGreaterThanOrEqual(0);
  });

  it('produces known approximate value for 50% win rate with 100 trades', () => {
    // With z=1.96, p=0.5, n=100 the lower bound should be around 0.40
    const score = wilsonScore(50, 100, 1.96);
    expect(score).toBeGreaterThan(0.38);
    expect(score).toBeLessThan(0.42);
  });
});
