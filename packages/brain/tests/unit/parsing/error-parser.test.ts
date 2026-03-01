import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorParserRegistry } from '../../../src/parsing/types.js';
import { parseError, getParserRegistry } from '../../../src/parsing/error-parser.js';

describe('ErrorParserRegistry', () => {
  it('registers parsers sorted by priority (highest first)', () => {
    const registry = new ErrorParserRegistry();
    registry.register({ name: 'low', priority: 1, canParse: () => true, parse: () => null });
    registry.register({ name: 'high', priority: 10, canParse: () => true, parse: () => null });
    registry.register({ name: 'mid', priority: 5, canParse: () => true, parse: () => null });
    expect(registry.getRegistered()).toEqual(['high', 'mid', 'low']);
  });

  it('dispatches to first parser that canParse and returns result', () => {
    const registry = new ErrorParserRegistry();
    registry.register({
      name: 'a',
      priority: 10,
      canParse: (input) => input.includes('a'),
      parse: () => ({
        errorType: 'AError', message: 'from a', stackTrace: null,
        frames: [], sourceFile: null, sourceLine: null, language: null,
      }),
    });
    registry.register({
      name: 'b',
      priority: 5,
      canParse: () => true,
      parse: () => ({
        errorType: 'BError', message: 'from b', stackTrace: null,
        frames: [], sourceFile: null, sourceLine: null, language: null,
      }),
    });
    const result = registry.parse('contains a')!;
    expect(result.errorType).toBe('AError');
  });

  it('skips parser if canParse returns false', () => {
    const registry = new ErrorParserRegistry();
    registry.register({
      name: 'strict',
      priority: 10,
      canParse: () => false,
      parse: () => ({
        errorType: 'X', message: 'x', stackTrace: null,
        frames: [], sourceFile: null, sourceLine: null, language: null,
      }),
    });
    registry.register({
      name: 'fallback',
      priority: 1,
      canParse: () => true,
      parse: () => ({
        errorType: 'Fallback', message: 'fb', stackTrace: null,
        frames: [], sourceFile: null, sourceLine: null, language: null,
      }),
    });
    const result = registry.parse('anything')!;
    expect(result.errorType).toBe('Fallback');
  });

  it('skips parser if parse returns null and tries next', () => {
    const registry = new ErrorParserRegistry();
    registry.register({
      name: 'failing',
      priority: 10,
      canParse: () => true,
      parse: () => null,
    });
    registry.register({
      name: 'working',
      priority: 5,
      canParse: () => true,
      parse: () => ({
        errorType: 'OK', message: 'ok', stackTrace: null,
        frames: [], sourceFile: null, sourceLine: null, language: null,
      }),
    });
    const result = registry.parse('test')!;
    expect(result.errorType).toBe('OK');
  });

  it('returns null when no parser matches', () => {
    const registry = new ErrorParserRegistry();
    registry.register({
      name: 'nope',
      priority: 10,
      canParse: () => false,
      parse: () => null,
    });
    expect(registry.parse('test')).toBeNull();
  });
});

describe('getParserRegistry', () => {
  it('returns a registry with all 7 parsers registered', () => {
    const registry = getParserRegistry();
    const names = registry.getRegistered();
    expect(names).toContain('node');
    expect(names).toContain('python');
    expect(names).toContain('rust');
    expect(names).toContain('go');
    expect(names).toContain('shell');
    expect(names).toContain('compiler');
    expect(names).toContain('generic');
    expect(names).toHaveLength(7);
  });
});

describe('parseError', () => {
  it('dispatches Node.js error to node parser', () => {
    const result = parseError(`TypeError: Cannot read properties of undefined (reading 'x')
    at foo (/app/src/index.ts:10:5)`)!;
    expect(result.language).toBe('javascript');
    expect(result.errorType).toBe('TypeError');
  });

  it('dispatches Python error to python parser', () => {
    const result = parseError(`Traceback (most recent call last):
  File "/app/main.py", line 1, in <module>
    import foo
ModuleNotFoundError: No module named 'foo'`)!;
    expect(result.language).toBe('python');
    expect(result.errorType).toBe('ModuleNotFoundError');
  });
});
