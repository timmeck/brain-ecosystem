import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ParameterRegistry } from '../metacognition/parameter-registry.js';
import type { GoalEngine } from '../goals/goal-engine.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';

// ── Types ───────────────────────────────────────────────

export interface GuardrailConfig {
  brainName: string;
  /** Minimum fitness improvement to accept a parameter change. Default: 0.01 */
  minFitnessDelta?: number;
  /** Number of declining generations before auto-rollback. Default: 3 */
  declineThreshold?: number;
  /** Max warnings before tripping circuit breaker. Default: 3 */
  maxWarnings?: number;
}

export interface ValidationResult {
  allowed: boolean;
  reason: string;
}

export interface RollbackResult {
  rolledBack: number;
  parameters: Array<{ param: string; from: number; to: number }>;
}

export interface HealthWarning {
  category: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface HealthReport {
  score: number; // 0-1
  warnings: HealthWarning[];
  circuitBreakerTripped: boolean;
  recommendation: string;
}

export interface GuardrailStatus {
  circuitBreakerTripped: boolean;
  circuitBreakerReason: string | null;
  totalRollbacks: number;
  recentChanges: number;
  healthScore: number;
  protectedPaths: string[];
}

// ── Protected Paths ──────────────────────────────────────

const PROTECTED_PATHS = [
  'src/ipc/',
  'src/llm/provider.ts',
  'src/llm/middleware.ts',
  'src/guardrails/',
  'src/db/',
  'migrations/',
];

// ── Migration ───────────────────────────────────────────

export function runGuardrailMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS parameter_changelog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      param TEXT NOT NULL,
      old_value REAL NOT NULL,
      new_value REAL NOT NULL,
      fitness_before REAL,
      fitness_after REAL,
      generation INTEGER,
      source TEXT DEFAULT 'evolution',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_param_changelog_param ON parameter_changelog(param);
    CREATE INDEX IF NOT EXISTS idx_param_changelog_gen ON parameter_changelog(generation);

    CREATE TABLE IF NOT EXISTS circuit_breaker_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tripped INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      warnings TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Engine ──────────────────────────────────────────────

export class GuardrailEngine {
  private readonly db: Database.Database;
  private readonly config: Required<GuardrailConfig>;
  private readonly log = getLogger();
  private registry: ParameterRegistry | null = null;
  private goalEngine: GoalEngine | null = null;
  private ts: ThoughtStream | null = null;
  private circuitBreakerTripped = false;
  private circuitBreakerReason: string | null = null;

  constructor(db: Database.Database, config: GuardrailConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      minFitnessDelta: config.minFitnessDelta ?? 0.01,
      declineThreshold: config.declineThreshold ?? 3,
      maxWarnings: config.maxWarnings ?? 3,
    };
    runGuardrailMigration(db);
  }

  setParameterRegistry(registry: ParameterRegistry): void { this.registry = registry; }
  setGoalEngine(engine: GoalEngine): void { this.goalEngine = engine; }
  setThoughtStream(stream: ThoughtStream): void { this.ts = stream; }

  // ── Parameter Validation ────────────────────────────────

  /** Check if a parameter change is within safe bounds. */
  validateParameterChange(param: string, oldVal: number, newVal: number): ValidationResult {
    if (this.circuitBreakerTripped) {
      return { allowed: false, reason: `Circuit breaker tripped: ${this.circuitBreakerReason}` };
    }

    // Reject no-ops
    if (oldVal === newVal) {
      return { allowed: true, reason: 'No change' };
    }

    // Check parameter bounds and change magnitude
    if (this.registry) {
      const params = this.registry.list();
      const [engine, name] = param.split(':');
      const def = params.find(p => p.engine === engine && p.name === name);
      if (def) {
        // Reject out-of-bounds first
        if (newVal < def.min || newVal > def.max) {
          return { allowed: false, reason: `Value ${newVal} out of bounds [${def.min}, ${def.max}]` };
        }
        // Reject extreme jumps (>50% of range in one step)
        const range = def.max - def.min;
        const delta = Math.abs(newVal - oldVal);
        if (range > 0 && delta > range * 0.5) {
          return { allowed: false, reason: `Change too large: ${delta.toFixed(4)} > 50% of range (${range.toFixed(4)})` };
        }
      }
    }

    return { allowed: true, reason: 'OK' };
  }

  // ── Fitness Delta ──────────────────────────────────────

  /** Only accept if fitness improved by at least minDelta. */
  checkFitnessDelta(oldFitness: number, newFitness: number, minDelta?: number): boolean {
    const threshold = minDelta ?? this.config.minFitnessDelta;
    return newFitness - oldFitness >= threshold;
  }

  // ── Protected Paths ─────────────────────────────────────

  /** Check if a file path is protected from self-modification. */
  isProtectedPath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return PROTECTED_PATHS.some(p => normalized.includes(p));
  }

  /** Get list of protected path patterns. */
  getProtectedPaths(): string[] {
    return [...PROTECTED_PATHS];
  }

  // ── Parameter Changelog ─────────────────────────────────

  /** Record a parameter change for audit trail. */
  recordParameterChange(param: string, oldValue: number, newValue: number, fitnessBefore?: number, fitnessAfter?: number, generation?: number, source = 'evolution'): void {
    this.db.prepare(`
      INSERT INTO parameter_changelog (param, old_value, new_value, fitness_before, fitness_after, generation, source)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(param, oldValue, newValue, fitnessBefore ?? null, fitnessAfter ?? null, generation ?? null, source);
  }

  /** Rollback the last N parameter changes. */
  rollbackParameters(steps = 1): RollbackResult {
    const changes = this.db.prepare(
      'SELECT * FROM parameter_changelog ORDER BY id DESC LIMIT ?',
    ).all(steps) as Array<{
      id: number; param: string; old_value: number; new_value: number;
    }>;

    const result: RollbackResult = { rolledBack: 0, parameters: [] };

    for (const change of changes) {
      if (this.registry) {
        const [engine, name] = change.param.split(':');
        if (engine && name) {
          this.registry.set(engine, name, change.old_value, 'guardrail-rollback', 'Auto-rollback');
          result.parameters.push({
            param: change.param,
            from: change.new_value,
            to: change.old_value,
          });
          result.rolledBack++;
        }
      }
    }

    if (result.rolledBack > 0) {
      this.log.info(`[guardrails] Rolled back ${result.rolledBack} parameter changes`);
      this.ts?.emit('guardrails', 'reflecting', `Rolled back ${result.rolledBack} parameter changes`, 'notable');
    }

    return result;
  }

  // ── Auto-Rollback Detection ────────────────────────────

  /** Check if fitness has been declining for N generations and auto-rollback if so. */
  checkAutoRollback(): RollbackResult | null {
    const rows = this.db.prepare(
      'SELECT generation, fitness_after FROM parameter_changelog WHERE fitness_after IS NOT NULL AND generation IS NOT NULL ORDER BY id DESC LIMIT ?',
    ).all(this.config.declineThreshold + 1) as Array<{ generation: number; fitness_after: number }>;

    if (rows.length < this.config.declineThreshold + 1) return null;

    // Check if each generation's fitness is lower than the previous
    let declining = true;
    for (let i = 0; i < rows.length - 1; i++) {
      if (rows[i].fitness_after >= rows[i + 1].fitness_after) {
        declining = false;
        break;
      }
    }

    if (declining) {
      this.log.warn(`[guardrails] Fitness declining for ${this.config.declineThreshold} generations — auto-rollback`);
      this.ts?.emit('guardrails', 'reflecting', `Auto-rollback: fitness declined ${this.config.declineThreshold} generations`, 'notable');
      // Rollback all changes from the declining generations
      return this.rollbackParameters(this.config.declineThreshold);
    }

    return null;
  }

  // ── Health Check ───────────────────────────────────────

  /** Comprehensive health check. */
  checkHealth(): HealthReport {
    const warnings: HealthWarning[] = [];

    // 1. Check goal stagnation
    if (this.goalEngine) {
      try {
        const status = this.goalEngine.getStatus();
        if (status.activeGoals > 0 && status.achievedGoals === 0 && status.totalGoals > 5) {
          warnings.push({
            category: 'goals',
            message: `${status.activeGoals} active goals but 0 achieved — progress stagnant`,
            severity: 'medium',
          });
        }
      } catch (err) { this.log.debug(`[guardrails] Goal engine check failed: ${(err as Error).message}`); }
    }

    // 2. Check fitness trend (last 5 changes)
    try {
      const recent = this.db.prepare(
        'SELECT fitness_after FROM parameter_changelog WHERE fitness_after IS NOT NULL ORDER BY id DESC LIMIT 5',
      ).all() as Array<{ fitness_after: number }>;

      if (recent.length >= 3) {
        const firstFitness = recent[recent.length - 1].fitness_after;
        const lastFitness = recent[0].fitness_after;
        if (lastFitness < firstFitness * 0.8) {
          warnings.push({
            category: 'fitness',
            message: `Fitness dropped ${((1 - lastFitness / firstFitness) * 100).toFixed(1)}% over last ${recent.length} changes`,
            severity: 'high',
          });
        }
      }
    } catch (err) { this.log.debug(`[guardrails] Fitness trend check failed: ${(err as Error).message}`); }

    // 3. Check parameter change frequency (too many changes = instability)
    try {
      const recentCount = (this.db.prepare(
        "SELECT COUNT(*) as cnt FROM parameter_changelog WHERE created_at > datetime('now', '-1 hour')",
      ).get() as { cnt: number }).cnt;

      if (recentCount > 20) {
        warnings.push({
          category: 'stability',
          message: `${recentCount} parameter changes in the last hour — high instability`,
          severity: 'medium',
        });
      }
    } catch (err) { this.log.debug(`[guardrails] Change frequency check failed: ${(err as Error).message}`); }

    // 4. Check memory/DB size (pragmatic check)
    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / (1024 * 1024);
      if (heapUsedMB > 512) {
        warnings.push({
          category: 'memory',
          message: `Heap usage at ${heapUsedMB.toFixed(0)}MB — consider restart`,
          severity: heapUsedMB > 1024 ? 'high' : 'medium',
        });
      }
    } catch (err) { this.log.debug(`[guardrails] Memory check failed: ${(err as Error).message}`); }

    // Calculate health score
    const severityWeights = { low: 0.1, medium: 0.25, high: 0.4 };
    const penalty = warnings.reduce((sum, w) => sum + severityWeights[w.severity], 0);
    const score = Math.max(0, Math.min(1, 1 - penalty));

    // Trip circuit breaker if too many warnings
    const highWarnings = warnings.filter(w => w.severity === 'high').length;
    if (warnings.length >= this.config.maxWarnings || highWarnings >= 2) {
      if (!this.circuitBreakerTripped) {
        const reason = `Health check: ${warnings.length} warnings (${highWarnings} high)`;
        this.tripCircuitBreaker(reason);
      }
    }

    const recommendation = warnings.length === 0
      ? 'All systems nominal'
      : warnings.length < this.config.maxWarnings
        ? 'Minor issues detected — monitoring'
        : 'Critical issues — autonomous operations paused';

    return {
      score,
      warnings,
      circuitBreakerTripped: this.circuitBreakerTripped,
      recommendation,
    };
  }

  // ── Circuit Breaker ────────────────────────────────────

  /** Trip the circuit breaker — pauses evolution + selfmod. */
  tripCircuitBreaker(reason: string): void {
    this.circuitBreakerTripped = true;
    this.circuitBreakerReason = reason;

    this.db.prepare(
      'INSERT INTO circuit_breaker_log (tripped, reason) VALUES (1, ?)',
    ).run(reason);

    this.log.warn(`[guardrails] Circuit breaker TRIPPED: ${reason}`);
    this.ts?.emit('guardrails', 'reflecting', `CIRCUIT BREAKER: ${reason}`, 'breakthrough');
  }

  /** Check if circuit breaker is tripped. */
  isCircuitBreakerTripped(): boolean {
    return this.circuitBreakerTripped;
  }

  /** Reset circuit breaker (manual action). */
  resetCircuitBreaker(): void {
    this.circuitBreakerTripped = false;
    this.circuitBreakerReason = null;

    this.db.prepare(
      'INSERT INTO circuit_breaker_log (tripped, reason) VALUES (0, ?)',
    ).run('Manual reset');

    this.log.info('[guardrails] Circuit breaker reset');
    this.ts?.emit('guardrails', 'reflecting', 'Circuit breaker reset', 'notable');
  }

  // ── Status ─────────────────────────────────────────────

  getStatus(): GuardrailStatus {
    const totalRollbacks = (this.db.prepare(
      "SELECT COUNT(*) as cnt FROM parameter_changelog WHERE source = 'guardrail-rollback'",
    ).get() as { cnt: number }).cnt;

    const recentChanges = (this.db.prepare(
      "SELECT COUNT(*) as cnt FROM parameter_changelog WHERE created_at > datetime('now', '-1 hour')",
    ).get() as { cnt: number }).cnt;

    const health = this.checkHealth();

    return {
      circuitBreakerTripped: this.circuitBreakerTripped,
      circuitBreakerReason: this.circuitBreakerReason,
      totalRollbacks,
      recentChanges,
      healthScore: health.score,
      protectedPaths: this.getProtectedPaths(),
    };
  }
}
