import type { ResearchConfig } from '../types/config.types.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import { getLogger } from '../utils/logger.js';

/**
 * Analyzes error frequency and solution success rate trends over time windows.
 */
export class TrendAnalyzer {
  private logger = getLogger();

  constructor(
    private errorRepo: ErrorRepository,
    private solutionRepo: SolutionRepository,
    private projectRepo: ProjectRepository,
    private insightRepo: InsightRepository,
    private config: ResearchConfig,
  ) {}

  analyze(): number {
    const projects = this.projectRepo.getAll();
    let insightsCreated = 0;

    for (const project of projects) {
      insightsCreated += this.analyzeErrorTrend(project.id, project.name);
      insightsCreated += this.analyzeSolutionTrend(project.id, project.name);
    }

    this.logger.info(`Trend analysis complete: ${insightsCreated} insights`);
    return insightsCreated;
  }

  private analyzeErrorTrend(projectId: number, projectName: string): number {
    const windowDays = this.config.trendWindowDays;
    const now = Date.now();
    const recentSince = new Date(now - windowDays * 86400000).toISOString();
    const previousSince = new Date(now - windowDays * 2 * 86400000).toISOString();

    const recentErrors = this.errorRepo.countSince(recentSince, projectId);
    const allSinceDouble = this.errorRepo.countSince(previousSince, projectId);
    const previousErrors = allSinceDouble - recentErrors;

    if (previousErrors <= 0) return 0;

    const changeRate = (recentErrors - previousErrors) / previousErrors;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    if (changeRate > 0.5) {
      this.insightRepo.create({
        type: 'warning',
        title: `Error rate rising in ${projectName}`,
        description: `${Math.round(changeRate * 100)}% more errors in the last ${windowDays} days vs previous window. Check recent changes: new dependencies, refactoring, or API changes.`,
        evidence: JSON.stringify({ recentErrors, previousErrors, changeRate, windowDays }),
        priority: Math.min(90, 50 + Math.round(changeRate * 30)),
        project_id: projectId,
        active: 1,
        expires_at: expiresAt,
      });
      return 1;
    }

    if (changeRate < -0.3) {
      this.insightRepo.create({
        type: 'pattern',
        title: `Error rate declining in ${projectName}`,
        description: `${Math.round(-changeRate * 100)}% fewer errors in the last ${windowDays} days. Whatever you're doing is working.`,
        evidence: JSON.stringify({ recentErrors, previousErrors, changeRate, windowDays }),
        priority: 20,
        project_id: projectId,
        active: 1,
        expires_at: expiresAt,
      });
      return 1;
    }

    return 0;
  }

  private analyzeSolutionTrend(projectId: number, projectName: string): number {
    const errors = this.errorRepo.findByProject(projectId);
    if (errors.length < this.config.minDataPoints) return 0;

    let totalRate = 0;
    let recentRate = 0;
    let totalCount = 0;
    let recentCount = 0;
    const recentCutoff = new Date(Date.now() - this.config.trendWindowDays * 86400000).toISOString();

    for (const error of errors) {
      const solutions = this.solutionRepo.findForError(error.id);
      for (const sol of solutions) {
        const rate = this.solutionRepo.successRate(sol.id);
        totalRate += rate;
        totalCount++;

        if (sol.updated_at >= recentCutoff) {
          recentRate += rate;
          recentCount++;
        }
      }
    }

    if (totalCount === 0 || recentCount === 0) return 0;

    const avgTotal = totalRate / totalCount;
    const avgRecent = recentRate / recentCount;

    if (avgRecent < avgTotal - 0.15 && totalCount >= this.config.minDataPoints) {
      const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();
      this.insightRepo.create({
        type: 'warning',
        title: `Solution quality declining in ${projectName}`,
        description: `Recent success rate ${Math.round(avgRecent * 100)}% vs overall ${Math.round(avgTotal * 100)}%. Solutions are becoming less effective.`,
        evidence: JSON.stringify({ avgRecent, avgTotal, recentCount, totalCount }),
        priority: 60,
        project_id: projectId,
        active: 1,
        expires_at: expiresAt,
      });
      return 1;
    }

    return 0;
  }
}
