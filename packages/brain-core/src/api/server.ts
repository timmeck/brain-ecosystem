import http from 'node:http';
import { getLogger } from '../utils/logger.js';
import type { IpcRouter } from '../ipc/server.js';

export interface ApiServerOptions {
  port: number;
  router: IpcRouter;
  apiKey?: string;
}

export interface RouteDefinition {
  method: string;
  pattern: RegExp;
  ipcMethod: string;
  extractParams: (match: RegExpMatchArray, query: URLSearchParams, body?: unknown) => unknown;
}

export class BaseApiServer {
  private server: http.Server | null = null;
  protected logger = getLogger();
  private routes: RouteDefinition[];
  protected sseClients: Set<http.ServerResponse> = new Set();

  constructor(protected options: ApiServerOptions) {
    this.routes = this.buildRoutes();
  }

  start(): void {
    const { port, apiKey } = this.options;

    this.server = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (apiKey) {
        const provided = (req.headers['x-api-key'] as string) ??
          req.headers.authorization?.replace('Bearer ', '');
        if (provided !== apiKey) {
          this.json(res, 401, { error: 'Unauthorized', message: 'Invalid or missing API key' });
          return;
        }
      }

      this.handleRequest(req, res).catch((err) => {
        this.logger.error('API error:', err);
        this.json(res, 500, {
          error: 'Internal Server Error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
    });

    this.server.listen(port, () => {
      this.logger.info(`REST API server started on http://localhost:${port}`);
    });
  }

  stop(): void {
    for (const client of this.sseClients) {
      try { client.end(); } catch { /* ignore */ }
    }
    this.sseClients.clear();
    this.server?.close();
    this.server = null;
    this.logger.info('REST API server stopped');
  }

  /** Override to add domain-specific RESTful routes */
  protected buildRoutes(): RouteDefinition[] {
    return [];
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathname = url.pathname;
    const method = req.method ?? 'GET';
    const query = url.searchParams;

    // Health check
    if (pathname === '/api/v1/health') {
      this.json(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
      return;
    }

    // SSE event stream
    if (pathname === '/api/v1/events' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write('data: {"type":"connected"}\n\n');
      this.sseClients.add(res);
      req.on('close', () => this.sseClients.delete(res));
      return;
    }

    // List all available methods
    if (pathname === '/api/v1/methods' && method === 'GET') {
      const methods = this.options.router.listMethods();
      this.json(res, 200, {
        methods,
        rpcEndpoint: '/api/v1/rpc',
        usage: 'POST /api/v1/rpc with body { "method": "<method>", "params": {...} }',
      });
      return;
    }

    // Generic RPC endpoint
    if (pathname === '/api/v1/rpc' && method === 'POST') {
      const body = await this.readBody(req);
      if (!body) {
        this.json(res, 400, { error: 'Bad Request', message: 'Empty request body' });
        return;
      }

      const parsed = JSON.parse(body);

      // Batch RPC support
      if (Array.isArray(parsed)) {
        const results = parsed.map((call: { method: string; params?: unknown; id?: string | number }) => {
          try {
            const result = this.options.router.handle(call.method, call.params ?? {});
            return { id: call.id, result };
          } catch (err) {
            return { id: call.id, error: err instanceof Error ? err.message : String(err) };
          }
        });
        this.json(res, 200, results);
        return;
      }

      if (!parsed.method) {
        this.json(res, 400, { error: 'Bad Request', message: 'Missing "method" field' });
        return;
      }

      try {
        const result = this.options.router.handle(parsed.method, parsed.params ?? {});
        this.json(res, 200, { result });
      } catch (err) {
        this.json(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // RESTful routes
    let body: unknown = undefined;
    if (method === 'POST' || method === 'PUT') {
      try {
        const raw = await this.readBody(req);
        body = raw ? JSON.parse(raw) : {};
      } catch {
        this.json(res, 400, { error: 'Bad Request', message: 'Invalid JSON body' });
        return;
      }
    }

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;

      try {
        const params = route.extractParams(match, query, body);
        const result = this.options.router.handle(route.ipcMethod, params);
        this.json(res, method === 'POST' ? 201 : 200, { result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const status = msg.startsWith('Unknown method') ? 404 : 400;
        this.json(res, status, { error: msg });
      }
      return;
    }

    this.json(res, 404, { error: 'Not Found', message: `No route for ${method} ${pathname}` });
  }

  protected json(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  protected readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  protected broadcastSSE(data: unknown): void {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(msg);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }
}
