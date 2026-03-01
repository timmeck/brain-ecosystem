import { McpHttpServer as CoreMcpHttpServer } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';
import { registerToolsDirect } from './tools.js';
import { registerResearchToolsDirect } from './research-tools.js';
import { registerAdvancedResearchToolsDirect } from './advanced-research-tools.js';

export class McpHttpServer {
  private inner: CoreMcpHttpServer;

  constructor(port: number, router: IpcRouter) {
    this.inner = new CoreMcpHttpServer(
      port,
      router,
      { name: 'marketing-brain', version: '1.9.0' },
      (server, _r) => {
        registerToolsDirect(server, router);
        registerResearchToolsDirect(server, router);
        registerAdvancedResearchToolsDirect(server, router);
      },
    );
  }

  start(): void { this.inner.start(); }
  stop(): void { this.inner.stop(); }
  getClientCount(): number { return this.inner.getClientCount(); }
}
