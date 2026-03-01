/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SolutionRecord } from '../../types/solution.types.js';
import type { ErrorRecord } from '../../types/error.types.js';
import type { MatchResult } from '../../matching/error-matcher.js';
import type { ActivationResult } from '@timmeck/brain-core';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockEventBus = { emit: vi.fn(), on: vi.fn() };
vi.mock('../../utils/events.js', () => ({
  getEventBus: () => mockEventBus,
}));

// Lazy-import after mocks are installed
const { AutoResolutionService } = await import('../auto-resolution.service.js');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSolution(overrides: Partial<SolutionRecord> = {}): SolutionRecord {
  return {
    id: 1,
    description: 'Restart the service',
    commands: 'systemctl restart app',
    code_change: null,
    source: 'human',
    confidence: 0.9,
    success_count: 8,
    fail_count: 2,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeError(overrides: Partial<ErrorRecord> = {}): ErrorRecord {
  return {
    id: 100,
    project_id: 1,
    terminal_id: null,
    fingerprint: 'abc123',
    type: 'TypeError',
    message: 'Cannot read properties of undefined',
    raw_output: '',
    context: null,
    file_path: '/src/app.ts',
    line_number: 42,
    column_number: 10,
    occurrence_count: 1,
    first_seen: '2025-01-01T00:00:00Z',
    last_seen: '2025-01-01T00:00:00Z',
    resolved: 0,
    resolved_at: null,
    ...overrides,
  };
}

function makeMatch(overrides: Partial<MatchResult> = {}): MatchResult {
  return {
    errorId: 200,
    score: 0.9,
    signals: [],
    isStrong: true,
    ...overrides,
  };
}

function makeActivation(
  type: string,
  id: number,
  activation: number,
): ActivationResult {
  return {
    node: { type, id },
    activation,
    depth: 1,
    path: [],
  };
}

function emptyContext() {
  return {
    solutions: [] as ActivationResult[],
    relatedErrors: [] as ActivationResult[],
    relevantModules: [] as ActivationResult[],
    preventionRules: [] as ActivationResult[],
    insights: [] as ActivationResult[],
  };
}

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('AutoResolutionService', () => {
  let solutionRepo: {
    findForError: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    successRate: ReturnType<typeof vi.fn>;
  };
  let errorRepo: {
    getById: ReturnType<typeof vi.fn>;
  };
  let synapseManager: {
    getErrorContext: ReturnType<typeof vi.fn>;
  };
  let service: InstanceType<typeof AutoResolutionService>;

  beforeEach(() => {
    vi.clearAllMocks();

    solutionRepo = {
      findForError: vi.fn().mockReturnValue([]),
      getById: vi.fn().mockReturnValue(undefined),
      successRate: vi.fn().mockReturnValue(0),
    };
    errorRepo = {
      getById: vi.fn().mockReturnValue(undefined),
    };
    synapseManager = {
      getErrorContext: vi.fn().mockReturnValue(emptyContext()),
    };

    service = new AutoResolutionService(
      solutionRepo as any,
      errorRepo as any,
      synapseManager as any,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getSuggestions
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getSuggestions', () => {
    it('returns empty result when no matches provided', () => {
      const result = service.getSuggestions(1, []);

      expect(result.errorId).toBe(1);
      expect(result.suggestions).toHaveLength(0);
      expect(result.autoApply).toBeNull();
      expect(result.totalConsidered).toBe(0);
    });

    it('returns empty result when matches have no solutions', () => {
      solutionRepo.findForError.mockReturnValue([]);
      const matches = [makeMatch({ errorId: 200, score: 0.95 })];

      const result = service.getSuggestions(1, matches);

      expect(result.suggestions).toHaveLength(0);
      expect(result.totalConsidered).toBe(0);
      expect(solutionRepo.findForError).toHaveBeenCalledWith(200);
    });

    it('returns ranked suggestions when matches have solutions', () => {
      const solA = makeSolution({ id: 10, confidence: 0.9 });
      const solB = makeSolution({ id: 11, confidence: 0.6 });

      // Match #200 has solA, match #201 has solB
      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 200) return [solA];
        if (errorId === 201) return [solB];
        return [];
      });
      solutionRepo.successRate.mockImplementation((solutionId: number) => {
        if (solutionId === 10) return 0.8;
        if (solutionId === 11) return 0.5;
        return 0;
      });

      const matches = [
        makeMatch({ errorId: 200, score: 0.95 }),
        makeMatch({ errorId: 201, score: 0.7 }),
      ];

      const result = service.getSuggestions(1, matches);

      expect(result.suggestions).toHaveLength(2);
      expect(result.totalConsidered).toBe(2);

      // First suggestion should be higher scored
      expect(result.suggestions[0]!.score).toBeGreaterThan(result.suggestions[1]!.score);
      expect(result.suggestions[0]!.solution.id).toBe(10);
      expect(result.suggestions[1]!.solution.id).toBe(11);
    });

    it('deduplicates solutions that appear across multiple matches', () => {
      const sharedSolution = makeSolution({ id: 10, confidence: 0.9 });

      // Both matches lead to the same solution
      solutionRepo.findForError.mockReturnValue([sharedSolution]);
      solutionRepo.successRate.mockReturnValue(0.8);

      const matches = [
        makeMatch({ errorId: 200, score: 0.95 }),
        makeMatch({ errorId: 201, score: 0.7 }),
      ];

      const result = service.getSuggestions(1, matches);

      // Should appear only once despite two matches referencing the same solution
      expect(result.suggestions).toHaveLength(1);
      expect(result.totalConsidered).toBe(1);
      expect(result.suggestions[0]!.solution.id).toBe(10);
      // It should keep the first occurrence (from match with errorId 200)
      expect(result.suggestions[0]!.matchedErrorId).toBe(200);
    });

    it('applies 20% discount to cross-project matches', () => {
      const sol = makeSolution({ id: 10, confidence: 0.9 });

      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.8);

      // Same match — once as local, once as cross-project
      const localMatch = makeMatch({ errorId: 200, score: 0.9 });
      const crossMatch = makeMatch({ errorId: 201, score: 0.9 });
      const crossSol = makeSolution({ id: 11, confidence: 0.9 });

      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 200) return [sol];
        if (errorId === 201) return [crossSol];
        return [];
      });
      solutionRepo.successRate.mockReturnValue(0.8);

      const result = service.getSuggestions(1, [localMatch], [crossMatch]);

      expect(result.suggestions).toHaveLength(2);

      const local = result.suggestions.find(s => s.solution.id === 10)!;
      const cross = result.suggestions.find(s => s.solution.id === 11)!;

      // Cross-project gets 0.8x multiplier
      const expectedLocal = 0.9 * 0.4 + 0.9 * 0.3 + 0.8 * 0.3;
      const expectedCross = expectedLocal * 0.8;

      expect(local.score).toBeCloseTo(expectedLocal, 10);
      expect(cross.score).toBeCloseTo(expectedCross, 10);
      expect(cross.score).toBeLessThan(local.score);
    });

    it('finds auto-apply candidate when score >= 0.85', () => {
      const sol = makeSolution({ id: 10, confidence: 1.0 });

      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(1.0);

      // score = 1.0*0.4 + 1.0*0.3 + 1.0*0.3 = 1.0
      const matches = [makeMatch({ errorId: 200, score: 1.0 })];

      const result = service.getSuggestions(1, matches);

      expect(result.autoApply).not.toBeNull();
      expect(result.autoApply!.solution.id).toBe(10);
      expect(result.autoApply!.category).toBe('auto');
    });

    it('does not set autoApply when all scores are below 0.85', () => {
      const sol = makeSolution({ id: 10, confidence: 0.3 });

      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.2);

      // score = 0.5*0.4 + 0.3*0.3 + 0.2*0.3 = 0.20 + 0.09 + 0.06 = 0.35
      const matches = [makeMatch({ errorId: 200, score: 0.5 })];

      const result = service.getSuggestions(1, matches);

      expect(result.autoApply).toBeNull();
      expect(result.suggestions[0]!.category).toBe('learn');
    });

    it('limits suggestions to top 10', () => {
      const solutions = Array.from({ length: 15 }, (_, i) =>
        makeSolution({ id: i + 1, confidence: 0.5 }),
      );

      // Each match has a unique solution
      const matches = solutions.map((_, i) =>
        makeMatch({ errorId: 300 + i, score: 0.5 }),
      );

      solutionRepo.findForError.mockImplementation((errorId: number) => {
        const idx = errorId - 300;
        return [solutions[idx]!];
      });
      solutionRepo.successRate.mockReturnValue(0.5);

      const result = service.getSuggestions(1, matches);

      expect(result.suggestions).toHaveLength(10);
      expect(result.totalConsidered).toBe(15);
    });

    it('emits resolution:suggested event when there are suggestions', () => {
      const sol = makeSolution({ id: 10, confidence: 1.0 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(1.0);

      const matches = [makeMatch({ errorId: 200, score: 1.0 })];
      service.getSuggestions(42, matches);

      expect(mockEventBus.emit).toHaveBeenCalledWith('resolution:suggested', {
        errorId: 42,
        suggestionCount: 1,
        autoApply: true,
        bestScore: expect.closeTo(1.0, 5),
      });
    });

    it('does not emit event when there are no suggestions', () => {
      solutionRepo.findForError.mockReturnValue([]);
      service.getSuggestions(1, [makeMatch()]);

      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('does not emit event when matches list is empty', () => {
      service.getSuggestions(1, []);
      expect(mockEventBus.emit).not.toHaveBeenCalled();
    });

    it('sorts suggestions by score descending', () => {
      const solHigh = makeSolution({ id: 1, confidence: 1.0 });
      const solMid = makeSolution({ id: 2, confidence: 0.5 });
      const solLow = makeSolution({ id: 3, confidence: 0.1 });

      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 200) return [solLow];
        if (errorId === 201) return [solHigh];
        if (errorId === 202) return [solMid];
        return [];
      });
      solutionRepo.successRate.mockReturnValue(0.5);

      const matches = [
        makeMatch({ errorId: 200, score: 0.3 }),
        makeMatch({ errorId: 201, score: 0.95 }),
        makeMatch({ errorId: 202, score: 0.6 }),
      ];

      const result = service.getSuggestions(1, matches);

      expect(result.suggestions).toHaveLength(3);
      for (let i = 1; i < result.suggestions.length; i++) {
        expect(result.suggestions[i - 1]!.score).toBeGreaterThanOrEqual(
          result.suggestions[i]!.score,
        );
      }
    });

    it('combines local and cross-project matches', () => {
      const localSol = makeSolution({ id: 1, confidence: 0.9 });
      const crossSol = makeSolution({ id: 2, confidence: 0.9 });

      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 200) return [localSol];
        if (errorId === 300) return [crossSol];
        return [];
      });
      solutionRepo.successRate.mockReturnValue(0.7);

      const localMatches = [makeMatch({ errorId: 200, score: 0.8 })];
      const crossMatches = [makeMatch({ errorId: 300, score: 0.8 })];

      const result = service.getSuggestions(1, localMatches, crossMatches);

      expect(result.suggestions).toHaveLength(2);
      expect(result.totalConsidered).toBe(2);
    });

    it('handles undefined crossProjectMatches gracefully', () => {
      solutionRepo.findForError.mockReturnValue([makeSolution()]);
      solutionRepo.successRate.mockReturnValue(0.5);

      const result = service.getSuggestions(1, [makeMatch()], undefined);

      expect(result.suggestions).toHaveLength(1);
    });

    it('includes correct matchedErrorId and matchScore in suggestions', () => {
      const sol = makeSolution({ id: 10 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.7);

      const match = makeMatch({ errorId: 555, score: 0.82 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.matchedErrorId).toBe(555);
      expect(result.suggestions[0]!.matchScore).toBe(0.82);
    });

    it('includes the successRate in each suggestion', () => {
      const sol = makeSolution({ id: 10 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.73);

      const result = service.getSuggestions(1, [makeMatch()]);

      expect(result.suggestions[0]!.successRate).toBe(0.73);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getSuggestionsForError
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getSuggestionsForError', () => {
    it('returns empty result for unknown error', () => {
      errorRepo.getById.mockReturnValue(undefined);

      const result = service.getSuggestionsForError(999);

      expect(result.errorId).toBe(999);
      expect(result.suggestions).toHaveLength(0);
      expect(result.autoApply).toBeNull();
      expect(result.totalConsidered).toBe(0);
    });

    it('finds direct solutions for a known error', () => {
      const error = makeError({ id: 100 });
      const sol = makeSolution({ id: 10, confidence: 0.8 });

      errorRepo.getById.mockReturnValue(error);
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.75);
      synapseManager.getErrorContext.mockReturnValue(emptyContext());

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]!.solution.id).toBe(10);
      // Direct solutions use matchScore = 1.0
      expect(result.suggestions[0]!.matchScore).toBe(1.0);
      expect(result.suggestions[0]!.matchedErrorId).toBe(100);
    });

    it('uses matchScore 1.0 for direct solutions', () => {
      errorRepo.getById.mockReturnValue(makeError({ id: 100 }));
      const sol = makeSolution({ id: 10, confidence: 0.6 });

      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.5);
      synapseManager.getErrorContext.mockReturnValue(emptyContext());

      const result = service.getSuggestionsForError(100);

      // score = 1.0*0.4 + 0.6*0.3 + 0.5*0.3 = 0.4 + 0.18 + 0.15 = 0.73
      expect(result.suggestions[0]!.score).toBeCloseTo(0.73, 10);
    });

    it('builds correct reasoning for direct solutions', () => {
      errorRepo.getById.mockReturnValue(makeError({ id: 100 }));
      const sol = makeSolution({ id: 10, confidence: 0.85 });

      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.9);
      synapseManager.getErrorContext.mockReturnValue(emptyContext());

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions[0]!.reasoning).toContain('Direct solution for this error');
      expect(result.suggestions[0]!.reasoning).toContain('85%');
      expect(result.suggestions[0]!.reasoning).toContain('90%');
    });

    it('finds solutions via synapse-connected related errors', () => {
      const error = makeError({ id: 100 });
      const relatedSol = makeSolution({ id: 20, confidence: 0.7 });

      errorRepo.getById.mockReturnValue(error);
      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 100) return []; // No direct solutions
        if (errorId === 200) return [relatedSol]; // Related error has solution
        return [];
      });
      solutionRepo.successRate.mockReturnValue(0.6);

      const context = emptyContext();
      context.relatedErrors = [makeActivation('error', 200, 0.75)];
      synapseManager.getErrorContext.mockReturnValue(context);

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]!.solution.id).toBe(20);
      expect(result.suggestions[0]!.matchedErrorId).toBe(200);
      // matchScore = min(1.0, activation) = min(1.0, 0.75) = 0.75
      expect(result.suggestions[0]!.matchScore).toBe(0.75);
    });

    it('caps matchScore from synapse activation at 1.0', () => {
      errorRepo.getById.mockReturnValue(makeError({ id: 100 }));
      const sol = makeSolution({ id: 20, confidence: 0.8 });

      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 100) return [];
        if (errorId === 200) return [sol];
        return [];
      });
      solutionRepo.successRate.mockReturnValue(0.7);

      const context = emptyContext();
      // activation > 1.0 — should be capped
      context.relatedErrors = [makeActivation('error', 200, 1.5)];
      synapseManager.getErrorContext.mockReturnValue(context);

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions[0]!.matchScore).toBe(1.0);
    });

    it('finds solutions via synapse activation context (solutions field)', () => {
      const error = makeError({ id: 100 });
      const sol = makeSolution({ id: 30, confidence: 0.8 });

      errorRepo.getById.mockReturnValue(error);
      solutionRepo.findForError.mockReturnValue([]); // No direct or related-error solutions
      solutionRepo.getById.mockReturnValue(sol);
      solutionRepo.successRate.mockReturnValue(0.65);

      const context = emptyContext();
      context.solutions = [makeActivation('solution', 30, 0.6)];
      synapseManager.getErrorContext.mockReturnValue(context);

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions).toHaveLength(1);
      expect(result.suggestions[0]!.solution.id).toBe(30);
      expect(result.suggestions[0]!.matchedErrorId).toBe(100);
      expect(result.suggestions[0]!.matchScore).toBe(0.6);
    });

    it('skips synapse solutions when getById returns undefined', () => {
      errorRepo.getById.mockReturnValue(makeError({ id: 100 }));
      solutionRepo.findForError.mockReturnValue([]);
      solutionRepo.getById.mockReturnValue(undefined); // Solution not found

      const context = emptyContext();
      context.solutions = [makeActivation('solution', 999, 0.7)];
      synapseManager.getErrorContext.mockReturnValue(context);

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions).toHaveLength(0);
    });

    it('deduplicates solutions found via direct and synapse paths', () => {
      const error = makeError({ id: 100 });
      const sol = makeSolution({ id: 10, confidence: 0.9 });

      errorRepo.getById.mockReturnValue(error);
      // Direct solutions include sol
      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 100) return [sol];
        if (errorId === 200) return [sol]; // Also found via related error
        return [];
      });
      solutionRepo.getById.mockReturnValue(sol); // Also found via synapse
      solutionRepo.successRate.mockReturnValue(0.8);

      const context = emptyContext();
      context.relatedErrors = [makeActivation('error', 200, 0.7)];
      context.solutions = [makeActivation('solution', 10, 0.6)];
      synapseManager.getErrorContext.mockReturnValue(context);

      const result = service.getSuggestionsForError(100);

      // Same solution id=10 appears via 3 paths, but should appear only once
      const solutionIds = result.suggestions.map(s => s.solution.id);
      expect(solutionIds.filter(id => id === 10)).toHaveLength(1);
    });

    it('includes solutions from all three channels without duplication', () => {
      const error = makeError({ id: 100 });
      const directSol = makeSolution({ id: 1, confidence: 0.9 });
      const relatedSol = makeSolution({ id: 2, confidence: 0.7 });
      const synapseSol = makeSolution({ id: 3, confidence: 0.6 });

      errorRepo.getById.mockReturnValue(error);
      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 100) return [directSol];
        if (errorId === 200) return [relatedSol];
        return [];
      });
      solutionRepo.getById.mockReturnValue(synapseSol);
      solutionRepo.successRate.mockReturnValue(0.5);

      const context = emptyContext();
      context.relatedErrors = [makeActivation('error', 200, 0.6)];
      context.solutions = [makeActivation('solution', 3, 0.5)];
      synapseManager.getErrorContext.mockReturnValue(context);

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions).toHaveLength(3);
      expect(result.totalConsidered).toBe(3);
    });

    it('sorts all channels by score descending', () => {
      errorRepo.getById.mockReturnValue(makeError({ id: 100 }));

      const directSol = makeSolution({ id: 1, confidence: 0.3 }); // Low confidence
      const relatedSol = makeSolution({ id: 2, confidence: 0.95 }); // High confidence

      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 100) return [directSol];
        if (errorId === 200) return [relatedSol];
        return [];
      });
      solutionRepo.successRate.mockReturnValue(0.5);

      const context = emptyContext();
      context.relatedErrors = [makeActivation('error', 200, 0.95)];
      synapseManager.getErrorContext.mockReturnValue(context);

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions).toHaveLength(2);
      expect(result.suggestions[0]!.score).toBeGreaterThanOrEqual(
        result.suggestions[1]!.score,
      );
    });

    it('builds reasoning for synapse-connected related error solutions', () => {
      errorRepo.getById.mockReturnValue(makeError({ id: 100 }));
      const sol = makeSolution({ id: 20, confidence: 0.7 });

      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 100) return [];
        if (errorId === 200) return [sol];
        return [];
      });
      solutionRepo.successRate.mockReturnValue(0.6);

      const context = emptyContext();
      context.relatedErrors = [makeActivation('error', 200, 0.75)];
      synapseManager.getErrorContext.mockReturnValue(context);

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions[0]!.reasoning).toContain('related error #200');
      expect(result.suggestions[0]!.reasoning).toContain('activation: 0.75');
      expect(result.suggestions[0]!.reasoning).toContain('60%');
    });

    it('builds reasoning for synapse-activated solutions', () => {
      errorRepo.getById.mockReturnValue(makeError({ id: 100 }));
      const sol = makeSolution({ id: 30, confidence: 0.8 });

      solutionRepo.findForError.mockReturnValue([]);
      solutionRepo.getById.mockReturnValue(sol);
      solutionRepo.successRate.mockReturnValue(0.45);

      const context = emptyContext();
      context.solutions = [makeActivation('solution', 30, 0.55)];
      synapseManager.getErrorContext.mockReturnValue(context);

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions[0]!.reasoning).toContain(
        'Connected solution via synapse network',
      );
      expect(result.suggestions[0]!.reasoning).toContain('activation: 0.55');
      expect(result.suggestions[0]!.reasoning).toContain('45%');
    });

    it('limits to top 10 suggestions', () => {
      errorRepo.getById.mockReturnValue(makeError({ id: 100 }));

      // 12 direct solutions
      const solutions = Array.from({ length: 12 }, (_, i) =>
        makeSolution({ id: i + 1, confidence: 0.5 }),
      );
      solutionRepo.findForError.mockReturnValue(solutions);
      solutionRepo.successRate.mockReturnValue(0.5);
      synapseManager.getErrorContext.mockReturnValue(emptyContext());

      const result = service.getSuggestionsForError(100);

      expect(result.suggestions).toHaveLength(10);
      expect(result.totalConsidered).toBe(12);
    });

    it('sets autoApply when a suggestion qualifies', () => {
      errorRepo.getById.mockReturnValue(makeError({ id: 100 }));
      const sol = makeSolution({ id: 10, confidence: 1.0 });

      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(1.0);
      synapseManager.getErrorContext.mockReturnValue(emptyContext());

      const result = service.getSuggestionsForError(100);

      // score = 1.0*0.4 + 1.0*0.3 + 1.0*0.3 = 1.0 → auto
      expect(result.autoApply).not.toBeNull();
      expect(result.autoApply!.solution.id).toBe(10);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // computeScore (tested indirectly through getSuggestions)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('score computation', () => {
    it('computes 0.4*match + 0.3*confidence + 0.3*successRate for local matches', () => {
      const sol = makeSolution({ id: 10, confidence: 0.7 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.6);

      const match = makeMatch({ errorId: 200, score: 0.8 });
      const result = service.getSuggestions(1, [match]);

      // expected = 0.8*0.4 + 0.7*0.3 + 0.6*0.3 = 0.32 + 0.21 + 0.18 = 0.71
      expect(result.suggestions[0]!.score).toBeCloseTo(0.71, 10);
    });

    it('applies 0.8x multiplier for cross-project matches', () => {
      const sol = makeSolution({ id: 10, confidence: 0.7 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.6);

      const crossMatch = makeMatch({ errorId: 200, score: 0.8 });
      const result = service.getSuggestions(1, [], [crossMatch]);

      // expected = (0.8*0.4 + 0.7*0.3 + 0.6*0.3) * 0.8 = 0.71 * 0.8 = 0.568
      expect(result.suggestions[0]!.score).toBeCloseTo(0.568, 10);
    });

    it('computes max score of 1.0 when all inputs are 1.0', () => {
      const sol = makeSolution({ id: 10, confidence: 1.0 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(1.0);

      const match = makeMatch({ errorId: 200, score: 1.0 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.score).toBeCloseTo(1.0, 10);
    });

    it('computes score of 0 when all inputs are 0', () => {
      const sol = makeSolution({ id: 10, confidence: 0 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0);

      const match = makeMatch({ errorId: 200, score: 0 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.score).toBeCloseTo(0, 10);
    });

    it('cross-project 0.8x discount stacks with low scores', () => {
      const sol = makeSolution({ id: 10, confidence: 0.5 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.3);

      const crossMatch = makeMatch({ errorId: 200, score: 0.4 });
      const result = service.getSuggestions(1, [], [crossMatch]);

      // raw = 0.4*0.4 + 0.5*0.3 + 0.3*0.3 = 0.16 + 0.15 + 0.09 = 0.40
      // cross = 0.40 * 0.8 = 0.32
      expect(result.suggestions[0]!.score).toBeCloseTo(0.32, 10);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // categorize (tested indirectly)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('categorization', () => {
    it('categorizes as "auto" when score >= 0.85', () => {
      const sol = makeSolution({ id: 10, confidence: 1.0 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(1.0);

      // score = 0.9*0.4 + 1.0*0.3 + 1.0*0.3 = 0.36+0.30+0.30 = 0.96 → auto
      const match = makeMatch({ errorId: 200, score: 0.9 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.category).toBe('auto');
      expect(result.suggestions[0]!.score).toBeGreaterThanOrEqual(0.85);
    });

    it('categorizes as "auto" at exactly 0.85', () => {
      // Need: 0.4m + 0.3c + 0.3s = 0.85
      // m = 1.0, c = 0.75, s = 0.75: 0.4 + 0.225 + 0.225 = 0.85
      const sol = makeSolution({ id: 10, confidence: 0.75 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.75);

      const match = makeMatch({ errorId: 200, score: 1.0 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.score).toBeCloseTo(0.85, 10);
      expect(result.suggestions[0]!.category).toBe('auto');
    });

    it('categorizes as "suggest" when 0.5 <= score < 0.85', () => {
      const sol = makeSolution({ id: 10, confidence: 0.6 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.5);

      // score = 0.7*0.4 + 0.6*0.3 + 0.5*0.3 = 0.28+0.18+0.15 = 0.61 → suggest
      const match = makeMatch({ errorId: 200, score: 0.7 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.category).toBe('suggest');
      expect(result.suggestions[0]!.score).toBeGreaterThanOrEqual(0.5);
      expect(result.suggestions[0]!.score).toBeLessThan(0.85);
    });

    it('categorizes as "suggest" at exactly 0.5', () => {
      // Need: 0.4m + 0.3c + 0.3s = 0.5
      // m = 0.5, c = 0.5, s = 0.5: 0.2 + 0.15 + 0.15 = 0.5
      const sol = makeSolution({ id: 10, confidence: 0.5 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.5);

      const match = makeMatch({ errorId: 200, score: 0.5 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.score).toBeCloseTo(0.5, 10);
      expect(result.suggestions[0]!.category).toBe('suggest');
    });

    it('categorizes as "learn" when score < 0.5', () => {
      const sol = makeSolution({ id: 10, confidence: 0.2 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.1);

      // score = 0.3*0.4 + 0.2*0.3 + 0.1*0.3 = 0.12+0.06+0.03 = 0.21 → learn
      const match = makeMatch({ errorId: 200, score: 0.3 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.category).toBe('learn');
      expect(result.suggestions[0]!.score).toBeLessThan(0.5);
    });

    it('score just below 0.85 is "suggest", not "auto"', () => {
      // 0.849... should be "suggest"
      // m = 1.0, c = 0.74, s = 0.75: 0.4 + 0.222 + 0.225 = 0.847
      const sol = makeSolution({ id: 10, confidence: 0.74 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.75);

      const match = makeMatch({ errorId: 200, score: 1.0 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.score).toBeLessThan(0.85);
      expect(result.suggestions[0]!.category).toBe('suggest');
    });

    it('score just below 0.5 is "learn", not "suggest"', () => {
      // 0.499... should be "learn"
      // m = 0.49, c = 0.5, s = 0.5: 0.196 + 0.15 + 0.15 = 0.496
      const sol = makeSolution({ id: 10, confidence: 0.5 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.5);

      const match = makeMatch({ errorId: 200, score: 0.49 });
      const result = service.getSuggestions(1, [match]);

      expect(result.suggestions[0]!.score).toBeLessThan(0.5);
      expect(result.suggestions[0]!.category).toBe('learn');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // buildReasoning (tested indirectly through getSuggestions)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('reasoning string', () => {
    it('includes matched error ID and similarity percentage', () => {
      const sol = makeSolution({ id: 10, confidence: 0.8, success_count: 5, fail_count: 1 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.83);

      const match = makeMatch({ errorId: 456, score: 0.72 });
      const result = service.getSuggestions(1, [match]);

      const reasoning = result.suggestions[0]!.reasoning;
      expect(reasoning).toContain('Matched error #456');
      expect(reasoning).toContain('72% similar');
    });

    it('includes "from another project" for cross-project matches', () => {
      const sol = makeSolution({ id: 10, confidence: 0.8, success_count: 3, fail_count: 1 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.75);

      const crossMatch = makeMatch({ errorId: 456, score: 0.72 });
      const result = service.getSuggestions(1, [], [crossMatch]);

      const reasoning = result.suggestions[0]!.reasoning;
      expect(reasoning).toContain('from another project');
    });

    it('does not include "from another project" for local matches', () => {
      const sol = makeSolution({ id: 10, confidence: 0.8, success_count: 3, fail_count: 1 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.75);

      const match = makeMatch({ errorId: 456, score: 0.72 });
      const result = service.getSuggestions(1, [match]);

      const reasoning = result.suggestions[0]!.reasoning;
      expect(reasoning).not.toContain('from another project');
    });

    it('includes success rate and attempt counts when attempts exist', () => {
      const sol = makeSolution({ id: 10, confidence: 0.8, success_count: 7, fail_count: 3 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.7);

      const match = makeMatch({ errorId: 200, score: 0.9 });
      const result = service.getSuggestions(1, [match]);

      const reasoning = result.suggestions[0]!.reasoning;
      expect(reasoning).toContain('70% success rate');
      expect(reasoning).toContain('7/10 attempts');
    });

    it('includes "no prior attempts" when success_count + fail_count is 0', () => {
      const sol = makeSolution({ id: 10, confidence: 0.8, success_count: 0, fail_count: 0 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0);

      const match = makeMatch({ errorId: 200, score: 0.9 });
      const result = service.getSuggestions(1, [match]);

      const reasoning = result.suggestions[0]!.reasoning;
      expect(reasoning).toContain('no prior attempts');
    });

    it('includes solution confidence percentage', () => {
      const sol = makeSolution({ id: 10, confidence: 0.65, success_count: 2, fail_count: 1 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.67);

      const match = makeMatch({ errorId: 200, score: 0.9 });
      const result = service.getSuggestions(1, [match]);

      const reasoning = result.suggestions[0]!.reasoning;
      expect(reasoning).toContain('confidence: 65%');
    });

    it('ends with a period', () => {
      const sol = makeSolution({ id: 10, confidence: 0.8, success_count: 5, fail_count: 1 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.83);

      const match = makeMatch({ errorId: 200, score: 0.9 });
      const result = service.getSuggestions(1, [match]);

      const reasoning = result.suggestions[0]!.reasoning;
      expect(reasoning).toMatch(/\.$/);
    });

    it('joins parts with ". " separator', () => {
      const sol = makeSolution({ id: 10, confidence: 0.8, success_count: 3, fail_count: 1 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.75);

      const match = makeMatch({ errorId: 200, score: 0.85 });
      const result = service.getSuggestions(1, [match]);

      const reasoning = result.suggestions[0]!.reasoning;
      // Should be: "Matched error #200 (85% similar). 75% success rate (3/4 attempts). confidence: 80%."
      const parts = reasoning.slice(0, -1).split('. ');
      expect(parts.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('handles empty local matches with non-empty cross-project matches', () => {
      const sol = makeSolution({ id: 10, confidence: 0.8 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.7);

      const result = service.getSuggestions(1, [], [makeMatch({ errorId: 300, score: 0.8 })]);

      expect(result.suggestions).toHaveLength(1);
    });

    it('totalConsidered counts unique solutions even when limited to 10', () => {
      const solutions = Array.from({ length: 15 }, (_, i) =>
        makeSolution({ id: i + 1, confidence: Math.random() }),
      );
      const matches = solutions.map((_, i) =>
        makeMatch({ errorId: 300 + i, score: 0.6 }),
      );
      solutionRepo.findForError.mockImplementation((errorId: number) => {
        const idx = errorId - 300;
        return [solutions[idx]!];
      });
      solutionRepo.successRate.mockReturnValue(0.5);

      const result = service.getSuggestions(1, matches);

      expect(result.totalConsidered).toBe(15);
      expect(result.suggestions).toHaveLength(10);
    });

    it('autoApply picks the first "auto" category from sorted results', () => {
      // Two solutions that both qualify as "auto"
      const sol1 = makeSolution({ id: 1, confidence: 1.0 });
      const sol2 = makeSolution({ id: 2, confidence: 0.95 });

      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 200) return [sol1];
        if (errorId === 201) return [sol2];
        return [];
      });
      solutionRepo.successRate.mockReturnValue(1.0);

      const matches = [
        makeMatch({ errorId: 200, score: 1.0 }),
        makeMatch({ errorId: 201, score: 0.95 }),
      ];

      const result = service.getSuggestions(1, matches);

      // Both are auto, but autoApply should be the highest-scored one (first in sorted list)
      expect(result.autoApply).not.toBeNull();
      expect(result.autoApply!.solution.id).toBe(1);
      expect(result.autoApply!.score).toBeGreaterThanOrEqual(result.suggestions[1]!.score);
    });

    it('event payload contains correct bestScore', () => {
      const sol1 = makeSolution({ id: 1, confidence: 0.5 });
      const sol2 = makeSolution({ id: 2, confidence: 0.9 });

      solutionRepo.findForError.mockImplementation((errorId: number) => {
        if (errorId === 200) return [sol1];
        if (errorId === 201) return [sol2];
        return [];
      });
      solutionRepo.successRate.mockReturnValue(0.7);

      const matches = [
        makeMatch({ errorId: 200, score: 0.5 }),
        makeMatch({ errorId: 201, score: 0.95 }),
      ];

      const result = service.getSuggestions(1, matches);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'resolution:suggested',
        expect.objectContaining({
          bestScore: result.suggestions[0]!.score,
        }),
      );
    });

    it('event payload autoApply is boolean false when no auto candidate', () => {
      const sol = makeSolution({ id: 10, confidence: 0.3 });
      solutionRepo.findForError.mockReturnValue([sol]);
      solutionRepo.successRate.mockReturnValue(0.3);

      // score = 0.5*0.4 + 0.3*0.3 + 0.3*0.3 = 0.2+0.09+0.09 = 0.38 → learn
      const match = makeMatch({ errorId: 200, score: 0.5 });
      service.getSuggestions(1, [match]);

      expect(mockEventBus.emit).toHaveBeenCalledWith(
        'resolution:suggested',
        expect.objectContaining({
          autoApply: false,
        }),
      );
    });
  });
});
