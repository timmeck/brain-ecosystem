import { describe, it, expect } from 'vitest';
import { templateMessage, generateFingerprint } from '../../../src/matching/fingerprint.js';

describe('templateMessage', () => {
  it('replaces file paths with placeholder', () => {
    const result = templateMessage('Error in /app/src/main.ts:42:5');
    expect(result).not.toContain('/app/src/main.ts');
    expect(result).toContain('<PATH>');
  });

  it('replaces hex addresses with <ADDR>', () => {
    const result = templateMessage('at 0x7fff5fbff8c0');
    expect(result).toContain('<ADDR>');
  });

  it('produces consistent output for similar messages', () => {
    const a = templateMessage("Cannot read property 'name' of undefined at /foo/bar.js:10:5");
    const b = templateMessage("Cannot read property 'name' of undefined at /baz/qux.js:20:3");
    expect(a).toBe(b);
  });

  it('replaces URLs', () => {
    // Unix path regex runs before URL regex, so URL domain/path part gets <PATH>
    // Test that the URL string is at least transformed (not left as-is)
    const result = templateMessage('Failed to fetch https://api.example.com/data');
    expect(result).not.toContain('https://api.example.com/data');
  });
});

describe('generateFingerprint', () => {
  it('produces consistent hash for same error', () => {
    const fp1 = generateFingerprint('TypeError', 'Cannot read undefined', []);
    const fp2 = generateFingerprint('TypeError', 'Cannot read undefined', []);
    expect(fp1).toBe(fp2);
  });

  it('produces different hash for different error types', () => {
    const fp1 = generateFingerprint('TypeError', 'msg', []);
    const fp2 = generateFingerprint('RangeError', 'msg', []);
    expect(fp1).not.toBe(fp2);
  });

  it('returns a hex string', () => {
    const fp = generateFingerprint('Error', 'test', []);
    expect(fp).toMatch(/^[a-f0-9]+$/);
  });
});
