import { startMcpServer as coreStartMcpServer } from '@timmeck/brain-core';
import path from 'node:path';
import { registerTools } from './tools.js';
import { registerResearchTools } from './research-tools.js';
import { registerAdvancedResearchTools } from './advanced-research-tools.js';
import { registerDreamTools } from './dream-tools.js';
import { registerConsciousnessTools } from './consciousness-tools.js';
import { registerPredictionTools } from './prediction-tools.js';
import { registerResponderTools } from './responder-tools.js';

export async function startMcpServer(): Promise<void> {
  await coreStartMcpServer({
    name: 'trading-brain',
    version: '2.12.0',
    entryPoint: path.resolve(import.meta.dirname, '../index.ts'),
    registerTools: (server, ipc) => {
      registerTools(server, ipc);
      registerResearchTools(server, ipc);
      registerAdvancedResearchTools(server, ipc);
      registerDreamTools(server, ipc);
      registerConsciousnessTools(server, ipc);
      registerPredictionTools(server, ipc);
      registerResponderTools(server, ipc);
    },
  });
}
