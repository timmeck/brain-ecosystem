import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningEngine } from '../../../src/learning/learning-engine.js';
import type { LearningConfig } from '../../../src/types/config.types.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../src/learning/pattern-extractor.js', () => ({
  extractPatterns: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../src/learning/rule-generator.js', () => ({
  generateRules: vi.fn().mockReturnValue([]),
  persistRules: vi.fn().mockReturnValue(0),
}));

vi.mock('../../../src/learning/decay.js', () => ({
  shouldPruneRule: vi.fn().mockReturnValue(false),
}));

vi.mock('../../../src/learning/confidence-scorer.js', () => ({
  computeAdaptiveThresholds: vi.fn().mockReturnValue({
    minOccurrences: 3,
    minSuccessRate: 0.5,
    minConfidence: 0.6,
    pruneThreshold: 0.1,
  }),
}));

function createMockConfig(): LearningConfig {
  return {
    intervalMs: 60000,
    minOccurrences: 3,
    minSuccessRate: 0.5,
    minConfidence: 0.6,
    pruneThreshold: 0.1,
    maxRejectionRate: 0.5,
    decayHalfLifeDays: 30,
  };
}

function createMockErrorRepo() {
  return {
    findUnresolved: vi.fn().mockReturnValue([]),
    countSince: vi.fn().mockReturnValue(0),
    findByProject: vi.fn().mockReturnValue([]),
  };
}

function createMockSolutionRepo() {
  return {
    getAll: vi.fn().mockReturnValue([]),
    findForError: vi.fn().mockReturnValue([]),
    successRate: vi.fn().mockReturnValue(0),
  };
}

function createMockRuleRepo() {
  return {
    findActive: vi.fn().mockReturnValue([]),
    create: vi.fn(),
    update: vi.fn(),
    findByPattern: vi.fn().mockReturnValue([]),
  };
}

function createMockAntipatternRepo() {
  return {
    create: vi.fn().mockReturnValue(1),
    findByProject: vi.fn().mockReturnValue([]),
  };
}

function createMockSynapseManager() {
  return {
    runDecay: vi.fn().mockReturnValue({ decayed: 0, pruned: 0 }),
    strengthen: vi.fn(),
  };
}

describe('LearningEngine', () => {
  let engine: LearningEngine;
  let config: LearningConfig;
  let errorRepo: ReturnType<typeof createMockErrorRepo>;
  let solutionRepo: ReturnType<typeof createMockSolutionRepo>;
  let ruleRepo: ReturnType<typeof createMockRuleRepo>;
  let antipatternRepo: ReturnType<typeof createMockAntipatternRepo>;
  let synapseManager: ReturnType<typeof createMockSynapseManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createMockConfig();
    errorRepo = createMockErrorRepo();
    solutionRepo = createMockSolutionRepo();
    ruleRepo = createMockRuleRepo();
    antipatternRepo = createMockAntipatternRepo();
    synapseManager = createMockSynapseManager();
    engine = new LearningEngine(
      config,
      errorRepo as any,
      solutionRepo as any,
      ruleRepo as any,
      antipatternRepo as any,
      synapseManager as any,
    );
  });

  it('runCycle returns a valid result structure', () => {
    const result = engine.runCycle();

    expect(result).toHaveProperty('newPatterns');
    expect(result).toHaveProperty('updatedRules');
    expect(result).toHaveProperty('prunedRules');
    expect(result).toHaveProperty('newAntipatterns');
    expect(result).toHaveProperty('duration');
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('runCycle queries unresolved errors', () => {
    engine.runCycle();
    expect(errorRepo.findUnresolved).toHaveBeenCalled();
  });

  it('runCycle runs synapse decay', () => {
    engine.runCycle();
    expect(synapseManager.runDecay).toHaveBeenCalled();
  });

  it('runCycle prunes weak active rules', async () => {
    const { shouldPruneRule } = await import('../../../src/learning/decay.js');
    (shouldPruneRule as any).mockReturnValue(true);

    ruleRepo.findActive.mockReturnValue([
      { id: 1, confidence: 0.05, occurrences: 1, active: 1 },
      { id: 2, confidence: 0.03, occurrences: 0, active: 1 },
    ]);

    const result = engine.runCycle();
    expect(result.prunedRules).toBe(2);
    expect(ruleRepo.update).toHaveBeenCalledTimes(2);
    expect(ruleRepo.update).toHaveBeenCalledWith(1, { active: 0 });
    expect(ruleRepo.update).toHaveBeenCalledWith(2, { active: 0 });
  });

  it('runCycle detects antipatterns from recurring errors with failed solutions', () => {
    errorRepo.findUnresolved.mockReturnValue([
      {
        id: 10,
        project_id: 1,
        type: 'TypeError',
        message: 'Cannot read properties of null',
        occurrence_count: 5,
        resolved: 0,
      },
    ]);

    solutionRepo.findForError.mockReturnValue([
      { id: 100 },
      { id: 101 },
    ]);

    // Both solutions have very low success rate
    solutionRepo.successRate.mockReturnValue(0.1);

    const result = engine.runCycle();
    expect(result.newAntipatterns).toBe(1);
    expect(antipatternRepo.create).toHaveBeenCalled();
  });

  it('runCycle does not create duplicate antipatterns', () => {
    errorRepo.findUnresolved.mockReturnValue([
      {
        id: 10,
        project_id: 1,
        type: 'TypeError',
        message: 'Cannot read properties of null',
        occurrence_count: 5,
        resolved: 0,
      },
    ]);

    solutionRepo.findForError.mockReturnValue([{ id: 100 }, { id: 101 }]);
    solutionRepo.successRate.mockReturnValue(0.1);

    // Already detected
    antipatternRepo.findByProject.mockReturnValue([
      { pattern: 'TypeError.*Cannot read properties of null', description: 'Recurring error without solution: TypeError: Cannot read properties of null' },
    ]);

    const result = engine.runCycle();
    expect(result.newAntipatterns).toBe(0);
  });

  it('getLastCycleAt returns null before any cycle', () => {
    expect(engine.getLastCycleAt()).toBeNull();
  });

  it('getLastCycleAt returns ISO string after a cycle', () => {
    engine.runCycle();
    const lastCycle = engine.getLastCycleAt();
    expect(lastCycle).not.toBeNull();
    expect(new Date(lastCycle!).getTime()).toBeGreaterThan(0);
  });

  it('runCycle enriches patterns with solution data', async () => {
    const { extractPatterns } = await import('../../../src/learning/pattern-extractor.js');
    (extractPatterns as any).mockReturnValue([
      {
        errorType: 'TypeError',
        messageTemplate: 'x is not a function',
        messageRegex: 'TypeError.*is not a function',
        filePattern: null,
        occurrences: 5,
        errorIds: [1, 2],
        solutionIds: [],
        confidence: 0,
        successRate: 0,
      },
    ]);

    solutionRepo.findForError.mockReturnValue([{ id: 100 }]);
    solutionRepo.successRate.mockReturnValue(0.8);

    engine.runCycle();

    // extractPatterns was called
    expect(extractPatterns).toHaveBeenCalled();
    // findForError was called for each errorId in the pattern
    expect(solutionRepo.findForError).toHaveBeenCalledWith(1);
    expect(solutionRepo.findForError).toHaveBeenCalledWith(2);
  });
});
