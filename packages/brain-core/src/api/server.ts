import http from 'node:http';
import { getLogger } from '../utils/logger.js';
import type { IpcRouter } from '../ipc/server.js';
import { RateLimiter, readBodyWithLimit, applySecurityHeaders } from './middleware.js';
import type { RateLimitConfig, SizeLimitConfig, SecurityHeadersConfig } from './middleware.js';
import { validateParams } from '../ipc/validation.js';
import { ValidationError } from '../ipc/errors.js';

export interface ApiServerOptions {
  port: number;
  router: IpcRouter;
  apiKey?: string;
  rateLimit?: RateLimitConfig;
  sizeLimit?: SizeLimitConfig;
  security?: SecurityHeadersConfig;
  /** Callback for deep health checks (DB, engines, etc.) */
  healthCheck?: () => Record<string, unknown>;
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
  private rateLimiter: RateLimiter;

  constructor(protected options: ApiServerOptions) {
    this.routes = this.buildRoutes();
    this.rateLimiter = new RateLimiter(options.rateLimit);
  }

  start(): void {
    const { port, apiKey } = this.options;

    this.server = http.createServer((req, res) => {
      // Security headers
      applySecurityHeaders(res, this.options.security);

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Rate limiting (skip health check)
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/api/v1/health' && url.pathname !== '/api/v1/ready') {
        const limit = this.rateLimiter.check(req);
        res.setHeader('X-RateLimit-Remaining', String(limit.remaining));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(limit.resetAt / 1000)));
        if (!limit.allowed) {
          this.json(res, 429, { error: 'Too Many Requests', message: 'Rate limit exceeded' });
          return;
        }
      }

      // API key auth
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

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.logger.warn(`REST API port ${port} already in use — skipping`);
        this.server?.close();
        this.server = null;
      } else {
        this.logger.error(`REST API server error: ${err.message}`);
      }
    });

    this.server.listen(port, () => {
      this.logger.info(`REST API server started on http://localhost:${port}`);
    });
  }

  stop(): void {
    this.rateLimiter.stop();
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

    // Health check (deep)
    if (pathname === '/api/v1/health') {
      const base = { status: 'ok', timestamp: new Date().toISOString(), uptime: Math.floor(process.uptime()), memory: Math.floor(process.memoryUsage().rss / 1024 / 1024) };
      const extra = this.options.healthCheck?.() ?? {};
      this.json(res, 200, { ...base, ...extra });
      return;
    }

    // Readiness probe (for Kubernetes)
    if (pathname === '/api/v1/ready') {
      const extra = this.options.healthCheck?.() ?? {};
      const ready = extra.db !== false && extra.ipc !== false;
      this.json(res, ready ? 200 : 503, { ready, timestamp: new Date().toISOString(), ...extra });
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
      const bodyResult = await readBodyWithLimit(req, this.options.sizeLimit);
      if (bodyResult.error) {
        this.json(res, 413, { error: 'Payload Too Large', message: bodyResult.error });
        return;
      }
      if (!bodyResult.body) {
        this.json(res, 400, { error: 'Bad Request', message: 'Empty request body' });
        return;
      }

      const parsed = JSON.parse(bodyResult.body);

      // Batch RPC support
      if (Array.isArray(parsed)) {
        const results = await Promise.all(parsed.map(async (call: { method: string; params?: unknown; id?: string | number }) => {
          try {
            const validated = validateParams(call.params);
            const result = await this.options.router.handle(call.method, validated);
            return { id: call.id, result };
          } catch (err) {
            const code = err instanceof ValidationError ? 'VALIDATION_ERROR' : 'ERROR';
            return { id: call.id, error: err instanceof Error ? err.message : String(err), code };
          }
        }));
        this.json(res, 200, results);
        return;
      }

      if (!parsed.method) {
        this.json(res, 400, { error: 'Bad Request', message: 'Missing "method" field' });
        return;
      }

      try {
        const validated = validateParams(parsed.params);
        const result = await this.options.router.handle(parsed.method, validated);
        this.json(res, 200, { result });
      } catch (err) {
        const status = err instanceof ValidationError ? 400 : 400;
        this.json(res, status, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // RESTful routes
    let body: unknown = undefined;
    if (method === 'POST' || method === 'PUT') {
      try {
        const bodyResult = await readBodyWithLimit(req, this.options.sizeLimit);
        if (bodyResult.error) {
          this.json(res, 413, { error: 'Payload Too Large', message: bodyResult.error });
          return;
        }
        body = bodyResult.body ? JSON.parse(bodyResult.body) : {};
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
        const result = await this.options.router.handle(route.ipcMethod, params);
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
