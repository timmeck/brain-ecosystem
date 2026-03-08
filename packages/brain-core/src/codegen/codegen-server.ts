import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { CodeGenerator } from './code-generator.js';
import type { CodeMiner } from './code-miner.js';
import type { PatternExtractor } from './pattern-extractor.js';
import type { SelfModificationEngine } from '../self-modification/self-modification-engine.js';

// ── Types ────────────────────────────────────────────────

export interface CodegenServerOptions {
  port: number;
  codeGenerator: CodeGenerator;
  codeMiner?: CodeMiner | null;
  patternExtractor?: PatternExtractor | null;
  selfModificationEngine?: SelfModificationEngine | null;
}

// ── Server ───────────────────────────────────────────────

export class CodegenServer {
  private server: http.Server | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private dashboardHtml: string | null = null;
  private logger = getLogger();

  constructor(private options: CodegenServerOptions) {}

  start(): void {
    const { port } = this.options;

    // Load dashboard HTML
    const htmlPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
      '../../codegen-dashboard.html',
    );
    try {
      this.dashboardHtml = fs.readFileSync(htmlPath, 'utf-8');
    } catch {
      this.dashboardHtml = '<html><body><h1>CodeGen Dashboard HTML not found</h1></body></html>';
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

      // Dashboard
      if (url.pathname === '/' || url.pathname === '/dashboard') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.dashboardHtml);
        return;
      }

      // Full state snapshot
      if (url.pathname === '/api/state' && req.method === 'GET') {
        this.handleGetState(res);
        return;
      }

      // Generate code
      if (url.pathname === '/api/generate' && req.method === 'POST') {
        this.handleGenerate(req, res);
        return;
      }

      // Approve generation
      const approveMatch = url.pathname.match(/^\/api\/approve\/(\d+)$/);
      if (approveMatch && req.method === 'POST') {
        this.handleReview(req, res, Number(approveMatch[1]), 'approve');
        return;
      }

      // Reject generation
      const rejectMatch = url.pathname.match(/^\/api\/reject\/(\d+)$/);
      if (rejectMatch && req.method === 'POST') {
        this.handleReview(req, res, Number(rejectMatch[1]), 'reject');
        return;
      }

      // ─── Self-Modification Routes ────────────────────
      if (url.pathname === '/api/selfmod/list' && req.method === 'GET') {
        this.handleSelfmodList(res);
        return;
      }

      const selfmodGetMatch = url.pathname.match(/^\/api\/selfmod\/(\d+)$/);
      if (selfmodGetMatch && req.method === 'GET') {
        this.handleSelfmodGet(res, Number(selfmodGetMatch[1]));
        return;
      }

      const selfmodApproveMatch = url.pathname.match(/^\/api\/selfmod\/(\d+)\/approve$/);
      if (selfmodApproveMatch && req.method === 'POST') {
        this.handleSelfmodAction(res, Number(selfmodApproveMatch[1]), 'approve');
        return;
      }

      const selfmodRejectMatch = url.pathname.match(/^\/api\/selfmod\/(\d+)\/reject$/);
      if (selfmodRejectMatch && req.method === 'POST') {
        this.handleSelfmodAction(res, Number(selfmodRejectMatch[1]), 'reject');
        return;
      }

      const selfmodTestMatch = url.pathname.match(/^\/api\/selfmod\/(\d+)\/test$/);
      if (selfmodTestMatch && req.method === 'POST') {
        this.handleSelfmodAction(res, Number(selfmodTestMatch[1]), 'test');
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

    // Heartbeat every 30s
    this.heartbeatTimer = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcast('heartbeat', { time: Date.now() });
      }
    }, 30_000);

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.logger.warn(`CodeGen dashboard port ${port} already in use — skipping`);
        this.server?.close();
        this.server = null;
      } else {
        this.logger.error(`CodeGen dashboard error: ${err.message}`);
      }
    });

    this.server.listen(port, () => {
      this.logger.info(`CodeGen dashboard started on http://localhost:${port}`);
    });
  }

  stop(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }

    for (const client of this.clients) {
      try { client.end(); } catch { /* ignore */ }
    }
    this.clients.clear();

    this.server?.close();
    this.server = null;
    this.logger.info('CodeGen dashboard stopped');
  }

  getClientCount(): number {
    return this.clients.size;
  }

  /** Broadcast an SSE event to all connected clients. */
  broadcast(event: string, data: unknown): void {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(msg);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  // ── Route Handlers ──────────────────────────────────────

  private handleGetState(res: http.ServerResponse): void {
    const { codeGenerator, codeMiner, patternExtractor, selfModificationEngine } = this.options;
    try {
      const state = {
        summary: codeGenerator.getSummary(),
        generations: codeGenerator.list(undefined, 50),
        pending: codeGenerator.list('generated', 50),
        minerSummary: codeMiner?.getSummary() ?? null,
        patterns: patternExtractor ? {
          dependencies: patternExtractor.getPatterns('dependency', 20),
          tech_stacks: patternExtractor.getPatterns('tech_stack', 10),
          structures: patternExtractor.getPatterns('structure', 20),
          readme: patternExtractor.getPatterns('readme', 15),
        } : null,
        selfmod: selfModificationEngine ? {
          status: selfModificationEngine.getStatus(),
          pending: selfModificationEngine.getPending(),
          history: selfModificationEngine.getHistory(20),
        } : null,
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  private handleGenerate(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { task, language } = JSON.parse(body) as { task?: string; language?: string };
        if (!task || task.trim().length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'task is required' }));
          return;
        }

        // Fire and forget — generation is async
        this.options.codeGenerator.generate({
          task: task.trim(),
          language: language ?? 'typescript',
          trigger: 'manual',
        }).then((result) => {
          this.broadcast('codegen:generated', result);
        }).catch((err: Error) => {
          this.broadcast('codegen:error', { error: err.message });
        });

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ accepted: true, task: task.trim() }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
  }

  private handleReview(req: http.IncomingMessage, res: http.ServerResponse, id: number, action: 'approve' | 'reject'): void {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { notes } = body ? JSON.parse(body) as { notes?: string } : { notes: undefined };
        const result = action === 'approve'
          ? this.options.codeGenerator.approve(id, notes)
          : this.options.codeGenerator.reject(id, notes);

        if (!result) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Generation #${id} not found or not reviewable` }));
          return;
        }

        this.broadcast(action === 'approve' ? 'codegen:approved' : 'codegen:rejected', result);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
  }

  // ─── Self-Modification Handlers ──────────────────────

  private handleSelfmodList(res: http.ServerResponse): void {
    const engine = this.options.selfModificationEngine;
    if (!engine) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SelfModificationEngine not available' }));
      return;
    }
    try {
      const data = {
        status: engine.getStatus(),
        pending: engine.getPending(),
        history: engine.getHistory(50),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  private handleSelfmodGet(res: http.ServerResponse, id: number): void {
    const engine = this.options.selfModificationEngine;
    if (!engine) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SelfModificationEngine not available' }));
      return;
    }
    try {
      const mod = engine.getModification(id);
      if (!mod) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Modification #${id} not found` }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mod));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  private async handleSelfmodAction(res: http.ServerResponse, id: number, action: 'approve' | 'reject' | 'test'): Promise<void> {
    const engine = this.options.selfModificationEngine;
    if (!engine) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'SelfModificationEngine not available' }));
      return;
    }
    try {
      let result;
      switch (action) {
        case 'approve':
          result = engine.approveModification(id);
          this.broadcast('selfmod:approved', result);
          break;
        case 'reject':
          result = engine.rejectModification(id);
          this.broadcast('selfmod:rejected', result);
          break;
        case 'test':
          result = await engine.testModification(id);
          this.broadcast(result.test_result === 'passed' ? 'selfmod:ready' : 'selfmod:failed', result);
          break;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }
}
