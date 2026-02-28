import { describe, it, expect } from 'vitest';
import { sha256 } from '../hash.js';

describe('sha256', () => {
  it('returns a 64-character hex string', () => {
    const hash = sha256('hello');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces consistent output for same input', () => {
    expect(sha256('test')).toBe(sha256('test'));
  });

  it('produces different output for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });

  it('matches known SHA-256 digest for empty string', () => {
    // SHA-256 of "" is well-known
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches known SHA-256 digest for "hello"', () => {
    expect(sha256('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('handles unicode input', () => {
    const hash = sha256('\u00fc\u00f6\u00e4');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles long input', () => {
    const long = 'x'.repeat(10_000);
    const hash = sha256(long);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
