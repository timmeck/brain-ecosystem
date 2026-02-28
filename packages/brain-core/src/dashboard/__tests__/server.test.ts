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

import { DashboardServer } from '../server.js';

/** Helper: make an HTTP request and return { statusCode, headers, body }. */
function request(
  port: number,
  path: string,
  method: string = 'GET',
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Start a DashboardServer on a random port and return { server, port }. */
function startServer(
  overrides: Partial<{
    getDashboardHtml: () => string;
    getStats: () => unknown;
  }> = {},
): Promise<{ dashboard: DashboardServer; port: number }> {
  return new Promise((resolve) => {
    const dashboard = new DashboardServer({
      port: 0,
      getDashboardHtml: overrides.getDashboardHtml ?? (() => '<html><body></body></html>'),
      getStats: overrides.getStats ?? (() => ({ memories: 42, uptime: 100 })),
    });

    dashboard.start();

    // Access the underlying server to get the assigned port
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internal = (dashboard as any).server as http.Server;
    internal.on('listening', () => {
      const addr = internal.address() as { port: number };
      resolve({ dashboard, port: addr.port });
    });
  });
}

describe('DashboardServer', () => {
  let dashboard: DashboardServer | null = null;

  afterEach(() => {
    dashboard?.stop();
    dashboard = null;
  });

  it('GET / returns HTML with SSE script injected', async () => {
    const result = await startServer({
      getDashboardHtml: () => '<html><body><h1>Dashboard</h1></body></html>',
    });
    dashboard = result.dashboard;

    const res = await request(result.port, '/');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('EventSource');
    expect(res.body).toContain('<h1>Dashboard</h1>');
  });

  it('GET /api/stats returns JSON from getStats callback', async () => {
    const stats = { totalMemories: 99, activeSynapses: 12 };
    const result = await startServer({ getStats: () => stats });
    dashboard = result.dashboard;

    const res = await request(result.port, '/api/stats');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(JSON.parse(res.body)).toEqual(stats);
  });

  it('GET /nonexistent returns 404', async () => {
    const result = await startServer();
    dashboard = result.dashboard;

    const res = await request(result.port, '/nonexistent');
    expect(res.statusCode).toBe(404);
    expect(res.body).toBe('Not Found');
  });

  it('OPTIONS returns 204 with CORS headers', async () => {
    const result = await startServer();
    dashboard = result.dashboard;

    const res = await request(result.port, '/', 'OPTIONS');
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('stop() closes the server', async () => {
    const result = await startServer();
    dashboard = result.dashboard;

    // Verify server responds before stop
    const resBefore = await request(result.port, '/api/stats');
    expect(resBefore.statusCode).toBe(200);

    dashboard.stop();
    dashboard = null;

    // After stop, connection should be refused
    await expect(request(result.port, '/')).rejects.toThrow();
  });

  it('sets CORS headers on all responses', async () => {
    const result = await startServer();
    dashboard = result.dashboard;

    const resRoot = await request(result.port, '/');
    expect(resRoot.headers['access-control-allow-origin']).toBe('*');

    const resStats = await request(result.port, '/api/stats');
    expect(resStats.headers['access-control-allow-origin']).toBe('*');

    const res404 = await request(result.port, '/nope');
    expect(res404.headers['access-control-allow-origin']).toBe('*');
  });
});
