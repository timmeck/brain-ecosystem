import type { ResearchConfig } from '../types/config.types.js';
import type { SynapseRepository } from '../db/repositories/synapse.repository.js';
import type { CodeModuleRepository } from '../db/repositories/code-module.repository.js';
import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import { getLogger } from '../utils/logger.js';

/**
 * Detects synergies: module pairs, transferable solutions, workflow patterns.
 */
export class SynergyDetector {
  private logger = getLogger();

  constructor(
    private synapseRepo: SynapseRepository,
    private codeModuleRepo: CodeModuleRepository,
    private solutionRepo: SolutionRepository,
    private errorRepo: ErrorRepository,
    private projectRepo: ProjectRepository,
    private insightRepo: InsightRepository,
    private config: ResearchConfig,
  ) {}

  detect(): number {
    let insightsCreated = 0;

    insightsCreated += this.findModuleSynergies();
    insightsCreated += this.findTransferableSolutions();

    this.logger.info(`Synergy detection complete: ${insightsCreated} insights`);
    return insightsCreated;
  }

  private findModuleSynergies(): number {
    const strongSynapses = this.synapseRepo.findByWeight(this.config.synergyMinWeight);
    const modulePairs = strongSynapses.filter(s =>
      s.source_type === 'code_module' &&
      s.target_type === 'code_module' &&
      s.synapse_type === 'co_occurs',
    );

    let count = 0;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    for (const synapse of modulePairs) {
      const sourceModule = this.codeModuleRepo.getById(synapse.source_id);
      const targetModule = this.codeModuleRepo.getById(synapse.target_id);
      if (!sourceModule || !targetModule) continue;

      this.insightRepo.create({
        type: 'correlation',
        title: `Strong module pair: ${sourceModule.name} + ${targetModule.name}`,
        description: `These modules co-occur with weight ${synapse.weight.toFixed(2)}. Consider combining into a shared package.`,
        evidence: JSON.stringify({
          sourceId: sourceModule.id,
          targetId: targetModule.id,
          sourceName: sourceModule.name,
          targetName: targetModule.name,
          weight: synapse.weight,
        }),
        priority: Math.min(70, Math.round(synapse.weight * 70)),
        project_id: sourceModule.project_id,
        active: 1,
        expires_at: expiresAt,
      });
      count++;
    }

    return count;
  }

  private findTransferableSolutions(): number {
    const projects = this.projectRepo.getAll();
    if (projects.length < 2) return 0;

    let count = 0;
    const expiresAt = new Date(Date.now() + this.config.insightExpiryDays * 86400000).toISOString();

    for (let i = 0; i < projects.length; i++) {
      for (let j = i + 1; j < projects.length; j++) {
        const projectA = projects[i]!;
        const projectB = projects[j]!;

        const errorsA = this.errorRepo.findByProject(projectA.id);
        const errorsB = this.errorRepo.findUnresolved(projectB.id);

        const transferable: number[] = [];

        for (const errorB of errorsB) {
          const matchingA = errorsA.filter(a => a.type === errorB.type && a.resolved);
          for (const matchA of matchingA) {
            const solutions = this.solutionRepo.findForError(matchA.id);
            for (const sol of solutions) {
              const rate = this.solutionRepo.successRate(sol.id);
              if (rate >= 0.5 && !transferable.includes(sol.id)) {
                transferable.push(sol.id);
              }
            }
          }
        }

        if (transferable.length >= 2) {
          this.insightRepo.create({
            type: 'suggestion',
            title: `${projectA.name} has solutions for ${projectB.name}`,
            description: `${transferable.length} successful solutions from ${projectA.name} could help resolve errors in ${projectB.name}.`,
            evidence: JSON.stringify({
              sourceProject: projectA.id,
              targetProject: projectB.id,
              solutionIds: transferable,
            }),
            priority: 50,
            project_id: projectB.id,
            active: 1,
            expires_at: expiresAt,
          });
          count++;
        }
      }
    }

    return count;
  }
}
