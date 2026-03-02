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
import { registerTransferTools } from './transfer-tools.js';
import { registerUnifiedTools } from './unified-tools.js';
import { registerNarrativeTools } from './narrative-tools.js';
import { registerCuriosityTools } from './curiosity-tools.js';
import { registerEmergenceTools } from './emergence-tools.js';
import { registerDebateTools } from './debate-tools.js';
import { registerMetacognitionTools } from './metacognition-tools.js';
import { registerSelfawareTools } from './selfaware-tools.js';
import { registerMemoryPalaceTools } from './memory-palace-tools.js';
import { registerGoalTools } from './goal-tools.js';
import { registerEvolutionTools } from './evolution-tools.js';
import { registerPrompts } from './prompts.js';

export async function startMcpServer(): Promise<void> {
  await coreStartMcpServer({
    name: 'brain',
    version: '3.26.0',
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
      registerTransferTools(server, ipc);
      registerUnifiedTools(server, ipc);
      registerNarrativeTools(server, ipc);
      registerCuriosityTools(server, ipc);
      registerEmergenceTools(server, ipc);
      registerDebateTools(server, ipc);
      registerMetacognitionTools(server, ipc);
      registerSelfawareTools(server, ipc);
      registerMemoryPalaceTools(server, ipc);
      registerGoalTools(server, ipc);
      registerEvolutionTools(server, ipc);
    },
    registerPrompts,
  });
}
