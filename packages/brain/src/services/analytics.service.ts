import type { ErrorRecord } from '../types/error.types.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import type { CodeModuleRepository } from '../db/repositories/code-module.repository.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { AntipatternRepository } from '../db/repositories/antipattern.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import type { MemoryRepository } from '../db/repositories/memory.repository.js';
import type { SessionRepository } from '../db/repositories/session.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { NetworkStats } from '../types/synapse.types.js';

export interface ProjectSummary {
  errors: { total: number; unresolved: number; last7d: number };
  solutions: { total: number };
  rules: { active: number };
  antipatterns: { total: number };
  modules: { total: number };
  insights: { active: number };
  memories: { active: number; byCategory: Record<string, number> };
  sessions: { total: number; last?: string };
  healthScore?: number;
}

export interface NetworkOverview {
  stats: NetworkStats;
  strongestSynapses: Array<{
    id: number;
    source: string;
    target: string;
    type: string;
    weight: number;
  }>;
}

export class AnalyticsService {
  private memoryRepo: MemoryRepository | null = null;
  private sessionRepo: SessionRepository | null = null;

  constructor(
    private errorRepo: ErrorRepository,
    private solutionRepo: SolutionRepository,
    private codeModuleRepo: CodeModuleRepository,
    private ruleRepo: RuleRepository,
    private antipatternRepo: AntipatternRepository,
    private insightRepo: InsightRepository,
    private synapseManager: SynapseManager,
  ) {}

  setMemoryRepos(memoryRepo: MemoryRepository, sessionRepo: SessionRepository): void {
    this.memoryRepo = memoryRepo;
    this.sessionRepo = sessionRepo;
  }

  getSummary(projectId?: number): ProjectSummary {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    const unresolvedErrors = this.errorRepo.findUnresolved(projectId);
    const allErrors = projectId ? this.errorRepo.findByProject(projectId) : [];
    const last7dCount = this.errorRepo.countSince(sevenDaysAgo, projectId);

    const rules = this.ruleRepo.findActive(projectId);
    const antipatterns = projectId
      ? this.antipatternRepo.findByProject(projectId)
      : this.antipatternRepo.findGlobal();

    const moduleCount = projectId
      ? this.codeModuleRepo.findByProject(projectId).length
      : this.codeModuleRepo.countAll();
    const insights = this.insightRepo.findActive(projectId);

    // Memory stats
    const memoryActive = this.memoryRepo?.countActive() ?? 0;
    const memoryByCategory = this.memoryRepo?.countByCategory() ?? {};
    const sessionTotal = this.sessionRepo?.countAll() ?? 0;
    const lastSession = this.sessionRepo?.findLast();

    return {
      errors: {
        total: allErrors.length,
        unresolved: unresolvedErrors.length,
        last7d: last7dCount,
      },
      solutions: { total: 0 }, // solutions are global, not per-project
      rules: { active: rules.length },
      antipatterns: { total: antipatterns.length },
      modules: { total: moduleCount },
      insights: { active: insights.length },
      memories: { active: memoryActive, byCategory: memoryByCategory },
      sessions: { total: sessionTotal, last: lastSession?.started_at },
    };
  }

  computeHealthScore(projectId?: number): number {
    const summary = this.getSummary(projectId);
    const networkStats = this.synapseManager.getNetworkStats();

    let score = 0;
    let maxScore = 0;

    // Data Volume (30 points)
    maxScore += 30;
    const dataVolume = summary.errors.total + (summary.modules.total * 2) + summary.solutions.total;
    score += Math.min(30, dataVolume * 0.3);

    // Synapse Density (20 points) - more connections = richer network
    maxScore += 20;
    const synapseDensity = networkStats.totalSynapses / Math.max(1, networkStats.totalNodes);
    score += Math.min(20, synapseDensity * 5);

    // Solution Coverage (20 points) - resolved errors vs total
    maxScore += 20;
    if (summary.errors.total > 0) {
      const resolvedRate = 1 - (summary.errors.unresolved / summary.errors.total);
      score += resolvedRate * 20;
    } else {
      score += 10; // No errors = neutral
    }

    // Learning Activity (15 points) - active rules + insights
    maxScore += 15;
    const learningActivity = summary.rules.active + summary.insights.active;
    score += Math.min(15, learningActivity * 1.5);

    // Error Trend (15 points) - fewer recent errors = better
    maxScore += 15;
    if (summary.errors.total > 0) {
      const recentRatio = summary.errors.last7d / Math.max(1, summary.errors.total);
      // Low recent ratio = health is good (errors decreasing)
      score += Math.max(0, 15 - recentRatio * 30);
    } else {
      score += 15;
    }

    return Math.round((score / maxScore) * 100);
  }

  getTimeSeries(projectId?: number, days: number = 30): Array<{ date: string; errors: number; solutions: number }> {
    const series: Array<{ date: string; errors: number; solutions: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(Date.now() - (i + 1) * 86400000).toISOString();
      const dayEnd = new Date(Date.now() - i * 86400000).toISOString();

      const errorsInDay = this.errorRepo.countSince(dayStart, projectId) - this.errorRepo.countSince(dayEnd, projectId);

      series.push({
        date: dayStart.split('T')[0]!,
        errors: Math.max(0, errorsInDay),
        solutions: 0, // Approximation
      });
    }

    return series;
  }

  explainError(errorId: number): {
    error: ErrorRecord | undefined;
    solutions: Array<{ id: number; description: string; confidence: number; successRate: number }>;
    chain: { parents: ErrorRecord[]; children: ErrorRecord[] };
    relatedErrors: Array<{ id: number; type: string; message: string; similarity: number }>;
    rules: Array<{ id: number; pattern: string; action: string; confidence: number }>;
    insights: Array<{ id: number; type: string; title: string }>;
    synapseConnections: number;
  } {
    const error = this.errorRepo.getById(errorId);
    if (!error) {
      return {
        error: undefined, solutions: [], chain: { parents: [], children: [] },
        relatedErrors: [], rules: [], insights: [], synapseConnections: 0,
      };
    }

    // Solutions
    const solutions = this.solutionRepo.findForError(errorId).map(s => ({
      id: s.id,
      description: s.description,
      confidence: s.confidence,
      successRate: this.solutionRepo.successRate(s.id),
    }));

    // Error chain
    const parents = this.errorRepo.findChainParents(errorId);
    const children = this.errorRepo.findChainChildren(errorId);

    // Related via synapses
    const context = this.synapseManager.getErrorContext(errorId);
    const relatedErrors = context.relatedErrors.map(r => {
      const e = this.errorRepo.getById(r.node.id);
      return {
        id: r.node.id,
        type: e?.type ?? 'unknown',
        message: e?.message ?? '',
        similarity: r.activation,
      };
    });

    // Prevention rules
    const matchedRules = this.ruleRepo.findActive(error.project_id);
    const rules = matchedRules
      .filter(r => {
        try { return new RegExp(r.pattern, 'i').test(`${error.type}: ${error.message}`); }
        catch { return false; }
      })
      .map(r => ({ id: r.id, pattern: r.pattern, action: r.action, confidence: r.confidence }));

    // Related insights
    const insights = context.insights.map(i => ({
      id: i.node.id,
      type: i.node.type,
      title: `Insight #${i.node.id}`,
    }));

    // Total synapse connections
    const allConnections = this.synapseManager.activate({ type: 'error', id: errorId });

    return {
      error,
      solutions,
      chain: { parents, children },
      relatedErrors,
      rules,
      insights,
      synapseConnections: allConnections.length,
    };
  }

  getNetworkOverview(limit: number = 10): NetworkOverview {
    const stats = this.synapseManager.getNetworkStats();
    // Use diverse sampling for dashboard (spread across synapse types)
    const diverse = limit >= 30
      ? this.synapseManager.getDiverseSynapses(Math.ceil(limit / 3))
      : this.synapseManager.getStrongestSynapses(limit);

    return {
      stats,
      strongestSynapses: diverse.map(s => ({
        id: s.id,
        source: `${s.source_type}:${s.source_id}`,
        target: `${s.target_type}:${s.target_id}`,
        type: s.synapse_type,
        weight: s.weight,
      })),
    };
  }
}
