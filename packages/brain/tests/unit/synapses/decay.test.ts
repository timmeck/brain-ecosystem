import { describe, it, expect } from 'vitest';
import { timeDecayFactor } from '@timmeck/brain-core';

describe('timeDecayFactor', () => {
  it('returns ~1.0 for recent activation', () => {
    const now = new Date().toISOString();
    expect(timeDecayFactor(now, 45)).toBeCloseTo(1.0, 1);
  });

  it('returns ~0.5 after one half-life', () => {
    const halfLifeDays = 45;
    const past = new Date(Date.now() - halfLifeDays * 86400000).toISOString();
    expect(timeDecayFactor(past, halfLifeDays)).toBeCloseTo(0.5, 1);
  });

  it('returns near 0 for very old activation', () => {
    const veryOld = new Date(Date.now() - 500 * 86400000).toISOString();
    expect(timeDecayFactor(veryOld, 45)).toBeLessThan(0.01);
  });

  it('always returns between 0 and 1', () => {
    const past = new Date(Date.now() - 15 * 86400000).toISOString();
    const val = timeDecayFactor(past, 45);
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});
