import http from 'node:http';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

export interface DashboardServerOptions {
  port: number;
  getDashboardHtml: () => string;
  getStats: () => unknown;
}

export class DashboardServer {
  private server: http.Server | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private logger = getLogger();

  constructor(private options: DashboardServerOptions) {}

  start(): void {
    const { port, getDashboardHtml, getStats } = this.options;
    const bus = getEventBus();

    this.server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${port}`);

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      if (url.pathname === '/events') {
        // SSE endpoint
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write('data: {"type":"connected"}\n\n');

        this.clients.add(res);
        req.on('close', () => this.clients.delete(res));
        return;
      }

      if (url.pathname === '/api/stats') {
        const stats = getStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
        return;
      }

      if (url.pathname === '/' || url.pathname === '/dashboard') {
        const html = getDashboardHtml();
        // Inject SSE script into the dashboard
        const sseScript = `
<script>
(function(){
  const evtSource = new EventSource('/events');
  evtSource.onmessage = function(e) {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'stats_update') {
        document.querySelectorAll('.stat-number').forEach(el => {
          const key = el.parentElement?.querySelector('.stat-label')?.textContent?.toLowerCase();
          if (key && data.stats[key] !== undefined) {
            el.textContent = Number(data.stats[key]).toLocaleString();
          }
        });
      }
      if (data.type === 'event') {
        const dot = document.querySelector('.activity-dot');
        if (dot) { dot.style.background = '#ff5577'; setTimeout(() => dot.style.background = '', 500); }
      }
    } catch {}
  };
  evtSource.onerror = function() { setTimeout(() => location.reload(), 5000); };
})();
</script>`;
        const liveHtml = html.replace('</body>', sseScript + '</body>');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(liveHtml);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    // Forward Marketing Brain events to SSE clients
    const eventNames = [
      'post:created', 'post:published', 'engagement:updated',
      'strategy:reported', 'rule:learned', 'rule:triggered',
      'template:created', 'campaign:created',
      'insight:created', 'synapse:created', 'synapse:strengthened',
    ] as const;

    for (const eventName of eventNames) {
      bus.on(eventName, (data: unknown) => {
        this.broadcast({ type: 'event', event: eventName, data });
      });
    }

    // Periodic stats broadcast (every 30s)
    setInterval(() => {
      if (this.clients.size > 0) {
        const stats = getStats();
        this.broadcast({ type: 'stats_update', stats });
      }
    }, 30_000);

    this.server.listen(port, () => {
      this.logger.info(`Dashboard server started on http://localhost:${port}`);
    });
  }

  stop(): void {
    for (const client of this.clients) {
      client.end();
    }
    this.clients.clear();
    this.server?.close();
    this.server = null;
    this.logger.info('Dashboard server stopped');
  }

  private broadcast(data: unknown): void {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(msg);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}
