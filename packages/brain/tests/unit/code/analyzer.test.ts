import { describe, it, expect } from 'vitest';
import { analyzeCode, checkPurity, measureCohesion } from '../../../src/code/analyzer.js';
import { retryModule, loggerModule, hashModule } from '../../fixtures/code-modules/modules.js';

describe('analyzeCode', () => {
  it('analyzes TypeScript module', () => {
    const result = analyzeCode(retryModule.source, 'typescript');
    expect(result).toBeTruthy();
    expect(result.exports).toBeDefined();
    expect(result.linesOfCode).toBeGreaterThan(0);
  });

  it('analyzes Python module', () => {
    const result = analyzeCode(hashModule.source, 'python');
    expect(result).toBeTruthy();
    expect(result.exports.length).toBeGreaterThan(0);
  });

  it('detects exports in TypeScript', () => {
    const result = analyzeCode(retryModule.source, 'typescript');
    const exportNames = result.exports.map((e: any) => e.name);
    expect(exportNames).toContain('retry');
  });

  it('detects external dependencies', () => {
    const result = analyzeCode(loggerModule.source, 'typescript');
    expect(result.externalDeps.length).toBeGreaterThan(0);
  });
});

describe('checkPurity', () => {
  it('pure function returns true', () => {
    const pureCode = `export function add(a: number, b: number): number { return a + b; }`;
    expect(checkPurity(pureCode)).toBe(true);
  });

  it('function with side effects returns false', () => {
    const impureCode = `export function save(data: any) { fs.writeFileSync('file', data); console.log('saved'); }`;
    expect(checkPurity(impureCode)).toBe(false);
  });
});

describe('measureCohesion', () => {
  it('returns value between 0 and 1', () => {
    const exports = [
      { name: 'sha256', type: 'function' },
      { name: 'md5', type: 'function' },
    ] as any[];
    const score = measureCohesion(exports);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('handles empty exports without crashing', () => {
    const score = measureCohesion([]);
    expect(typeof score).toBe('number');
  });
});
