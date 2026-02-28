import type { ResearchConfig } from '../types/config.types.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import type { CodeModuleRepository } from '../db/repositories/code-module.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import { getLogger } from '../utils/logger.js';

/**
 * Generates project suggestions, tool ideas, and optimization hints.
 */
export class InsightGenerator {
  private logger = getLogger();

  constructor(
    private projectRepo: ProjectRepository,
    private errorRepo: ErrorRepository,
    private solutionRepo: SolutionRepository,
    private codeModuleRepo: CodeModuleRepository,
    private insightRepo: InsightRepository,
    private config: ResearchConfig,
  ) {}

  generate(): number {
    let insightsCreated = 0;

    insightsCreated += this.suggestRefactoring();
    insightsCreated += this.suggestErrorTypeTools();
    this.reprioritizeInsights();

    this.logger.info(`Insight generation complete: ${insightsCreated} new insights`);
    return insightsCreated;
  }

  private suggestRefactoring(): number {
    const projects = this.projectRepo.getAll();
    let count = 0;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    for (const project of projects) {
      const modules = this.codeModuleRepo.findByProject(project.id);
      const problematic = modules.filter(m =>
        (m.complexity ?? 0) > 10 && m.reusability_score < 0.3 && m.lines_of_code > 50,
      );

      if (problematic.length > 0) {
        this.insightRepo.create({
          type: 'optimization',
          title: `${problematic.length} complex modules need refactoring in ${project.name}`,
          description: `These modules have high complexity (>10), low reusability (<30%), and are non-trivial (>50 LOC). Refactoring would improve maintainability.`,
          evidence: JSON.stringify({
            modules: problematic.map(m => ({
              id: m.id,
              name: m.name,
              complexity: m.complexity,
              reusability: m.reusability_score,
              loc: m.lines_of_code,
            })),
          }),
          priority: Math.min(70, 30 + problematic.length * 10),
          project_id: project.id,
          active: 1,
          expires_at: expiresAt,
        });
        count++;
      }
    }

    return count;
  }

  private suggestErrorTypeTools(): number {
    const projects = this.projectRepo.getAll();
    let count = 0;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    for (const project of projects) {
      const errors = this.errorRepo.findByProject(project.id);
      if (errors.length < this.config.minDataPoints) continue;

      // Group errors by type
      const byType = new Map<string, number>();
      for (const error of errors) {
        byType.set(error.type, (byType.get(error.type) ?? 0) + error.occurrence_count);
      }

      // Find dominant error types
      for (const [errorType, totalOccurrences] of byType) {
        if (totalOccurrences >= this.config.gapMinOccurrences * 3) {
          this.insightRepo.create({
            type: 'suggestion',
            title: `Frequent error type: ${errorType} in ${project.name}`,
            description: `${errorType} has ${totalOccurrences} total occurrences. Consider adding linting rules, type checking, or tooling to prevent this class of errors.`,
            evidence: JSON.stringify({ errorType, totalOccurrences, projectId: project.id }),
            priority: Math.min(65, 30 + Math.round(totalOccurrences / 5)),
            project_id: project.id,
            active: 1,
            expires_at: expiresAt,
          });
          count++;
        }
      }
    }

    return count;
  }

  private reprioritizeInsights(): void {
    const activeInsights = this.insightRepo.findActive();

    for (const insight of activeInsights) {
      if (insight.type === 'warning') {
        const ageMs = Date.now() - new Date(insight.created_at).getTime();
        const ageDays = ageMs / 86400000;
        if (ageDays > 3 && insight.priority < 80) {
          this.insightRepo.update(insight.id, {
            priority: Math.min(85, insight.priority + 10),
          });
        }
      }
    }
  }
}
