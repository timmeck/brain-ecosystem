import { McpHttpServer as CoreMcpHttpServer } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';
import { registerToolsDirect } from './tools.js';
import { registerResearchToolsDirect } from './research-tools.js';
import { registerAdvancedResearchToolsDirect } from './advanced-research-tools.js';
import { registerDreamToolsDirect } from './dream-tools.js';
import { registerConsciousnessToolsDirect } from './consciousness-tools.js';
import { registerPredictionToolsDirect } from './prediction-tools.js';
import { registerResponderToolsDirect } from './responder-tools.js';
import { registerPromptsDirect } from './prompts.js';

export class McpHttpServer {
  private inner: CoreMcpHttpServer;

  constructor(port: number, router: IpcRouter) {
    this.inner = new CoreMcpHttpServer(
      port,
      router,
      { name: 'brain', version: '3.12.1' },
      (server, _r) => {
        registerToolsDirect(server, router);
        registerResearchToolsDirect(server, router);
        registerAdvancedResearchToolsDirect(server, router);
        registerDreamToolsDirect(server, router);
        registerConsciousnessToolsDirect(server, router);
        registerPredictionToolsDirect(server, router);
        registerResponderToolsDirect(server, router);
        registerPromptsDirect(server, router);
      },
    );
  }

  start(): void { this.inner.start(); }
  stop(): void { this.inner.stop(); }
  getClientCount(): number { return this.inner.getClientCount(); }
}
