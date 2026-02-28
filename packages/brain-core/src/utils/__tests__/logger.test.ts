import { describe, it, expect, afterEach } from 'vitest';
import { createLogger, getLogger, resetLogger } from '../logger.js';

describe('logger', () => {
  afterEach(() => {
    resetLogger();
  });

  it('createLogger returns a logger instance', () => {
    const logger = createLogger({ level: 'error' });
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  it('getLogger returns the same singleton', () => {
    const a = createLogger({ level: 'error' });
    const b = getLogger();
    expect(a).toBe(b);
  });

  it('resetLogger allows creating a new logger', () => {
    const a = createLogger({ level: 'error' });
    resetLogger();
    const b = createLogger({ level: 'warn' });
    expect(a).not.toBe(b);
  });

  it('getLogger auto-creates if none exists', () => {
    const logger = getLogger();
    expect(logger).toBeDefined();
  });
});
