import { startMcpServer as coreStartMcpServer } from '@timmeck/brain-core';
import path from 'node:path';
import { registerTools } from './tools.js';
import { registerPrompts } from './prompts.js';

export async function startMcpServer(): Promise<void> {
  await coreStartMcpServer({
    name: 'brain',
    version: '3.1.0',
    entryPoint: path.resolve(import.meta.dirname, '../index.ts'),
    registerTools,
    registerPrompts,
  });
}
