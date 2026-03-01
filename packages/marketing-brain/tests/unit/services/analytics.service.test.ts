import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnalyticsService } from '../../../src/services/analytics.service.js';
import type { PostRepository } from '../../../src/db/repositories/post.repository.js';
import type { EngagementRepository } from '../../../src/db/repositories/engagement.repository.js';
import type { CampaignRepository } from '../../../src/db/repositories/campaign.repository.js';
import type { StrategyRepository } from '../../../src/db/repositories/strategy.repository.js';
import type { RuleRepository } from '../../../src/db/repositories/rule.repository.js';
import type { TemplateRepository } from '../../../src/db/repositories/template.repository.js';
import type { InsightRepository } from '../../../src/db/repositories/insight.repository.js';
import type { MemoryRepository } from '../../../src/db/repositories/memory.repository.js';
import type { SessionRepository } from '../../../src/db/repositories/session.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let postRepo: Record<string, ReturnType<typeof vi.fn>>;
  let engagementRepo: Record<string, ReturnType<typeof vi.fn>>;
  let campaignRepo: Record<string, ReturnType<typeof vi.fn>>;
  let strategyRepo: Record<string, ReturnType<typeof vi.fn>>;
  let ruleRepo: Record<string, ReturnType<typeof vi.fn>>;
  let templateRepo: Record<string, ReturnType<typeof vi.fn>>;
  let insightRepo: Record<string, ReturnType<typeof vi.fn>>;
  let synapseManager: Record<string, ReturnType<typeof vi.fn>>;
  let memoryRepo: Record<string, ReturnType<typeof vi.fn>>;
  let sessionRepo: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    postRepo = {
      countAll: vi.fn().mockReturnValue(50),
      countByPlatform: vi.fn().mockReturnValue({ x: 30, reddit: 20 }),
      countByStatus: vi.fn().mockReturnValue({ draft: 10, published: 40 }),
    };

    engagementRepo = {
      topPosts: vi.fn().mockReturnValue([]),
      avgByPlatform: vi.fn().mockReturnValue([]),
    };

    campaignRepo = {
      countAll: vi.fn().mockReturnValue(5),
    };

    strategyRepo = {
      countAll: vi.fn().mockReturnValue(12),
      topByConfidence: vi.fn().mockReturnValue([]),
    };

    ruleRepo = {
      countAll: vi.fn().mockReturnValue(8),
      countActive: vi.fn().mockReturnValue(6),
      listActive: vi.fn().mockReturnValue([]),
    };

    templateRepo = {
      countAll: vi.fn().mockReturnValue(4),
    };

    insightRepo = {
      countActive: vi.fn().mockReturnValue(3),
      countAll: vi.fn().mockReturnValue(10),
      listActive: vi.fn().mockReturnValue([]),
    };

    synapseManager = {
      getNetworkStats: vi.fn().mockReturnValue({
        totalSynapses: 100,
        totalNodes: 50,
        avgWeight: 0.65,
        nodesByType: {},
        synapsesByType: {},
      }),
      getStrongestSynapses: vi.fn().mockReturnValue([]),
    };

    memoryRepo = {
      countActive: vi.fn().mockReturnValue(15),
      countByCategory: vi.fn().mockReturnValue({ preference: 5, fact: 10 }),
    };

    sessionRepo = {
      countAll: vi.fn().mockReturnValue(7),
    };

    service = new AnalyticsService(
      postRepo as unknown as PostRepository,
      engagementRepo as unknown as EngagementRepository,
      campaignRepo as unknown as CampaignRepository,
      strategyRepo as unknown as StrategyRepository,
      ruleRepo as unknown as RuleRepository,
      templateRepo as unknown as TemplateRepository,
      insightRepo as unknown as InsightRepository,
      synapseManager as unknown as SynapseManager,
      memoryRepo as unknown as MemoryRepository,
      sessionRepo as unknown as SessionRepository,
    );
  });

  describe('getSummary', () => {
    it('should return a complete summary object', () => {
      const summary = service.getSummary();

      expect(summary.posts.total).toBe(50);
      expect(summary.posts.byPlatform).toEqual({ x: 30, reddit: 20 });
      expect(summary.posts.byStatus).toEqual({ draft: 10, published: 40 });
      expect(summary.campaigns.total).toBe(5);
      expect(summary.strategies.total).toBe(12);
      expect(summary.rules.total).toBe(8);
      expect(summary.rules.active).toBe(6);
      expect(summary.templates.total).toBe(4);
      expect(summary.insights.active).toBe(3);
      expect(summary.insights.total).toBe(10);
      expect(summary.network.synapses).toBe(100);
      expect(summary.network.nodes).toBe(50);
      expect(summary.network.avgWeight).toBe(0.65);
    });

    it('should include memory stats', () => {
      const summary = service.getSummary();

      expect(summary.memory.active).toBe(15);
      expect(summary.memory.byCategory).toEqual({ preference: 5, fact: 10 });
      expect(summary.memory.sessions).toBe(7);
    });

    it('should handle missing memory and session repos', () => {
      const serviceNoMemory = new AnalyticsService(
        postRepo as unknown as PostRepository,
        engagementRepo as unknown as EngagementRepository,
        campaignRepo as unknown as CampaignRepository,
        strategyRepo as unknown as StrategyRepository,
        ruleRepo as unknown as RuleRepository,
        templateRepo as unknown as TemplateRepository,
        insightRepo as unknown as InsightRepository,
        synapseManager as unknown as SynapseManager,
      );

      const summary = serviceNoMemory.getSummary();
      expect(summary.memory.active).toBe(0);
      expect(summary.memory.byCategory).toEqual({});
      expect(summary.memory.sessions).toBe(0);
    });
  });

  describe('getTopPerformers', () => {
    it('should return top performers data', () => {
      const topPosts = [{ id: 1, post_id: 1, likes: 100 }];
      const platformStats = [{ platform: 'x', avg_likes: 50 }];
      const topStrategies = [{ id: 1, description: 'Best strategy', confidence: 0.9 }];

      engagementRepo.topPosts.mockReturnValue(topPosts);
      engagementRepo.avgByPlatform.mockReturnValue(platformStats);
      strategyRepo.topByConfidence.mockReturnValue(topStrategies);

      const result = service.getTopPerformers(5);

      expect(engagementRepo.topPosts).toHaveBeenCalledWith(5);
      expect(strategyRepo.topByConfidence).toHaveBeenCalledWith(0.6, 5);
      expect(result.topPosts).toEqual(topPosts);
      expect(result.platformStats).toEqual(platformStats);
      expect(result.topStrategies).toEqual(topStrategies);
    });

    it('should use default limit', () => {
      service.getTopPerformers();
      expect(engagementRepo.topPosts).toHaveBeenCalledWith(10);
    });
  });

  describe('getDashboardData', () => {
    it('should return all dashboard data', () => {
      const dashboard = service.getDashboardData();

      expect(dashboard).toHaveProperty('summary');
      expect(dashboard).toHaveProperty('topPerformers');
      expect(dashboard).toHaveProperty('recentInsights');
      expect(dashboard).toHaveProperty('activeRules');
      expect(dashboard).toHaveProperty('strongestConnections');
    });

    it('should call insightRepo.listActive with limit 5', () => {
      service.getDashboardData();
      expect(insightRepo.listActive).toHaveBeenCalledWith(5);
    });

    it('should call synapseManager.getStrongestSynapses with limit 10', () => {
      service.getDashboardData();
      expect(synapseManager.getStrongestSynapses).toHaveBeenCalledWith(10);
    });
  });
});
