import { startMcpServer as coreStartMcpServer } from '@timmeck/brain-core';
import path from 'node:path';
import { registerTools } from './tools.js';

export async function startMcpServer(): Promise<void> {
  await coreStartMcpServer({
    name: 'marketing-brain',
    version: '0.3.0',
    entryPoint: path.resolve(import.meta.dirname, '../index.ts'),
    registerTools,
  });
}
