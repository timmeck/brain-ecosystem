import { describe, it, expect } from 'vitest';
import { levenshteinDistance, cosineSimilarity, jaccardSimilarity } from '../../../src/matching/similarity.js';

describe('levenshteinDistance (normalized similarity)', () => {
  it('returns 1 for identical strings', () => {
    expect(levenshteinDistance('hello', 'hello')).toBeCloseTo(1.0);
  });

  it('returns 0 for completely different strings', () => {
    expect(levenshteinDistance('', 'abc')).toBeCloseTo(0.0);
    expect(levenshteinDistance('abc', '')).toBeCloseTo(0.0);
  });

  it('returns high similarity for single edit', () => {
    // cat vs bat: 1 edit / 3 length = 0.33 distance → 0.67 similarity
    expect(levenshteinDistance('cat', 'bat')).toBeCloseTo(1 - 1 / 3, 1);
  });

  it('returns value between 0 and 1', () => {
    const sim = levenshteinDistance('kitten', 'sitting');
    expect(sim).toBeGreaterThanOrEqual(0);
    expect(sim).toBeLessThanOrEqual(1);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical token arrays', () => {
    expect(cosineSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBeCloseTo(1.0);
  });

  it('returns 0 for disjoint token arrays', () => {
    expect(cosineSimilarity(['a', 'b'], ['c', 'd'])).toBeCloseTo(0.0);
  });

  it('returns value between 0 and 1 for partial overlap', () => {
    const sim = cosineSimilarity(['a', 'b', 'c'], ['b', 'c', 'd']);
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });

  it('handles empty arrays', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity(['a'], [])).toBe(0);
  });
});

describe('jaccardSimilarity', () => {
  it('returns 1 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBeCloseTo(1.0);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBeCloseTo(0.0);
  });

  it('computes correct ratio for partial overlap', () => {
    // intersection {b} = 1, union {a,b,c} = 3
    const sim = jaccardSimilarity(['a', 'b'], ['b', 'c']);
    expect(sim).toBeCloseTo(1 / 3);
  });

  it('handles empty arrays', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });
});
