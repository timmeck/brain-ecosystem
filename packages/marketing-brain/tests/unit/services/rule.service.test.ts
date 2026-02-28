import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RuleService } from '../../../src/services/rule.service.js';
import type { RuleRepository } from '../../../src/db/repositories/rule.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { MarketingRule, RuleCreate } from '../../../src/types/post.types.js';

// Mock the event bus
vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({ emit: vi.fn() }),
}));

function makeRule(overrides: Partial<MarketingRule> = {}): MarketingRule {
  return {
    id: 1,
    pattern: 'use_emojis',
    recommendation: 'Use emojis to increase engagement',
    confidence: 0.8,
    trigger_count: 0,
    success_count: 0,
    active: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RuleService', () => {
  let service: RuleService;
  let ruleRepo: {
    create: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    listActive: ReturnType<typeof vi.fn>;
    listAll: ReturnType<typeof vi.fn>;
    incrementTrigger: ReturnType<typeof vi.fn>;
    countAll: ReturnType<typeof vi.fn>;
    countActive: ReturnType<typeof vi.fn>;
  };
  let synapseManager: {
    strengthen: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    ruleRepo = {
      create: vi.fn(),
      getById: vi.fn(),
      listActive: vi.fn(),
      listAll: vi.fn(),
      incrementTrigger: vi.fn(),
      countAll: vi.fn(),
      countActive: vi.fn(),
    };

    synapseManager = {
      strengthen: vi.fn(),
    };

    service = new RuleService(
      ruleRepo as unknown as RuleRepository,
      synapseManager as unknown as SynapseManager,
    );
  });

  describe('create', () => {
    it('should create a new rule and return it', () => {
      const data: RuleCreate = { pattern: 'no_clickbait', recommendation: 'Avoid clickbait titles' };
      const rule = makeRule({ id: 5, pattern: 'no_clickbait', recommendation: 'Avoid clickbait titles' });

      ruleRepo.create.mockReturnValue(5);
      ruleRepo.getById.mockReturnValue(rule);

      const result = service.create(data);

      expect(result).toEqual(rule);
      expect(ruleRepo.create).toHaveBeenCalledWith(data);
      expect(ruleRepo.getById).toHaveBeenCalledWith(5);
    });
  });

  describe('check', () => {
    it('should return passed=true when no violations', () => {
      const rule = makeRule({ pattern: 'use_emojis', recommendation: 'Use emojis to boost engagement' });
      ruleRepo.listActive.mockReturnValue([rule]);

      const result = service.check('Hello world!', 'x');

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      // Non-preventive rules become recommendations
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].suggestion).toBe('Use emojis to boost engagement');
    });

    it('should detect violations for no_ prefixed rules', () => {
      const rule = makeRule({
        pattern: 'no_clickbait',
        recommendation: 'Avoid clickbait content',
      });
      ruleRepo.listActive.mockReturnValue([rule]);

      // Content contains "clickbait" which matches the no_clickbait pattern keyword
      const result = service.check('This is clickbait content', 'x');

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].rule).toEqual(rule);
      expect(result.violations[0].reason).toBe('Avoid clickbait content');
    });

    it('should detect violations for avoid_ prefixed rules', () => {
      const rule = makeRule({
        pattern: 'avoid_spam',
        recommendation: 'Do not include spam',
      });
      ruleRepo.listActive.mockReturnValue([rule]);

      const result = service.check('This is spam content', 'x');

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should detect violations for never_ prefixed rules', () => {
      const rule = makeRule({
        pattern: 'never_profanity',
        recommendation: 'Never use profanity',
      });
      ruleRepo.listActive.mockReturnValue([rule]);

      const result = service.check('Contains profanity in text', 'reddit');

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should not trigger violation when keyword is not in content', () => {
      const rule = makeRule({
        pattern: 'no_clickbait',
        recommendation: 'Avoid clickbait content',
      });
      ruleRepo.listActive.mockReturnValue([rule]);

      const result = service.check('Professional marketing post', 'x');

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should filter rules by platform when platform: prefix is used', () => {
      const rule = makeRule({
        pattern: 'platform:linkedin use_formal_tone',
        recommendation: 'Use formal tone on LinkedIn',
      });
      ruleRepo.listActive.mockReturnValue([rule]);

      // Rule targets linkedin but we are checking for x -- should be skipped
      const result = service.check('Some content', 'x');

      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.recommendations).toHaveLength(0);
    });

    it('should apply platform-specific rules when platform matches', () => {
      const rule = makeRule({
        pattern: 'platform:linkedin use_formal_tone',
        recommendation: 'Use formal tone on LinkedIn',
      });
      ruleRepo.listActive.mockReturnValue([rule]);

      const result = service.check('Some content', 'linkedin');

      // The rule matches the platform and is a recommendation (not preventive)
      expect(result.recommendations).toHaveLength(1);
      expect(result.recommendations[0].suggestion).toBe('Use formal tone on LinkedIn');
    });

    it('should be case-insensitive for content and pattern matching', () => {
      const rule = makeRule({
        pattern: 'no_CLICKBAIT',
        recommendation: 'Avoid clickbait',
      });
      ruleRepo.listActive.mockReturnValue([rule]);

      const result = service.check('This has CLICKBAIT headlines', 'x');

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(1);
    });

    it('should limit recommendations to 5', () => {
      const rules = Array.from({ length: 8 }, (_, i) =>
        makeRule({
          id: i + 1,
          pattern: `tip_${i}`,
          recommendation: `Recommendation ${i}`,
        }),
      );
      ruleRepo.listActive.mockReturnValue(rules);

      const result = service.check('Some content', 'x');

      expect(result.recommendations.length).toBeLessThanOrEqual(5);
    });

    it('should handle multiple rules with mixed violations and recommendations', () => {
      const rules = [
        makeRule({ id: 1, pattern: 'no_spam', recommendation: 'Avoid spam' }),
        makeRule({ id: 2, pattern: 'use_hashtags', recommendation: 'Add hashtags' }),
        makeRule({ id: 3, pattern: 'avoid_links', recommendation: 'No links please' }),
      ];
      ruleRepo.listActive.mockReturnValue(rules);

      // Content contains "spam" (violation for rule 1)
      // Content contains "links" (violation for rule 3)
      const result = service.check('This is spam with links', 'x');

      expect(result.passed).toBe(false);
      expect(result.violations).toHaveLength(2);
      expect(result.recommendations).toHaveLength(1);
    });
  });

  describe('listRules', () => {
    it('should return active rules', () => {
      const rules = [makeRule({ id: 1 }), makeRule({ id: 2 })];
      ruleRepo.listActive.mockReturnValue(rules);

      expect(service.listRules()).toEqual(rules);
      expect(ruleRepo.listActive).toHaveBeenCalled();
    });
  });

  describe('listAllRules', () => {
    it('should return all rules including inactive', () => {
      const rules = [makeRule({ id: 1, active: 1 }), makeRule({ id: 2, active: 0 })];
      ruleRepo.listAll.mockReturnValue(rules);

      expect(service.listAllRules()).toEqual(rules);
      expect(ruleRepo.listAll).toHaveBeenCalled();
    });
  });

  describe('recordTrigger', () => {
    it('should increment trigger count with success=true', () => {
      service.recordTrigger(5, true);

      expect(ruleRepo.incrementTrigger).toHaveBeenCalledWith(5, true);
    });

    it('should increment trigger count with success=false', () => {
      service.recordTrigger(5, false);

      expect(ruleRepo.incrementTrigger).toHaveBeenCalledWith(5, false);
    });
  });

  describe('getById', () => {
    it('should return a rule by id', () => {
      const rule = makeRule({ id: 3 });
      ruleRepo.getById.mockReturnValue(rule);

      expect(service.getById(3)).toEqual(rule);
      expect(ruleRepo.getById).toHaveBeenCalledWith(3);
    });

    it('should return undefined for non-existent rule', () => {
      ruleRepo.getById.mockReturnValue(undefined);

      expect(service.getById(999)).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return total and active rule counts', () => {
      ruleRepo.countAll.mockReturnValue(25);
      ruleRepo.countActive.mockReturnValue(18);

      const stats = service.getStats();

      expect(stats).toEqual({ total: 25, active: 18 });
    });
  });
});
