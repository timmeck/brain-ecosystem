import { createLogger as coreCreateLogger, getLogger, resetLogger } from '@timmeck/brain-core';
import type winston from 'winston';
import { getDataDir } from './paths.js';

export function createLogger(opts?: { level?: string; file?: string; maxSize?: number; maxFiles?: number }): winston.Logger {
  return coreCreateLogger({
    ...opts,
    envVar: 'MARKETING_BRAIN_LOG_LEVEL',
    defaultFilename: 'marketing-brain.log',
    dataDir: opts?.file ? undefined : getDataDir(),
  });
}

export { getLogger, resetLogger };
