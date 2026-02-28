import { describe, it, expect, vi, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { normalizePath, getDataDir, getPipeName } from '../paths.js';

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\test\\file.ts')).toBe('C:/Users/test/file.ts');
  });

  it('leaves forward slashes unchanged', () => {
    expect(normalizePath('/home/user/file.ts')).toBe('/home/user/file.ts');
  });

  it('handles mixed slashes', () => {
    expect(normalizePath('src\\utils/hash.ts')).toBe('src/utils/hash.ts');
  });

  it('handles empty string', () => {
    expect(normalizePath('')).toBe('');
  });

  it('handles path with no slashes', () => {
    expect(normalizePath('file.ts')).toBe('file.ts');
  });

  it('handles multiple consecutive backslashes', () => {
    expect(normalizePath('a\\\\b\\\\c')).toBe('a//b//c');
  });
});

describe('getDataDir', () => {
  const originalEnv = process.env['BRAIN_DATA_DIR'];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['BRAIN_DATA_DIR'] = originalEnv;
    } else {
      delete process.env['BRAIN_DATA_DIR'];
    }
  });

  it('returns BRAIN_DATA_DIR when env variable is set', () => {
    process.env['BRAIN_DATA_DIR'] = '/tmp/brain-test';
    const dir = getDataDir();
    expect(dir).toBe(path.resolve('/tmp/brain-test'));
  });

  it('resolves relative BRAIN_DATA_DIR to absolute path', () => {
    process.env['BRAIN_DATA_DIR'] = './data';
    const dir = getDataDir();
    expect(path.isAbsolute(dir)).toBe(true);
  });

  it('returns ~/.brain when env variable is not set', () => {
    delete process.env['BRAIN_DATA_DIR'];
    const dir = getDataDir();
    expect(dir).toBe(path.join(os.homedir(), '.brain'));
  });
});

describe('getPipeName', () => {
  it('uses default name "brain"', () => {
    const pipe = getPipeName();
    if (process.platform === 'win32') {
      expect(pipe).toBe('\\\\.\\pipe\\brain');
    } else {
      expect(pipe).toBe(path.join(os.tmpdir(), 'brain.sock'));
    }
  });

  it('accepts a custom name', () => {
    const pipe = getPipeName('custom');
    if (process.platform === 'win32') {
      expect(pipe).toBe('\\\\.\\pipe\\custom');
    } else {
      expect(pipe).toBe(path.join(os.tmpdir(), 'custom.sock'));
    }
  });

  it('returns a string containing the name', () => {
    const pipe = getPipeName('myservice');
    expect(pipe).toContain('myservice');
  });
});
