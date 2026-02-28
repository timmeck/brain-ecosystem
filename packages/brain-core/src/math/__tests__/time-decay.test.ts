import { describe, it, expect, vi, afterEach } from 'vitest';
import { timeDecayFactor } from '../time-decay.js';

describe('timeDecayFactor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ~1.0 for just-activated item', () => {
    const now = new Date().toISOString();
    const factor = timeDecayFactor(now, 30);
    expect(factor).toBeGreaterThan(0.99);
    expect(factor).toBeLessThanOrEqual(1.0);
  });

  it('returns ~0.5 at exactly one half-life', () => {
    const halfLifeDays = 30;
    const activatedAt = new Date(Date.now() - halfLifeDays * 24 * 60 * 60 * 1000).toISOString();
    const factor = timeDecayFactor(activatedAt, halfLifeDays);
    expect(factor).toBeCloseTo(0.5, 1);
  });

  it('returns ~0.25 at two half-lives', () => {
    const halfLifeDays = 14;
    const activatedAt = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
    const factor = timeDecayFactor(activatedAt, halfLifeDays);
    expect(factor).toBeCloseTo(0.25, 1);
  });

  it('returns very small value for very old items', () => {
    const activatedAt = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const factor = timeDecayFactor(activatedAt, 30);
    expect(factor).toBeLessThan(0.01);
  });

  it('works with different half-life values', () => {
    const activatedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const shortHalfLife = timeDecayFactor(activatedAt, 7);
    const longHalfLife = timeDecayFactor(activatedAt, 45);
    expect(shortHalfLife).toBeLessThan(longHalfLife);
  });
});
