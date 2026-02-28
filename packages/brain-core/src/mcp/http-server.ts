import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { getLogger } from '../utils/logger.js';
import type { IpcRouter } from '../ipc/server.js';

export interface McpHttpServerOptions {
  /** MCP server name */
  name: string;
  /** MCP server version */
  version: string;
}

export class McpHttpServer {
  private server: http.Server | null = null;
  private transports = new Map<string, SSEServerTransport>();
  private logger = getLogger();

  constructor(
    private port: number,
    private router: IpcRouter,
    private meta: McpHttpServerOptions,
    private registerToolsDirect: (server: McpServer, router: IpcRouter) => void,
  ) {}

  start(): void {
    this.server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);

      if (url.pathname === '/sse' && req.method === 'GET') {
        this.handleSSE(res);
        return;
      }

      if (url.pathname === '/messages' && req.method === 'POST') {
        this.handleMessage(req, res, url);
        return;
      }

      if (url.pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          name: this.meta.name,
          version: this.meta.version,
          protocol: 'MCP',
          transport: 'sse',
          endpoints: {
            sse: '/sse',
            messages: '/messages',
          },
          clients: this.transports.size,
        }));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    this.server.listen(this.port, () => {
      this.logger.info(`MCP HTTP server (SSE) started on http://localhost:${this.port}`);
    });
  }

  stop(): void {
    for (const transport of this.transports.values()) {
      try { transport.close?.(); } catch { /* ignore */ }
    }
    this.transports.clear();
    this.server?.close();
    this.server = null;
    this.logger.info('MCP HTTP server stopped');
  }

  getClientCount(): number {
    return this.transports.size;
  }

  private async handleSSE(res: http.ServerResponse): Promise<void> {
    try {
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId ?? randomUUID();
      this.transports.set(sessionId, transport);

      const server = new McpServer({
        name: this.meta.name,
        version: this.meta.version,
      });

      this.registerToolsDirect(server, this.router);

      res.on('close', () => {
        this.transports.delete(sessionId);
        this.logger.debug(`MCP SSE client disconnected: ${sessionId}`);
      });

      await server.connect(transport);
      this.logger.info(`MCP SSE client connected: ${sessionId}`);
    } catch (err) {
      this.logger.error('MCP SSE connection error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    }
  }

  private async handleMessage(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<void> {
    try {
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing sessionId parameter');
        return;
      }

      const transport = this.transports.get(sessionId);
      if (!transport) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Session not found. Connect to /sse first.');
        return;
      }

      await transport.handlePostMessage(req, res);
    } catch (err) {
      this.logger.error('MCP message error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
    }
  }
}
