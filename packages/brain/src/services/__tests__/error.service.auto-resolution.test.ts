/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorService } from '../error.service.js';
import { matchError } from '../../matching/error-matcher.js';

// Mock dependencies — same pattern as existing error.service.test.ts
vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../utils/events.js', () => ({
  getEventBus: () => ({
    emit: vi.fn(),
  }),
}));

vi.mock('../../parsing/error-parser.js', () => ({
  parseError: vi.fn((output: string) => {
    if (output.includes('UNPARSEABLE')) return null;
    return {
      errorType: 'TypeError',
      message: output.split('\n')[0] ?? output,
      frames: [],
      sourceFile: 'test.ts',
      sourceLine: 10,
    };
  }),
}));

vi.mock('../../matching/fingerprint.js', () => ({
  generateFingerprint: vi.fn(() => 'fp-mock-123'),
}));

vi.mock('../../matching/error-matcher.js', () => ({
  matchError: vi.fn(() => []),
}));

const matchErrorMock = vi.mocked(matchError);

function createMockErrorRepo() {
  return {
    create: vi.fn().mockReturnValue(1),
    getById: vi.fn().mockReturnValue({
      id: 1,
      project_id: 1,
      terminal_id: null,
      fingerprint: 'fp-mock-123',
      type: 'TypeError',
      message: 'test error',
      raw_output: 'TypeError: test error',
      context: null,
      file_path: 'test.ts',
      line_number: 10,
      column_number: null,
      occurrence_count: 1,
      first_seen: '2025-01-01T00:00:00Z',
      last_seen: '2025-01-01T00:00:00Z',
      resolved: 0,
      resolved_at: null,
    }),
    update: vi.fn(),
    delete: vi.fn(),
    findByFingerprint: vi.fn().mockReturnValue([]),
    findByProject: vi.fn().mockReturnValue([]),
    findUnresolved: vi.fn().mockReturnValue([]),
    countSince: vi.fn().mockReturnValue(0),
    search: vi.fn().mockReturnValue([]),
    incrementOccurrence: vi.fn(),
    createChain: vi.fn(),
    findChainChildren: vi.fn().mockReturnValue([]),
    findChainParents: vi.fn().mockReturnValue([]),
    findRecentByProject: vi.fn().mockReturnValue([]),
    findAll: vi.fn().mockReturnValue([]),
  };
}

function createMockProjectRepo() {
  return {
    findByName: vi.fn().mockReturnValue({ id: 1, name: 'test-project' }),
    create: vi.fn().mockReturnValue(1),
    getById: vi.fn().mockReturnValue({ id: 1, name: 'test-project' }),
    getAll: vi.fn().mockReturnValue([]),
  };
}

function createMockSynapseManager() {
  return {
    strengthen: vi.fn(),
    weaken: vi.fn(),
    find: vi.fn(),
    activate: vi.fn(),
    runDecay: vi.fn(),
  };
}

function createMockAutoResolution() {
  return {
    getSuggestions: vi.fn().mockReturnValue({
      errorId: 1,
      suggestions: [
        {
          solution: { id: 10, description: 'Fix it' },
          score: 0.9,
          category: 'auto' as const,
          matchedErrorId: 2,
          matchScore: 0.95,
          successRate: 1.0,
          reasoning: 'High confidence match',
        },
      ],
      autoApply: null,
      totalConsidered: 1,
    }),
    getSuggestionsForError: vi.fn(),
  };
}

function createMockEmbeddingEngine(ready = true) {
  return {
    isReady: vi.fn().mockReturnValue(ready),
    computeErrorVectorScores: vi.fn().mockReturnValue(new Map([[2, 0.85]])),
  };
}

describe('ErrorService — Auto-Resolution Integration', () => {
  let service: ErrorService;
  let errorRepo: ReturnType<typeof createMockErrorRepo>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let synapseManager: ReturnType<typeof createMockSynapseManager>;
  let autoResolution: ReturnType<typeof createMockAutoResolution>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorRepo = createMockErrorRepo();
    projectRepo = createMockProjectRepo();
    synapseManager = createMockSynapseManager();
    autoResolution = createMockAutoResolution();
    service = new ErrorService(errorRepo as any, projectRepo as any, synapseManager as any);
  });

  it('report() calls auto-resolution when matches exist', () => {
    const matches = [
      { errorId: 2, score: 0.95, isStrong: true, signals: [] },
    ];
    matchErrorMock.mockReturnValue(matches);
    service.setAutoResolution(autoResolution as any);

    const result = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: cannot read property of undefined',
    });

    expect(autoResolution.getSuggestions).toHaveBeenCalledTimes(1);
    expect(autoResolution.getSuggestions).toHaveBeenCalledWith(
      result.errorId,
      matches,
      [], // crossProjectMatches (empty since crossProjectMatching not configured)
    );
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.suggestions).toHaveLength(1);
  });

  it('report() does not call auto-resolution when no matches', () => {
    matchErrorMock.mockReturnValue([]);
    service.setAutoResolution(autoResolution as any);

    const result = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: no matches here',
    });

    expect(autoResolution.getSuggestions).not.toHaveBeenCalled();
    expect(result.suggestions).toBeUndefined();
  });

  it('report() does not call auto-resolution when service not set', () => {
    const matches = [
      { errorId: 2, score: 0.95, isStrong: true, signals: [] },
    ];
    matchErrorMock.mockReturnValue(matches);
    // Do NOT call service.setAutoResolution()

    const result = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: auto-resolution not configured',
    });

    expect(result.suggestions).toBeUndefined();
  });

  it('report() includes suggestions in return value', () => {
    const matches = [
      { errorId: 2, score: 0.88, isStrong: true, signals: [] },
    ];
    matchErrorMock.mockReturnValue(matches);

    const expectedSuggestions = {
      errorId: 1,
      suggestions: [
        {
          solution: { id: 10, description: 'Fix it' },
          score: 0.9,
          category: 'auto' as const,
          matchedErrorId: 2,
          matchScore: 0.95,
          successRate: 1.0,
          reasoning: 'High confidence match',
        },
      ],
      autoApply: null,
      totalConsidered: 1,
    };
    autoResolution.getSuggestions.mockReturnValue(expectedSuggestions);
    service.setAutoResolution(autoResolution as any);

    const result = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: test',
    });

    expect(result.suggestions).toEqual(expectedSuggestions);
    expect(result.suggestions!.errorId).toBe(1);
    expect(result.suggestions!.suggestions[0].solution.id).toBe(10);
    expect(result.suggestions!.totalConsidered).toBe(1);
  });

  it('setAutoResolution() wires the service correctly', () => {
    // First, verify no auto-resolution without wiring
    const matches = [{ errorId: 2, score: 0.9, isStrong: true, signals: [] }];
    matchErrorMock.mockReturnValue(matches);

    const result1 = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: before wiring',
    });
    expect(result1.suggestions).toBeUndefined();

    // Wire the service
    service.setAutoResolution(autoResolution as any);

    // Reset fingerprint mock so we get a new error (not a duplicate)
    errorRepo.findByFingerprint.mockReturnValue([]);
    matchErrorMock.mockReturnValue(matches);

    const result2 = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: after wiring',
    });
    expect(result2.suggestions).toBeDefined();
    expect(autoResolution.getSuggestions).toHaveBeenCalledTimes(1);
  });

  it('report() passes vector scores to matchError when embedding engine is available', () => {
    const embeddingEngine = createMockEmbeddingEngine(true);
    service.setEmbeddingEngine(embeddingEngine as any);

    service.report({
      project: 'test-project',
      errorOutput: 'TypeError: with embeddings',
    });

    expect(embeddingEngine.isReady).toHaveBeenCalled();
    expect(embeddingEngine.computeErrorVectorScores).toHaveBeenCalledWith(1, 1);
    // matchError should receive the vector scores map as third argument
    expect(matchErrorMock).toHaveBeenCalledWith(
      expect.any(Object), // newError
      expect.any(Array),  // candidates
      expect.any(Map),    // vectorScores
    );
    const vectorScoresArg = matchErrorMock.mock.calls[0]![2];
    expect(vectorScoresArg).toBeInstanceOf(Map);
    expect(vectorScoresArg!.get(2)).toBe(0.85);
  });

  it('report() does not pass vector scores when embedding engine is not ready', () => {
    const embeddingEngine = createMockEmbeddingEngine(false);
    service.setEmbeddingEngine(embeddingEngine as any);

    service.report({
      project: 'test-project',
      errorOutput: 'TypeError: embeddings not ready',
    });

    expect(embeddingEngine.isReady).toHaveBeenCalled();
    expect(embeddingEngine.computeErrorVectorScores).not.toHaveBeenCalled();
    // matchError should receive undefined for vectorScores
    expect(matchErrorMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      undefined,
    );
  });

  it('report() does not pass vector scores when no embedding engine is set', () => {
    // No call to setEmbeddingEngine
    service.report({
      project: 'test-project',
      errorOutput: 'TypeError: no embedding engine',
    });

    expect(matchErrorMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Array),
      undefined,
    );
  });

  it('report() calls auto-resolution with cross-project matches when configured', () => {
    const matchingConfig = { crossProjectMatching: true, crossProjectWeight: 0.7 };
    service = new ErrorService(errorRepo as any, projectRepo as any, synapseManager as any, matchingConfig as any);
    service.setAutoResolution(autoResolution as any);

    // Set up other projects with resolved errors
    projectRepo.getAll.mockReturnValue([
      { id: 1, name: 'test-project' },
      { id: 2, name: 'other-project' },
    ]);
    const otherProjectErrors = [
      {
        id: 50, project_id: 2, fingerprint: 'fp-other', type: 'TypeError',
        message: 'similar error in other project', resolved: 1,
      },
    ];
    errorRepo.findByProject.mockImplementation((projectId: number) => {
      if (projectId === 2) return otherProjectErrors;
      return [];
    });

    const inProjectMatches = [{ errorId: 3, score: 0.8, isStrong: false, signals: [] }];
    const crossMatches = [{ errorId: 50, score: 0.7, isStrong: false, signals: [] }];
    matchErrorMock
      .mockReturnValueOnce(inProjectMatches)  // in-project matchError call
      .mockReturnValueOnce(crossMatches);      // cross-project matchError call

    const result = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: cross project test',
    });

    expect(autoResolution.getSuggestions).toHaveBeenCalledTimes(1);
    // Should be called with errorId, in-project matches, and cross-project matches
    const callArgs = autoResolution.getSuggestions.mock.calls[0]!;
    expect(callArgs[0]).toBe(1); // errorId
    expect(callArgs[1]).toEqual(inProjectMatches);
    // Cross-project matches will have discounted scores
    expect(callArgs[2]).toHaveLength(1);
    expect(result.crossProjectMatches).toHaveLength(1);
  });

  it('report() skips auto-resolution for duplicate (existing fingerprint) errors', () => {
    errorRepo.findByFingerprint.mockReturnValue([{
      id: 42,
      project_id: 1,
      fingerprint: 'fp-mock-123',
      type: 'TypeError',
      message: 'old error',
      context: null,
      resolved: 0,
      occurrence_count: 3,
    }]);
    service.setAutoResolution(autoResolution as any);

    const result = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: old error',
    });

    // Duplicate errors return early — no matchError, no auto-resolution
    expect(result.isNew).toBe(false);
    expect(autoResolution.getSuggestions).not.toHaveBeenCalled();
    expect(result.suggestions).toBeUndefined();
  });
});
