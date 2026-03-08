import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

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
      ['signal.cross.status', ['signal', 'cross-brain', 'cross brain']],
      ['paper.status', ['paper', 'trading', 'positionen', 'positions']],
      ['paper.portfolio', ['portfolio', 'balance', 'equity', 'guthaben']],
      ['action.status', ['action', 'bridge', 'queue', 'aktionen']],
      ['content.status', ['content', 'forge', 'draft', 'publish', 'inhalt']],
      ['strategy.status', ['strateg', 'rules', 'regeln']],
      ['insight.list', ['insight', 'erkenntnisse', 'einsichten']],
      ['rule.list', ['rules', 'regeln', 'learned']],
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
