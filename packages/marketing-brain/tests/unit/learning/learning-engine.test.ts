import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LearningEngine } from '../../../src/learning/learning-engine.js';
import type { PostRepository } from '../../../src/db/repositories/post.repository.js';
import type { EngagementRepository } from '../../../src/db/repositories/engagement.repository.js';
import type { RuleRepository } from '../../../src/db/repositories/rule.repository.js';
import type { StrategyRepository } from '../../../src/db/repositories/strategy.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { LearningConfig } from '../../../src/types/config.types.js';

const defaultConfig: LearningConfig = {
  intervalMs: 60000,
  minOccurrences: 2,
  minConfidence: 0.3,
  pruneThreshold: 0.1,
  decayHalfLifeDays: 7,
};

function makePost(id: number, platform: string = 'x', format: string = 'text', publishedAt: string | null = null) {
  return {
    id,
    campaign_id: null,
    platform,
    content: `Post content ${id}`,
    format,
    hashtags: null,
    url: null,
    published_at: publishedAt,
    fingerprint: `fp_${id}`,
    status: 'published' as const,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function makeEngagement(postId: number, likes: number = 10, comments: number = 2, shares: number = 1) {
  return {
    id: postId,
    post_id: postId,
    timestamp: '2026-01-01T00:00:00Z',
    likes,
    comments,
    shares,
    impressions: 1000,
    clicks: 5,
    saves: 0,
    reach: 500,
  };
}

describe('LearningEngine', () => {
  let engine: LearningEngine;
  let postRepo: Record<string, ReturnType<typeof vi.fn>>;
  let engagementRepo: Record<string, ReturnType<typeof vi.fn>>;
  let ruleRepo: Record<string, ReturnType<typeof vi.fn>>;
  let strategyRepo: Record<string, ReturnType<typeof vi.fn>>;
  let synapseManager: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    postRepo = {
      listPublished: vi.fn().mockReturnValue([]),
      listAll: vi.fn().mockReturnValue([]),
      countByPlatform: vi.fn().mockReturnValue({}),
      getById: vi.fn(),
    };
    engagementRepo = {
      getLatestByPost: vi.fn(),
      avgByPlatform: vi.fn().mockReturnValue([]),
      topPosts: vi.fn().mockReturnValue([]),
    };
    ruleRepo = {
      create: vi.fn().mockReturnValue(1),
      listAll: vi.fn().mockReturnValue([]),
      update: vi.fn(),
    };
    strategyRepo = {
      listAll: vi.fn().mockReturnValue([]),
      update: vi.fn(),
    };
    synapseManager = {
      runDecay: vi.fn().mockReturnValue({ decayed: 0, pruned: 0 }),
      strengthen: vi.fn(),
    };

    engine = new LearningEngine(
      defaultConfig,
      postRepo as unknown as PostRepository,
      engagementRepo as unknown as EngagementRepository,
      ruleRepo as unknown as RuleRepository,
      strategyRepo as unknown as StrategyRepository,
      synapseManager as unknown as SynapseManager,
    );
  });

  it('should return a result object from runCycle', () => {
    const result = engine.runCycle();
    expect(result).toHaveProperty('rulesCreated');
    expect(result).toHaveProperty('rulesUpdated');
    expect(result).toHaveProperty('strategiesUpdated');
    expect(result).toHaveProperty('synapsesDecayed');
    expect(result).toHaveProperty('synapsesPruned');
  });

  it('should run synapse decay during cycle', () => {
    synapseManager.runDecay.mockReturnValue({ decayed: 3, pruned: 1 });
    const result = engine.runCycle();
    expect(synapseManager.runDecay).toHaveBeenCalled();
    expect(result.synapsesDecayed).toBe(3);
    expect(result.synapsesPruned).toBe(1);
  });

  it('should extract timing patterns when sufficient data exists', () => {
    // Create posts at hour 10 and hour 22, with different engagement
    const posts = [
      makePost(1, 'x', 'text', '2026-01-01T10:00:00Z'),
      makePost(2, 'x', 'text', '2026-01-02T10:00:00Z'),
      makePost(3, 'x', 'text', '2026-01-03T10:00:00Z'),
      makePost(4, 'x', 'text', '2026-01-01T22:00:00Z'),
      makePost(5, 'x', 'text', '2026-01-02T22:00:00Z'),
      makePost(6, 'x', 'text', '2026-01-03T22:00:00Z'),
    ];
    postRepo.listPublished.mockReturnValue(posts);

    // High engagement for hour 10, low for hour 22
    engagementRepo.getLatestByPost.mockImplementation((id: number) => {
      if (id <= 3) return makeEngagement(id, 100, 50, 20); // High score
      return makeEngagement(id, 1, 0, 0); // Low score
    });

    const result = engine.runCycle();
    expect(result.rulesCreated).toBeGreaterThanOrEqual(1);
    expect(ruleRepo.create).toHaveBeenCalled();
  });

  it('should extract format patterns when data has multiple formats', () => {
    const posts = [
      makePost(1, 'x', 'video', '2026-01-01T10:00:00Z'),
      makePost(2, 'x', 'video', '2026-01-02T10:00:00Z'),
      makePost(3, 'x', 'video', '2026-01-03T10:00:00Z'),
      makePost(4, 'x', 'text', '2026-01-01T10:00:00Z'),
      makePost(5, 'x', 'text', '2026-01-02T10:00:00Z'),
      makePost(6, 'x', 'text', '2026-01-03T10:00:00Z'),
    ];
    postRepo.listPublished.mockReturnValue(posts);

    engagementRepo.getLatestByPost.mockImplementation((id: number) => {
      if (id <= 3) return makeEngagement(id, 100, 50, 20);
      return makeEngagement(id, 5, 1, 0);
    });

    const result = engine.runCycle();
    // Should have at least 1 format rule created
    expect(result.rulesCreated).toBeGreaterThanOrEqual(1);
  });

  it('should extract platform patterns when multiple platforms have data', () => {
    engagementRepo.avgByPlatform.mockReturnValue([
      { platform: 'x', avg_likes: 50, avg_comments: 20, avg_shares: 10, avg_impressions: 5000, avg_clicks: 30, post_count: 5 },
      { platform: 'reddit', avg_likes: 5, avg_comments: 1, avg_shares: 0, avg_impressions: 200, avg_clicks: 2, post_count: 3 },
    ]);

    const result = engine.runCycle();
    expect(result.rulesCreated).toBeGreaterThanOrEqual(1);
    // Check it created a platform-related rule
    const calls = ruleRepo.create.mock.calls;
    const platformRule = calls.find((c: unknown[]) => (c[0] as { pattern: string }).pattern.includes('best_platform'));
    expect(platformRule).toBeDefined();
  });

  it('should not create timing rules when insufficient data', () => {
    // Only 1 post per hour (below minOccurrences of 2)
    const posts = [
      makePost(1, 'x', 'text', '2026-01-01T10:00:00Z'),
      makePost(2, 'x', 'text', '2026-01-01T22:00:00Z'),
    ];
    postRepo.listPublished.mockReturnValue(posts);
    engagementRepo.getLatestByPost.mockReturnValue(makeEngagement(1));

    engine.runCycle();
    // No timing rules should have been created (minOccurrences = 2 per bucket)
    const timingCalls = ruleRepo.create.mock.calls.filter(
      (c: unknown[]) => (c[0] as { pattern: string }).pattern.includes('best_time')
    );
    expect(timingCalls).toHaveLength(0);
  });

  it('should update strategy confidence based on engagement', () => {
    strategyRepo.listAll.mockReturnValue([
      { id: 1, post_id: 10, description: 'Test strategy', confidence: 0.5, created_at: '2026-01-01' },
    ]);
    engagementRepo.getLatestByPost.mockReturnValue(makeEngagement(10, 50, 20, 10));

    const result = engine.runCycle();
    expect(result.strategiesUpdated).toBe(1);
    expect(strategyRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ confidence: expect.any(Number) }));
  });

  it('should not update strategy confidence when change is negligible', () => {
    // Score = 10*1 + 2*3 + 1*5 + 5*2 + 0 + 1000*0.01 = 10+6+5+10+10 = 41
    // confidence = min(1.0, 41/100) = 0.41
    strategyRepo.listAll.mockReturnValue([
      { id: 1, post_id: 10, description: 'Stable', confidence: 0.41, created_at: '2026-01-01' },
    ]);
    engagementRepo.getLatestByPost.mockReturnValue(makeEngagement(10));

    const result = engine.runCycle();
    expect(result.strategiesUpdated).toBe(0);
  });

  it('should wire similar posts during cycle', () => {
    const posts = [
      makePost(1, 'x', 'text'),
      makePost(2, 'x', 'text'),
    ];
    postRepo.listPublished.mockReturnValue(posts);

    engine.runCycle();
    expect(synapseManager.strengthen).toHaveBeenCalled();
  });

  it('should update rule confidence via Wilson Score', () => {
    // Wilson score for 2/10 is ~0.057, which is < pruneThreshold (0.1),
    // so the rule will be deactivated. This counts as an update.
    ruleRepo.listAll.mockReturnValue([
      { id: 1, pattern: 'test', recommendation: 'Test', confidence: 0.5, trigger_count: 10, success_count: 2, active: 1 },
    ]);

    const result = engine.runCycle();
    expect(result.rulesUpdated).toBeGreaterThanOrEqual(1);
    expect(ruleRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ active: 0 }));
  });
});
