import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizePath, getDataDir, getPipeName } from '../paths.js';

describe('normalizePath', () => {
  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\test\\file.ts')).toBe('C:/Users/test/file.ts');
  });
  it('leaves forward slashes unchanged', () => {
    expect(normalizePath('/home/user/file.ts')).toBe('/home/user/file.ts');
  });
  it('handles mixed slashes', () => {
    expect(normalizePath('C:\\Users/test\\file.ts')).toBe('C:/Users/test/file.ts');
  });
});

describe('getDataDir', () => {
  afterEach(() => {
    delete process.env['TEST_DATA_DIR'];
  });

  it('uses env var when set', () => {
    process.env['TEST_DATA_DIR'] = '/custom/dir';
    const result = getDataDir('TEST_DATA_DIR', '.brain');
    // path.resolve normalises to platform-native form
    expect(result).toContain('custom');
    expect(result).not.toContain('.brain');
  });
  it('falls back to home dir', () => {
    const result = getDataDir('NONEXISTENT_VAR_XYZ', '.test-brain');
    expect(result).toContain('.test-brain');
  });
});

describe('getPipeName', () => {
  it('returns platform-specific path', () => {
    const name = getPipeName('test-brain');
    if (process.platform === 'win32') {
      expect(name).toBe('\\\\.\\pipe\\test-brain');
    } else {
      expect(name).toContain('test-brain.sock');
    }
  });
  it('defaults to brain', () => {
    const name = getPipeName();
    if (process.platform === 'win32') {
      expect(name).toBe('\\\\.\\pipe\\brain');
    } else {
      expect(name).toContain('brain.sock');
    }
  });
});
