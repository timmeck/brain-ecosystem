import type { ErrorRecord } from '../types/error.types.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { MatchingConfig } from '../types/config.types.js';
import type { EmbeddingEngine } from '../embeddings/engine.js';
import type { AutoResolutionService, AutoResolutionResult } from './auto-resolution.service.js';
import { parseError } from '../parsing/error-parser.js';
import { generateFingerprint } from '../matching/fingerprint.js';
import { matchError, type MatchResult } from '../matching/error-matcher.js';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

export interface ReportErrorInput {
  project: string;
  errorOutput: string;
  filePath?: string;
  terminalId?: number;
  taskContext?: string;
  workingDirectory?: string;
  command?: string;
}

export interface ErrorQueryInput {
  projectId?: number;
  resolved?: boolean;
  search?: string;
  limit?: number;
}

export class ErrorService {
  private logger = getLogger();
  private eventBus = getEventBus();
  private matchingConfig: MatchingConfig | null = null;
  private embeddingEngine: EmbeddingEngine | null = null;
  private autoResolution: AutoResolutionService | null = null;

  constructor(
    private errorRepo: ErrorRepository,
    private projectRepo: ProjectRepository,
    private synapseManager: SynapseManager,
    matchingConfig?: MatchingConfig,
  ) {
    this.matchingConfig = matchingConfig ?? null;
  }

  setEmbeddingEngine(engine: EmbeddingEngine): void {
    this.embeddingEngine = engine;
  }

  setAutoResolution(service: AutoResolutionService): void {
    this.autoResolution = service;
  }

  report(input: ReportErrorInput): { errorId: number; isNew: boolean; matches: MatchResult[]; crossProjectMatches?: MatchResult[]; suggestions?: AutoResolutionResult } {
    // 1. Ensure project exists
    let project = this.projectRepo.findByName(input.project);
    if (!project) {
      const id = this.projectRepo.create({ name: input.project, path: null, language: null, framework: null });
      project = this.projectRepo.getById(id)!;
    }

    // 2. Build context from available information
    const context = this.buildContext(input);

    // 3. Parse the error
    const parsed = parseError(input.errorOutput);
    if (!parsed) {
      this.logger.warn('Could not parse error output');
      const errorId = this.errorRepo.create({
        project_id: project.id,
        terminal_id: input.terminalId ?? null,
        fingerprint: '',
        type: 'UnknownError',
        message: input.errorOutput.split('\n')[0] ?? input.errorOutput,
        raw_output: input.errorOutput,
        context,
        file_path: input.filePath ?? null,
        line_number: null,
        column_number: null,
      });
      return { errorId, isNew: true, matches: [] };
    }

    // 4. Generate fingerprint
    const fingerprint = generateFingerprint(parsed.errorType, parsed.message, parsed.frames);

    // 5. Check for existing error with same fingerprint
    const existing = this.errorRepo.findByFingerprint(fingerprint);
    if (existing.length > 0) {
      const err = existing[0]!;
      this.errorRepo.incrementOccurrence(err.id);
      // Update context if previously null
      if (!err.context && context) {
        this.errorRepo.update(err.id, { context });
      }
      this.logger.info(`Known error (id=${err.id}), occurrence incremented`);

      // Strengthen synapse
      this.synapseManager.strengthen(
        { type: 'error', id: err.id },
        { type: 'project', id: project.id },
        'co_occurs',
      );

      return { errorId: err.id, isNew: false, matches: [] };
    }

    // 6. Create new error record
    const errorId = this.errorRepo.create({
      project_id: project.id,
      terminal_id: input.terminalId ?? null,
      fingerprint,
      type: parsed.errorType,
      message: parsed.message,
      raw_output: input.errorOutput,
      context,
      file_path: parsed.sourceFile ?? input.filePath ?? null,
      line_number: parsed.sourceLine ?? null,
      column_number: null,
    });

    // 7. Create synapse: error ↔ project
    this.synapseManager.strengthen(
      { type: 'error', id: errorId },
      { type: 'project', id: project.id },
      'co_occurs',
    );

    // 8. Find similar errors (with vector scores if embedding engine is available)
    const candidates = this.errorRepo.findByProject(project.id)
      .filter(e => e.id !== errorId);
    const newError = this.errorRepo.getById(errorId)!;
    const vectorScores = this.embeddingEngine?.isReady()
      ? this.embeddingEngine.computeErrorVectorScores(errorId, project.id)
      : undefined;
    const matches = matchError(newError, candidates, vectorScores);

    // 9. Create similarity synapses for strong matches
    for (const match of matches.filter(m => m.isStrong)) {
      this.synapseManager.strengthen(
        { type: 'error', id: errorId },
        { type: 'error', id: match.errorId },
        'similar_to',
      );
    }

    // 10. Error Chain Detection: link to recent unresolved errors in same project
    this.detectErrorChain(errorId, project.id);

    // 11. Cross-Project Transfer Learning
    let crossProjectMatches: MatchResult[] = [];
    if (this.matchingConfig?.crossProjectMatching) {
      crossProjectMatches = this.findCrossProjectMatches(newError, project.id);
      for (const match of crossProjectMatches.filter(m => m.isStrong)) {
        this.synapseManager.strengthen(
          { type: 'error', id: errorId },
          { type: 'error', id: match.errorId },
          'cross_project',
        );
      }
    }

    // 12. Auto-Resolution: find solutions for matched errors
    let suggestions: AutoResolutionResult | undefined;
    if (this.autoResolution && (matches.length > 0 || crossProjectMatches.length > 0)) {
      suggestions = this.autoResolution.getSuggestions(errorId, matches, crossProjectMatches);
    }

    this.eventBus.emit('error:reported', { errorId, projectId: project.id, fingerprint });
    this.logger.info(`New error reported (id=${errorId}, type=${parsed.errorType})`);

    return { errorId, isNew: true, matches, crossProjectMatches, suggestions };
  }

  query(input: ErrorQueryInput): ErrorRecord[] {
    if (input.search && input.search.trim()) {
      return this.errorRepo.search(input.search.trim());
    }
    if (input.resolved === false) {
      return this.errorRepo.findUnresolved(input.projectId);
    }
    if (input.projectId) {
      return this.errorRepo.findByProject(input.projectId);
    }
    // Default: return recent errors (most recent first)
    return this.errorRepo.findAll(input.limit ?? 100);
  }

  matchSimilar(errorId: number): MatchResult[] {
    const error = this.errorRepo.getById(errorId);
    if (!error) return [];

    const candidates = this.errorRepo.findByProject(error.project_id)
      .filter(e => e.id !== errorId);

    // Hybrid search: include vector scores if embedding engine is available
    const vectorScores = this.embeddingEngine?.isReady()
      ? this.embeddingEngine.computeErrorVectorScores(errorId, error.project_id)
      : undefined;

    return matchError(error, candidates, vectorScores);
  }

  resolve(errorId: number, solutionId?: number): void {
    this.errorRepo.update(errorId, {
      resolved: 1,
      resolved_at: new Date().toISOString(),
    });

    if (solutionId) {
      this.eventBus.emit('error:resolved', { errorId, solutionId });
    }
  }

  getById(id: number): ErrorRecord | undefined {
    return this.errorRepo.getById(id);
  }

  countSince(since: string, projectId?: number): number {
    return this.errorRepo.countSince(since, projectId);
  }

  getErrorChain(errorId: number): { parents: ErrorRecord[]; children: ErrorRecord[] } {
    return {
      parents: this.errorRepo.findChainParents(errorId),
      children: this.errorRepo.findChainChildren(errorId),
    };
  }

  private findCrossProjectMatches(error: ErrorRecord, currentProjectId: number): MatchResult[] {
    const allProjects = this.projectRepo.getAll();
    const otherProjects = allProjects.filter(p => p.id !== currentProjectId);
    const weight = this.matchingConfig?.crossProjectWeight ?? 0.7;

    const allMatches: MatchResult[] = [];
    for (const project of otherProjects) {
      const candidates = this.errorRepo.findByProject(project.id)
        .filter(e => e.resolved === 1); // Only look at resolved errors from other projects
      const matches = matchError(error, candidates);
      // Apply cross-project weight discount
      for (const match of matches) {
        match.score *= weight;
        match.isStrong = match.score >= 0.90;
        allMatches.push(match);
      }
    }

    return allMatches.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  private detectErrorChain(newErrorId: number, projectId: number): void {
    // Look for recent unresolved errors in the same project (last 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const recentErrors = this.errorRepo.findRecentByProject(projectId, tenMinutesAgo, 5);

    for (const recent of recentErrors) {
      if (recent.id === newErrorId) continue;
      if (recent.resolved === 0) {
        // This new error appeared while trying to fix a recent error → chain
        this.errorRepo.createChain(recent.id, newErrorId, 'caused_by_fix');
        this.synapseManager.strengthen(
          { type: 'error', id: recent.id },
          { type: 'error', id: newErrorId },
          'causes',
        );
        this.logger.info(`Error chain: #${recent.id} → #${newErrorId} (caused_by_fix)`);
        break; // Link to most recent parent only
      }
    }
  }

  private buildContext(input: ReportErrorInput): string | null {
    const parts: string[] = [];
    if (input.taskContext) parts.push(`task: ${input.taskContext}`);
    if (input.command) parts.push(`command: ${input.command}`);
    if (input.workingDirectory) parts.push(`cwd: ${input.workingDirectory}`);
    if (input.filePath) parts.push(`file: ${input.filePath}`);
    return parts.length > 0 ? parts.join(' | ') : null;
  }
}
