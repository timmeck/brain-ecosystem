import type { SolutionRecord } from '../types/solution.types.js';
import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { MatchResult } from '../matching/error-matcher.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../utils/events.js';

export type SuggestionCategory = 'auto' | 'suggest' | 'learn';

export interface SolutionSuggestion {
  solution: SolutionRecord;
  /** Combined score factoring in match quality, confidence, and recency */
  score: number;
  /** Category: auto (≥0.85), suggest (0.5-0.85), learn (<0.5) */
  category: SuggestionCategory;
  /** Which matched error this solution originally solved */
  matchedErrorId: number;
  /** How similar the original error was to the current one */
  matchScore: number;
  /** Success rate of this solution across all attempts */
  successRate: number;
  /** Human-readable explanation of why this is suggested */
  reasoning: string;
}

export interface AutoResolutionResult {
  errorId: number;
  suggestions: SolutionSuggestion[];
  /** Best suggestion if any pass the auto-apply threshold */
  autoApply: SolutionSuggestion | null;
  /** Total solutions considered */
  totalConsidered: number;
}

export class AutoResolutionService {
  private logger = getLogger();
  private eventBus = getEventBus();

  constructor(
    private solutionRepo: SolutionRepository,
    private errorRepo: ErrorRepository,
    private synapseManager: SynapseManager,
  ) {}

  /**
   * Given an error and its matches, find and rank solutions.
   * Returns suggestions sorted by combined score.
   */
  getSuggestions(errorId: number, matches: MatchResult[], crossProjectMatches?: MatchResult[]): AutoResolutionResult {
    const allMatches = [
      ...matches.map(m => ({ ...m, crossProject: false })),
      ...(crossProjectMatches ?? []).map(m => ({ ...m, crossProject: true })),
    ];

    const suggestions: SolutionSuggestion[] = [];
    const seenSolutionIds = new Set<number>();

    for (const match of allMatches) {
      const solutions = this.solutionRepo.findForError(match.errorId);

      for (const solution of solutions) {
        // Deduplicate — same solution can be linked to multiple errors
        if (seenSolutionIds.has(solution.id)) continue;
        seenSolutionIds.add(solution.id);

        const successRate = this.solutionRepo.successRate(solution.id);
        const score = this.computeScore(match.score, solution.confidence, successRate, match.crossProject);
        const category = this.categorize(score);

        suggestions.push({
          solution,
          score,
          category,
          matchedErrorId: match.errorId,
          matchScore: match.score,
          successRate,
          reasoning: this.buildReasoning(match, solution, successRate, match.crossProject),
        });
      }
    }

    // Sort by score descending
    suggestions.sort((a, b) => b.score - a.score);

    // Limit to top 10
    const topSuggestions = suggestions.slice(0, 10);

    // Find auto-apply candidate
    const autoApply = topSuggestions.find(s => s.category === 'auto') ?? null;

    if (topSuggestions.length > 0) {
      this.eventBus.emit('resolution:suggested', {
        errorId,
        suggestionCount: topSuggestions.length,
        autoApply: autoApply !== null,
        bestScore: topSuggestions[0]!.score,
      });
    }

    this.logger.info(
      `Auto-resolution for error #${errorId}: ${topSuggestions.length} suggestions` +
      `${autoApply ? ` (auto-apply: solution #${autoApply.solution.id})` : ''}`
    );

    return {
      errorId,
      suggestions: topSuggestions,
      autoApply,
      totalConsidered: seenSolutionIds.size,
    };
  }

  /**
   * Get suggestions for an existing error by re-running match + solution lookup.
   */
  getSuggestionsForError(errorId: number): AutoResolutionResult {
    const error = this.errorRepo.getById(errorId);
    if (!error) {
      return { errorId, suggestions: [], autoApply: null, totalConsidered: 0 };
    }

    // Find all solutions linked to this error directly
    const directSolutions = this.solutionRepo.findForError(errorId);
    const suggestions: SolutionSuggestion[] = [];

    for (const solution of directSolutions) {
      const successRate = this.solutionRepo.successRate(solution.id);
      const score = this.computeScore(1.0, solution.confidence, successRate, false);
      const category = this.categorize(score);

      suggestions.push({
        solution,
        score,
        category,
        matchedErrorId: errorId,
        matchScore: 1.0,
        successRate,
        reasoning: `Direct solution for this error. Confidence: ${(solution.confidence * 100).toFixed(0)}%, Success rate: ${(successRate * 100).toFixed(0)}%.`,
      });
    }

    // Also check synapse-connected errors via spreading activation
    const context = this.synapseManager.getErrorContext(errorId);
    const seenSolutionIds = new Set(directSolutions.map(s => s.id));

    // Check solutions from synapse-connected errors
    for (const activation of context.relatedErrors) {
      const relatedErrorId = activation.node.id;
      const relatedSolutions = this.solutionRepo.findForError(relatedErrorId);

      for (const solution of relatedSolutions) {
        if (seenSolutionIds.has(solution.id)) continue;
        seenSolutionIds.add(solution.id);

        const successRate = this.solutionRepo.successRate(solution.id);
        const matchScore = Math.min(1.0, activation.activation);
        const score = this.computeScore(matchScore, solution.confidence, successRate, false);
        const category = this.categorize(score);

        suggestions.push({
          solution,
          score,
          category,
          matchedErrorId: relatedErrorId,
          matchScore,
          successRate,
          reasoning: `Solution from related error #${relatedErrorId} (activation: ${activation.activation.toFixed(2)}). ` +
            `Success rate: ${(successRate * 100).toFixed(0)}%.`,
        });
      }
    }

    // Also check solutions found via synapse activation directly
    for (const activation of context.solutions) {
      const sol = this.solutionRepo.getById(activation.node.id);
      if (!sol || seenSolutionIds.has(sol.id)) continue;
      seenSolutionIds.add(sol.id);

      const successRate = this.solutionRepo.successRate(sol.id);
      const matchScore = Math.min(1.0, activation.activation);
      const score = this.computeScore(matchScore, sol.confidence, successRate, false);
      const category = this.categorize(score);

      suggestions.push({
        solution: sol,
        score,
        category,
        matchedErrorId: errorId,
        matchScore,
        successRate,
        reasoning: `Connected solution via synapse network (activation: ${activation.activation.toFixed(2)}). ` +
          `Success rate: ${(successRate * 100).toFixed(0)}%.`,
      });
    }

    suggestions.sort((a, b) => b.score - a.score);
    const topSuggestions = suggestions.slice(0, 10);
    const autoApply = topSuggestions.find(s => s.category === 'auto') ?? null;

    return {
      errorId,
      suggestions: topSuggestions,
      autoApply,
      totalConsidered: seenSolutionIds.size,
    };
  }

  /**
   * Compute a combined score for a solution suggestion.
   * Factors: match quality (40%), solution confidence (30%), success rate (30%)
   * Cross-project solutions get a 20% discount.
   */
  private computeScore(
    matchScore: number,
    solutionConfidence: number,
    successRate: number,
    crossProject: boolean,
  ): number {
    const raw = matchScore * 0.4 + solutionConfidence * 0.3 + successRate * 0.3;
    return crossProject ? raw * 0.8 : raw;
  }

  /**
   * Categorize a score into auto/suggest/learn.
   */
  private categorize(score: number): SuggestionCategory {
    if (score >= 0.85) return 'auto';
    if (score >= 0.5) return 'suggest';
    return 'learn';
  }

  /**
   * Build a human-readable explanation of the suggestion.
   */
  private buildReasoning(
    match: { errorId: number; score: number; crossProject: boolean },
    solution: SolutionRecord,
    successRate: number,
    crossProject: boolean,
  ): string {
    const parts: string[] = [];

    parts.push(`Matched error #${match.errorId} (${(match.score * 100).toFixed(0)}% similar)`);

    if (crossProject) {
      parts.push('from another project');
    }

    if (solution.success_count + solution.fail_count > 0) {
      parts.push(`${(successRate * 100).toFixed(0)}% success rate (${solution.success_count}/${solution.success_count + solution.fail_count} attempts)`);
    } else {
      parts.push('no prior attempts');
    }

    parts.push(`confidence: ${(solution.confidence * 100).toFixed(0)}%`);

    return parts.join('. ') + '.';
  }
}
