import { startMcpServer as coreStartMcpServer } from '@timmeck/brain-core';
import path from 'node:path';
import { registerTools } from './tools.js';
import { registerResearchTools } from './research-tools.js';
import { registerAdvancedResearchTools } from './advanced-research-tools.js';
import { registerDreamTools } from './dream-tools.js';
import { registerConsciousnessTools } from './consciousness-tools.js';
import { registerPredictionTools } from './prediction-tools.js';
import { registerResponderTools } from './responder-tools.js';
import { registerScanTools } from './scan-tools.js';
import { registerReposignalTools } from './reposignal-tools.js';
import { registerScannerTools } from './scanner-tools.js';
import { registerCodegenTools } from './codegen-tools.js';
import { registerAttentionTools } from './attention-tools.js';
import { registerPrompts } from './prompts.js';

export async function startMcpServer(): Promise<void> {
  await coreStartMcpServer({
    name: 'brain',
    version: '3.18.0',
    entryPoint: path.resolve(import.meta.dirname, '../index.ts'),
    registerTools: (server, ipc) => {
      registerTools(server, ipc);
      registerResearchTools(server, ipc);
      registerAdvancedResearchTools(server, ipc);
      registerDreamTools(server, ipc);
      registerConsciousnessTools(server, ipc);
      registerPredictionTools(server, ipc);
      registerResponderTools(server, ipc);
      registerScanTools(server, ipc);
      registerReposignalTools(server, ipc);
      registerScannerTools(server, ipc);
      registerCodegenTools(server, ipc);
      registerAttentionTools(server, ipc);
    },
    registerPrompts,
  });
}
