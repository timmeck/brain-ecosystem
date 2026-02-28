import type { ResearchConfig } from '../types/config.types.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import type { SynapseRepository } from '../db/repositories/synapse.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import { getLogger } from '../utils/logger.js';

/**
 * Identifies gaps: unresolved recurring errors, missing solutions, isolated synapse nodes.
 */
export class GapAnalyzer {
  private logger = getLogger();

  constructor(
    private errorRepo: ErrorRepository,
    private solutionRepo: SolutionRepository,
    private synapseRepo: SynapseRepository,
    private projectRepo: ProjectRepository,
    private insightRepo: InsightRepository,
    private config: ResearchConfig,
  ) {}

  analyze(): number {
    let insightsCreated = 0;

    insightsCreated += this.findUnresolvedRecurring();
    insightsCreated += this.findFailedSolutions();
    insightsCreated += this.findIsolatedNodes();

    this.logger.info(`Gap analysis complete: ${insightsCreated} insights`);
    return insightsCreated;
  }

  private findUnresolvedRecurring(): number {
    const unresolved = this.errorRepo.findUnresolved();
    const recurring = unresolved.filter(e => e.occurrence_count >= this.config.gapMinOccurrences);
    let count = 0;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    for (const error of recurring) {
      const solutions = this.solutionRepo.findForError(error.id);
      if (solutions.length === 0) {
        this.insightRepo.create({
          type: 'warning',
          title: `Unresolved recurring error: ${error.type}`,
          description: `"${error.message.substring(0, 80)}..." has occurred ${error.occurrence_count} times with no solution.`,
          evidence: JSON.stringify({ errorId: error.id, occurrences: error.occurrence_count, type: error.type }),
          priority: Math.min(95, 40 + error.occurrence_count * 5),
          project_id: error.project_id,
          active: 1,
          expires_at: expiresAt,
        });
        count++;
      }
    }

    return count;
  }

  private findFailedSolutions(): number {
    const projects = this.projectRepo.getAll();
    let count = 0;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    for (const project of projects) {
      const errors = this.errorRepo.findUnresolved(project.id);
      for (const error of errors) {
        if (error.occurrence_count < this.config.gapMinOccurrences) continue;

        const solutions = this.solutionRepo.findForError(error.id);
        if (solutions.length < 2) continue;

        const allFailed = solutions.every(s => {
          const rate = this.solutionRepo.successRate(s.id);
          return rate < 0.3;
        });

        if (allFailed) {
          this.insightRepo.create({
            type: 'warning',
            title: `All solutions failing for: ${error.type}`,
            description: `${solutions.length} solutions tried for "${error.message.substring(0, 60)}..." but all have <30% success rate.`,
            evidence: JSON.stringify({
              errorId: error.id,
              solutionCount: solutions.length,
              solutionIds: solutions.map(s => s.id),
            }),
            priority: Math.min(90, 50 + solutions.length * 10),
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

  private findIsolatedNodes(): number {
    const projects = this.projectRepo.getAll();
    let count = 0;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    for (const project of projects) {
      const errors = this.errorRepo.findByProject(project.id);
      let projectIsolated = 0;

      for (const error of errors) {
        const connections = this.synapseRepo.findConnected('error', error.id);
        if (connections.length === 0) {
          projectIsolated++;
        }
      }

      if (projectIsolated > 5) {
        this.insightRepo.create({
          type: 'optimization',
          title: `${projectIsolated} errors without connections in ${project.name}`,
          description: `These errors have no synapses to solutions, modules, or other errors. Brain cannot contextualize them.`,
          evidence: JSON.stringify({ projectId: project.id, isolatedCount: projectIsolated }),
          priority: 25,
          project_id: project.id,
          active: 1,
          expires_at: expiresAt,
        });
        count++;
      }
    }

    return count;
  }
}
