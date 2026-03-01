import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResearchEngine } from '../../../src/research/research-engine.js';
import type { PostRepository } from '../../../src/db/repositories/post.repository.js';
import type { EngagementRepository } from '../../../src/db/repositories/engagement.repository.js';
import type { CampaignRepository } from '../../../src/db/repositories/campaign.repository.js';
import type { TemplateRepository } from '../../../src/db/repositories/template.repository.js';
import type { InsightRepository } from '../../../src/db/repositories/insight.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { ResearchConfig } from '../../../src/types/config.types.js';

const defaultConfig: ResearchConfig = {
  intervalMs: 60000,
  initialDelayMs: 0,
  minDataPoints: 3,
  trendWindowDays: 7,
  insightExpiryDays: 14,
};

function makePost(id: number, platform: string = 'x', format: string = 'text') {
  return {
    id,
    campaign_id: null,
    platform,
    content: `Post content ${id}`,
    format,
    hashtags: null,
    url: null,
    published_at: '2026-01-15T10:00:00Z',
    fingerprint: `fp_${id}`,
    status: 'published' as const,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
  };
}

function makeEngagement(postId: number, likes: number = 10) {
  return {
    id: postId,
    post_id: postId,
    timestamp: '2026-01-15T10:00:00Z',
    likes,
    comments: 2,
    shares: 1,
    impressions: 1000,
    clicks: 5,
    saves: 0,
    reach: 500,
  };
}

describe('ResearchEngine', () => {
  let engine: ResearchEngine;
  let postRepo: Record<string, ReturnType<typeof vi.fn>>;
  let engagementRepo: Record<string, ReturnType<typeof vi.fn>>;
  let campaignRepo: Record<string, ReturnType<typeof vi.fn>>;
  let templateRepo: Record<string, ReturnType<typeof vi.fn>>;
  let insightRepo: Record<string, ReturnType<typeof vi.fn>>;
  let synapseManager: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    postRepo = {
      recentPublished: vi.fn().mockReturnValue([]),
      countByPlatform: vi.fn().mockReturnValue({}),
      getById: vi.fn(),
      listByCampaign: vi.fn().mockReturnValue([]),
    };
    engagementRepo = {
      getLatestByPost: vi.fn(),
      topPosts: vi.fn().mockReturnValue([]),
    };
    campaignRepo = {
      listActive: vi.fn().mockReturnValue([]),
    };
    templateRepo = {
      search: vi.fn().mockReturnValue([]),
    };
    insightRepo = {
      expireOld: vi.fn().mockReturnValue(0),
      create: vi.fn().mockReturnValue(1),
    };
    synapseManager = {
      strengthen: vi.fn(),
    };

    engine = new ResearchEngine(
      defaultConfig,
      postRepo as unknown as PostRepository,
      engagementRepo as unknown as EngagementRepository,
      campaignRepo as unknown as CampaignRepository,
      templateRepo as unknown as TemplateRepository,
      insightRepo as unknown as InsightRepository,
      synapseManager as unknown as SynapseManager,
    );
  });

  it('should expire old insights at the start of the cycle', () => {
    insightRepo.expireOld.mockReturnValue(3);
    engine.runCycle();
    expect(insightRepo.expireOld).toHaveBeenCalled();
  });

  it('should detect platform gaps for missing platforms', () => {
    postRepo.countByPlatform.mockReturnValue({ x: 10 });

    engine.runCycle();

    // Should create gap insights for reddit, linkedin, bluesky
    const gapCalls = insightRepo.create.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'gap'
    );
    expect(gapCalls.length).toBeGreaterThanOrEqual(3);
  });

  it('should detect low-activity platforms', () => {
    postRepo.countByPlatform.mockReturnValue({ x: 10, reddit: 2 });

    engine.runCycle();

    const gapCalls = insightRepo.create.mock.calls.filter(
      (c: unknown[]) => {
        const arg = c[0] as { type: string; title: string };
        return arg.type === 'gap' && arg.title.includes('Low activity');
      }
    );
    expect(gapCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect trends when engagement changes significantly', () => {
    const posts = [
      makePost(1, 'x'), makePost(2, 'x'), makePost(3, 'x'),
      makePost(4, 'x'), makePost(5, 'x'), makePost(6, 'x'),
    ];
    postRepo.recentPublished.mockReturnValue(posts);

    // Recent posts (1-3) have much higher engagement than older ones (4-6)
    engagementRepo.getLatestByPost.mockImplementation((id: number) => {
      if (id <= 3) return makeEngagement(id, 100);
      return makeEngagement(id, 10);
    });

    engine.runCycle();

    const trendCalls = insightRepo.create.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'trend'
    );
    expect(trendCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('should not detect trends with insufficient data', () => {
    // Only 2 posts (below minDataPoints of 3)
    postRepo.recentPublished.mockReturnValue([makePost(1), makePost(2)]);

    engine.runCycle();

    const trendCalls = insightRepo.create.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'trend'
    );
    expect(trendCalls).toHaveLength(0);
  });

  it('should detect synergies from top-performing posts', () => {
    const topPosts = [
      { ...makeEngagement(1), post_id: 1, platform: 'x', content: 'c1', published_at: '2026-01-01' },
      { ...makeEngagement(2), post_id: 2, platform: 'x', content: 'c2', published_at: '2026-01-02' },
      { ...makeEngagement(3), post_id: 3, platform: 'x', content: 'c3', published_at: '2026-01-03' },
    ];
    engagementRepo.topPosts.mockReturnValue(topPosts);

    // All same platform + format = synergy
    postRepo.getById.mockImplementation((id: number) => makePost(id, 'x', 'video'));

    engine.runCycle();

    const synergyCalls = insightRepo.create.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'synergy'
    );
    expect(synergyCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('should suggest templates for high-performing posts without templates', () => {
    const topPosts = [
      { ...makeEngagement(1), post_id: 1, platform: 'x', content: 'c1', published_at: '2026-01-01' },
    ];
    engagementRepo.topPosts.mockReturnValue(topPosts);
    postRepo.getById.mockReturnValue(makePost(1));
    templateRepo.search.mockReturnValue([]); // No existing template

    engine.runCycle();

    const templateCalls = insightRepo.create.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'template'
    );
    expect(templateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('should not suggest templates when one already exists', () => {
    const topPosts = [
      { ...makeEngagement(1), post_id: 1, platform: 'x', content: 'c1', published_at: '2026-01-01' },
    ];
    engagementRepo.topPosts.mockReturnValue(topPosts);
    postRepo.getById.mockReturnValue(makePost(1));
    templateRepo.search.mockReturnValue([{ id: 1, name: 'Existing', structure: 'test' }]);

    engine.runCycle();

    const templateCalls = insightRepo.create.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'template'
    );
    expect(templateCalls).toHaveLength(0);
  });

  it('should suggest optimizations for active campaigns with enough posts', () => {
    campaignRepo.listActive.mockReturnValue([{ id: 1, name: 'My Campaign', status: 'active' }]);
    const posts = [makePost(1), makePost(2), makePost(3)];
    posts.forEach(p => { p.campaign_id = 1; });
    postRepo.listByCampaign.mockReturnValue(posts);
    engagementRepo.getLatestByPost.mockReturnValue(makeEngagement(1, 50));

    const topPost = { ...makeEngagement(1, 50), post_id: 1, platform: 'x', content: 'top', published_at: '2026-01-01' };
    engagementRepo.topPosts.mockReturnValue([topPost]);
    postRepo.getById.mockReturnValue({ ...makePost(1), campaign_id: 1 });

    engine.runCycle();

    const optCalls = insightRepo.create.mock.calls.filter(
      (c: unknown[]) => (c[0] as { type: string }).type === 'optimization'
    );
    expect(optCalls.length).toBeGreaterThanOrEqual(1);
  });
});
