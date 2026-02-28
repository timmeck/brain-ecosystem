import { describe, it, expect } from 'vitest';
import { sha256 } from '../hash.js';

describe('sha256', () => {
  it('returns a 64-character hex string', () => {
    const result = sha256('hello');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces the known SHA-256 digest for "hello"', () => {
    // Well-known test vector
    expect(sha256('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('produces the known digest for an empty string', () => {
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('returns different hashes for different inputs', () => {
    expect(sha256('a')).not.toBe(sha256('b'));
  });

  it('returns the same hash for the same input (deterministic)', () => {
    expect(sha256('deterministic')).toBe(sha256('deterministic'));
  });
});
