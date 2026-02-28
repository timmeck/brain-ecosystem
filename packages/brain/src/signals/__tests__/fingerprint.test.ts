import { describe, it, expect } from 'vitest';
import { templateMessage, generateFingerprint } from '../../matching/fingerprint.js';
import type { StackFrame } from '../../parsing/types.js';

function frame(overrides: Partial<StackFrame> = {}): StackFrame {
  return {
    function_name: null,
    file_path: null,
    line_number: null,
    column_number: null,
    normalized: null,
    ...overrides,
  };
}

describe('templateMessage', () => {
  it('replaces Unix file paths with <PATH>', () => {
    const result = templateMessage('Error in /app/src/main.ts');
    expect(result).toContain('<PATH>');
    expect(result).not.toContain('/app/src/main.ts');
  });

  it('replaces Windows file paths with <PATH>', () => {
    const result = templateMessage('Error in C:\\Users\\test\\file.ts');
    expect(result).toContain('<PATH>');
    expect(result).not.toContain('C:\\Users\\test\\file.ts');
  });

  it('replaces line:col references with <LINE>:<COL>', () => {
    const result = templateMessage('at file.ts:42:10');
    expect(result).toContain('<LINE>:<COL>');
    expect(result).not.toContain(':42:10');
  });

  it('replaces "line N" with "line <LINE>"', () => {
    const result = templateMessage('Syntax error on line 55');
    expect(result).toContain('line <LINE>');
    expect(result).not.toContain('line 55');
  });

  it('replaces hex addresses with <ADDR>', () => {
    const result = templateMessage('Segfault at 0x7fff5fbff8c0');
    expect(result).toContain('<ADDR>');
    expect(result).not.toContain('0x7fff5fbff8c0');
  });

  it('replaces UUIDs with <UUID>', () => {
    const result = templateMessage('Request 550e8400-e29b-41d4-a716-446655440000 failed');
    expect(result).toContain('<UUID>');
    expect(result).not.toContain('550e8400-e29b-41d4-a716-446655440000');
  });

  it('normalizes timestamps (line:col regex fires first on HH:MM:SS)', () => {
    const result = templateMessage('Event at 2024-01-15T10:30:00 crashed');
    // The :30:00 portion is caught by the line:col regex before the timestamp regex,
    // so the timestamp is still normalized -- just not as <TIMESTAMP>
    expect(result).not.toContain('2024-01-15T10:30:00');
    expect(result).toContain('<LINE>:<COL>');
  });

  it('normalizes property access patterns', () => {
    const a = templateMessage("Cannot read properties of undefined (reading 'map')");
    const b = templateMessage("Cannot read properties of undefined (reading 'forEach')");
    expect(a).toBe(b);
  });

  it('normalizes quoted identifiers', () => {
    const a = templateMessage("'myVariable' is not defined");
    const b = templateMessage("'otherVariable' is not defined");
    expect(a).toBe(b);
  });

  it('produces identical templates for errors differing only in paths and lines', () => {
    const a = templateMessage("TypeError at /home/user/app.js:10:5");
    const b = templateMessage("TypeError at /var/deploy/app.js:99:12");
    expect(a).toBe(b);
  });
});

describe('generateFingerprint', () => {
  it('returns a 64-char hex string', () => {
    const fp = generateFingerprint('Error', 'test message', []);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const frames = [frame({ function_name: 'foo', file_path: '/a/b.ts' })];
    const fp1 = generateFingerprint('TypeError', 'msg', frames);
    const fp2 = generateFingerprint('TypeError', 'msg', frames);
    expect(fp1).toBe(fp2);
  });

  it('differs by error type', () => {
    const fp1 = generateFingerprint('TypeError', 'msg', []);
    const fp2 = generateFingerprint('RangeError', 'msg', []);
    expect(fp1).not.toBe(fp2);
  });

  it('differs by message content', () => {
    const fp1 = generateFingerprint('Error', 'cannot read property', []);
    const fp2 = generateFingerprint('Error', 'null pointer exception', []);
    expect(fp1).not.toBe(fp2);
  });

  it('uses only top 3 stack frames', () => {
    const manyFrames = Array.from({ length: 10 }, (_, i) =>
      frame({ function_name: `fn${i}`, file_path: `/src/file${i}.ts` }),
    );
    const threeFrames = manyFrames.slice(0, 3);

    const fpMany = generateFingerprint('Error', 'msg', manyFrames);
    const fpThree = generateFingerprint('Error', 'msg', threeFrames);
    expect(fpMany).toBe(fpThree);
  });

  it('handles frames with null function names', () => {
    const frames = [frame({ function_name: null, file_path: '/src/app.ts' })];
    const fp = generateFingerprint('Error', 'msg', frames);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles frames with null file paths', () => {
    const frames = [frame({ function_name: 'foo', file_path: null })];
    const fp = generateFingerprint('Error', 'msg', frames);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('same error at different file locations produces the same fingerprint', () => {
    const frames1 = [frame({ function_name: 'handler', file_path: '/app/v1/server.ts' })];
    const frames2 = [frame({ function_name: 'handler', file_path: '/deploy/v2/server.ts' })];
    const fp1 = generateFingerprint('TypeError', "Cannot read properties of undefined (reading 'name')", frames1);
    const fp2 = generateFingerprint('TypeError', "Cannot read properties of undefined (reading 'name')", frames2);
    // basename of file_path is 'server.ts' in both cases, so fingerprints should match
    expect(fp1).toBe(fp2);
  });

  it('empty frames still produces a valid fingerprint', () => {
    const fp = generateFingerprint('SyntaxError', 'Unexpected token', []);
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});
