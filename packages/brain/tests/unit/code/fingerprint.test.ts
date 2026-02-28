import { describe, it, expect } from 'vitest';
import { fingerprintCode, stripComments } from '../../../src/code/fingerprint.js';

describe('fingerprintCode', () => {
  it('produces consistent fingerprint', () => {
    const code = 'function add(a, b) { return a + b; }';
    const fp1 = fingerprintCode(code, 'typescript');
    const fp2 = fingerprintCode(code, 'typescript');
    expect(fp1).toBe(fp2);
  });

  it('produces different fingerprint for different code', () => {
    const fp1 = fingerprintCode('function add(a, b) { return a + b; }', 'typescript');
    const fp2 = fingerprintCode('function mul(a, b) { return a * b; }', 'typescript');
    expect(fp1).not.toBe(fp2);
  });

  it('ignores whitespace differences', () => {
    const fp1 = fingerprintCode('function add(a, b) { return a + b; }', 'typescript');
    const fp2 = fingerprintCode('function add(a,  b) {\n  return a + b;\n}', 'typescript');
    expect(fp1).toBe(fp2);
  });

  it('returns hex string', () => {
    const fp = fingerprintCode('const x = 1;', 'typescript');
    expect(fp).toMatch(/^[a-f0-9]+$/);
  });
});

describe('stripComments', () => {
  it('removes single-line comments', () => {
    const code = 'const x = 1; // this is a comment\nconst y = 2;';
    const stripped = stripComments(code, 'typescript');
    expect(stripped).not.toContain('this is a comment');
    expect(stripped).toContain('const x = 1');
  });

  it('removes multi-line comments', () => {
    const code = '/* block comment */\nconst x = 1;';
    const stripped = stripComments(code, 'typescript');
    expect(stripped).not.toContain('block comment');
    expect(stripped).toContain('const x = 1');
  });

  it('removes Python comments', () => {
    const code = '# python comment\nx = 1';
    const stripped = stripComments(code, 'python');
    expect(stripped).not.toContain('python comment');
    expect(stripped).toContain('x = 1');
  });
});
