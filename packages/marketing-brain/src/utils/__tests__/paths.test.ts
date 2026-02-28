import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { normalizePath, getDataDir, getPipeName } from '../paths.js';

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\test\\file.txt')).toBe('C:/Users/test/file.txt');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalizePath('/home/user/file.txt')).toBe('/home/user/file.txt');
  });

  it('handles mixed separators', () => {
    expect(normalizePath('src\\utils/hash.ts')).toBe('src/utils/hash.ts');
  });

  it('handles empty string', () => {
    expect(normalizePath('')).toBe('');
  });

  it('handles path with no separators', () => {
    expect(normalizePath('file.txt')).toBe('file.txt');
  });
});

describe('getDataDir', () => {
  const originalEnv = process.env['MARKETING_BRAIN_DATA_DIR'];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['MARKETING_BRAIN_DATA_DIR'] = originalEnv;
    } else {
      delete process.env['MARKETING_BRAIN_DATA_DIR'];
    }
  });

  it('returns env-based directory when MARKETING_BRAIN_DATA_DIR is set', () => {
    process.env['MARKETING_BRAIN_DATA_DIR'] = '/custom/data';
    const result = getDataDir();
    expect(result).toBe(path.resolve('/custom/data'));
  });

  it('returns homedir-based directory when env is not set', () => {
    delete process.env['MARKETING_BRAIN_DATA_DIR'];
    const result = getDataDir();
    expect(result).toBe(path.join(os.homedir(), '.marketing-brain'));
  });
});

describe('getPipeName', () => {
  it('uses default name when no argument is given', () => {
    const result = getPipeName();
    if (process.platform === 'win32') {
      expect(result).toBe('\\\\.\\pipe\\marketing-brain');
    } else {
      expect(result).toBe(path.join(os.tmpdir(), 'marketing-brain.sock'));
    }
  });

  it('uses custom name when provided', () => {
    const result = getPipeName('my-app');
    if (process.platform === 'win32') {
      expect(result).toBe('\\\\.\\pipe\\my-app');
    } else {
      expect(result).toBe(path.join(os.tmpdir(), 'my-app.sock'));
    }
  });
});
