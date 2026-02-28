import { describe, it, expect } from 'vitest';
import { sha256 } from '../hash.js';

describe('sha256', () => {
  it('returns consistent hash for same input', () => {
    expect(sha256('hello')).toBe(sha256('hello'));
  });
  it('returns different hashes for different inputs', () => {
    expect(sha256('hello')).not.toBe(sha256('world'));
  });
  it('returns 64-char hex string', () => {
    expect(sha256('test')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('matches known SHA-256 value', () => {
    expect(sha256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
  it('handles empty string', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('handles unicode', () => {
    const hash = sha256('こんにちは');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(sha256('こんにちは'));
  });
});
