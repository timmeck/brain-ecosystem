import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { CodeGenerator } from '../codegen/code-generator.js';
import type { CodeMiner } from '../codegen/code-miner.js';
import type { PatternExtractor } from '../codegen/pattern-extractor.js';
import type { SelfModificationEngine } from '../self-modification/self-modification-engine.js';

// ── Types ────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'brain';
  content: string;
  timestamp: number;
  details?: unknown;
}

export interface UnifiedDashboardOptions {
  port: number;
  thoughtStream: ThoughtStream;
  getOverview: () => unknown;
  getTransferStatus: () => unknown;
  getAttentionStatus: () => unknown;
  getNotifications: () => unknown[];
  onTriggerFeedback?: () => void;
  // Neural Graph
  getNetworkState?: () => unknown;
  getEngineStatus?: () => unknown;
  // CodeGen
  codeGenerator?: CodeGenerator | null;
  codeMiner?: CodeMiner | null;
  patternExtractor?: PatternExtractor | null;
  // Self-Modification
  selfModificationEngine?: SelfModificationEngine | null;
  // Emotional (for Entity visualization)
  getEmotionalStatus?: () => unknown;
  // Chat — Brain answers via NarrativeEngine
  onChat?: (question: string) => ChatMessage;
  // Ingest — Feed data into Brain (observations + journal)
  onIngest?: (content: string, source: string) => { stored: boolean; items: number };
  // LLM Service stats
  getLLMStats?: () => unknown;
  getLLMHistory?: (hours: number) => unknown;
  getLLMByTemplate?: () => unknown;
}

// ── Server ───────────────────────────────────────────────

export class UnifiedDashboardServer {
  private server: http.Server | null = null;
  private clients: Set<http.ServerResponse> = new Set();
  private unsubscribe: (() => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private networkTimer: ReturnType<typeof setInterval> | null = null;
  private dashboardHtml: string | null = null;
  private chatHistory: ChatMessage[] = [];
  private logger = getLogger();

  constructor(private options: UnifiedDashboardOptions) {}

  start(): void {
    const { port, thoughtStream } = this.options;

    // Load dashboard HTML
    const htmlPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
      '../../unified-dashboard.html',
    );
    try {
      this.dashboardHtml = fs.readFileSync(htmlPath, 'utf-8');
    } catch {
      this.dashboardHtml = '<html><body><h1>Unified Dashboard HTML not found</h1></body></html>';
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
      if (url.pathname === '/api/state') {
        try {
          const state = {
            overview: this.options.getOverview(),
            transfer: this.options.getTransferStatus(),
            attention: this.options.getAttentionStatus(),
            thoughts: thoughtStream.getRecent(200),
            engines: thoughtStream.getEngineActivity(),
            stats: thoughtStream.getStats(),
            notifications: this.options.getNotifications(),
          };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(state));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (err as Error).message }));
        }
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

      // ── Neural Graph ──────────────────────────────────
      if (url.pathname === '/api/network' && req.method === 'GET') {
        this.handleNetwork(res);
        return;
      }

      // ── Emotional (Entity) ──────────────────────────────
      if (url.pathname === '/api/emotional' && req.method === 'GET') {
        const data = this.options.getEmotionalStatus?.() ?? { mood: 'reflective', score: 0.5, dimensions: {} };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
        return;
      }

      // ── CodeGen Routes ────────────────────────────────
      if (url.pathname === '/api/codegen/state' && req.method === 'GET') {
        this.handleCodegenState(res);
        return;
      }

      if (url.pathname === '/api/codegen/generate' && req.method === 'POST') {
        this.handleCodegenGenerate(req, res);
        return;
      }

      const codegenApproveMatch = url.pathname.match(/^\/api\/codegen\/approve\/(\d+)$/);
      if (codegenApproveMatch && req.method === 'POST') {
        this.handleCodegenReview(req, res, Number(codegenApproveMatch[1]), 'approve');
        return;
      }

      const codegenRejectMatch = url.pathname.match(/^\/api\/codegen\/reject\/(\d+)$/);
      if (codegenRejectMatch && req.method === 'POST') {
        this.handleCodegenReview(req, res, Number(codegenRejectMatch[1]), 'reject');
        return;
      }

      // ── Self-Modification Routes ──────────────────────
      if (url.pathname === '/api/selfmod/list' && req.method === 'GET') {
        this.handleSelfmodList(res);
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

      // ── Chat Route ────────────────────────────────────
      if (url.pathname === '/api/chat' && req.method === 'POST') {
        this.handleChat(req, res);
        return;
      }

      // ── Chat History ───────────────────────────────────
      if (url.pathname === '/api/chat/history' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.chatHistory.slice(-100)));
        return;
      }

      // ── Ingest (File Upload) ───────────────────────────
      if (url.pathname === '/api/ingest' && req.method === 'POST') {
        this.handleIngest(req, res);
        return;
      }

      // ── LLM Stats Route ────────────────────────────────
      if (url.pathname === '/api/llm/stats' && req.method === 'GET') {
        this.handleLlmStats(res);
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

    // Status snapshot every 10s
    this.statusTimer = setInterval(() => {
      if (this.clients.size > 0) {
        try {
          this.broadcast('status', {
            overview: this.options.getOverview(),
            engines: thoughtStream.getEngineActivity(),
            stats: thoughtStream.getStats(),
          });
        } catch { /* ignore errors during broadcast */ }
      }
    }, 10_000);

    // Network state every 10s (for Neural Graph)
    this.networkTimer = setInterval(() => {
      if (this.clients.size > 0 && this.options.getNetworkState) {
        try {
          this.broadcast('network', this.options.getNetworkState());
        } catch { /* ignore */ }
      }
    }, 10_000);

    // Heartbeat every 30s
    this.heartbeatTimer = setInterval(() => {
      if (this.clients.size > 0) {
        this.broadcast('heartbeat', { time: Date.now() });
      }
    }, 30_000);

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        this.logger.warn(`Unified dashboard port ${port} already in use — skipping`);
        this.server?.close();
        this.server = null;
      } else {
        this.logger.error(`Unified dashboard error: ${err.message}`);
      }
    });

    this.server.listen(port, () => {
      this.logger.info(`Unified dashboard started on http://localhost:${port}`);
    });
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (this.statusTimer) { clearInterval(this.statusTimer); this.statusTimer = null; }
    if (this.networkTimer) { clearInterval(this.networkTimer); this.networkTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }

    for (const client of this.clients) {
      try { client.end(); } catch { /* ignore */ }
    }
    this.clients.clear();

    this.server?.close();
    this.server = null;
    this.logger.info('Unified dashboard stopped');
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

  // ── Route Handlers ──────────────────────────────────────

  private handleNetwork(res: http.ServerResponse): void {
    if (!this.options.getNetworkState) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ nodes: [], edges: [] }));
      return;
    }
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.options.getNetworkState()));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  private handleCodegenState(res: http.ServerResponse): void {
    const { codeGenerator, codeMiner, patternExtractor, selfModificationEngine } = this.options;
    if (!codeGenerator) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ available: false }));
      return;
    }
    try {
      const state = {
        available: true,
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

  private handleCodegenGenerate(req: http.IncomingMessage, res: http.ServerResponse): void {
    const codeGenerator = this.options.codeGenerator;
    if (!codeGenerator) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CodeGenerator not available' }));
      return;
    }
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
        codeGenerator.generate({
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

  private handleCodegenReview(req: http.IncomingMessage, res: http.ServerResponse, id: number, action: 'approve' | 'reject'): void {
    const codeGenerator = this.options.codeGenerator;
    if (!codeGenerator) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'CodeGenerator not available' }));
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { notes } = body ? JSON.parse(body) as { notes?: string } : { notes: undefined };
        const result = action === 'approve'
          ? codeGenerator.approve(id, notes)
          : codeGenerator.reject(id, notes);
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

  private handleSelfmodList(res: http.ServerResponse): void {
    const engine = this.options.selfModificationEngine;
    if (!engine) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ available: false }));
      return;
    }
    try {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        available: true,
        status: engine.getStatus(),
        pending: engine.getPending(),
        history: engine.getHistory(50),
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  }

  private handleChat(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.options.onChat) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Chat not configured — NarrativeEngine not available' }));
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { message } = JSON.parse(body) as { message?: string };
        if (!message || message.trim().length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'message is required' }));
          return;
        }
        // Store user message
        const userMsg: ChatMessage = { role: 'user', content: message.trim(), timestamp: Date.now() };
        this.chatHistory.push(userMsg);
        if (this.chatHistory.length > 200) this.chatHistory.splice(0, this.chatHistory.length - 200);

        const answer = this.options.onChat!(message.trim());
        this.chatHistory.push(answer);
        this.broadcast('chat', answer);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(answer));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
  }

  private handleIngest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (!this.options.onIngest) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Ingest not configured' }));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    const MAX_SIZE = 1_000_000; // 1MB limit
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_SIZE) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_SIZE) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File too large (max 1MB)' }));
        return;
      }
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        const { content, source, filename } = JSON.parse(raw) as { content?: string; source?: string; filename?: string };
        if (!content || content.trim().length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'content is required' }));
          return;
        }
        const label = source || filename || 'file_upload';
        const result = this.options.onIngest!(content.trim(), label);

        // Broadcast as chat message
        const ingestMsg: ChatMessage = {
          role: 'brain',
          content: `Ingested "${label}": stored ${result.items} data points. This knowledge is now part of my research.`,
          timestamp: Date.now(),
          details: result,
        };
        this.chatHistory.push(ingestMsg);
        this.broadcast('chat', ingestMsg);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
    });
  }

  private handleLlmStats(res: http.ServerResponse): void {
    if (!this.options.getLLMStats) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ available: false }));
      return;
    }
    try {
      const data = {
        available: true,
        stats: this.options.getLLMStats(),
        history: this.options.getLLMHistory?.(24) ?? [],
        byTemplate: this.options.getLLMByTemplate?.() ?? [],
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
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
