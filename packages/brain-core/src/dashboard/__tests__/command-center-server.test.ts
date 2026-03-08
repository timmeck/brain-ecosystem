import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { CommandCenterServer } from '../command-center-server.js';
import type { CommandCenterOptions } from '../command-center-server.js';

// ── Helpers ─────────────────────────────────────────────────

function request(
  port: number,
  path: string,
  method = 'GET',
  body?: string,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: body ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode!, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function createMockOptions(overrides: Partial<CommandCenterOptions> = {}): CommandCenterOptions {
  return {
    port: 0,
    selfName: 'brain',
    crossBrain: {
      broadcast: vi.fn().mockResolvedValue([]),
      query: vi.fn().mockResolvedValue(null),
      getPeerNames: vi.fn().mockReturnValue(['trading-brain', 'marketing-brain']),
      getAvailablePeers: vi.fn().mockResolvedValue([]),
      addPeer: vi.fn(),
      removePeer: vi.fn(),
    } as unknown as CommandCenterOptions['crossBrain'],
    ecosystemService: {
      getStatus: vi.fn().mockResolvedValue({
        brains: [{ name: 'brain', available: true, version: '1.0.0', uptime: 100, pid: 1234, methods: 50 }],
        health: { score: 85, status: 'healthy', activeBrains: 1, totalEvents: 10, correlations: 0, recentErrors: 0, recentTradeLosses: 0, alerts: [] },
        correlations: [],
        recentEvents: [],
      }),
      getAggregatedAnalytics: vi.fn().mockResolvedValue({
        brain: { errors: 5, solutions: 3, modules: 10 },
      }),
      getCorrelations: vi.fn().mockReturnValue([]),
      getTimeline: vi.fn().mockReturnValue([]),
      getHealth: vi.fn().mockReturnValue({ score: 85, status: 'healthy' }),
    } as unknown as CommandCenterOptions['ecosystemService'],
    correlator: {
      getHealth: vi.fn().mockReturnValue({ score: 85, status: 'healthy' }),
      getCorrelations: vi.fn().mockReturnValue([]),
      getTimeline: vi.fn().mockReturnValue([]),
    } as unknown as CommandCenterOptions['correlator'],
    watchdog: null,
    pluginRegistry: null,
    borgSync: null,
    thoughtStream: {
      onThought: vi.fn().mockReturnValue(() => {}),
      getRecent: vi.fn().mockReturnValue([]),
      getByEngine: vi.fn().mockReturnValue([]),
      getStats: vi.fn().mockReturnValue({ totalThoughts: 0, activeEngines: [] }),
    } as unknown as CommandCenterOptions['thoughtStream'],
    getLLMStats: vi.fn().mockReturnValue({ totalCalls: 42, totalTokens: 5000, cacheHitRate: 0.5, callsThisHour: 3 }),
    getLLMHistory: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

function startServer(
  overrides: Partial<CommandCenterOptions> = {},
): Promise<{ server: CommandCenterServer; port: number }> {
  return new Promise((resolve) => {
    const opts = createMockOptions(overrides);
    const server = new CommandCenterServer(opts);
    server.start();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internal = (server as any).server as http.Server;
    internal.on('listening', () => {
      const addr = internal.address() as { port: number };
      resolve({ server, port: addr.port });
    });
  });
}

// ── Tests ───────────────────────────────────────────────────

describe('CommandCenterServer', () => {
  let server: CommandCenterServer | null = null;

  afterEach(() => {
    server?.stop();
    server = null;
  });

  it('GET / returns HTML', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Command Center');
  });

  it('GET /api/state returns full state snapshot', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/state');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('ecosystem');
    expect(data).toHaveProperty('engines');
    expect(data).toHaveProperty('watchdog');
    expect(data).toHaveProperty('plugins');
    expect(data).toHaveProperty('analytics');
    expect(data).toHaveProperty('errors');
    expect(data).toHaveProperty('selfmod');
    expect(data).toHaveProperty('missions');
    expect(data).toHaveProperty('knowledge');
    expect(data.ecosystem.brains).toHaveLength(1);
    expect(data.ecosystem.brains[0].name).toBe('brain');
  });

  it('GET /api/ecosystem returns ecosystem status', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/ecosystem');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.brains).toBeInstanceOf(Array);
    expect(data.health).toHaveProperty('score');
  });

  it('GET /api/engines broadcasts to peers', async () => {
    const mockBroadcast = vi.fn().mockResolvedValue([
      { name: 'brain', result: [{ engine: 'learning', thoughtCount: 5 }] },
    ]);
    const result = await startServer({
      crossBrain: {
        broadcast: mockBroadcast,
        getPeerNames: vi.fn().mockReturnValue([]),
      } as unknown as CommandCenterOptions['crossBrain'],
    });
    server = result.server;

    const res = await request(result.port, '/api/engines');
    expect(res.statusCode).toBe(200);
    expect(mockBroadcast).toHaveBeenCalledWith('consciousness.engines');
    const data = JSON.parse(res.body);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('brain');
  });

  it('GET /api/watchdog returns empty array when no watchdog', async () => {
    const result = await startServer({ watchdog: null });
    server = result.server;

    const res = await request(result.port, '/api/watchdog');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toEqual([]);
  });

  it('GET /api/watchdog returns daemon status when available', async () => {
    const mockWatchdog = {
      getStatus: vi.fn().mockReturnValue([
        { name: 'brain', pid: 1234, running: true, healthy: true, uptime: 5000, restarts: 0, lastCrash: null },
        { name: 'trading-brain', pid: 5678, running: true, healthy: false, uptime: 3000, restarts: 1, lastCrash: '2026-03-06T12:00:00Z' },
        { name: 'marketing-brain', pid: null, running: false, healthy: false, uptime: null, restarts: 3, lastCrash: '2026-03-06T11:00:00Z' },
      ]),
    };
    const result = await startServer({ watchdog: mockWatchdog as unknown as CommandCenterOptions['watchdog'] });
    server = result.server;

    const res = await request(result.port, '/api/watchdog');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toHaveLength(3);
    expect(data[0].name).toBe('brain');
    expect(data[0].running).toBe(true);
    expect(data[0].healthy).toBe(true);
    expect(data[1].healthy).toBe(false);
    expect(data[2].running).toBe(false);
    expect(data[2].pid).toBeNull();
  });

  it('GET /api/plugins returns empty array when no registry', async () => {
    const result = await startServer({ pluginRegistry: null });
    server = result.server;

    const res = await request(result.port, '/api/plugins');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual([]);
  });

  it('GET /api/plugins returns plugin list when available', async () => {
    const mockPlugins = {
      list: vi.fn().mockReturnValue([
        { name: 'test-plugin', version: '1.0.0', description: 'A test' },
      ]),
    };
    const result = await startServer({ pluginRegistry: mockPlugins as unknown as CommandCenterOptions['pluginRegistry'] });
    server = result.server;

    const res = await request(result.port, '/api/plugins');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe('test-plugin');
  });

  it('GET /api/borg returns not available when no borgSync', async () => {
    const result = await startServer({ borgSync: null });
    server = result.server;

    const res = await request(result.port, '/api/borg');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.available).toBe(false);
  });

  it('GET /api/borg returns borg status when available', async () => {
    const mockBorg = {
      getStatus: vi.fn().mockReturnValue({ enabled: true, mode: 'full', totalSyncs: 5 }),
      getConfig: vi.fn().mockReturnValue({ enabled: true, mode: 'full' }),
      getHistory: vi.fn().mockReturnValue([]),
    };
    const result = await startServer({ borgSync: mockBorg as unknown as CommandCenterOptions['borgSync'] });
    server = result.server;

    const res = await request(result.port, '/api/borg');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status.enabled).toBe(true);
    expect(data.config.mode).toBe('full');
  });

  it('GET /api/analytics returns aggregated analytics', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/analytics');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.brain).toEqual({ errors: 5, solutions: 3, modules: 10 });
  });

  it('POST /api/borg/toggle toggles borg sync', async () => {
    const mockBorg = {
      getStatus: vi.fn().mockReturnValue({ enabled: false }),
      getConfig: vi.fn().mockReturnValue({}),
      getHistory: vi.fn().mockReturnValue([]),
      setEnabled: vi.fn(),
    };
    const result = await startServer({ borgSync: mockBorg as unknown as CommandCenterOptions['borgSync'] });
    server = result.server;

    const res = await request(result.port, '/api/borg/toggle', 'POST', JSON.stringify({ enabled: true }));
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.toggled).toBe(true);
    expect(mockBorg.setEnabled).toHaveBeenCalledWith(true);
  });

  it('POST /api/borg/toggle returns 501 when no borgSync', async () => {
    const result = await startServer({ borgSync: null });
    server = result.server;

    const res = await request(result.port, '/api/borg/toggle', 'POST', JSON.stringify({ enabled: true }));
    expect(res.statusCode).toBe(501);
  });

  it('POST /api/borg/toggle returns 400 on invalid body', async () => {
    const mockBorg = {
      getStatus: vi.fn().mockReturnValue({ enabled: false }),
      getConfig: vi.fn().mockReturnValue({}),
      getHistory: vi.fn().mockReturnValue([]),
      setEnabled: vi.fn(),
    };
    const result = await startServer({ borgSync: mockBorg as unknown as CommandCenterOptions['borgSync'] });
    server = result.server;

    const res = await request(result.port, '/api/borg/toggle', 'POST', JSON.stringify({ foo: 'bar' }));
    expect(res.statusCode).toBe(400);
  });

  it('GET /events returns SSE stream', async () => {
    const result = await startServer();
    server = result.server;

    const sseData = await new Promise<string>((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: result.port, path: '/events' }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toBe('text/event-stream');
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          if (data.includes('event: connected')) {
            res.destroy();
            resolve(data);
          }
        });
      });
      req.on('error', (err) => {
        if (err.message.includes('socket hang up')) return;
        reject(err);
      });
      req.end();
    });

    expect(sseData).toContain('event: connected');
  });

  it('GET /nonexistent returns 404', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('Not Found');
  });

  it('OPTIONS returns 204 with CORS headers', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/', 'OPTIONS');
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('sets CORS headers on all responses', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/ecosystem');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('GET /api/llm returns LLM stats', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/llm');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.stats).toHaveProperty('totalCalls', 42);
    expect(data.history).toEqual([]);
  });

  it('GET /api/thoughts returns thought list', async () => {
    const mockThoughts = [{ id: '1', engine: 'learning', content: 'test', timestamp: Date.now(), significance: 'routine' }];
    const result = await startServer({
      thoughtStream: {
        onThought: vi.fn().mockReturnValue(() => {}),
        getRecent: vi.fn().mockReturnValue(mockThoughts),
        getByEngine: vi.fn().mockReturnValue(mockThoughts),
        getStats: vi.fn().mockReturnValue({ totalThoughts: 1 }),
      } as unknown as CommandCenterOptions['thoughtStream'],
    });
    server = result.server;

    const res = await request(result.port, '/api/thoughts');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toHaveLength(1);
    expect(data[0].engine).toBe('learning');
  });

  it('GET /api/thoughts?engine=x filters by engine', async () => {
    const mockThoughts = [{ id: '1', engine: 'hypothesis', content: 'test', timestamp: Date.now() }];
    const mockTS = {
      onThought: vi.fn().mockReturnValue(() => {}),
      getRecent: vi.fn().mockReturnValue([]),
      getByEngine: vi.fn().mockReturnValue(mockThoughts),
      getStats: vi.fn().mockReturnValue({ totalThoughts: 1 }),
    };
    const result = await startServer({ thoughtStream: mockTS as unknown as CommandCenterOptions['thoughtStream'] });
    server = result.server;

    const res = await request(result.port, '/api/thoughts?engine=hypothesis');
    expect(res.statusCode).toBe(200);
    expect(mockTS.getByEngine).toHaveBeenCalledWith('hypothesis', 50);
  });

  it('GET /api/state includes all data sources', async () => {
    const result = await startServer({
      getErrors: vi.fn().mockReturnValue({ errors: [{ message: 'test', timestamp: Date.now() }] }),
      getSelfModStatus: vi.fn().mockReturnValue({ totalModifications: 3, byStatus: { applied: 2, failed: 1 } }),
      getSelfModHistory: vi.fn().mockReturnValue([{ title: 'Fix bug', status: 'applied' }]),
      getMissions: vi.fn().mockReturnValue({ activeMissions: 1, completedMissions: 5, totalSources: 20 }),
      getMissionList: vi.fn().mockReturnValue([{ topic: 'AI research', status: 'gathering' }]),
      getKnowledgeStats: vi.fn().mockReturnValue({ totals: { principles: 10 }, timeSeries: [] }),
    });
    server = result.server;

    const res = await request(result.port, '/api/state');
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('llm');
    expect(data).toHaveProperty('thoughts');
    expect(data).toHaveProperty('errors');
    expect(data).toHaveProperty('selfmod');
    expect(data).toHaveProperty('missions');
    expect(data).toHaveProperty('knowledge');
    expect(data.llm.totalCalls).toBe(42);
    expect(data.errors.errors).toHaveLength(1);
    expect(data.selfmod.status.totalModifications).toBe(3);
    expect(data.missions.status.activeMissions).toBe(1);
    expect(data.knowledge.totals.principles).toBe(10);
  });

  // ── New endpoint tests ──────────────────────────────────

  it('GET /api/errors returns error data when available', async () => {
    const mockErrors = { errors: [{ message: 'Something broke', timestamp: Date.now(), resolved: false }] };
    const result = await startServer({ getErrors: vi.fn().mockReturnValue(mockErrors) });
    server = result.server;

    const res = await request(result.port, '/api/errors');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].message).toBe('Something broke');
  });

  it('GET /api/errors returns empty when no error source', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/errors');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('errors');
  });

  it('GET /api/selfmod returns self-modification status', async () => {
    const result = await startServer({
      getSelfModStatus: vi.fn().mockReturnValue({ totalModifications: 5, byStatus: { applied: 3, failed: 2 } }),
      getSelfModHistory: vi.fn().mockReturnValue([
        { title: 'Improve caching', status: 'applied', created_at: new Date().toISOString() },
      ]),
    });
    server = result.server;

    const res = await request(result.port, '/api/selfmod');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status.totalModifications).toBe(5);
    expect(data.history).toHaveLength(1);
    expect(data.history[0].title).toBe('Improve caching');
  });

  it('GET /api/selfmod returns empty when no selfmod', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/selfmod');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBeNull();
    expect(data.history).toEqual([]);
  });

  it('GET /api/missions returns mission status and list', async () => {
    const result = await startServer({
      getMissions: vi.fn().mockReturnValue({ activeMissions: 2, completedMissions: 10, totalSources: 50 }),
      getMissionList: vi.fn().mockReturnValue([
        { topic: 'Quantum computing', status: 'gathering', depth: 'deep', sourceCount: 5 },
      ]),
    });
    server = result.server;

    const res = await request(result.port, '/api/missions');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status.activeMissions).toBe(2);
    expect(data.list).toHaveLength(1);
    expect(data.list[0].topic).toBe('Quantum computing');
  });

  it('GET /api/missions returns empty when no mission engine', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/missions');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBeNull();
    expect(data.list).toEqual([]);
  });

  it('GET /api/knowledge returns knowledge stats', async () => {
    const result = await startServer({
      getKnowledgeStats: vi.fn().mockReturnValue({
        totals: { principles: 15, hypotheses: 30, experiments: 12, solutions: 8 },
        timeSeries: [{ date: '2026-03-01', errors: 5, solutions: 3 }],
      }),
    });
    server = result.server;

    const res = await request(result.port, '/api/knowledge');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.totals.principles).toBe(15);
    expect(data.timeSeries).toHaveLength(1);
  });

  it('GET /api/knowledge returns empty when no source', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/knowledge');
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data).toHaveProperty('timeSeries');
  });

  it('POST /api/action triggers an action', async () => {
    const mockTrigger = vi.fn().mockResolvedValue({ triggered: true });
    const result = await startServer({ triggerAction: mockTrigger });
    server = result.server;

    const res = await request(result.port, '/api/action', 'POST', JSON.stringify({ action: 'learning-cycle' }));
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.ok).toBe(true);
    expect(data.action).toBe('learning-cycle');
    expect(mockTrigger).toHaveBeenCalledWith('learning-cycle', undefined);
  });

  it('POST /api/action returns 501 when no triggerAction', async () => {
    const result = await startServer();
    server = result.server;

    const res = await request(result.port, '/api/action', 'POST', JSON.stringify({ action: 'test' }));
    expect(res.statusCode).toBe(501);
  });

  it('POST /api/action returns 400 on missing action', async () => {
    const mockTrigger = vi.fn().mockResolvedValue({});
    const result = await startServer({ triggerAction: mockTrigger });
    server = result.server;

    const res = await request(result.port, '/api/action', 'POST', JSON.stringify({ foo: 'bar' }));
    expect(res.statusCode).toBe(400);
  });

  it('stop() closes the server', async () => {
    const result = await startServer();
    server = result.server;

    const resBefore = await request(result.port, '/api/watchdog');
    expect(resBefore.statusCode).toBe(200);

    server.stop();
    server = null;

    await expect(request(result.port, '/')).rejects.toThrow();
  });

  // ─── Session 99: Forge API ─────────────────────────────

  it('GET /api/forge returns forge status data', async () => {
    const result = await startServer({
      getActionBridgeStatus: () => ({ queueSize: 3, executed24h: 12, successRate: 0.85, autoExecuteEnabled: true, topSources: [] }),
      getContentForgeStatus: () => ({ drafts: 5, scheduled: 2, published: 10, avgEngagement: 4.5 }),
      getStrategyForgeStatus: () => ({ active: 2, total: 8, avgPerformance: 0.65, topStrategy: 'btc-dca' }),
      getSignalRouterStatus: () => ({ totalSignals: 15, byType: [{ signalType: 'trade_signal', count: 10 }], handlerCount: 2 }),
    });

    const res = await request(result.port, '/api/forge');
    expect(res.statusCode).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.actionBridge.queueSize).toBe(3);
    expect(data.contentForge.published).toBe(10);
    expect(data.strategyForge.topStrategy).toBe('btc-dca');
    expect(data.signalRouter.totalSignals).toBe(15);
  });

  it('GET /api/forge returns nulls when no getters provided', async () => {
    const result = await startServer({});

    const res = await request(result.port, '/api/forge');
    expect(res.statusCode).toBe(200);

    const data = JSON.parse(res.body);
    expect(data.actionBridge).toBeNull();
    expect(data.contentForge).toBeNull();
    expect(data.strategyForge).toBeNull();
    expect(data.signalRouter).toBeNull();
  });

  it('returns 404 for unknown routes', async () => {
    const result = await startServer({});
    const res = await request(result.port, '/api/nonexistent');
    expect(res.statusCode).toBe(404);
  });
});
