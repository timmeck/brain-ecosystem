import { McpHttpServer as CoreMcpHttpServer } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';
import { registerToolsDirect } from './tools.js';
import { registerResearchToolsDirect } from './research-tools.js';
import { registerAdvancedResearchToolsDirect } from './advanced-research-tools.js';
import { registerDreamToolsDirect } from './dream-tools.js';
import { registerConsciousnessToolsDirect } from './consciousness-tools.js';
import { registerPredictionToolsDirect } from './prediction-tools.js';
import { registerResponderToolsDirect } from './responder-tools.js';
import { registerAttentionToolsDirect } from './attention-tools.js';
import { registerTransferToolsDirect } from './transfer-tools.js';
import { registerNarrativeToolsDirect } from './narrative-tools.js';
import { registerCuriosityToolsDirect } from './curiosity-tools.js';
import { registerEmergenceToolsDirect } from './emergence-tools.js';

export class McpHttpServer {
  private inner: CoreMcpHttpServer;

  constructor(port: number, router: IpcRouter) {
    this.inner = new CoreMcpHttpServer(
      port,
      router,
      { name: 'marketing-brain', version: '1.20.0' },
      (server, _r) => {
        registerToolsDirect(server, router);
        registerResearchToolsDirect(server, router);
        registerAdvancedResearchToolsDirect(server, router);
        registerDreamToolsDirect(server, router);
        registerConsciousnessToolsDirect(server, router);
        registerPredictionToolsDirect(server, router);
        registerResponderToolsDirect(server, router);
        registerAttentionToolsDirect(server, router);
        registerTransferToolsDirect(server, router);
        registerNarrativeToolsDirect(server, router);
        registerCuriosityToolsDirect(server, router);
        registerEmergenceToolsDirect(server, router);
      },
    );
  }

  start(): void { this.inner.start(); }
  stop(): void { this.inner.stop(); }
  getClientCount(): number { return this.inner.getClientCount(); }
}
