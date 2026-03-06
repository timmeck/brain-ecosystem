import { McpHttpServer as CoreMcpHttpServer } from '@timmeck/brain-core';
import { getCurrentVersion } from '../cli/update-check.js';
import type { IpcRouter } from '../ipc/router.js';
import { registerToolsDirect } from './tools.js';
import { registerResearchToolsDirect } from './research-tools.js';
import { registerAdvancedResearchToolsDirect } from './advanced-research-tools.js';
import { registerDreamToolsDirect } from './dream-tools.js';
import { registerConsciousnessToolsDirect } from './consciousness-tools.js';
import { registerPredictionToolsDirect } from './prediction-tools.js';
import { registerResponderToolsDirect } from './responder-tools.js';
import { registerScanToolsDirect } from './scan-tools.js';
import { registerReposignalToolsDirect } from './reposignal-tools.js';
import { registerScannerToolsDirect } from './scanner-tools.js';
import { registerCodegenToolsDirect } from './codegen-tools.js';
import { registerAttentionToolsDirect } from './attention-tools.js';
import { registerTransferToolsDirect } from './transfer-tools.js';
import { registerUnifiedToolsDirect } from './unified-tools.js';
import { registerNarrativeToolsDirect } from './narrative-tools.js';
import { registerCuriosityToolsDirect } from './curiosity-tools.js';
import { registerEmergenceToolsDirect } from './emergence-tools.js';
import { registerDebateToolsDirect } from './debate-tools.js';
import { registerMetacognitionToolsDirect } from './metacognition-tools.js';
import { registerSelfawareToolsDirect } from './selfaware-tools.js';
import { registerMemoryPalaceToolsDirect } from './memory-palace-tools.js';
import { registerGoalToolsDirect } from './goal-tools.js';
import { registerEvolutionToolsDirect } from './evolution-tools.js';
import { registerReasoningToolsDirect } from './reasoning-tools.js';
import { registerEmotionalToolsDirect } from './emotional-tools.js';
import { registerSelfmodToolsDirect } from './selfmod-tools.js';
import { registerConceptToolsDirect } from './concept-tools.js';
import { registerPeerToolsDirect } from './peer-tools.js';
import { registerLLMToolsDirect } from './llm-tools.js';
import { registerMissionToolsDirect } from './mission-tools.js';
import { registerTechRadarToolsDirect } from './techradar-tools.js';
import { registerPromptsDirect } from './prompts.js';

export class McpHttpServer {
  private inner: CoreMcpHttpServer;

  constructor(port: number, router: IpcRouter) {
    this.inner = new CoreMcpHttpServer(
      port,
      router,
      { name: 'brain', version: getCurrentVersion() },
      (server, _r) => {
        registerToolsDirect(server, router);
        registerResearchToolsDirect(server, router);
        registerAdvancedResearchToolsDirect(server, router);
        registerDreamToolsDirect(server, router);
        registerConsciousnessToolsDirect(server, router);
        registerPredictionToolsDirect(server, router);
        registerResponderToolsDirect(server, router);
        registerScanToolsDirect(server, router);
        registerReposignalToolsDirect(server, router);
        registerScannerToolsDirect(server, router);
        registerCodegenToolsDirect(server, router);
        registerAttentionToolsDirect(server, router);
        registerTransferToolsDirect(server, router);
        registerUnifiedToolsDirect(server, router);
        registerNarrativeToolsDirect(server, router);
        registerCuriosityToolsDirect(server, router);
        registerEmergenceToolsDirect(server, router);
        registerDebateToolsDirect(server, router);
        registerMetacognitionToolsDirect(server, router);
        registerSelfawareToolsDirect(server, router);
        registerMemoryPalaceToolsDirect(server, router);
        registerGoalToolsDirect(server, router);
        registerEvolutionToolsDirect(server, router);
        registerReasoningToolsDirect(server, router);
        registerEmotionalToolsDirect(server, router);
        registerSelfmodToolsDirect(server, router);
        registerConceptToolsDirect(server, router);
        registerPeerToolsDirect(server, router);
        registerLLMToolsDirect(server, router);
        registerMissionToolsDirect(server, router);
        registerTechRadarToolsDirect(server, router);
        registerPromptsDirect(server, router);
      },
    );
  }

  start(): void { this.inner.start(); }
  stop(): void { this.inner.stop(); }
  getClientCount(): number { return this.inner.getClientCount(); }
}
