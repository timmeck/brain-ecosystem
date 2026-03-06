import { describe, it, expect, afterEach, vi } from 'vitest';
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

  it('skips Console transport when stdout is not writable', () => {
    const origWritable = Object.getOwnPropertyDescriptor(process.stdout, 'writable');
    Object.defineProperty(process.stdout, 'writable', { value: false, configurable: true });
    try {
      const logger = createLogger({ level: 'error' });
      // Should have only File transport (no Console)
      const transportNames = logger.transports.map(t => t.constructor.name);
      expect(transportNames).not.toContain('Console');
    } finally {
      if (origWritable) {
        Object.defineProperty(process.stdout, 'writable', origWritable);
      } else {
        Object.defineProperty(process.stdout, 'writable', { value: true, configurable: true });
      }
    }
  });

  it('Console transport has error handler registered', () => {
    const logger = createLogger({ level: 'error' });
    const consoleTransport = logger.transports.find(t => t.constructor.name === 'Console');
    if (consoleTransport) {
      // Verify error handler is attached (prevents EPIPE crash)
      expect(consoleTransport.listenerCount('error')).toBeGreaterThan(0);
    }
  });
});
