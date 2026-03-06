import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { CrossBrainClient } from '../cross-brain/client.js';
import type { EcosystemService } from '../ecosystem/service.js';
import type { CrossBrainCorrelator } from '../cross-brain/correlator.js';
import type { WatchdogService } from '../watchdog/watchdog-service.js';
import type { PluginRegistry } from '../plugin/plugin-registry.js';
import type { BorgSyncEngine } from '../cross-brain/borg-sync-engine.js';

// ── Types ────────────────────────────────────────────────

export interface CommandCenterOptions {
  port: number;
  selfName: string;
  crossBrain: CrossBrainClient;
  ecosystemService: EcosystemService;
  correlator: CrossBrainCorrelator;
  watchdog?: WatchdogService | null;
  pluginRegistry?: PluginRegistry | null;
  borgSync?: BorgSyncEngine | null;
}

// ── Server ───────────────────────────────────────────────

export class CommandCenterServer {
  private server: http.Server | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private timers: ReturnType<typeof setInterval>[] = [];
  private dashboardHtml: string | null = null;
  private logger = getLogger();

  constructor(private options: CommandCenterOptions) {}

  start(): void {
    const { port } = this.options;

    // Load HTML
    const htmlPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
      '../../command-center.html',
    );
    try {
      this.dashboardHtml = fs.readFileSync(htmlPath, 'utf-8');
    } catch {
      this.dashboardHtml = '<html><body><h1>Command Center HTML not found</h1></body></html>';
    }

    this.server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);

      // CORS + Security
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      // ── Routes ──────────────────────────────────────────
      try {
        if (url.pathname === '/' || url.pathname === '/dashboard') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.dashboardHtml);
          return;
        }

        if (url.pathname === '/api/state') {
          this.handleState(res);
          return;
        }

        if (url.pathname === '/api/ecosystem') {
          this.handleEcosystem(res);
          return;
        }

        if (url.pathname === '/api/engines') {
          this.handleEngines(res);
          return;
        }

        if (url.pathname === '/api/watchdog') {
          this.handleWatchdog(res);
          return;
        }

        if (url.pathname === '/api/plugins') {
          this.handlePlugins(res);
          return;
        }

        if (url.pathname === '/api/borg') {
          this.handleBorg(res);
          return;
        }

        if (url.pathname === '/api/analytics') {
          this.handleAnalytics(res);
          return;
        }

        if (url.pathname === '/api/borg/toggle' && req.method === 'POST') {
          this.handleBorgToggle(req, res);
          return;
        }

        if (url.pathname === '/events') {
          this.handleSSE(req, res);
          return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } catch (err) {
        this.logger.error(`Command Center route error: ${(err as Error).message}`);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
      }
    });

    // ── SSE Timers ──────────────────────────────────────

    // Ecosystem (10s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      this.options.ecosystemService.getStatus()
        .then(status => { this.ensureSelfInBrains(status); this.broadcast('ecosystem', status); })
        .catch(() => {});
    }, 10_000));

    // Engines (15s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      this.options.crossBrain.broadcast('consciousness.engines')
        .then(results => this.broadcast('engines', results))
        .catch(() => {});
    }, 15_000));

    // Watchdog (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      const status = this.options.watchdog?.getStatus() ?? [];
      this.broadcast('watchdog', status);
    }, 30_000));

    // Borg (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.borgSync) return;
      this.broadcast('borg', {
        status: this.options.borgSync.getStatus(),
        config: this.options.borgSync.getConfig(),
        history: this.options.borgSync.getHistory(20),
      });
    }, 30_000));

    // Analytics (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      this.options.ecosystemService.getAggregatedAnalytics()
        .then(analytics => this.broadcast('analytics', analytics))
        .catch(() => {});
    }, 30_000));

    // Heartbeat (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcast('heartbeat', { time: Date.now() });
      }
    }, 30_000));

    // ── Error handling ──────────────────────────────────
    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.logger.warn(`Command Center port ${port} already in use — skipping`);
        this.server?.close();
        this.server = null;
      } else {
        this.logger.error(`Command Center error: ${err.message}`);
      }
    });

    this.server.listen(port, () => {
      this.logger.info(`Command Center started on http://localhost:${port}`);
    });
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];

    for (const client of this.clients) {
      try { client.end(); } catch { /* ignore */ }
    }
    this.clients.clear();

    this.server?.close();
    this.server = null;
    this.logger.info('Command Center stopped');
  }

  // ── Route Handlers ──────────────────────────────────────

  /** Ensure the brain running this server appears in the brains list. */
  private ensureSelfInBrains(ecosystem: { brains: Array<{ name: string; available?: boolean; version?: string; uptime?: number; pid?: number; methods?: number }> }): void {
    const selfName = this.options.selfName;
    const existing = ecosystem.brains.find(b => b.name === selfName);
    if (!existing) {
      // Self is always available (we're serving this request)
      ecosystem.brains.unshift({
        name: selfName,
        available: true,
        uptime: process.uptime(),
        pid: process.pid,
      });
    } else if (!existing.available) {
      // Self was marked unavailable because broadcast doesn't include self
      existing.available = true;
      existing.uptime = existing.uptime ?? process.uptime();
      existing.pid = existing.pid ?? process.pid;
    }
  }

  private async handleState(res: http.ServerResponse): Promise<void> {
    try {
      const [ecosystem, engineResults, analytics] = await Promise.all([
        this.options.ecosystemService.getStatus(),
        this.options.crossBrain.broadcast('consciousness.engines'),
        this.options.ecosystemService.getAggregatedAnalytics(),
      ]);
      this.ensureSelfInBrains(ecosystem);
      const watchdog = this.options.watchdog?.getStatus() ?? [];
      const plugins = this.options.pluginRegistry?.list() ?? [];
      const borg = this.options.borgSync ? {
        status: this.options.borgSync.getStatus(),
        config: this.options.borgSync.getConfig(),
        history: this.options.borgSync.getHistory(20),
      } : null;

      this.json(res, { ecosystem, engines: engineResults, watchdog, plugins, borg, analytics });
    } catch (err) {
      this.json(res, { error: (err as Error).message }, 500);
    }
  }

  private async handleEcosystem(res: http.ServerResponse): Promise<void> {
    try {
      const status = await this.options.ecosystemService.getStatus();
      this.ensureSelfInBrains(status);
      this.json(res, status);
    } catch (err) {
      this.json(res, { error: (err as Error).message }, 500);
    }
  }

  private async handleEngines(res: http.ServerResponse): Promise<void> {
    try {
      const results = await this.options.crossBrain.broadcast('consciousness.engines');
      // Also include self (the brain running this server)
      this.json(res, results);
    } catch (err) {
      this.json(res, { error: (err as Error).message }, 500);
    }
  }

  private handleWatchdog(res: http.ServerResponse): void {
    const status = this.options.watchdog?.getStatus() ?? [];
    this.json(res, status);
  }

  private handlePlugins(res: http.ServerResponse): void {
    const plugins = this.options.pluginRegistry?.list() ?? [];
    this.json(res, plugins);
  }

  private handleBorg(res: http.ServerResponse): void {
    if (!this.options.borgSync) {
      this.json(res, { enabled: false, available: false });
      return;
    }
    this.json(res, {
      status: this.options.borgSync.getStatus(),
      config: this.options.borgSync.getConfig(),
      history: this.options.borgSync.getHistory(50),
    });
  }

  private async handleAnalytics(res: http.ServerResponse): Promise<void> {
    try {
      const analytics = await this.options.ecosystemService.getAggregatedAnalytics();
      this.json(res, analytics);
    } catch (err) {
      this.json(res, { error: (err as Error).message }, 500);
    }
  }

  private handleBorgToggle(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.options.borgSync) {
      this.json(res, { error: 'Borg sync not available' }, 501);
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { enabled } = JSON.parse(body || '{}') as { enabled?: boolean };
        if (typeof enabled !== 'boolean') {
          this.json(res, { error: 'Missing "enabled" boolean' }, 400);
          return;
        }
        this.options.borgSync!.setEnabled(enabled);
        this.json(res, { enabled, toggled: true });
      } catch (err) {
        this.json(res, { error: (err as Error).message }, 400);
      }
    });
  }

  private handleSSE(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ clients: this.clients.size + 1 })}\n\n`);
    this.clients.add(res);
    req.on('close', () => this.clients.delete(res));
  }

  // ── Helpers ─────────────────────────────────────────────

  private broadcast(event: string, data: unknown): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try { client.write(msg); } catch { this.clients.delete(client); }
    }
  }

  private json(res: http.ServerResponse, data: unknown, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }
}
