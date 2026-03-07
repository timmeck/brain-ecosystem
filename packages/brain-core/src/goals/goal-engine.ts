import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';

// ── Types ───────────────────────────────────────────────

export interface GoalEngineConfig {
  brainName: string;
  /** Maximum active goals at once. Default: 10 */
  maxActiveGoals?: number;
  /** Minimum data points for forecast. Default: 3 */
  minForecastCycles?: number;
}

export type GoalType = 'metric_target' | 'discovery' | 'quality' | 'custom';
export type GoalStatus = 'active' | 'achieved' | 'failed' | 'paused';

export interface Goal {
  id?: number;
  title: string;
  description: string;
  type: GoalType;
  metricName: string;
  targetValue: number;
  currentValue: number;
  baselineValue: number;
  deadlineCycles: number;
  startedCycle: number;
  status: GoalStatus;
  priority: number;
  createdAt: string;
  achievedAt: string | null;
}

export interface GoalProgress {
  id?: number;
  goalId: number;
  cycle: number;
  value: number;
  delta: number;
  timestamp: string;
}

export interface GoalProgressReport {
  goal: Goal;
  progressPercent: number;
  trend: 'improving' | 'declining' | 'stagnant';
  estimatedCycles: number | null;
  dataPoints: number;
}

export interface GoalForecast {
  goalId: number;
  estimatedCycle: number | null;
  confidence: number;
  slope: number;
  currentRate: number;
  willComplete: boolean;
}

export interface GoalSuggestion {
  title: string;
  metricName: string;
  targetValue: number;
  deadlineCycles: number;
  reason: string;
  type: GoalType;
}

export interface GoalEngineStatus {
  totalGoals: number;
  activeGoals: number;
  achievedGoals: number;
  failedGoals: number;
  pausedGoals: number;
  recentAchievements: Goal[];
  topActive: Goal[];
  uptime: number;
}

export interface GoalEngineDataSources {
  /** Get current prediction accuracy (0-1) */
  getPredictionAccuracy?: () => number;
  /** Get number of active curiosity gaps */
  getActiveGaps?: () => number;
  /** Get total principle count */
  getPrincipleCount?: () => number;
  /** Get knowledge quality score (0-1) */
  getKnowledgeQuality?: () => number;
  /** Get total experiment count */
  getExperimentCount?: () => number;
  /** Get hypothesis confirmation rate */
  getConfirmationRate?: () => number;
}

// ── Migration ───────────────────────────────────────────

export function runGoalEngineMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'metric_target',
      metric_name TEXT NOT NULL,
      target_value REAL NOT NULL,
      current_value REAL NOT NULL DEFAULT 0,
      baseline_value REAL NOT NULL DEFAULT 0,
      deadline_cycles INTEGER NOT NULL DEFAULT 50,
      started_cycle INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      priority REAL NOT NULL DEFAULT 0.5,
      created_at TEXT DEFAULT (datetime('now')),
      achieved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
    CREATE INDEX IF NOT EXISTS idx_goals_metric ON goals(metric_name);

    CREATE TABLE IF NOT EXISTS goal_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      cycle INTEGER NOT NULL,
      value REAL NOT NULL,
      delta REAL NOT NULL DEFAULT 0,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    );
    CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON goal_progress(goal_id);
    CREATE INDEX IF NOT EXISTS idx_goal_progress_cycle ON goal_progress(cycle);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class GoalEngine {
  private readonly db: Database.Database;
  private readonly config: Required<GoalEngineConfig>;
  private readonly log = getLogger();
  private ts: ThoughtStream | null = null;
  private sources: GoalEngineDataSources = {};
  private startTime = Date.now();

  // ── Prepared statements ──────────────────────────────
  private readonly stmtCreateGoal: Database.Statement;
  private readonly stmtGetGoal: Database.Statement;
  private readonly stmtListGoals: Database.Statement;
  private readonly stmtListGoalsByStatus: Database.Statement;
  private readonly stmtUpdateValue: Database.Statement;
  private readonly stmtUpdateStatus: Database.Statement;
  private readonly stmtCountByStatus: Database.Statement;
  private readonly stmtInsertProgress: Database.Statement;
  private readonly stmtGetProgress: Database.Statement;
  private readonly stmtActiveGoals: Database.Statement;
  private readonly stmtRecentAchievements: Database.Statement;

  constructor(db: Database.Database, config: GoalEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxActiveGoals: config.maxActiveGoals ?? 10,
      minForecastCycles: config.minForecastCycles ?? 3,
    };

    runGoalEngineMigration(db);

    this.stmtCreateGoal = db.prepare(`
      INSERT INTO goals (title, description, type, metric_name, target_value, current_value, baseline_value, deadline_cycles, started_cycle, status, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);

    this.stmtGetGoal = db.prepare('SELECT * FROM goals WHERE id = ?');
    this.stmtListGoals = db.prepare('SELECT * FROM goals ORDER BY priority DESC, created_at DESC LIMIT ?');
    this.stmtListGoalsByStatus = db.prepare('SELECT * FROM goals WHERE status = ? ORDER BY priority DESC LIMIT ?');
    this.stmtUpdateValue = db.prepare('UPDATE goals SET current_value = ? WHERE id = ?');
    this.stmtUpdateStatus = db.prepare('UPDATE goals SET status = ?, achieved_at = ? WHERE id = ?');
    this.stmtCountByStatus = db.prepare('SELECT status, COUNT(*) as count FROM goals GROUP BY status');
    this.stmtInsertProgress = db.prepare('INSERT INTO goal_progress (goal_id, cycle, value, delta) VALUES (?, ?, ?, ?)');
    this.stmtGetProgress = db.prepare('SELECT * FROM goal_progress WHERE goal_id = ? ORDER BY cycle ASC');
    this.stmtActiveGoals = db.prepare("SELECT * FROM goals WHERE status = 'active' ORDER BY priority DESC");
    this.stmtRecentAchievements = db.prepare("SELECT * FROM goals WHERE status = 'achieved' ORDER BY achieved_at DESC LIMIT ?");
  }

  setThoughtStream(stream: ThoughtStream): void { this.ts = stream; }
  setDataSources(sources: GoalEngineDataSources): void { this.sources = sources; }

  // ── Create goal ───────────────────────────────────────

  createGoal(title: string, metricName: string, targetValue: number, deadlineCycles: number, opts?: {
    description?: string;
    type?: GoalType;
    baselineValue?: number;
    currentCycle?: number;
    priority?: number;
  }): Goal {
    const activeCount = (this.stmtListGoalsByStatus.all('active', 999) as DbGoal[]).length;
    if (activeCount >= this.config.maxActiveGoals) {
      throw new Error(`Max active goals (${this.config.maxActiveGoals}) reached. Pause or complete existing goals first.`);
    }

    const baseline = opts?.baselineValue ?? 0;
    const result = this.stmtCreateGoal.run(
      title,
      opts?.description ?? '',
      opts?.type ?? 'metric_target',
      metricName,
      targetValue,
      baseline,
      baseline,
      deadlineCycles,
      opts?.currentCycle ?? 0,
      opts?.priority ?? 0.5,
    );

    const goal = this.getGoal(Number(result.lastInsertRowid))!;

    this.ts?.emit('goals', 'reflecting', `New goal: "${title}" — target ${metricName}=${targetValue} in ${deadlineCycles} cycles`, 'notable');
    this.log.info(`[goals] Created goal: "${title}" (metric=${metricName}, target=${targetValue})`);

    return goal;
  }

  // ── Record progress ───────────────────────────────────

  recordProgress(cycle: number, metrics: Record<string, number>): number {
    const active = this.stmtActiveGoals.all() as DbGoal[];
    let updated = 0;

    for (const goal of active) {
      const value = metrics[goal.metric_name];
      if (value === undefined) continue;

      const delta = value - goal.current_value;
      this.stmtInsertProgress.run(goal.id, cycle, value, delta);
      this.stmtUpdateValue.run(value, goal.id);
      updated++;
    }

    return updated;
  }

  // ── Check goals for completion/failure ────────────────

  checkGoals(currentCycle: number): { achieved: Goal[]; failed: Goal[] } {
    const active = this.stmtActiveGoals.all() as DbGoal[];
    const achieved: Goal[] = [];
    const failed: Goal[] = [];

    for (const goal of active) {
      // Check if achieved
      if (goal.current_value >= goal.target_value) {
        const now = new Date().toISOString();
        this.stmtUpdateStatus.run('achieved', now, goal.id);
        const updated = this.getGoal(goal.id)!;
        achieved.push(updated);
        this.ts?.emit('goals', 'discovering', `Goal achieved: "${goal.title}" — ${goal.metric_name}=${goal.current_value} >= ${goal.target_value}`, 'notable');
        this.log.info(`[goals] Goal achieved: "${goal.title}"`);
        continue;
      }

      // Check if deadline passed
      const elapsed = currentCycle - goal.started_cycle;
      if (elapsed >= goal.deadline_cycles) {
        this.stmtUpdateStatus.run('failed', null, goal.id);
        const updated = this.getGoal(goal.id)!;
        failed.push(updated);
        this.ts?.emit('goals', 'reflecting', `Goal failed: "${goal.title}" — ${goal.metric_name}=${goal.current_value} < ${goal.target_value} after ${elapsed} cycles`, 'notable');
        this.log.info(`[goals] Goal failed: "${goal.title}" (${goal.current_value}/${goal.target_value})`);
      }
    }

    return { achieved, failed };
  }

  // ── Progress report ───────────────────────────────────

  getProgress(goalId: number): GoalProgressReport | null {
    const goal = this.getGoal(goalId);
    if (!goal) return null;

    const rows = this.stmtGetProgress.all(goalId) as DbProgress[];
    const range = goal.targetValue - goal.baselineValue;
    const current = goal.currentValue - goal.baselineValue;
    const progressPercent = range > 0 ? Math.min(100, (current / range) * 100) : 0;

    // Determine trend
    let trend: 'improving' | 'declining' | 'stagnant' = 'stagnant';
    if (rows.length >= 2) {
      const recent = rows.slice(-3);
      const avgDelta = recent.reduce((sum, r) => sum + r.delta, 0) / recent.length;
      if (avgDelta > 0.01) trend = 'improving';
      else if (avgDelta < -0.01) trend = 'declining';
    }

    // Estimate cycles to completion
    const forecast = this.forecastCompletion(goalId);

    return {
      goal,
      progressPercent,
      trend,
      estimatedCycles: forecast?.estimatedCycle ?? null,
      dataPoints: rows.length,
    };
  }

  // ── Forecast completion via linear regression ─────────

  forecastCompletion(goalId: number): GoalForecast | null {
    const goal = this.getGoal(goalId);
    if (!goal) return null;

    const rows = this.stmtGetProgress.all(goalId) as DbProgress[];
    if (rows.length < this.config.minForecastCycles) {
      return {
        goalId,
        estimatedCycle: null,
        confidence: 0,
        slope: 0,
        currentRate: 0,
        willComplete: false,
      };
    }

    // Simple linear regression: value = slope * cycle + intercept
    const n = rows.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (const row of rows) {
      sumX += row.cycle;
      sumY += row.value;
      sumXY += row.cycle * row.value;
      sumX2 += row.cycle * row.cycle;
    }

    const denominator = n * sumX2 - sumX * sumX;
    if (denominator === 0) {
      return { goalId, estimatedCycle: null, confidence: 0, slope: 0, currentRate: 0, willComplete: false };
    }

    const slope = (n * sumXY - sumX * sumY) / denominator;
    const intercept = (sumY - slope * sumX) / n;

    // Predict when target will be reached
    let estimatedCycle: number | null = null;
    let willComplete = false;

    if (slope > 0) {
      estimatedCycle = Math.ceil((goal.targetValue - intercept) / slope);
      willComplete = estimatedCycle <= goal.startedCycle + goal.deadlineCycles;
    }

    // R² for confidence
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (const row of rows) {
      const predicted = slope * row.cycle + intercept;
      ssTot += (row.value - meanY) ** 2;
      ssRes += (row.value - predicted) ** 2;
    }
    const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

    return {
      goalId,
      estimatedCycle,
      confidence: Math.max(0, r2),
      slope,
      currentRate: slope,
      willComplete,
    };
  }

  // ── Suggest goals based on weaknesses ─────────────────

  suggestGoals(_currentCycle: number): GoalSuggestion[] {
    const suggestions: GoalSuggestion[] = [];
    const metrics = this.gatherMetrics();

    // Prediction accuracy < 50% → "Improve accuracy to 60%"
    if (metrics.predictionAccuracy !== undefined && metrics.predictionAccuracy < 0.5) {
      suggestions.push({
        title: 'Improve prediction accuracy to 60%',
        metricName: 'predictionAccuracy',
        targetValue: 0.6,
        deadlineCycles: 50,
        reason: `Current prediction accuracy is ${(metrics.predictionAccuracy * 100).toFixed(0)}% — below 50% threshold`,
        type: 'quality',
      });
    }

    // Knowledge gaps > 10 → "Close gaps to under 5"
    if (metrics.activeGaps !== undefined && metrics.activeGaps > 10) {
      suggestions.push({
        title: 'Close knowledge gaps to under 5',
        metricName: 'activeGaps',
        targetValue: 5,
        deadlineCycles: 30,
        reason: `${metrics.activeGaps} active knowledge gaps — too many blind spots`,
        type: 'discovery',
      });
    }

    // Total principles < 10 → "Discover 15 principles"
    if (metrics.principleCount !== undefined && metrics.principleCount < 10) {
      suggestions.push({
        title: 'Discover 15 principles',
        metricName: 'principleCount',
        targetValue: 15,
        deadlineCycles: 40,
        reason: `Only ${metrics.principleCount} principles discovered — need broader knowledge base`,
        type: 'discovery',
      });
    }

    // Low knowledgeQuality → "Raise quality to 0.7"
    if (metrics.knowledgeQuality !== undefined && metrics.knowledgeQuality < 0.5) {
      suggestions.push({
        title: 'Raise knowledge quality to 70%',
        metricName: 'knowledgeQuality',
        targetValue: 0.7,
        deadlineCycles: 60,
        reason: `Knowledge quality at ${(metrics.knowledgeQuality * 100).toFixed(0)}% — needs improvement`,
        type: 'quality',
      });
    }

    // Low experiment count → "Run 20 experiments"
    if (metrics.experimentCount !== undefined && metrics.experimentCount < 5) {
      suggestions.push({
        title: 'Run 20 experiments',
        metricName: 'experimentCount',
        targetValue: 20,
        deadlineCycles: 50,
        reason: `Only ${metrics.experimentCount} experiments — need more empirical validation`,
        type: 'metric_target',
      });
    }

    // Filter out suggestions for goals that already exist
    const active = this.stmtActiveGoals.all() as DbGoal[];
    const activeMetrics = new Set(active.map(g => g.metric_name));
    return suggestions.filter(s => !activeMetrics.has(s.metricName));
  }

  // ── Gather metrics from data sources ──────────────────

  gatherMetrics(): Record<string, number> {
    const metrics: Record<string, number> = {};

    try { if (this.sources.getPredictionAccuracy) metrics.predictionAccuracy = this.sources.getPredictionAccuracy(); } catch { /* skip */ }
    try { if (this.sources.getActiveGaps) metrics.activeGaps = this.sources.getActiveGaps(); } catch { /* skip */ }
    try { if (this.sources.getPrincipleCount) metrics.principleCount = this.sources.getPrincipleCount(); } catch { /* skip */ }
    try { if (this.sources.getKnowledgeQuality) metrics.knowledgeQuality = this.sources.getKnowledgeQuality(); } catch { /* skip */ }
    try { if (this.sources.getExperimentCount) metrics.experimentCount = this.sources.getExperimentCount(); } catch { /* skip */ }
    try { if (this.sources.getConfirmationRate) metrics.confirmationRate = this.sources.getConfirmationRate(); } catch { /* skip */ }

    return metrics;
  }

  // ── Pause / Resume ────────────────────────────────────

  pauseGoal(id: number): boolean {
    const goal = this.getGoal(id);
    if (!goal || goal.status !== 'active') return false;
    this.stmtUpdateStatus.run('paused', null, id);
    return true;
  }

  resumeGoal(id: number, _currentCycle: number): boolean {
    const goal = this.getGoal(id);
    if (!goal || goal.status !== 'paused') return false;
    this.stmtUpdateStatus.run('active', null, id);
    return true;
  }

  // ── Query ─────────────────────────────────────────────

  listGoals(status?: string, limit = 20): Goal[] {
    const rows = status
      ? this.stmtListGoalsByStatus.all(status, limit) as DbGoal[]
      : this.stmtListGoals.all(limit) as DbGoal[];
    return rows.map(r => this.toGoal(r));
  }

  getGoal(id: number): Goal | null {
    const row = this.stmtGetGoal.get(id) as DbGoal | undefined;
    return row ? this.toGoal(row) : null;
  }

  getStatus(): GoalEngineStatus {
    const counts = this.stmtCountByStatus.all() as Array<{ status: string; count: number }>;
    const statusMap: Record<string, number> = {};
    for (const c of counts) statusMap[c.status] = c.count;

    const recent = this.stmtRecentAchievements.all(5) as DbGoal[];
    const active = this.stmtActiveGoals.all() as DbGoal[];

    return {
      totalGoals: Object.values(statusMap).reduce((a, b) => a + b, 0),
      activeGoals: statusMap['active'] ?? 0,
      achievedGoals: statusMap['achieved'] ?? 0,
      failedGoals: statusMap['failed'] ?? 0,
      pausedGoals: statusMap['paused'] ?? 0,
      recentAchievements: recent.map(r => this.toGoal(r)),
      topActive: active.slice(0, 5).map(r => this.toGoal(r)),
      uptime: Date.now() - this.startTime,
    };
  }

  // ── Private helpers ───────────────────────────────────

  private toGoal(row: DbGoal): Goal {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type as GoalType,
      metricName: row.metric_name,
      targetValue: row.target_value,
      currentValue: row.current_value,
      baselineValue: row.baseline_value,
      deadlineCycles: row.deadline_cycles,
      startedCycle: row.started_cycle,
      status: row.status as GoalStatus,
      priority: row.priority,
      createdAt: row.created_at,
      achievedAt: row.achieved_at,
    };
  }
}

// ── DB row types ────────────────────────────────────────

interface DbGoal {
  id: number;
  title: string;
  description: string;
  type: string;
  metric_name: string;
  target_value: number;
  current_value: number;
  baseline_value: number;
  deadline_cycles: number;
  started_cycle: number;
  status: string;
  priority: number;
  created_at: string;
  achieved_at: string | null;
}

interface DbProgress {
  id: number;
  goal_id: number;
  cycle: number;
  value: number;
  delta: number;
  timestamp: string;
}
