import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizePath, getDataDir, getPipeName } from '../paths.js';
import os from 'node:os';
import path from 'node:path';

describe('normalizePath', () => {
  it('replaces backslashes with forward slashes', () => {
    expect(normalizePath('C:\\Users\\foo\\bar')).toBe('C:/Users/foo/bar');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalizePath('/home/user/data')).toBe('/home/user/data');
  });

  it('handles mixed slashes', () => {
    expect(normalizePath('src\\utils/hash.ts')).toBe('src/utils/hash.ts');
  });

  it('returns empty string for empty input', () => {
    expect(normalizePath('')).toBe('');
  });
});

describe('getDataDir', () => {
  const originalEnv = process.env['TRADING_BRAIN_DATA_DIR'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['TRADING_BRAIN_DATA_DIR'];
    } else {
      process.env['TRADING_BRAIN_DATA_DIR'] = originalEnv;
    }
  });

  it('returns env-based path when TRADING_BRAIN_DATA_DIR is set', () => {
    process.env['TRADING_BRAIN_DATA_DIR'] = '/tmp/my-brain';
    const result = getDataDir();
    expect(result).toBe(path.resolve('/tmp/my-brain'));
  });

  it('falls back to ~/.trading-brain when env var is unset', () => {
    delete process.env['TRADING_BRAIN_DATA_DIR'];
    const result = getDataDir();
    expect(result).toBe(path.join(os.homedir(), '.trading-brain'));
  });
});

describe('getPipeName', () => {
  it('uses default name "trading-brain" when no argument', () => {
    const result = getPipeName();
    if (process.platform === 'win32') {
      expect(result).toBe('\\\\.\\pipe\\trading-brain');
    } else {
      expect(result).toBe(path.join(os.tmpdir(), 'trading-brain.sock'));
    }
  });

  it('uses a custom name', () => {
    const result = getPipeName('my-pipe');
    if (process.platform === 'win32') {
      expect(result).toBe('\\\\.\\pipe\\my-pipe');
    } else {
      expect(result).toBe(path.join(os.tmpdir(), 'my-pipe.sock'));
    }
  });
});
