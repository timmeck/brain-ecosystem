import { describe, it, expect } from 'vitest';
import { sha256 } from '../hash.js';

describe('sha256', () => {
  it('returns a 64-character hex string', () => {
    const result = sha256('hello');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces correct hash for known input', () => {
    // SHA-256 of "hello" is well-known
    expect(sha256('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
    );
  });

  it('produces different hashes for different inputs', () => {
    expect(sha256('foo')).not.toBe(sha256('bar'));
  });

  it('produces the same hash for the same input', () => {
    expect(sha256('deterministic')).toBe(sha256('deterministic'));
  });

  it('handles empty string', () => {
    const result = sha256('');
    expect(result).toHaveLength(64);
    expect(result).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('handles unicode input', () => {
    const result = sha256('Hallo Welt! 🚀');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });
});
