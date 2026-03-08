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
import type { ThoughtStream } from '../consciousness/thought-stream.js';

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
  thoughtStream?: ThoughtStream | null;
  getLLMStats?: () => unknown;
  getLLMHistory?: (hours: number) => unknown;
  getErrors?: () => unknown;
  getSelfModStatus?: () => unknown;
  getSelfModHistory?: (limit?: number) => unknown;
  selfmodApprove?: (id: number) => unknown;
  selfmodReject?: (id: number, notes?: string) => unknown;
  getMissions?: () => unknown;
  getMissionList?: (status?: string, limit?: number) => unknown;
  getKnowledgeStats?: () => unknown;
  getTimeSeries?: (days?: number) => unknown;
  getDebateStatus?: () => unknown;
  getDebateList?: (limit?: number) => unknown;
  getChallengeHistory?: (limit?: number) => unknown;
  getChallengeVulnerable?: (limit?: number) => unknown;
  getRepoAbsorberStatus?: () => unknown;
  getRepoAbsorberHistory?: (limit?: number) => unknown;
  getIntelligenceStats?: () => unknown;
  getEmotionalStatus?: () => unknown;
  getGuardrailHealth?: () => unknown;
  getRoadmaps?: () => unknown;
  getCreativeInsights?: () => unknown;
  triggerAction?: (action: string, params?: unknown) => Promise<unknown>;
}

// ── Server ───────────────────────────────────────────────

export class CommandCenterServer {
  private server: http.Server | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private timers: ReturnType<typeof setInterval>[] = [];
  private unsubscribe: (() => void) | null = null;
  private dashboardHtml: string | null = null;
  private logger = getLogger();

  constructor(private options: CommandCenterOptions) {}

  getClientCount(): number { return this.clients.size; }

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

        if (url.pathname === '/api/state') { this.handleState(res); return; }
        if (url.pathname === '/api/ecosystem') { this.handleEcosystem(res); return; }
        if (url.pathname === '/api/engines') { this.handleEngines(res); return; }
        if (url.pathname === '/api/watchdog') { this.handleWatchdog(res); return; }
        if (url.pathname === '/api/plugins') { this.handlePlugins(res); return; }
        if (url.pathname === '/api/borg') { this.handleBorg(res); return; }
        if (url.pathname === '/api/analytics') { this.handleAnalytics(res); return; }
        if (url.pathname === '/api/llm') { this.handleLLM(res); return; }
        if (url.pathname === '/api/thoughts') { this.handleThoughts(res, url); return; }
        if (url.pathname === '/api/errors') { this.handleErrors(res); return; }
        if (url.pathname === '/api/selfmod') { this.handleSelfMod(res); return; }
        if ((url.pathname === '/api/selfmod/approve' || url.pathname === '/api/selfmod/reject') && req.method === 'POST') { this.handleSelfModAction(req, res, url.pathname); return; }
        if (url.pathname === '/api/missions') { this.handleMissions(res, url); return; }
        if (url.pathname === '/api/knowledge') { this.handleKnowledge(res); return; }
        if (url.pathname === '/api/debates') { this.handleDebates(res); return; }
        if (url.pathname === '/api/borg/toggle' && req.method === 'POST') { this.handleBorgToggle(req, res); return; }
        if (url.pathname === '/api/action' && req.method === 'POST') { this.handleAction(req, res); return; }
        if (url.pathname === '/api/guardrails') { this.handleGuardrails(res); return; }
        if (url.pathname === '/api/roadmaps') { this.handleRoadmaps(res); return; }
        if (url.pathname === '/api/creative') { this.handleCreative(res); return; }
        if (url.pathname === '/events') { this.handleSSE(req, res); return; }

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

    // ── SSE: Subscribe to ThoughtStream for live thoughts ──
    if (this.options.thoughtStream) {
      this.unsubscribe = this.options.thoughtStream.onThought((thought) => {
        if (this.clients.size > 0) {
          this.broadcast('thought', thought);
        }
      });
    }

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

    // LLM Stats (10s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getLLMStats) return;
      try {
        this.broadcast('llm', this.options.getLLMStats());
      } catch { /* ignore */ }
    }, 10_000));

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

    // Errors (20s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getErrors) return;
      try { this.broadcast('errors', this.options.getErrors()); } catch { /* ignore */ }
    }, 20_000));

    // Self-Mod (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getSelfModStatus) return;
      try {
        this.broadcast('selfmod', {
          status: this.options.getSelfModStatus(),
          history: this.options.getSelfModHistory?.(10) ?? [],
        });
      } catch { /* ignore */ }
    }, 30_000));

    // Missions (15s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getMissions) return;
      try {
        this.broadcast('missions', {
          status: this.options.getMissions(),
          list: this.options.getMissionList?.() ?? [],
        });
      } catch { /* ignore */ }
    }, 15_000));

    // Knowledge (60s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getKnowledgeStats) return;
      try { this.broadcast('knowledge', this.options.getKnowledgeStats()); } catch { /* ignore */ }
    }, 60_000));

    // Debates (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getDebateStatus) return;
      try {
        this.broadcast('debates', {
          status: this.options.getDebateStatus(),
          recent: this.options.getDebateList?.(5) ?? [],
          challenges: this.options.getChallengeHistory?.(10) ?? [],
          vulnerable: this.options.getChallengeVulnerable?.(5) ?? [],
        });
      } catch { /* ignore */ }
    }, 30_000));

    // Intelligence (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getIntelligenceStats) return;
      try { this.broadcast('intelligence', this.options.getIntelligenceStats()); } catch { /* ignore */ }
    }, 30_000));

    // Repo Absorber (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getRepoAbsorberStatus) return;
      try {
        this.broadcast('repoAbsorber', {
          status: this.options.getRepoAbsorberStatus(),
          history: this.options.getRepoAbsorberHistory?.(10) ?? [],
        });
      } catch { /* ignore */ }
    }, 30_000));

    // Emotional (5s — for entity animation)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getEmotionalStatus) return;
      try { this.broadcast('emotional', this.options.getEmotionalStatus()); } catch { /* ignore */ }
    }, 5_000));

    // Guardrail Health (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getGuardrailHealth) return;
      try { this.broadcast('guardrail-health', this.options.getGuardrailHealth()); } catch { /* ignore */ }
    }, 30_000));

    // Roadmaps (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getRoadmaps) return;
      try { this.broadcast('roadmaps', this.options.getRoadmaps()); } catch { /* ignore */ }
    }, 30_000));

    // Creative Insights (30s)
    this.timers.push(setInterval(() => {
      if (this.clients.size === 0) return;
      if (!this.options.getCreativeInsights) return;
      try { this.broadcast('creative-insights', this.options.getCreativeInsights()); } catch { /* ignore */ }
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
    if (this.unsubscribe) { this.unsubscribe(); this.unsubscribe = null; }
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
      ecosystem.brains.unshift({
        name: selfName,
        available: true,
        uptime: process.uptime(),
        pid: process.pid,
      });
    } else if (!existing.available) {
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
      const llm = this.options.getLLMStats?.() ?? null;
      const thoughts = this.options.thoughtStream?.getRecent(30) ?? [];
      const errors = this.options.getErrors?.() ?? null;
      const selfmod = this.options.getSelfModStatus ? {
        status: this.options.getSelfModStatus(),
        history: this.options.getSelfModHistory?.(10) ?? [],
      } : null;
      const missions = this.options.getMissions ? {
        status: this.options.getMissions(),
        list: this.options.getMissionList?.() ?? [],
      } : null;
      const knowledge = this.options.getKnowledgeStats?.() ?? null;
      const debates = this.options.getDebateStatus ? {
        status: this.options.getDebateStatus(),
        recent: this.options.getDebateList?.(5) ?? [],
        challenges: this.options.getChallengeHistory?.(10) ?? [],
        vulnerable: this.options.getChallengeVulnerable?.(5) ?? [],
      } : null;

      const intelligence = this.options.getIntelligenceStats?.() ?? null;
      const repoAbsorber = this.options.getRepoAbsorberStatus ? {
        status: this.options.getRepoAbsorberStatus(),
        history: this.options.getRepoAbsorberHistory?.(10) ?? [],
      } : null;
      const emotional = this.options.getEmotionalStatus?.() ?? null;
      const guardrailHealth = this.options.getGuardrailHealth?.() ?? null;
      const roadmaps = this.options.getRoadmaps?.() ?? [];
      const creativeInsights = this.options.getCreativeInsights?.() ?? [];

      this.json(res, { ecosystem, engines: engineResults, watchdog, plugins, borg, analytics, llm, thoughts, errors, selfmod, missions, knowledge, debates, intelligence, repoAbsorber, emotional, guardrailHealth, roadmaps, creativeInsights });
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
      this.json(res, results);
    } catch (err) {
      this.json(res, { error: (err as Error).message }, 500);
    }
  }

  private handleWatchdog(res: http.ServerResponse): void {
    this.json(res, this.options.watchdog?.getStatus() ?? []);
  }

  private handlePlugins(res: http.ServerResponse): void {
    this.json(res, this.options.pluginRegistry?.list() ?? []);
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
      this.json(res, await this.options.ecosystemService.getAggregatedAnalytics());
    } catch (err) {
      this.json(res, { error: (err as Error).message }, 500);
    }
  }

  private handleLLM(res: http.ServerResponse): void {
    const stats = this.options.getLLMStats?.() ?? null;
    const history = this.options.getLLMHistory?.(24) ?? [];
    this.json(res, { stats, history });
  }

  private handleThoughts(res: http.ServerResponse, url: URL): void {
    const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);
    const engine = url.searchParams.get('engine');
    const ts = this.options.thoughtStream;
    if (!ts) { this.json(res, []); return; }
    this.json(res, engine ? ts.getByEngine(engine, limit) : ts.getRecent(limit));
  }

  private handleErrors(res: http.ServerResponse): void {
    this.json(res, this.options.getErrors?.() ?? { errors: [], summary: null });
  }

  private handleSelfMod(res: http.ServerResponse): void {
    if (!this.options.getSelfModStatus) {
      this.json(res, { status: null, history: [] });
      return;
    }
    this.json(res, {
      status: this.options.getSelfModStatus(),
      history: this.options.getSelfModHistory?.(20) ?? [],
    });
  }

  private handleSelfModAction(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body) as { id: number; notes?: string };
        const action = pathname.endsWith('/approve') ? 'approve' : 'reject';
        let result: unknown;
        if (action === 'approve') {
          if (!this.options.selfmodApprove) { this.json(res, { error: 'selfmodApprove not configured' }, 400); return; }
          result = this.options.selfmodApprove(data.id);
        } else {
          if (!this.options.selfmodReject) { this.json(res, { error: 'selfmodReject not configured' }, 400); return; }
          result = this.options.selfmodReject(data.id, data.notes);
        }
        this.json(res, { ok: true, result });
      } catch (err) {
        this.json(res, { error: (err as Error).message }, 500);
      }
    });
  }

  private handleMissions(res: http.ServerResponse, url: URL): void {
    if (!this.options.getMissions) {
      this.json(res, { status: null, list: [] });
      return;
    }
    const status = url.searchParams.get('status') ?? undefined;
    this.json(res, {
      status: this.options.getMissions(),
      list: this.options.getMissionList?.(status) ?? [],
    });
  }

  private handleKnowledge(res: http.ServerResponse): void {
    this.json(res, this.options.getKnowledgeStats?.() ?? { timeSeries: [], totals: null });
  }

  private handleDebates(res: http.ServerResponse): void {
    if (!this.options.getDebateStatus) {
      this.json(res, { status: null, recent: [], challenges: [], vulnerable: [] });
      return;
    }
    this.json(res, {
      status: this.options.getDebateStatus(),
      recent: this.options.getDebateList?.(10) ?? [],
      challenges: this.options.getChallengeHistory?.(20) ?? [],
      vulnerable: this.options.getChallengeVulnerable?.(5) ?? [],
    });
  }

  private handleGuardrails(res: http.ServerResponse): void {
    this.json(res, this.options.getGuardrailHealth?.() ?? null);
  }

  private handleRoadmaps(res: http.ServerResponse): void {
    this.json(res, this.options.getRoadmaps?.() ?? []);
  }

  private handleCreative(res: http.ServerResponse): void {
    this.json(res, this.options.getCreativeInsights?.() ?? []);
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

  private handleAction(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.options.triggerAction) {
      this.json(res, { error: 'Actions not available' }, 501);
      return;
    }

    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { action, params } = JSON.parse(body || '{}') as { action?: string; params?: unknown };
        if (!action || typeof action !== 'string') {
          this.json(res, { error: 'Missing "action" string' }, 400);
          return;
        }
        this.options.triggerAction!(action, params)
          .then(result => this.json(res, { ok: true, action, result }))
          .catch(err => this.json(res, { error: (err as Error).message }, 500));
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
