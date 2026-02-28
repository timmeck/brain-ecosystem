import { describe, it, expect } from 'vitest';
import { computeReusabilityScore, getSignalBreakdown, MODULE_THRESHOLD } from '../../../src/code/scorer.js';
import { analyzeCode } from '../../../src/code/analyzer.js';
import { retryModule } from '../../fixtures/code-modules/modules.js';

describe('computeReusabilityScore', () => {
  it('scores a real module', () => {
    const analysis = analyzeCode(retryModule.source, 'typescript');
    const score = computeReusabilityScore({
      source: retryModule.source,
      filePath: retryModule.filePath,
      exports: analysis.exports,
      internalDeps: analysis.internalDeps,
      hasTypeAnnotations: analysis.hasTypeAnnotations,
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns value between 0 and 1', () => {
    const score = computeReusabilityScore({
      source: 'export function add(a: number, b: number) { return a + b; }',
      filePath: 'utils/add.ts',
      exports: [{ name: 'add', type: 'function' }] as any[],
      internalDeps: [],
      hasTypeAnnotations: true,
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('getSignalBreakdown', () => {
  it('returns named signals with scores', () => {
    const signals = getSignalBreakdown({
      source: 'export function add(a: number, b: number) { return a + b; }',
      filePath: 'utils/add.ts',
      exports: [{ name: 'add', type: 'function' }] as any[],
      internalDeps: [],
      hasTypeAnnotations: true,
    });
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(signal.name).toBeTruthy();
      expect(typeof signal.score).toBe('number');
      expect(typeof signal.weighted).toBe('number');
    }
  });
});

describe('MODULE_THRESHOLD', () => {
  it('is 0.6', () => {
    expect(MODULE_THRESHOLD).toBe(0.6);
  });
});
