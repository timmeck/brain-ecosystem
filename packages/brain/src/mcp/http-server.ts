import { McpHttpServer as CoreMcpHttpServer } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';
import { registerToolsDirect } from './tools.js';
import { registerPromptsDirect } from './prompts.js';

export class McpHttpServer {
  private inner: CoreMcpHttpServer;

  constructor(port: number, router: IpcRouter) {
    this.inner = new CoreMcpHttpServer(
      port,
      router,
      { name: 'brain', version: '3.1.0' },
      (server, _r) => {
        registerToolsDirect(server, router);
        registerPromptsDirect(server, router);
      },
    );
  }

  start(): void { this.inner.start(); }
  stop(): void { this.inner.stop(); }
  getClientCount(): number { return this.inner.getClientCount(); }
}
