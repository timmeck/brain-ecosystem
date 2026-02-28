import { BaseApiServer, type RouteDefinition, type ApiServerOptions } from '@timmeck/brain-core';
import { getEventBus } from '../utils/events.js';

export type { ApiServerOptions };

export class ApiServer extends BaseApiServer {
  private statsTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    super.start();
    this.setupSSE();
  }

  stop(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    super.stop();
  }

  protected buildRoutes(): RouteDefinition[] {
    return [
      // ─── Errors ────────────────────────────────────────────
      { method: 'POST', pattern: /^\/api\/v1\/errors$/, ipcMethod: 'error.report',
        extractParams: (_m, _q, body) => body },
      { method: 'GET', pattern: /^\/api\/v1\/errors$/, ipcMethod: 'error.query',
        extractParams: (_m, q) => ({
          search: q.get('search') ?? '',
          projectId: q.get('projectId') ? Number(q.get('projectId')) : undefined,
        }) },
      { method: 'GET', pattern: /^\/api\/v1\/errors\/(\d+)$/, ipcMethod: 'error.get',
        extractParams: (m) => ({ id: Number(m[1]) }) },
      { method: 'GET', pattern: /^\/api\/v1\/errors\/(\d+)\/match$/, ipcMethod: 'error.match',
        extractParams: (m) => ({ errorId: Number(m[1]) }) },
      { method: 'GET', pattern: /^\/api\/v1\/errors\/(\d+)\/chain$/, ipcMethod: 'error.chain',
        extractParams: (m) => ({ errorId: Number(m[1]) }) },
      { method: 'POST', pattern: /^\/api\/v1\/errors\/(\d+)\/resolve$/, ipcMethod: 'error.resolve',
        extractParams: (m, _q, body) => ({ errorId: Number(m[1]), ...(body as object) }) },

      // ─── Solutions ─────────────────────────────────────────
      { method: 'POST', pattern: /^\/api\/v1\/solutions$/, ipcMethod: 'solution.report',
        extractParams: (_m, _q, body) => body },
      { method: 'GET', pattern: /^\/api\/v1\/solutions$/, ipcMethod: 'solution.query',
        extractParams: (_m, q) => ({
          errorId: q.get('errorId') ? Number(q.get('errorId')) : undefined,
        }) },
      { method: 'POST', pattern: /^\/api\/v1\/solutions\/rate$/, ipcMethod: 'solution.rate',
        extractParams: (_m, _q, body) => body },
      { method: 'GET', pattern: /^\/api\/v1\/solutions\/efficiency$/, ipcMethod: 'solution.efficiency',
        extractParams: () => ({}) },

      // ─── Projects ──────────────────────────────────────────
      { method: 'GET', pattern: /^\/api\/v1\/projects$/, ipcMethod: 'project.list',
        extractParams: () => ({}) },

      // ─── Code ──────────────────────────────────────────────
      { method: 'POST', pattern: /^\/api\/v1\/code\/analyze$/, ipcMethod: 'code.analyze',
        extractParams: (_m, _q, body) => body },
      { method: 'POST', pattern: /^\/api\/v1\/code\/find$/, ipcMethod: 'code.find',
        extractParams: (_m, _q, body) => body },
      { method: 'POST', pattern: /^\/api\/v1\/code\/similarity$/, ipcMethod: 'code.similarity',
        extractParams: (_m, _q, body) => body },
      { method: 'GET', pattern: /^\/api\/v1\/code\/modules$/, ipcMethod: 'code.modules',
        extractParams: (_m, q) => ({
          projectId: q.get('projectId') ? Number(q.get('projectId')) : undefined,
          language: q.get('language') ?? undefined,
          limit: q.get('limit') ? Number(q.get('limit')) : undefined,
        }) },
      { method: 'GET', pattern: /^\/api\/v1\/code\/(\d+)$/, ipcMethod: 'code.get',
        extractParams: (m) => ({ id: Number(m[1]) }) },

      // ─── Prevention ────────────────────────────────────────
      { method: 'POST', pattern: /^\/api\/v1\/prevention\/check$/, ipcMethod: 'prevention.check',
        extractParams: (_m, _q, body) => body },
      { method: 'POST', pattern: /^\/api\/v1\/prevention\/antipatterns$/, ipcMethod: 'prevention.antipatterns',
        extractParams: (_m, _q, body) => body },
      { method: 'POST', pattern: /^\/api\/v1\/prevention\/code$/, ipcMethod: 'prevention.checkCode',
        extractParams: (_m, _q, body) => body },

      // ─── Synapses ─────────────────────────────────────────
      { method: 'GET', pattern: /^\/api\/v1\/synapses\/context\/(\d+)$/, ipcMethod: 'synapse.context',
        extractParams: (m) => ({ errorId: Number(m[1]) }) },
      { method: 'POST', pattern: /^\/api\/v1\/synapses\/path$/, ipcMethod: 'synapse.path',
        extractParams: (_m, _q, body) => body },
      { method: 'POST', pattern: /^\/api\/v1\/synapses\/related$/, ipcMethod: 'synapse.related',
        extractParams: (_m, _q, body) => body },
      { method: 'GET', pattern: /^\/api\/v1\/synapses\/stats$/, ipcMethod: 'synapse.stats',
        extractParams: () => ({}) },

      // ─── Research ──────────────────────────────────────────
      { method: 'GET', pattern: /^\/api\/v1\/research\/insights$/, ipcMethod: 'research.insights',
        extractParams: (_m, q) => ({
          type: q.get('type') ?? undefined,
          limit: q.get('limit') ? Number(q.get('limit')) : 20,
          activeOnly: q.get('activeOnly') !== 'false',
        }) },
      { method: 'POST', pattern: /^\/api\/v1\/research\/insights\/(\d+)\/rate$/, ipcMethod: 'insight.rate',
        extractParams: (m, _q, body) => ({ id: Number(m[1]), ...(body as object) }) },
      { method: 'GET', pattern: /^\/api\/v1\/research\/suggest$/, ipcMethod: 'research.suggest',
        extractParams: (_m, q) => ({
          context: q.get('context') ?? '',
          limit: 10,
          activeOnly: true,
        }) },
      { method: 'GET', pattern: /^\/api\/v1\/research\/trends$/, ipcMethod: 'research.trends',
        extractParams: (_m, q) => ({
          projectId: q.get('projectId') ? Number(q.get('projectId')) : undefined,
          windowDays: q.get('windowDays') ? Number(q.get('windowDays')) : undefined,
        }) },

      // ─── Notifications ────────────────────────────────────
      { method: 'GET', pattern: /^\/api\/v1\/notifications$/, ipcMethod: 'notification.list',
        extractParams: (_m, q) => ({
          projectId: q.get('projectId') ? Number(q.get('projectId')) : undefined,
        }) },
      { method: 'POST', pattern: /^\/api\/v1\/notifications\/(\d+)\/ack$/, ipcMethod: 'notification.ack',
        extractParams: (m) => ({ id: Number(m[1]) }) },

      // ─── Analytics ─────────────────────────────────────────
      { method: 'GET', pattern: /^\/api\/v1\/analytics\/summary$/, ipcMethod: 'analytics.summary',
        extractParams: (_m, q) => ({
          projectId: q.get('projectId') ? Number(q.get('projectId')) : undefined,
        }) },
      { method: 'GET', pattern: /^\/api\/v1\/analytics\/network$/, ipcMethod: 'analytics.network',
        extractParams: (_m, q) => ({
          limit: q.get('limit') ? Number(q.get('limit')) : undefined,
        }) },
      { method: 'GET', pattern: /^\/api\/v1\/analytics\/health$/, ipcMethod: 'analytics.health',
        extractParams: (_m, q) => ({
          projectId: q.get('projectId') ? Number(q.get('projectId')) : undefined,
        }) },
      { method: 'GET', pattern: /^\/api\/v1\/analytics\/timeline$/, ipcMethod: 'analytics.timeline',
        extractParams: (_m, q) => ({
          projectId: q.get('projectId') ? Number(q.get('projectId')) : undefined,
          days: q.get('days') ? Number(q.get('days')) : undefined,
        }) },
      { method: 'GET', pattern: /^\/api\/v1\/analytics\/explain\/(\d+)$/, ipcMethod: 'analytics.explain',
        extractParams: (m) => ({ errorId: Number(m[1]) }) },

      // ─── Git ───────────────────────────────────────────────
      { method: 'GET', pattern: /^\/api\/v1\/git\/context$/, ipcMethod: 'git.context',
        extractParams: (_m, q) => ({ cwd: q.get('cwd') ?? undefined }) },
      { method: 'POST', pattern: /^\/api\/v1\/git\/link-error$/, ipcMethod: 'git.linkError',
        extractParams: (_m, _q, body) => body },
      { method: 'GET', pattern: /^\/api\/v1\/git\/errors\/(\d+)\/commits$/, ipcMethod: 'git.errorCommits',
        extractParams: (m) => ({ errorId: Number(m[1]) }) },
      { method: 'GET', pattern: /^\/api\/v1\/git\/commits\/([a-f0-9]+)\/errors$/, ipcMethod: 'git.commitErrors',
        extractParams: (m) => ({ commitHash: m[1] }) },
      { method: 'GET', pattern: /^\/api\/v1\/git\/diff$/, ipcMethod: 'git.diff',
        extractParams: (_m, q) => ({ cwd: q.get('cwd') ?? undefined }) },

      // ─── Terminal ──────────────────────────────────────────
      { method: 'POST', pattern: /^\/api\/v1\/terminal\/register$/, ipcMethod: 'terminal.register',
        extractParams: (_m, _q, body) => body },
      { method: 'POST', pattern: /^\/api\/v1\/terminal\/heartbeat$/, ipcMethod: 'terminal.heartbeat',
        extractParams: (_m, _q, body) => body },
      { method: 'POST', pattern: /^\/api\/v1\/terminal\/disconnect$/, ipcMethod: 'terminal.disconnect',
        extractParams: (_m, _q, body) => body },

      // ─── Learning ──────────────────────────────────────────
      { method: 'POST', pattern: /^\/api\/v1\/learning\/run$/, ipcMethod: 'learning.run',
        extractParams: () => ({}) },
    ];
  }

  private setupSSE(): void {
    const bus = getEventBus();
    const eventNames = [
      'error:reported', 'error:resolved', 'solution:applied',
      'solution:created', 'module:registered', 'module:updated',
      'synapse:created', 'synapse:strengthened',
      'insight:created', 'rule:learned',
    ] as const;

    for (const eventName of eventNames) {
      bus.on(eventName, (data: unknown) => {
        this.broadcastSSE({ type: 'event', event: eventName, data });
      });
    }

    // Periodic stats broadcast every 30s
    this.statsTimer = setInterval(() => {
      if (this.sseClients.size > 0) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const summary = this.options.router.handle('analytics.summary', {}) as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const network = this.options.router.handle('synapse.stats', {}) as any;
          const stats = {
            modules: summary?.modules?.total ?? 0,
            synapses: network?.totalSynapses ?? 0,
            errors: summary?.errors?.total ?? 0,
            solutions: summary?.solutions?.total ?? 0,
            rules: summary?.rules?.active ?? 0,
            insights: summary?.insights?.total ?? 0,
          };
          this.broadcastSSE({ type: 'stats_update', stats });
        } catch { /* ignore stats errors */ }
      }
    }, 30_000);
  }
}
