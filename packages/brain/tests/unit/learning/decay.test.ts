import { describe, it, expect } from 'vitest';
import { relevanceDecay, shouldPruneRule } from '../../../src/learning/decay.js';

describe('relevanceDecay', () => {
  it('returns 1.0 for current timestamp', () => {
    const now = new Date().toISOString();
    expect(relevanceDecay(now, 30)).toBeCloseTo(1.0, 1);
  });

  it('returns ~0.5 after one half-life', () => {
    const halfLifeDays = 30;
    const past = new Date(Date.now() - halfLifeDays * 86400000).toISOString();
    expect(relevanceDecay(past, halfLifeDays)).toBeCloseTo(0.5, 1);
  });

  it('returns near 0 for very old timestamps', () => {
    const veryOld = new Date(Date.now() - 365 * 86400000).toISOString();
    expect(relevanceDecay(veryOld, 30)).toBeLessThan(0.01);
  });

  it('returns value between 0 and 1', () => {
    const past = new Date(Date.now() - 10 * 86400000).toISOString();
    const val = relevanceDecay(past, 30);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});

describe('shouldPruneRule', () => {
  it('prunes low confidence rules', () => {
    expect(shouldPruneRule(0.1, 0, 10, 0.2, 0.5)).toBe(true);
  });

  it('keeps high confidence rules', () => {
    expect(shouldPruneRule(0.8, 1, 20, 0.2, 0.5)).toBe(false);
  });

  it('prunes rules with high rejection rate', () => {
    expect(shouldPruneRule(0.5, 8, 10, 0.2, 0.5)).toBe(true);
  });

  it('keeps rules with low rejection rate', () => {
    expect(shouldPruneRule(0.5, 1, 10, 0.2, 0.5)).toBe(false);
  });
});
