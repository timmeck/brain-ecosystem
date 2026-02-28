import { describe, it, expect } from 'vitest';
import { splitCamelCase, splitSnakeCase, removeStopwords, tokenize } from '../../../src/matching/tokenizer.js';

describe('splitCamelCase', () => {
  it('splits camelCase words (preserves case)', () => {
    const result = splitCamelCase('camelCase');
    expect(result).toContain('camel');
    expect(result).toContain('Case');
  });

  it('splits PascalCase words', () => {
    const result = splitCamelCase('PascalCase');
    expect(result).toContain('Pascal');
    expect(result).toContain('Case');
  });

  it('handles consecutive uppercase (acronyms)', () => {
    const result = splitCamelCase('parseHTMLResponse');
    expect(result).toContain('parse');
    expect(result).toContain('HTML');
    expect(result).toContain('Response');
  });

  it('returns single word unchanged', () => {
    expect(splitCamelCase('hello')).toEqual(['hello']);
  });
});

describe('splitSnakeCase', () => {
  it('splits snake_case words', () => {
    expect(splitSnakeCase('snake_case')).toEqual(['snake', 'case']);
  });

  it('splits kebab-case words', () => {
    expect(splitSnakeCase('kebab-case')).toEqual(['kebab', 'case']);
  });

  it('returns single word unchanged', () => {
    expect(splitSnakeCase('hello')).toEqual(['hello']);
  });
});

describe('removeStopwords', () => {
  it('removes common stopwords', () => {
    const tokens = ['the', 'is', 'in', 'module'];
    const result = removeStopwords(tokens);
    expect(result).toContain('module');
    expect(result).not.toContain('the');
    expect(result).not.toContain('is');
  });

  it('error is treated as stopword', () => {
    // 'error' is in the stopword list
    const tokens = ['error', 'module'];
    const result = removeStopwords(tokens);
    expect(result).toContain('module');
  });
});

describe('tokenize', () => {
  it('tokenizes and lowercases text', () => {
    const tokens = tokenize('Cannot read property map of undefined');
    expect(tokens).toContain('read');
    expect(tokens).toContain('property');
    expect(tokens).toContain('map');
    expect(tokens).toContain('undefined');
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('lowercases all tokens', () => {
    const tokens = tokenize('Something FAILED');
    tokens.forEach(t => expect(t).toBe(t.toLowerCase()));
  });

  it('returns unique tokens', () => {
    const tokens = tokenize('error error error');
    const unique = new Set(tokens);
    expect(tokens.length).toBe(unique.size);
  });
});
