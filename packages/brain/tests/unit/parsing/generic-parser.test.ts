import { describe, it, expect } from 'vitest';
import { genericParser } from '../../../src/parsing/parsers/generic.js';

describe('genericParser', () => {
  describe('canParse', () => {
    it('always returns true (fallback parser)', () => {
      expect(genericParser.canParse('anything at all')).toBe(true);
      expect(genericParser.canParse('')).toBe(true);
      expect(genericParser.canParse('error: something')).toBe(true);
    });
  });

  describe('parse', () => {
    it('extracts message from error: prefix', () => {
      const result = genericParser.parse('error: something went wrong')!;
      expect(result.errorType).toBe('UnknownError');
      expect(result.message).toBe('something went wrong');
      expect(result.language).toBeNull();
    });

    it('extracts message from Error: prefix', () => {
      const result = genericParser.parse('Error: unexpected token')!;
      expect(result.message).toBe('unexpected token');
    });

    it('extracts message from ERROR prefix', () => {
      const result = genericParser.parse('ERROR: database connection failed')!;
      expect(result.message).toBe('database connection failed');
    });

    it('falls back to first line when no error keyword found', () => {
      const result = genericParser.parse('something failed\nmore details here')!;
      expect(result.message).toBe('something failed');
    });

    it('returns empty frames and null stack trace', () => {
      const result = genericParser.parse('error: test')!;
      expect(result.frames).toHaveLength(0);
      expect(result.stackTrace).toBeNull();
      expect(result.sourceFile).toBeNull();
      expect(result.sourceLine).toBeNull();
    });

    it('has priority 0 (lowest)', () => {
      expect(genericParser.priority).toBe(0);
    });
  });
});
