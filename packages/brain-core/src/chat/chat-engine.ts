import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import { MultiBrainRouter, type AggregatedResponse } from './multi-brain-router.js';

// ── Types ──────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: string;
  timestamp: number;
}

export interface ChatEngineConfig {
  brainName: string;
  maxHistoryPerSession?: number;
}

export interface ChatEngineStatus {
  sessions: number;
  totalMessages: number;
  routesAvailable: number;
}

type IpcHandler = (method: string, params?: unknown) => unknown | Promise<unknown>;

// ── Migration ──────────────────────────────────────────────

export function runChatMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp);
  `);
}

// ── Engine ──────────────────────────────────────────────────

const log = getLogger();

/**
 * ChatEngine — processes natural language messages and routes them to IPC endpoints.
 * Uses simple keyword matching for NLU (LLM-powered NLU is optional enhancement).
 */
export class ChatEngine {
  private readonly db: Database.Database;
  private readonly config: Required<ChatEngineConfig>;
  private ipcHandler: IpcHandler | null = null;
  private availableRoutes: string[] = [];
  private multiBrainRouter = new MultiBrainRouter();
  private crossBrainQuery: ((brain: string, method: string, params?: unknown) => Promise<unknown>) | null = null;
  private conversationMemory: import('../memory/conversation-memory.js').ConversationMemory | null = null;

  private readonly stmtInsert;
  private readonly stmtGetSession;
  private readonly stmtCountSessions;
  private readonly stmtCountMessages;

  constructor(db: Database.Database, config: ChatEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxHistoryPerSession: config.maxHistoryPerSession ?? 50,
    };
    runChatMigration(db);

    this.stmtInsert = db.prepare(`INSERT INTO chat_messages (id, session_id, role, content, tool_calls, timestamp) VALUES (?, ?, ?, ?, ?, ?)`);
    this.stmtGetSession = db.prepare(`SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?`);
    this.stmtCountSessions = db.prepare(`SELECT COUNT(DISTINCT session_id) as count FROM chat_messages`);
    this.stmtCountMessages = db.prepare(`SELECT COUNT(*) as count FROM chat_messages`);
  }

  /** Set the IPC handler for routing commands */
  setIpcHandler(handler: IpcHandler): void {
    this.ipcHandler = handler;
  }

  /** Set the list of available IPC routes for NLU matching */
  setAvailableRoutes(routes: string[]): void {
    this.availableRoutes = routes;
  }

  /** Set the cross-brain query function for multi-brain chat. */
  setCrossBrainQuery(fn: (brain: string, method: string, params?: unknown) => Promise<unknown>): void {
    this.crossBrainQuery = fn;
  }

  /** Set ConversationMemory for auto-remembering chat interactions. */
  setConversationMemory(memory: import('../memory/conversation-memory.js').ConversationMemory): void {
    this.conversationMemory = memory;
  }

  /** Process a multi-brain query — routes message to 1+ brains and aggregates results. */
  async processMultiBrain(sessionId: string, content: string): Promise<ChatMessage> {
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId, role: 'user', content, timestamp: Date.now(),
    };
    this.storeMessage(userMsg);

    let responseContent: string;
    let toolCalls: string | undefined;

    try {
      const routing = this.multiBrainRouter.route(content);

      if (routing.brains.length === 1 && routing.brains[0] === this.config.brainName) {
        // Single brain — use local routing
        const route = this.matchRoute(content);
        if (route && this.ipcHandler) {
          const params = this.extractParams(content, route);
          const result = await this.ipcHandler(route, params);
          toolCalls = JSON.stringify({ route, params, result });
          responseContent = this.formatResult(route, result);
        } else {
          responseContent = this.generateFallback(content);
        }
      } else if (this.crossBrainQuery && this.ipcHandler) {
        // Multi-brain query
        const method = this.matchRoute(content) ?? 'status';
        const aggregated = await this.multiBrainRouter.queryMultiple(
          routing.brains,
          this.config.brainName,
          (m, p) => Promise.resolve(this.ipcHandler!(m, p)),
          this.crossBrainQuery,
          method,
        );
        toolCalls = JSON.stringify({ routing, method, responses: aggregated.responses.length });
        responseContent = aggregated.markdown;
      } else {
        responseContent = this.generateFallback(content);
      }
    } catch (err) {
      responseContent = `Fehler: ${(err as Error).message}`;
    }

    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId, role: 'assistant', content: responseContent, toolCalls, timestamp: Date.now(),
    };
    this.storeMessage(assistantMsg);
    return assistantMsg;
  }

  /** Process a user message and generate a response */
  async processMessage(sessionId: string, content: string): Promise<ChatMessage> {
    // Store user message
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    this.storeMessage(userMsg);

    // Route to IPC
    let responseContent: string;
    let toolCalls: string | undefined;

    try {
      const route = this.matchRoute(content);
      if (route && this.ipcHandler) {
        const params = this.extractParams(content, route);
        const result = await this.ipcHandler(route, params);
        toolCalls = JSON.stringify({ route, params, result });
        responseContent = this.formatResult(route, result);
      } else {
        responseContent = this.generateFallback(content);
      }
    } catch (err) {
      responseContent = `Fehler: ${(err as Error).message}`;
    }

    // Store assistant response
    const assistantMsg: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      role: 'assistant',
      content: responseContent,
      toolCalls,
      timestamp: Date.now(),
    };
    this.storeMessage(assistantMsg);

    // Auto-remember significant chat interactions
    if (this.conversationMemory && responseContent.length > 50) {
      try {
        const route = this.matchRoute(content);
        this.conversationMemory.remember(
          `[${sessionId}] Q: ${content.slice(0, 100)} → A: ${responseContent.slice(0, 200)}`,
          {
            category: 'context',
            importance: 5,
            tags: ['chat', route ?? 'unknown'],
          },
        );
      } catch { /* best effort */ }
    }

    return assistantMsg;
  }

  /** Get chat history for a session */
  getHistory(sessionId: string, limit?: number): ChatMessage[] {
    const rows = this.stmtGetSession.all(sessionId, limit ?? this.config.maxHistoryPerSession) as RawMessage[];
    return rows.map(deserializeMessage);
  }

  /** Get status */
  getStatus(): ChatEngineStatus {
    return {
      sessions: (this.stmtCountSessions.get() as { count: number }).count,
      totalMessages: (this.stmtCountMessages.get() as { count: number }).count,
      routesAvailable: this.availableRoutes.length,
    };
  }

  // ── Private ──────────────────────────────────────────────

  private storeMessage(msg: ChatMessage): void {
    this.stmtInsert.run(msg.id, msg.sessionId, msg.role, msg.content, msg.toolCalls ?? null, msg.timestamp);
  }

  /** Simple keyword-based NLU: match user input to IPC routes */
  private matchRoute(input: string): string | null {
    const lower = input.toLowerCase();

    // Direct route mention
    for (const route of this.availableRoutes) {
      if (lower.includes(route)) return route;
    }

    // Keyword mapping — ordered specific-first (longer routes before generic)
    const keywords: [string, string[]][] = [
      // Cross-Brain & Signals
      ['signal.cross.status', ['signal', 'cross-brain', 'cross brain']],
      ['borg.status', ['borg', 'collective', 'sync']],
      ['debate.status', ['debate', 'debatte', 'challenge']],

      // Trading / Paper
      ['paper.status', ['paper', 'trading', 'positionen', 'positions']],
      ['paper.portfolio', ['portfolio', 'balance', 'equity', 'guthaben']],

      // Forges & Actions
      ['action.status', ['action', 'bridge', 'queue', 'aktionen']],
      ['content.status', ['content', 'forge', 'draft', 'publish', 'inhalt']],
      ['codeforge.status', ['codeforge', 'code forge', 'pattern']],
      ['strategy.status', ['strateg', 'strategy']],

      // Error & Solution (brain)
      ['error.query', ['error', 'fehler', 'bug', 'problem', 'exception']],
      ['solution.recent', ['solution', 'lösung', 'fix', 'solved']],

      // Code Intelligence
      ['code.stats', ['code', 'modul', 'module', 'dependency']],
      ['synapse.stats', ['synapse', 'netzwerk', 'network', 'graph', 'verbindung']],

      // Research & Knowledge
      ['insight.list', ['insight', 'erkenntnisse', 'einsichten']],
      ['rule.list', ['rules', 'regeln', 'learned']],
      ['research.status', ['research', 'forschung', 'agenda']],

      // Guardrails & Safety
      ['guardrail.status', ['guardrail', 'circuit', 'safety', 'schutz']],
      ['guardrail.health', ['health check', 'gesundheit']],

      // Goals & Roadmap
      ['goal.status', ['goal', 'ziel', 'target']],
      ['roadmap.list', ['roadmap', 'plan', 'milestone']],

      // Creative & Causal
      ['creative.status', ['creative', 'kreativ', 'idea', 'idee', 'pollinate']],
      ['causal.status', ['causal', 'kausal', 'root cause', 'ursache']],

      // Knowledge Graph & RAG
      ['kg.status', ['knowledge graph', 'wissensgraph', 'fact']],
      ['rag.status', ['rag', 'vector', 'embedding', 'retrieval']],

      // LLM & Tools
      ['llm.status', ['llm', 'anthropic', 'ollama', 'model', 'token']],
      ['tool.stats', ['tool', 'werkzeug', 'usage']],

      // System services
      ['watchdog.status', ['watchdog', 'daemon', 'prozess', 'process']],
      ['dream.status', ['dream', 'traum', 'consolidat', 'sleep']],
      ['prediction.status', ['predict', 'vorhersage', 'forecast']],
      ['mission.list', ['mission', 'research mission', 'forschungsmission']],
      ['selfmod.status', ['selfmod', 'self-mod', 'modification', 'evolution']],

      // Memory & General
      ['memory.stats', ['memory', 'gedächtnis', 'speicher']],
      ['ecosystem.status', ['ecosystem', 'peers', 'ökosystem']],
      ['status', ['status', 'wie geht', 'how are', 'overview', 'übersicht']],
    ];

    for (const [route, kws] of keywords) {
      if (this.availableRoutes.includes(route) && kws.some(kw => lower.includes(kw))) return route;
    }

    return null;
  }

  /** Extract parameters from user input */
  private extractParams(input: string, _route: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Extract numbers
    const numbers = input.match(/\d+/g);
    if (numbers) params.limit = parseInt(numbers[0], 10);

    return params;
  }

  /** Format IPC result as human-readable text */
  private formatResult(route: string, result: unknown): string {
    if (result === null || result === undefined) return 'Keine Daten verfügbar.';

    try {
      if (typeof result === 'object') {
        const obj = result as Record<string, unknown>;

        // Paper status formatting
        if (route === 'paper.status' || route === 'paper.portfolio') {
          const balance = (obj.balance as number)?.toFixed(2) ?? '?';
          const equity = (obj.equity as number)?.toFixed(2) ?? '?';
          const positions = Array.isArray(obj.positions) ? obj.positions.length : 0;
          return `Paper Trading: Balance $${balance}, Equity $${equity}, ${positions} Position(en)`;
        }

        // Generic status formatting
        return JSON.stringify(result, null, 2).substring(0, 1000);
      }
      return String(result);
    } catch {
      return JSON.stringify(result).substring(0, 500);
    }
  }

  /** Fallback response when no route matches */
  private generateFallback(input: string): string {
    log.info(`[chat] No route matched for: ${input}`);
    return `Ich konnte deine Frage nicht zuordnen. Verfügbare Themen: status, paper trading, portfolio, strategies, signals, insights, rules, memory. Versuche es mit konkreteren Begriffen.`;
  }
}

// ── Helpers ──────────────────────────────────────────────────

interface RawMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  tool_calls: string | null;
  timestamp: number;
}

function deserializeMessage(row: RawMessage): ChatMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as ChatMessage['role'],
    content: row.content,
    toolCalls: row.tool_calls ?? undefined,
    timestamp: row.timestamp,
  };
}
