import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { deepMerge, loadConfigFile } from '../loader.js';

describe('deepMerge', () => {
  it('merges flat properties', () => {
    const target = { a: 1, b: 2 } as Record<string, unknown>;
    deepMerge(target, { b: 3, c: 4 });
    expect(target).toEqual({ a: 1, b: 3, c: 4 });
  });

  it('merges nested objects recursively', () => {
    const target = { api: { port: 7777, enabled: true } } as Record<string, unknown>;
    deepMerge(target, { api: { port: 8080 } });
    expect(target).toEqual({ api: { port: 8080, enabled: true } });
  });

  it('overwrites arrays (no merge)', () => {
    const target = { tags: ['a', 'b'] } as Record<string, unknown>;
    deepMerge(target, { tags: ['c'] });
    expect(target).toEqual({ tags: ['c'] });
  });

  it('ignores undefined values', () => {
    const target = { a: 1 } as Record<string, unknown>;
    deepMerge(target, { a: undefined, b: 2 });
    expect(target).toEqual({ a: 1, b: 2 });
  });

  it('handles deeply nested merge', () => {
    const target = {
      level1: {
        level2: {
          level3: { keep: true, replace: 'old' },
        },
      },
    } as Record<string, unknown>;
    deepMerge(target, {
      level1: { level2: { level3: { replace: 'new' } } },
    });
    expect((target as any).level1.level2.level3).toEqual({ keep: true, replace: 'new' });
  });
});

describe('loadConfigFile', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'existsSync');
    vi.spyOn(fs, 'readFileSync');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns defaults when no file exists', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const defaults = { port: 8080, name: 'test' };
    const result = loadConfigFile(defaults);
    expect(result).toEqual(defaults);
  });

  it('merges config file into defaults', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ port: 9090 }));

    const defaults = { port: 8080, name: 'test' };
    const result = loadConfigFile(defaults, '/some/config.json');
    expect(result).toEqual({ port: 9090, name: 'test' });
  });

  it('uses defaultConfigPath as fallback', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ name: 'custom' }));

    const defaults = { port: 8080, name: 'test' };
    const result = loadConfigFile(defaults, undefined, '/default/config.json');
    expect(result).toEqual({ port: 8080, name: 'custom' });
    expect(fs.existsSync).toHaveBeenCalledWith('/default/config.json');
  });

  it('does not mutate original defaults', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ port: 9090 }));

    const defaults = { port: 8080, name: 'test' };
    loadConfigFile(defaults, '/some/config.json');
    expect(defaults.port).toBe(8080);
  });

  it('handles nested config merge', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
      api: { port: 9999 },
    }));

    const defaults = { api: { port: 8080, enabled: true } };
    const result = loadConfigFile(defaults, '/some/config.json');
    expect(result).toEqual({ api: { port: 9999, enabled: true } });
  });
});
