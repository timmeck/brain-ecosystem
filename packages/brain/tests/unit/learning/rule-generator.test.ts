import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateRules, persistRules } from '../../../src/learning/rule-generator.js';
import type { ErrorPattern } from '../../../src/learning/pattern-extractor.js';
import type { LearningConfig } from '../../../src/types/config.types.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

function makePattern(overrides: Partial<ErrorPattern> = {}): ErrorPattern {
  return {
    errorType: 'TypeError',
    messageTemplate: 'x is not a function',
    messageRegex: 'TypeError.*is not a function',
    filePattern: null,
    occurrences: 5,
    errorIds: [1, 2, 3],
    solutionIds: [10, 11],
    confidence: 0.7,
    successRate: 0.6,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<LearningConfig> = {}): LearningConfig {
  return {
    intervalMs: 60000,
    minOccurrences: 3,
    minSuccessRate: 0.5,
    minConfidence: 0.6,
    pruneThreshold: 0.1,
    maxRejectionRate: 0.5,
    decayHalfLifeDays: 30,
    ...overrides,
  };
}

describe('generateRules', () => {
  it('generates rules from patterns meeting thresholds', () => {
    const patterns = [makePattern({ occurrences: 5, confidence: 0.75 })];
    const config = makeConfig({ minOccurrences: 3, minConfidence: 0.6 });

    const rules = generateRules(patterns, config);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.pattern).toBe('TypeError.*is not a function');
    expect(rules[0]!.confidence).toBe(0.75);
  });

  it('filters out patterns below minOccurrences', () => {
    const patterns = [makePattern({ occurrences: 1 })];
    const config = makeConfig({ minOccurrences: 3 });

    const rules = generateRules(patterns, config);
    expect(rules).toHaveLength(0);
  });

  it('filters out patterns below minConfidence', () => {
    const patterns = [makePattern({ confidence: 0.3 })];
    const config = makeConfig({ minConfidence: 0.6 });

    const rules = generateRules(patterns, config);
    expect(rules).toHaveLength(0);
  });

  it('generates auto-fix action for high-confidence patterns', () => {
    const patterns = [makePattern({ confidence: 0.95 })];
    const config = makeConfig({ minOccurrences: 1, minConfidence: 0.5 });

    const rules = generateRules(patterns, config);
    expect(rules[0]!.action).toContain('Auto-fix');
  });

  it('generates suggestion action for moderate-confidence patterns', () => {
    const patterns = [makePattern({ confidence: 0.7 })];
    const config = makeConfig({ minOccurrences: 1, minConfidence: 0.5 });

    const rules = generateRules(patterns, config);
    expect(rules[0]!.action).toContain('Suggestion');
  });

  it('includes sourceErrorIds in generated rules', () => {
    const patterns = [makePattern({ errorIds: [10, 20, 30], occurrences: 5, confidence: 0.8 })];
    const config = makeConfig();

    const rules = generateRules(patterns, config);
    expect(rules[0]!.sourceErrorIds).toEqual([10, 20, 30]);
  });

  it('handles empty patterns array', () => {
    const rules = generateRules([], makeConfig());
    expect(rules).toHaveLength(0);
  });
});

describe('persistRules', () => {
  let mockRuleRepo: any;

  beforeEach(() => {
    mockRuleRepo = {
      findByPattern: vi.fn().mockReturnValue([]),
      create: vi.fn().mockReturnValue(1),
      update: vi.fn(),
    };
  });

  it('creates new rules that do not exist yet', () => {
    const rules = [
      { pattern: 'Error.*new', action: 'fix it', description: 'desc', confidence: 0.8, sourceErrorIds: [1] },
    ];

    const created = persistRules(rules, mockRuleRepo);
    expect(created).toBe(1);
    expect(mockRuleRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      pattern: 'Error.*new',
      action: 'fix it',
      confidence: 0.8,
    }));
  });

  it('updates existing rule confidence when new is higher', () => {
    mockRuleRepo.findByPattern.mockReturnValue([{ id: 5, confidence: 0.5 }]);

    const rules = [
      { pattern: 'Error.*existing', action: 'fix', description: 'desc', confidence: 0.9, sourceErrorIds: [1] },
    ];

    const created = persistRules(rules, mockRuleRepo);
    expect(created).toBe(0); // Not a new creation
    expect(mockRuleRepo.update).toHaveBeenCalledWith(5, { confidence: 0.9 });
  });

  it('does not update existing rule if new confidence is lower', () => {
    mockRuleRepo.findByPattern.mockReturnValue([{ id: 5, confidence: 0.9 }]);

    const rules = [
      { pattern: 'Error.*existing', action: 'fix', description: 'desc', confidence: 0.7, sourceErrorIds: [1] },
    ];

    const created = persistRules(rules, mockRuleRepo);
    expect(created).toBe(0);
    expect(mockRuleRepo.update).not.toHaveBeenCalled();
  });

  it('handles multiple rules with mix of new and existing', () => {
    mockRuleRepo.findByPattern.mockImplementation((pattern: string) => {
      if (pattern === 'existing.*pattern') return [{ id: 1, confidence: 0.5 }];
      return [];
    });

    const rules = [
      { pattern: 'existing.*pattern', action: 'update', description: 'desc', confidence: 0.8, sourceErrorIds: [1] },
      { pattern: 'new.*pattern', action: 'create', description: 'desc', confidence: 0.7, sourceErrorIds: [2] },
    ];

    const created = persistRules(rules, mockRuleRepo);
    expect(created).toBe(1); // Only the new one
    expect(mockRuleRepo.update).toHaveBeenCalledWith(1, { confidence: 0.8 });
    expect(mockRuleRepo.create).toHaveBeenCalledTimes(1);
  });

  it('passes projectId when provided', () => {
    const rules = [
      { pattern: 'Error.*test', action: 'fix', description: 'desc', confidence: 0.8, sourceErrorIds: [1] },
    ];

    persistRules(rules, mockRuleRepo, 42);
    expect(mockRuleRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 42,
    }));
  });
});
