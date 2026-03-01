import { startMcpServer as coreStartMcpServer } from '@timmeck/brain-core';
import path from 'node:path';
import { registerTools } from './tools.js';
import { registerResearchTools } from './research-tools.js';
import { registerAdvancedResearchTools } from './advanced-research-tools.js';
import { registerPrompts } from './prompts.js';

export async function startMcpServer(): Promise<void> {
  await coreStartMcpServer({
    name: 'brain',
    version: '3.8.0',
    entryPoint: path.resolve(import.meta.dirname, '../index.ts'),
    registerTools: (server, ipc) => {
      registerTools(server, ipc);
      registerResearchTools(server, ipc);
      registerAdvancedResearchTools(server, ipc);
    },
    registerPrompts,
  });
}
