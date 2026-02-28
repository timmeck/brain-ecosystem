import type { ChangelogRepository } from '../db/repositories/changelog.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { ChangelogEntry, RecordChangeInput, QueryChangesInput } from '../types/decision.types.js';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

export class ChangelogService {
  private logger = getLogger();

  constructor(
    private changelogRepo: ChangelogRepository,
    private projectRepo: ProjectRepository,
    private synapseManager: SynapseManager,
  ) {}

  recordChange(input: RecordChangeInput): { changeId: number } {
    const bus = getEventBus();

    let projectId = input.projectId ?? 0;
    if (!input.projectId && input.project) {
      const project = this.projectRepo.findByName(input.project);
      if (project) projectId = project.id;
    }

    const changeId = this.changelogRepo.create({
      project_id: projectId,
      session_id: input.sessionId ?? null,
      file_path: input.filePath,
      change_type: input.changeType,
      summary: input.summary,
      reason: input.reason ?? null,
      diff_snippet: input.diffSnippet ?? null,
      related_error_id: input.relatedErrorId ?? null,
      related_decision_id: input.relatedDecisionId ?? null,
      commit_hash: input.commitHash ?? null,
      embedding: null,
    });

    // Synapse: changelog → project
    if (projectId) {
      this.synapseManager.strengthen(
        { type: 'changelog_entry', id: changeId },
        { type: 'project', id: projectId },
        'co_occurs',
      );
    }

    // Synapse: changelog → error (solves)
    if (input.relatedErrorId) {
      this.synapseManager.strengthen(
        { type: 'changelog_entry', id: changeId },
        { type: 'error', id: input.relatedErrorId },
        'solves',
      );
    }

    // Synapse: changelog → decision (derived_from)
    if (input.relatedDecisionId) {
      this.synapseManager.strengthen(
        { type: 'changelog_entry', id: changeId },
        { type: 'decision', id: input.relatedDecisionId },
        'derived_from',
      );
    }

    bus.emit('changelog:recorded', { changeId, projectId, filePath: input.filePath });
    this.logger.info(`Changelog #${changeId}: ${input.changeType} ${input.filePath}`);
    return { changeId };
  }

  queryChanges(input: QueryChangesInput): ChangelogEntry[] {
    if (input.query) {
      try {
        return this.changelogRepo.search(input.query, input.limit ?? 20);
      } catch {
        // FTS syntax error — fall back
      }
    }

    if (input.filePath) {
      return this.changelogRepo.findByFile(input.filePath, input.projectId, input.limit ?? 50);
    }

    if (input.sessionId) {
      return this.changelogRepo.findBySession(input.sessionId);
    }

    if (input.projectId) {
      return this.changelogRepo.findByProject(input.projectId, input.limit ?? 50);
    }

    return [];
  }

  getById(id: number): ChangelogEntry | undefined {
    return this.changelogRepo.getById(id);
  }

  getFileHistory(filePath: string, projectId?: number): ChangelogEntry[] {
    return this.changelogRepo.findByFile(filePath, projectId);
  }
}
