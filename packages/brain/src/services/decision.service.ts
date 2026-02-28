import type { DecisionRepository } from '../db/repositories/decision.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { DecisionRecord, RecordDecisionInput, QueryDecisionsInput } from '../types/decision.types.js';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

export class DecisionService {
  private logger = getLogger();

  constructor(
    private decisionRepo: DecisionRepository,
    private projectRepo: ProjectRepository,
    private synapseManager: SynapseManager,
  ) {}

  recordDecision(input: RecordDecisionInput): { decisionId: number } {
    const bus = getEventBus();

    let projectId = input.projectId ?? null;
    if (!projectId && input.project) {
      const project = this.projectRepo.findByName(input.project);
      if (project) projectId = project.id;
    }

    const decisionId = this.decisionRepo.create({
      project_id: projectId,
      session_id: input.sessionId ?? null,
      title: input.title,
      description: input.description,
      alternatives: input.alternatives ? JSON.stringify(input.alternatives) : null,
      category: input.category ?? 'architecture',
      status: 'active',
      superseded_by: null,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      embedding: null,
    });

    if (projectId) {
      this.synapseManager.strengthen(
        { type: 'decision', id: decisionId },
        { type: 'project', id: projectId },
        'co_occurs',
      );
    }

    bus.emit('decision:recorded', { decisionId, projectId, category: input.category ?? 'architecture' });
    this.logger.info(`Decision #${decisionId} recorded: ${input.title}`);
    return { decisionId };
  }

  queryDecisions(input: QueryDecisionsInput): DecisionRecord[] {
    if (input.query) {
      try {
        return this.decisionRepo.search(input.query, input.limit ?? 20);
      } catch {
        // FTS syntax error — fall back
      }
    }

    if (input.category) {
      return this.decisionRepo.findByCategory(input.category, input.projectId, input.status ?? 'active', input.limit ?? 20);
    }

    return this.decisionRepo.findActive(input.projectId, input.limit ?? 20);
  }

  getById(id: number): DecisionRecord | undefined {
    return this.decisionRepo.getById(id);
  }

  supersedeDecision(oldId: number, newId: number): void {
    const bus = getEventBus();
    this.decisionRepo.supersede(oldId, newId);
    bus.emit('decision:superseded', { oldId, newId });
    this.logger.info(`Decision #${oldId} superseded by #${newId}`);
  }
}
