import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface ProposedAction {
  id: number;
  source: 'proactive' | 'creative' | 'mission' | 'selfmod' | 'codegen' | 'research' | 'feedback-router';
  type: 'publish_content' | 'apply_code' | 'execute_trade' | 'adjust_parameter' | 'create_goal' | 'start_mission' | 'creative_seed';
  title: string;
  description: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'executing' | 'completed' | 'failed' | 'rolled_back';
  outcome?: ActionOutcome;
  executedAt?: string;
  createdAt?: string;
}

export interface ActionOutcome {
  success: boolean;
  result: unknown;
  metrics?: Record<string, number>;
  learnedLesson?: string;
}

export interface ActionBridgeConfig {
  brainName: string;
  maxPendingActions?: number;
  autoExecuteEnabled?: boolean;
}

export interface ActionBridgeStatus {
  queueSize: number;
  executed24h: number;
  successRate: number;
  topSources: Array<{ source: string; count: number }>;
  autoExecuteEnabled: boolean;
}

type ActionType = ProposedAction['type'];
type ActionSource = ProposedAction['source'];
type RiskLevel = ProposedAction['riskLevel'];

// Risk thresholds: type → { risk, minConfidence }
const RISK_MAP: Record<ActionType, { risk: RiskLevel; minConfidence: number }> = {
  adjust_parameter: { risk: 'low', minConfidence: 0.7 },
  create_goal:      { risk: 'low', minConfidence: 0.6 },
  start_mission:    { risk: 'low', minConfidence: 0.5 },
  publish_content:  { risk: 'medium', minConfidence: 0.8 },
  execute_trade:    { risk: 'medium', minConfidence: 0.8 },
  apply_code:       { risk: 'high', minConfidence: 1.1 }, // never auto (>1.0)
  creative_seed:    { risk: 'low', minConfidence: 0.5 },
};

// ── Migration ──────────────────────────────────────────────

export function runActionBridgeMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS action_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      confidence REAL DEFAULT 0,
      risk_level TEXT DEFAULT 'medium',
      payload TEXT,
      status TEXT DEFAULT 'pending',
      outcome TEXT,
      executed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_action_status ON action_queue(status);
    CREATE INDEX IF NOT EXISTS idx_action_source ON action_queue(source);
    CREATE INDEX IF NOT EXISTS idx_action_type ON action_queue(type);
    CREATE INDEX IF NOT EXISTS idx_action_created ON action_queue(created_at);
  `);
}

// ── Engine ──────────────────────────────────────────────────

export class ActionBridgeEngine {
  private readonly db: Database.Database;
  private readonly config: Required<ActionBridgeConfig>;
  private readonly log = getLogger();

  // Execution handlers keyed by action type
  private handlers = new Map<ActionType, (payload: Record<string, unknown>) => Promise<unknown> | unknown>();

  // Prepared statements
  private readonly stmtInsert;
  private readonly stmtGetById;
  private readonly stmtUpdateStatus;
  private readonly stmtSetOutcome;
  private readonly stmtGetQueue;
  private readonly stmtGetHistory;
  private readonly stmtSuccessRate;
  private readonly stmtSuccessRateByType;
  private readonly stmtSuccessRateBySource;
  private readonly stmtExecuted24h;
  private readonly stmtTopSources;

  constructor(db: Database.Database, config: ActionBridgeConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxPendingActions: config.maxPendingActions ?? 100,
      autoExecuteEnabled: config.autoExecuteEnabled ?? true,
    };
    runActionBridgeMigration(db);

    this.stmtInsert = db.prepare(`
      INSERT INTO action_queue (source, type, title, description, confidence, risk_level, payload, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    this.stmtGetById = db.prepare(`SELECT * FROM action_queue WHERE id = ?`);
    this.stmtUpdateStatus = db.prepare(`UPDATE action_queue SET status = ? WHERE id = ?`);
    this.stmtSetOutcome = db.prepare(`UPDATE action_queue SET status = ?, outcome = ?, executed_at = datetime('now') WHERE id = ?`);
    this.stmtGetQueue = db.prepare(`SELECT * FROM action_queue WHERE status = ? ORDER BY confidence DESC, created_at ASC LIMIT ?`);
    this.stmtGetHistory = db.prepare(`SELECT * FROM action_queue WHERE status IN ('completed', 'failed', 'rolled_back') ORDER BY executed_at DESC LIMIT ?`);
    this.stmtSuccessRate = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successes FROM action_queue WHERE status IN ('completed', 'failed')`);
    this.stmtSuccessRateByType = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successes FROM action_queue WHERE status IN ('completed', 'failed') AND type = ?`);
    this.stmtSuccessRateBySource = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successes FROM action_queue WHERE status IN ('completed', 'failed') AND source = ?`);
    this.stmtExecuted24h = db.prepare(`SELECT COUNT(*) as count FROM action_queue WHERE executed_at > datetime('now', '-1 day')`);
    this.stmtTopSources = db.prepare(`SELECT source, COUNT(*) as count FROM action_queue GROUP BY source ORDER BY count DESC LIMIT 5`);
  }

  /** Register an execution handler for an action type */
  registerHandler(type: ActionType, handler: (payload: Record<string, unknown>) => Promise<unknown> | unknown): void {
    this.handlers.set(type, handler);
  }

  /** Propose a new action — returns the action ID */
  propose(action: {
    source: ActionSource;
    type: ActionType;
    title: string;
    description?: string;
    confidence: number;
    payload?: Record<string, unknown>;
  }): number {
    const risk = this.evaluateRisk(action.type, action.confidence);

    // Check queue limit
    const pending = this.getQueue('pending');
    if (pending.length >= this.config.maxPendingActions) {
      this.log.warn(`[action-bridge] Queue full (${pending.length}/${this.config.maxPendingActions}), rejecting: ${action.title}`);
      return -1;
    }

    const result = this.stmtInsert.run(
      action.source,
      action.type,
      action.title,
      action.description ?? '',
      action.confidence,
      risk,
      JSON.stringify(action.payload ?? {}),
    );

    const id = Number(result.lastInsertRowid);
    this.log.info(`[action-bridge] Proposed #${id}: ${action.title} (${action.source}/${action.type}, risk=${risk}, conf=${action.confidence.toFixed(2)})`);
    return id;
  }

  /** Evaluate risk level for an action type */
  evaluateRisk(type: ActionType, _confidence?: number): RiskLevel {
    return RISK_MAP[type]?.risk ?? 'high';
  }

  /** Check if an action qualifies for auto-execution */
  canAutoExecute(action: ProposedAction): boolean {
    if (!this.config.autoExecuteEnabled) return false;
    const rule = RISK_MAP[action.type];
    if (!rule) return false;
    return action.confidence >= rule.minConfidence;
  }

  /** Execute a specific action by ID */
  async executeAction(actionId: number): Promise<{ success: boolean; result: unknown }> {
    const row = this.stmtGetById.get(actionId) as RawAction | undefined;
    if (!row) throw new Error(`Action #${actionId} not found`);
    const action = deserializeAction(row);

    if (action.status !== 'pending' && action.status !== 'approved') {
      throw new Error(`Action #${actionId} cannot be executed (status=${action.status})`);
    }

    const handler = this.handlers.get(action.type);
    if (!handler) {
      this.log.warn(`[action-bridge] No handler for type: ${action.type}`);
      this.stmtSetOutcome.run('failed', JSON.stringify({ success: false, result: 'No handler registered' }), actionId);
      return { success: false, result: 'No handler registered' };
    }

    this.stmtUpdateStatus.run('executing', actionId);

    try {
      const result = await handler(action.payload);
      const outcome: ActionOutcome = { success: true, result };
      this.stmtSetOutcome.run('completed', JSON.stringify(outcome), actionId);
      this.log.info(`[action-bridge] Executed #${actionId}: ${action.title} → success`);
      return { success: true, result };
    } catch (err) {
      const outcome: ActionOutcome = { success: false, result: (err as Error).message };
      this.stmtSetOutcome.run('failed', JSON.stringify(outcome), actionId);
      this.log.warn(`[action-bridge] Executed #${actionId}: ${action.title} → failed: ${(err as Error).message}`);
      return { success: false, result: (err as Error).message };
    }
  }

  /** Process pending queue — auto-execute qualifying actions */
  async processQueue(): Promise<number> {
    if (!this.config.autoExecuteEnabled) return 0;

    const pending = this.getQueue('pending');
    let executed = 0;

    for (const action of pending) {
      if (this.canAutoExecute(action)) {
        try {
          await this.executeAction(action.id);
          executed++;
        } catch (err) {
          this.log.warn(`[action-bridge] Auto-execute error for #${action.id}: ${(err as Error).message}`);
        }
      }
    }

    if (executed > 0) {
      this.log.info(`[action-bridge] Auto-executed ${executed} action(s)`);
    }
    return executed;
  }

  /** Record outcome for an already-executed action */
  recordOutcome(actionId: number, outcome: ActionOutcome): void {
    const row = this.stmtGetById.get(actionId) as RawAction | undefined;
    if (!row) throw new Error(`Action #${actionId} not found`);

    const status = outcome.success ? 'completed' : 'failed';
    this.stmtSetOutcome.run(status, JSON.stringify(outcome), actionId);
    this.log.info(`[action-bridge] Outcome recorded for #${actionId}: ${status}`);
  }

  /** Rollback a completed action */
  rollback(actionId: number): void {
    const row = this.stmtGetById.get(actionId) as RawAction | undefined;
    if (!row) throw new Error(`Action #${actionId} not found`);
    if (row.status !== 'completed' && row.status !== 'failed') {
      throw new Error(`Action #${actionId} cannot be rolled back (status=${row.status})`);
    }
    this.stmtUpdateStatus.run('rolled_back', actionId);
    this.log.info(`[action-bridge] Rolled back #${actionId}`);
  }

  /** Get success rate (optionally filtered by type or source) */
  getSuccessRate(type?: string, source?: string): number {
    let row: { total: number; successes: number };
    if (type) {
      row = this.stmtSuccessRateByType.get(type) as { total: number; successes: number };
    } else if (source) {
      row = this.stmtSuccessRateBySource.get(source) as { total: number; successes: number };
    } else {
      row = this.stmtSuccessRate.get() as { total: number; successes: number };
    }
    if (!row || row.total === 0) return 0;
    return row.successes / row.total;
  }

  /** Get queue items by status */
  getQueue(status?: string): ProposedAction[] {
    const rows = this.stmtGetQueue.all(status ?? 'pending', 100) as RawAction[];
    return rows.map(deserializeAction);
  }

  /** Get action history (completed/failed/rolled_back) */
  getHistory(limit?: number): ProposedAction[] {
    const rows = this.stmtGetHistory.all(limit ?? 50) as RawAction[];
    return rows.map(deserializeAction);
  }

  /** Get a single action by ID */
  getAction(id: number): ProposedAction | null {
    const row = this.stmtGetById.get(id) as RawAction | undefined;
    return row ? deserializeAction(row) : null;
  }

  /** Get status overview */
  getStatus(): ActionBridgeStatus {
    const queueSize = (this.getQueue('pending')).length;
    const executed24h = (this.stmtExecuted24h.get() as { count: number }).count;
    const successRate = this.getSuccessRate();
    const topSources = this.stmtTopSources.all() as Array<{ source: string; count: number }>;

    return {
      queueSize,
      executed24h,
      successRate,
      topSources,
      autoExecuteEnabled: this.config.autoExecuteEnabled,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────

interface RawAction {
  id: number;
  source: string;
  type: string;
  title: string;
  description: string;
  confidence: number;
  risk_level: string;
  payload: string;
  status: string;
  outcome: string | null;
  executed_at: string | null;
  created_at: string;
}

function deserializeAction(row: RawAction): ProposedAction {
  return {
    id: row.id,
    source: row.source as ProposedAction['source'],
    type: row.type as ProposedAction['type'],
    title: row.title,
    description: row.description,
    confidence: row.confidence,
    riskLevel: row.risk_level as ProposedAction['riskLevel'],
    payload: JSON.parse(row.payload || '{}'),
    status: row.status as ProposedAction['status'],
    outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
    executedAt: row.executed_at ?? undefined,
    createdAt: row.created_at,
  };
}
