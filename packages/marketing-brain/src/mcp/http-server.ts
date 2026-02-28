import { McpHttpServer as CoreMcpHttpServer } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';
import { registerToolsDirect } from './tools.js';

export class McpHttpServer {
  private inner: CoreMcpHttpServer;

  constructor(port: number, router: IpcRouter) {
    this.inner = new CoreMcpHttpServer(
      port,
      router,
      { name: 'marketing-brain', version: '0.5.0' },
      (server, _r) => registerToolsDirect(server, router),
    );
  }

  start(): void { this.inner.start(); }
  stop(): void { this.inner.stop(); }
  getClientCount(): number { return this.inner.getClientCount(); }
}
