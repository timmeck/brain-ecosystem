import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from './thought-stream.js';

// ── Types ────────────────────────────────────────────────

export interface ConsciousnessServerOptions {
  port: number;
  thoughtStream: ThoughtStream;
  getNetworkState: () => unknown;
  getEngineStatus: () => unknown;
  onTriggerFeedback?: () => void;
}

// ── Server ───────────────────────────────────────────────

export class ConsciousnessServer {
  private server: http.Server | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private unsubscribe: (() => void) | null = null;
  private networkTimer: ReturnType<typeof setInterval> | null = null;
  private engineTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private dashboardHtml: string | null = null;
  private logger = getLogger();

  constructor(private options: ConsciousnessServerOptions) {}

  start(): void {
    const { port, thoughtStream, getNetworkState } = this.options;

    // Load dashboard HTML
    const htmlPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
      '../../consciousness-dashboard.html',
    );
    try {
      this.dashboardHtml = fs.readFileSync(htmlPath, 'utf-8');
    } catch {
      this.dashboardHtml = '<html><body><h1>Consciousness Dashboard HTML not found</h1></body></html>';
    }

    this.server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);

      // CORS + Security
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // Dashboard
      if (url.pathname === '/' || url.pathname === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.dashboardHtml);
        return;
      }

      // Full state snapshot
      if (url.pathname === '/api/state') {
        const state = {
          thoughts: thoughtStream.getRecent(100),
          network: getNetworkState(),
          engines: thoughtStream.getEngineActivity(),
          status: thoughtStream.getStats(),
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
        return;
      }

      // Trigger feedback cycle
      if (url.pathname === '/api/trigger' && req.method === 'POST') {
        if (this.options.onTriggerFeedback) {
          try {
            this.options.onTriggerFeedback();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ triggered: true }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
        } else {
          res.writeHead(501, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Feedback trigger not configured' }));
        }
        return;
      }

      // SSE stream
      if (url.pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(`event: connected\ndata: ${JSON.stringify({ clients: this.clients.size + 1 })}\n\n`);

        this.clients.add(res);
        req.on('close', () => this.clients.delete(res));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    // Subscribe to thought stream → broadcast immediately
    this.unsubscribe = thoughtStream.onThought((thought) => {
      this.broadcast('thought', thought);
    });

    // Network snapshot every 10s
    this.networkTimer = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcast('network', getNetworkState());
      }
    }, 10_000);

    // Engine status every 5s
    this.engineTimer = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcast('engines', {
          engines: thoughtStream.getEngineActivity(),
          status: thoughtStream.getStats(),
        });
      }
    }, 5_000);

    // Heartbeat every 30s
    this.heartbeatTimer = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcast('heartbeat', { time: Date.now() });
      }
    }, 30_000);

    this.server.listen(port, () => {
      this.logger.info(`Consciousness dashboard started on http://localhost:${port}`);
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.networkTimer) { clearInterval(this.networkTimer); this.networkTimer = null; }
    if (this.engineTimer) { clearInterval(this.engineTimer); this.engineTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }

    for (const client of this.clients) {
      try { client.end(); } catch { /* ignore */ }
    }
    this.clients.clear();

    this.server?.close();
    this.server = null;
    this.logger.info('Consciousness dashboard stopped');
  }

  getClientCount(): number {
    return this.clients.size;
  }

  private broadcast(event: string, data: unknown): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(msg);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
