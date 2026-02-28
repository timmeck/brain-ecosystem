import http from 'node:http';
import { getLogger } from '../utils/logger.js';
import type { IpcRouter } from '../ipc/router.js';

interface ApiServerOptions {
  port: number;
  router: IpcRouter;
  apiKey?: string;
}

export class ApiServer {
  private server: http.Server | null = null;
  private logger = getLogger();

  constructor(private opts: ApiServerOptions) {}

  start(): void {
    this.server = http.createServer((req, res) => {
      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Auth check
      if (this.opts.apiKey) {
        const auth = req.headers.authorization;
        if (!auth || auth !== `Bearer ${this.opts.apiKey}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
      }

      // Health check
      if (req.url === '/api/v1/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'marketing-brain' }));
        return;
      }

      // Methods list
      if (req.url === '/api/v1/methods') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ methods: this.opts.router.listMethods() }));
        return;
      }

      // RPC endpoint
      if (req.url === '/api/v1/rpc' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { method, params } = JSON.parse(body);
            const result = this.opts.router.handle(method, params);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ result }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
        });
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    });

    this.server.listen(this.opts.port, () => {
      this.logger.info(`API server listening on port ${this.opts.port}`);
    });
  }

  stop(): void {
    this.server?.close();
    this.server = null;
    this.logger.info('API server stopped');
  }
}
