import { startMcpServer as coreStartMcpServer } from '@timmeck/brain-core';
import path from 'node:path';
import { registerTools } from './tools.js';

export async function startMcpServer(): Promise<void> {
  await coreStartMcpServer({
    name: 'trading-brain',
    version: '1.1.0',
    entryPoint: path.resolve(import.meta.dirname, '../index.ts'),
    registerTools,
  });
}
