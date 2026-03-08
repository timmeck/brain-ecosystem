import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface Strategy {
  id: number;
  brainName: string;
  type: 'trade' | 'campaign' | 'research' | 'optimization';
  name: string;
  description: string;
  rules: StrategyRule[];
  performance: StrategyPerformance;
  status: 'draft' | 'backtesting' | 'active' | 'paused' | 'retired';
  parentId?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StrategyRule {
  condition: string;
  action: string;
  confidence: number;
  source: string;
}

export interface StrategyPerformance {
  executions: number;
  successes: number;
  avgReturn: number;
}

export interface BacktestResult {
  strategyId: number;
  trades: number;
  wins: number;
  losses: number;
  avgReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

export interface StrategyForgeConfig {
  brainName: string;
  maxActiveStrategies?: number;
  minBacktestTrades?: number;
}

export interface StrategyForgeStatus {
  active: number;
  total: number;
  avgPerformance: number;
  topStrategy: string | null;
}

// ── Migration ──────────────────────────────────────────────

export function runStrategyForgeMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brain_name TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      rules TEXT DEFAULT '[]',
      performance TEXT DEFAULT '{"executions":0,"successes":0,"avgReturn":0}',
      status TEXT DEFAULT 'draft',
      parent_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_strategy_status ON strategies(status);
    CREATE INDEX IF NOT EXISTS idx_strategy_type ON strategies(type);
    CREATE INDEX IF NOT EXISTS idx_strategy_brain ON strategies(brain_name);
  `);
}

// ── Engine ──────────────────────────────────────────────────

export class StrategyForge {
  private readonly db: Database.Database;
  private readonly config: Required<StrategyForgeConfig>;
  private readonly log = getLogger();

  private actionBridge: import('../action/action-bridge.js').ActionBridgeEngine | null = null;
  private knowledgeDistiller: { getPrinciples: (domain?: string, limit?: number) => Array<{ id: string; statement: string; domain: string; confidence: number; source: string }> } | null = null;

  // Prepared statements
  private readonly stmtInsert;
  private readonly stmtGetById;
  private readonly stmtUpdateStatus;
  private readonly stmtUpdatePerformance;
  private readonly stmtGetActive;
  private readonly stmtGetByType;
  private readonly stmtGetAll;
  private readonly stmtCountByStatus;

  constructor(db: Database.Database, config: StrategyForgeConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxActiveStrategies: config.maxActiveStrategies ?? 10,
      minBacktestTrades: config.minBacktestTrades ?? 5,
    };
    runStrategyForgeMigration(db);

    this.stmtInsert = db.prepare(`
      INSERT INTO strategies (brain_name, type, name, description, rules, performance, status, parent_id)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
    `);
    this.stmtGetById = db.prepare(`SELECT * FROM strategies WHERE id = ?`);
    this.stmtUpdateStatus = db.prepare(`UPDATE strategies SET status = ?, updated_at = datetime('now') WHERE id = ?`);
    this.stmtUpdatePerformance = db.prepare(`UPDATE strategies SET performance = ?, updated_at = datetime('now') WHERE id = ?`);
    this.stmtGetActive = db.prepare(`SELECT * FROM strategies WHERE status = 'active' ORDER BY created_at DESC`);
    this.stmtGetByType = db.prepare(`SELECT * FROM strategies WHERE type = ? ORDER BY created_at DESC LIMIT ?`);
    this.stmtGetAll = db.prepare(`SELECT * FROM strategies ORDER BY created_at DESC LIMIT ?`);
    this.stmtCountByStatus = db.prepare(`SELECT status, COUNT(*) as count FROM strategies GROUP BY status`);
  }

  setActionBridge(bridge: import('../action/action-bridge.js').ActionBridgeEngine): void { this.actionBridge = bridge; }
  setKnowledgeDistiller(distiller: { getPrinciples: (domain?: string, limit?: number) => Array<{ id: string; statement: string; domain: string; confidence: number; source: string }> }): void { this.knowledgeDistiller = distiller; }

  /** Create a strategy from learned principles */
  createFromPrinciples(domain: string): Strategy | null {
    if (!this.knowledgeDistiller) return null;

    const principles = this.knowledgeDistiller.getPrinciples(domain, 10);
    if (principles.length === 0) return null;

    const type = this.domainToType(domain);
    const rules: StrategyRule[] = principles.slice(0, 5).map(p => ({
      condition: p.statement,
      action: this.inferAction(p.statement, type),
      confidence: p.confidence,
      source: p.source,
    }));

    const name = `${domain}-strategy-${Date.now()}`;
    const description = `Strategy from ${principles.length} ${domain} principles`;

    return this.storeStrategy(type, name, description, rules);
  }

  /** Create a strategy from observed signals */
  createFromSignals(signals: Array<{ name: string; value: number; direction: string }>): Strategy | null {
    if (signals.length === 0) return null;

    const rules: StrategyRule[] = signals.map(s => ({
      condition: `${s.name} ${s.direction === 'up' ? '>' : '<'} ${s.value}`,
      action: s.direction === 'up' ? 'buy' : 'sell',
      confidence: 0.5,
      source: 'signal',
    }));

    const name = `signal-strategy-${Date.now()}`;
    return this.storeStrategy('trade', name, `Strategy from ${signals.length} signals`, rules);
  }

  /** Backtest a strategy (simplified) */
  backtest(strategyId: number, data?: Array<{ date: string; value: number }>): BacktestResult {
    const row = this.stmtGetById.get(strategyId) as RawStrategy | undefined;
    if (!row) throw new Error(`Strategy #${strategyId} not found`);

    this.stmtUpdateStatus.run('backtesting', strategyId);

    // Simplified backtest — in production would use real market data
    const trades = data?.length ?? 10;
    const wins = Math.floor(trades * 0.6);
    const losses = trades - wins;
    const avgReturn = 0.02;
    const sharpeRatio = 1.2;
    const maxDrawdown = 0.1;

    // Update status back to draft after backtest
    this.stmtUpdateStatus.run('draft', strategyId);

    this.log.info(`[strategy-forge] Backtest #${strategyId}: ${wins}/${trades} wins, sharpe=${sharpeRatio.toFixed(2)}`);

    return { strategyId, trades, wins, losses, avgReturn, sharpeRatio, maxDrawdown };
  }

  /** Activate a strategy */
  activate(strategyId: number): void {
    const active = this.getActive();
    if (active.length >= this.config.maxActiveStrategies) {
      throw new Error(`Max active strategies (${this.config.maxActiveStrategies}) reached`);
    }
    this.stmtUpdateStatus.run('active', strategyId);
    this.log.info(`[strategy-forge] Activated strategy #${strategyId}`);
  }

  /** Pause a strategy */
  pause(strategyId: number): void {
    this.stmtUpdateStatus.run('paused', strategyId);
    this.log.info(`[strategy-forge] Paused strategy #${strategyId}`);
  }

  /** Execute one step of a strategy (check rules, fire actions, create ActionBridge proposals) */
  executeStep(strategyId: number): { fired: number; proposed: number; results: string[] } {
    const row = this.stmtGetById.get(strategyId) as RawStrategy | undefined;
    if (!row) throw new Error(`Strategy #${strategyId} not found`);
    if (row.status !== 'active') throw new Error(`Strategy #${strategyId} is not active`);

    const strategy = deserializeStrategy(row);
    const results: string[] = [];
    let fired = 0;
    let proposed = 0;

    for (const rule of strategy.rules) {
      // Simple condition evaluation: always fire for now (real eval would check market data)
      if (rule.confidence >= 0.5) {
        results.push(`Rule fired: ${rule.condition} → ${rule.action}`);
        fired++;

        // Create ActionBridge proposal for trade rules
        if (this.actionBridge && this.isTradeAction(rule.action) && strategy.type === 'trade') {
          const symbol = this.extractSymbol(rule.condition);
          const actionId = this.actionBridge.propose({
            source: 'research',
            type: 'execute_trade',
            title: `Strategy #${strategyId}: ${rule.action} ${symbol}`,
            description: `Rule: ${rule.condition} → ${rule.action} (source: ${rule.source})`,
            confidence: rule.confidence,
            payload: {
              symbol,
              action: rule.action as 'buy' | 'sell',
              reason: rule.condition,
              strategyId,
              ruleCondition: rule.condition,
              confidence: rule.confidence,
            },
          });
          if (actionId > 0) {
            proposed++;
            results.push(`Proposed: execute_trade #${actionId} for ${symbol}`);
          }
        }
      }
    }

    // Update performance
    const perf = strategy.performance;
    perf.executions += fired;
    if (fired > 0) perf.successes += 1;
    this.stmtUpdatePerformance.run(JSON.stringify(perf), strategyId);

    return { fired, proposed, results };
  }

  /** Evolve best strategies by combining their rules */
  evolve(strategyIds?: number[]): Strategy | null {
    let strategies: Strategy[];
    if (strategyIds && strategyIds.length > 0) {
      strategies = strategyIds.map(id => {
        const row = this.stmtGetById.get(id) as RawStrategy | undefined;
        return row ? deserializeStrategy(row) : null;
      }).filter((s): s is Strategy => s !== null);
    } else {
      strategies = this.getActive();
    }

    if (strategies.length < 2) return null;

    // Take best rules from top strategies
    const allRules = strategies.flatMap(s => s.rules);
    const bestRules = allRules
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5);

    const parentIds = strategies.map(s => s.id);
    const type = strategies[0].type;
    const name = `evolved-${type}-${Date.now()}`;
    const description = `Evolved from strategies: ${parentIds.join(', ')}`;

    return this.storeStrategy(type, name, description, bestRules, parentIds[0]);
  }

  /** Get active strategies */
  getActive(): Strategy[] {
    return (this.stmtGetActive.all() as RawStrategy[]).map(deserializeStrategy);
  }

  /** Get strategy by ID */
  getStrategy(id: number): Strategy | null {
    const row = this.stmtGetById.get(id) as RawStrategy | undefined;
    return row ? deserializeStrategy(row) : null;
  }

  /** Get performance report */
  getPerformance(strategyId: number): StrategyPerformance | null {
    const row = this.stmtGetById.get(strategyId) as RawStrategy | undefined;
    if (!row) return null;
    return JSON.parse(row.performance || '{"executions":0,"successes":0,"avgReturn":0}');
  }

  /** Retire a strategy */
  retire(strategyId: number, reason?: string): void {
    this.stmtUpdateStatus.run('retired', strategyId);
    this.log.info(`[strategy-forge] Retired strategy #${strategyId}: ${reason ?? 'no reason'}`);
  }

  /** Get all strategies */
  getAll(limit?: number): Strategy[] {
    return (this.stmtGetAll.all(limit ?? 100) as RawStrategy[]).map(deserializeStrategy);
  }

  /** Get status overview */
  getStatus(): StrategyForgeStatus {
    const counts = this.stmtCountByStatus.all() as Array<{ status: string; count: number }>;
    const countMap: Record<string, number> = {};
    let total = 0;
    for (const c of counts) { countMap[c.status] = c.count; total += c.count; }

    const active = this.getActive();
    const topStrategy = active.length > 0
      ? active.sort((a, b) => b.performance.successes - a.performance.successes)[0].name
      : null;

    const avgPerformance = active.length > 0
      ? active.reduce((sum, s) => sum + (s.performance.executions > 0 ? s.performance.successes / s.performance.executions : 0), 0) / active.length
      : 0;

    return {
      active: countMap['active'] ?? 0,
      total,
      avgPerformance,
      topStrategy,
    };
  }

  // ── Private ──────────────────────────────────────────────

  private storeStrategy(type: Strategy['type'], name: string, description: string, rules: StrategyRule[], parentId?: number): Strategy {
    const perf: StrategyPerformance = { executions: 0, successes: 0, avgReturn: 0 };
    const result = this.stmtInsert.run(
      this.config.brainName, type, name, description,
      JSON.stringify(rules), JSON.stringify(perf), parentId ?? null,
    );
    const id = Number(result.lastInsertRowid);
    this.log.info(`[strategy-forge] Created strategy #${id}: ${name} (${type}, ${rules.length} rules)`);
    return { id, brainName: this.config.brainName, type, name, description, rules, performance: perf, status: 'draft', parentId };
  }

  private domainToType(domain: string): Strategy['type'] {
    if (domain.includes('trad') || domain.includes('market') || domain.includes('crypto')) return 'trade';
    if (domain.includes('content') || domain.includes('market') || domain.includes('campaign')) return 'campaign';
    if (domain.includes('research') || domain.includes('learn')) return 'research';
    return 'optimization';
  }

  private inferAction(statement: string, type: Strategy['type']): string {
    if (type === 'trade') return 'evaluate_position';
    if (type === 'campaign') return 'schedule_content';
    if (type === 'research') return 'start_mission';
    return 'adjust_parameter';
  }

  private isTradeAction(action: string): boolean {
    return ['buy', 'sell', 'evaluate_position'].includes(action);
  }

  private extractSymbol(condition: string): string {
    // Extract symbol from conditions like "BTC > 50000" or "ETH < 3000"
    const match = condition.match(/^([A-Z0-9]+)\s/);
    return match ? match[1] : 'UNKNOWN';
  }
}

// ── Helpers ──────────────────────────────────────────────────

interface RawStrategy {
  id: number;
  brain_name: string;
  type: string;
  name: string;
  description: string;
  rules: string;
  performance: string;
  status: string;
  parent_id: number | null;
  created_at: string;
  updated_at: string | null;
}

function deserializeStrategy(row: RawStrategy): Strategy {
  return {
    id: row.id,
    brainName: row.brain_name,
    type: row.type as Strategy['type'],
    name: row.name,
    description: row.description,
    rules: JSON.parse(row.rules || '[]'),
    performance: JSON.parse(row.performance || '{"executions":0,"successes":0,"avgReturn":0}'),
    status: row.status as Strategy['status'],
    parentId: row.parent_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}
