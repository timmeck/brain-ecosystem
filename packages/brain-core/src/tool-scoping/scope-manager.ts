/**
 * Tool Scope Manager — Dynamic Tool Scoping for Workflows
 *
 * Inspiriert von LangGraph's State-based Tool Filtering.
 * Statt 424+ Tools gleichzeitig zu zeigen, filtert der ScopeManager
 * Tools basierend auf Workflow-Phase, Kontext und Bedingungen.
 *
 * Usage:
 * ```typescript
 * const manager = new ToolScopeManager(db);
 * manager.registerScope({ name: 'research', tools: ['query', 'search'], phase: 'gathering' });
 * const tools = manager.getAvailableTools({ phase: 'gathering', context: {} });
 * ```
 */

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface ToolScope {
  /** Unique scope name (e.g., 'research', 'trading-decision', 'code-review') */
  name: string;
  /** Tool names available in this scope */
  tools: string[];
  /** Workflow phase this scope applies to (if null → applies always when active) */
  phase?: string | null;
  /** Priority — higher overrides lower when scopes conflict. Default: 0 */
  priority?: number;
  /** Human-readable description */
  description?: string;
}

export interface WorkflowContext {
  /** Current workflow phase */
  phase: string;
  /** Arbitrary key-value context data */
  context?: Record<string, unknown>;
  /** Workflow/mission ID (optional) */
  workflowId?: string;
}

export interface ScopeCheckResult {
  allowed: boolean;
  reason?: string;
  scope?: string;
}

export interface ToolScopeManagerStatus {
  totalScopes: number;
  totalToolMappings: number;
  totalChecks: number;
  totalBlocked: number;
  blockRate: number;
  topBlockedTools: Array<{ tool: string; count: number }>;
}

// ── Migration ───────────────────────────────────────────

export function runToolScopingMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_scopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      phase TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      tools TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tool_scopes_phase ON tool_scopes(phase);

    CREATE TABLE IF NOT EXISTS scope_check_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tool_name TEXT NOT NULL,
      phase TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1,
      scope_name TEXT,
      workflow_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scope_check_tool ON scope_check_log(tool_name);
    CREATE INDEX IF NOT EXISTS idx_scope_check_created ON scope_check_log(created_at);
  `);
}

// ── Manager ─────────────────────────────────────────────

export class ToolScopeManager {
  private readonly log = getLogger();

  /** In-memory scope registry (fast lookups, DB is persistence layer) */
  private scopes: Map<string, ToolScope> = new Map();
  /** Phase → scope names index */
  private phaseIndex: Map<string, string[]> = new Map();
  /** Global scopes (no phase restriction) */
  private globalScopes: string[] = [];

  private stmtInsertScope: Database.Statement;
  private stmtDeleteScope: Database.Statement;
  private stmtLogCheck: Database.Statement;

  private stats = { checks: 0, blocked: 0, blockedTools: new Map<string, number>() };

  constructor(private db: Database.Database) {
    runToolScopingMigration(db);

    this.stmtInsertScope = db.prepare(
      'INSERT OR REPLACE INTO tool_scopes (name, phase, priority, description, tools) VALUES (?, ?, ?, ?, ?)',
    );
    this.stmtDeleteScope = db.prepare('DELETE FROM tool_scopes WHERE name = ?');
    this.stmtLogCheck = db.prepare(
      'INSERT INTO scope_check_log (tool_name, phase, allowed, scope_name, workflow_id) VALUES (?, ?, ?, ?, ?)',
    );

    // Load persisted scopes
    this.loadScopes();
  }

  // ── Scope Registration ────────────────────────────────

  /** Register a tool scope. Persists to DB. */
  registerScope(scope: ToolScope): void {
    const s: ToolScope = {
      ...scope,
      priority: scope.priority ?? 0,
      phase: scope.phase ?? null,
    };

    this.scopes.set(s.name, s);
    this.rebuildIndex();

    // Persist
    try {
      this.stmtInsertScope.run(
        s.name, s.phase ?? null, s.priority, s.description ?? null,
        JSON.stringify(s.tools),
      );
    } catch (e) {
      this.log.warn(`[ToolScopeManager] Failed to persist scope: ${(e as Error).message}`);
    }
  }

  /** Register multiple scopes at once. */
  registerScopes(scopes: ToolScope[]): number {
    let count = 0;
    const tx = this.db.transaction(() => {
      for (const s of scopes) {
        this.registerScope(s);
        count++;
      }
    });
    tx();
    return count;
  }

  /** Remove a scope. */
  removeScope(name: string): boolean {
    const existed = this.scopes.delete(name);
    if (existed) {
      this.rebuildIndex();
      try { this.stmtDeleteScope.run(name); } catch { /* ignore */ }
    }
    return existed;
  }

  /** Get a scope by name. */
  getScope(name: string): ToolScope | null {
    return this.scopes.get(name) ?? null;
  }

  /** List all registered scopes. */
  listScopes(): ToolScope[] {
    return [...this.scopes.values()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  // ── Tool Availability ─────────────────────────────────

  /**
   * Get all tools available for a given workflow context.
   *
   * Combines:
   * 1. Global scopes (no phase restriction)
   * 2. Phase-specific scopes matching the current phase
   * 3. Deduplicates by tool name, higher priority wins
   */
  getAvailableTools(ctx: WorkflowContext): string[] {
    const applicableScopes: ToolScope[] = [];

    // Global scopes always apply
    for (const name of this.globalScopes) {
      const s = this.scopes.get(name);
      if (s) applicableScopes.push(s);
    }

    // Phase-specific scopes
    const phaseScopes = this.phaseIndex.get(ctx.phase) ?? [];
    for (const name of phaseScopes) {
      const s = this.scopes.get(name);
      if (s) applicableScopes.push(s);
    }

    // Collect tools, deduplicate
    const tools = new Set<string>();
    // Sort by priority (highest first) so high-priority scopes' tools win
    applicableScopes.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const scope of applicableScopes) {
      for (const tool of scope.tools) {
        tools.add(tool);
      }
    }

    return [...tools].sort();
  }

  /**
   * Check if a specific tool is allowed in the current context.
   * Logs the check for audit trail.
   */
  checkTool(toolName: string, ctx: WorkflowContext): ScopeCheckResult {
    this.stats.checks++;

    // If no scopes registered for this phase → allow all (no restrictions)
    const hasPhaseScopes = this.phaseIndex.has(ctx.phase) || this.globalScopes.length > 0;
    if (!hasPhaseScopes) {
      return { allowed: true, reason: 'no scopes defined — all tools allowed' };
    }

    const available = this.getAvailableTools(ctx);
    const allowed = available.includes(toolName);

    if (!allowed) {
      this.stats.blocked++;
      const count = this.stats.blockedTools.get(toolName) ?? 0;
      this.stats.blockedTools.set(toolName, count + 1);
    }

    // Find which scope grants access (for audit)
    let scopeName: string | undefined;
    if (allowed) {
      for (const [name, scope] of this.scopes) {
        if (scope.tools.includes(toolName) && (scope.phase === null || scope.phase === ctx.phase)) {
          scopeName = name;
          break;
        }
      }
    }

    // Log to DB (async-safe, fire-and-forget)
    try {
      this.stmtLogCheck.run(
        toolName, ctx.phase, allowed ? 1 : 0,
        scopeName ?? null, ctx.workflowId ?? null,
      );
    } catch { /* ignore logging failures */ }

    return {
      allowed,
      scope: scopeName,
      reason: allowed
        ? `allowed by scope '${scopeName}'`
        : `tool '${toolName}' not in any scope for phase '${ctx.phase}'`,
    };
  }

  /**
   * Get tools available for a phase, grouped by scope.
   * Useful for dashboard display.
   */
  getToolsByScope(phase: string): Array<{ scope: string; tools: string[]; priority: number }> {
    const result: Array<{ scope: string; tools: string[]; priority: number }> = [];

    for (const name of this.globalScopes) {
      const s = this.scopes.get(name);
      if (s) result.push({ scope: s.name, tools: [...s.tools], priority: s.priority ?? 0 });
    }
    for (const name of (this.phaseIndex.get(phase) ?? [])) {
      const s = this.scopes.get(name);
      if (s) result.push({ scope: s.name, tools: [...s.tools], priority: s.priority ?? 0 });
    }

    return result.sort((a, b) => b.priority - a.priority);
  }

  // ── Built-in Scope Presets ────────────────────────────

  /**
   * Register default scope presets for common workflow phases.
   * Call this once to get sensible defaults.
   */
  registerDefaults(): void {
    const defaults: ToolScope[] = [
      {
        name: 'global-always',
        tools: ['status', 'help', 'health'],
        phase: null,
        priority: 100,
        description: 'Always available — status and help tools',
      },
      {
        name: 'research-gathering',
        tools: ['query', 'search', 'web_search', 'rag_search', 'error.search', 'insight.list'],
        phase: 'gathering',
        priority: 10,
        description: 'Research gathering phase — search and query tools',
      },
      {
        name: 'research-analysis',
        tools: ['query', 'kg.query', 'kg.infer', 'hypothesis.create', 'experiment.propose', 'reasoning.chain'],
        phase: 'analyzing',
        priority: 10,
        description: 'Research analysis phase — inference and hypothesis tools',
      },
      {
        name: 'research-synthesis',
        tools: ['kg.addFact', 'insight.create', 'principle.add', 'narrative.synthesize', 'compress'],
        phase: 'synthesizing',
        priority: 10,
        description: 'Research synthesis phase — knowledge creation tools',
      },
      {
        name: 'trading-analysis',
        tools: ['market.price', 'market.history', 'signal.analyze', 'backtest.run', 'prediction.get'],
        phase: 'trading-analysis',
        priority: 10,
        description: 'Trading analysis phase — market data and signals',
      },
      {
        name: 'trading-execution',
        tools: ['position.open', 'position.close', 'risk.check', 'portfolio.status'],
        phase: 'trading-execution',
        priority: 10,
        description: 'Trading execution phase — position management',
      },
      {
        name: 'code-review',
        tools: ['code.search', 'code.health', 'code.patterns', 'selfmod.propose', 'selfmod.list'],
        phase: 'code-review',
        priority: 10,
        description: 'Code review phase — analysis and modification tools',
      },
    ];

    this.registerScopes(defaults);
  }

  // ── History & Audit ──────────────────────────────────

  /** Get recent scope check history. */
  getCheckHistory(limit = 50): Array<{
    toolName: string; phase: string; allowed: boolean;
    scopeName: string | null; workflowId: string | null; createdAt: string;
  }> {
    return this.db.prepare(
      'SELECT tool_name as toolName, phase, allowed, scope_name as scopeName, workflow_id as workflowId, created_at as createdAt FROM scope_check_log ORDER BY created_at DESC LIMIT ?',
    ).all(limit).map((r) => ({
      ...(r as Record<string, unknown>),
      allowed: !!(r as Record<string, unknown>).allowed,
    })) as Array<{
      toolName: string; phase: string; allowed: boolean;
      scopeName: string | null; workflowId: string | null; createdAt: string;
    }>;
  }

  /** Get top blocked tools. */
  getTopBlocked(limit = 10): Array<{ tool: string; count: number }> {
    return this.db.prepare(
      'SELECT tool_name as tool, COUNT(*) as count FROM scope_check_log WHERE allowed = 0 GROUP BY tool_name ORDER BY count DESC LIMIT ?',
    ).all(limit) as Array<{ tool: string; count: number }>;
  }

  // ── Status ──────────────────────────────────────────

  getStatus(): ToolScopeManagerStatus {
    try {
      const totalMappings = [...this.scopes.values()].reduce((sum, s) => sum + s.tools.length, 0);
      const totalChecks = (this.db.prepare('SELECT COUNT(*) as c FROM scope_check_log').get() as { c: number }).c;
      const totalBlocked = (this.db.prepare('SELECT COUNT(*) as c FROM scope_check_log WHERE allowed = 0').get() as { c: number }).c;
      const topBlocked = this.getTopBlocked(5);

      return {
        totalScopes: this.scopes.size,
        totalToolMappings: totalMappings,
        totalChecks,
        totalBlocked,
        blockRate: totalChecks > 0 ? Math.round((totalBlocked / totalChecks) * 1000) / 1000 : 0,
        topBlockedTools: topBlocked,
      };
    } catch {
      return { totalScopes: 0, totalToolMappings: 0, totalChecks: 0, totalBlocked: 0, blockRate: 0, topBlockedTools: [] };
    }
  }

  // ── Private ─────────────────────────────────────────

  private loadScopes(): void {
    try {
      const rows = this.db.prepare('SELECT * FROM tool_scopes ORDER BY priority DESC').all() as Array<{
        name: string; phase: string | null; priority: number; description: string | null; tools: string;
      }>;
      for (const row of rows) {
        try {
          this.scopes.set(row.name, {
            name: row.name,
            phase: row.phase,
            priority: row.priority,
            description: row.description ?? undefined,
            tools: JSON.parse(row.tools),
          });
        } catch { /* skip corrupt rows */ }
      }
      this.rebuildIndex();
      if (this.scopes.size > 0) {
        this.log.debug(`[ToolScopeManager] Loaded ${this.scopes.size} scopes from DB`);
      }
    } catch { /* fresh DB, no scopes yet */ }
  }

  private rebuildIndex(): void {
    this.phaseIndex.clear();
    this.globalScopes = [];

    for (const [name, scope] of this.scopes) {
      if (scope.phase === null || scope.phase === undefined) {
        this.globalScopes.push(name);
      } else {
        const existing = this.phaseIndex.get(scope.phase) ?? [];
        existing.push(name);
        this.phaseIndex.set(scope.phase, existing);
      }
    }
  }
}
