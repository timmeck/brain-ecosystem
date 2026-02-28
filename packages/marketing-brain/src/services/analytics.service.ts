import type { PostRepository } from '../db/repositories/post.repository.js';
import type { EngagementRepository } from '../db/repositories/engagement.repository.js';
import type { CampaignRepository } from '../db/repositories/campaign.repository.js';
import type { StrategyRepository } from '../db/repositories/strategy.repository.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { TemplateRepository } from '../db/repositories/template.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import type { MemoryRepository } from '../db/repositories/memory.repository.js';
import type { SessionRepository } from '../db/repositories/session.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';

export class AnalyticsService {
  constructor(
    private postRepo: PostRepository,
    private engagementRepo: EngagementRepository,
    private campaignRepo: CampaignRepository,
    private strategyRepo: StrategyRepository,
    private ruleRepo: RuleRepository,
    private templateRepo: TemplateRepository,
    private insightRepo: InsightRepository,
    private synapseManager: SynapseManager,
    private memoryRepo?: MemoryRepository,
    private sessionRepo?: SessionRepository,
  ) {}

  getSummary() {
    const network = this.synapseManager.getNetworkStats();

    return {
      posts: {
        total: this.postRepo.countAll(),
        byPlatform: this.postRepo.countByPlatform(),
        byStatus: this.postRepo.countByStatus(),
      },
      campaigns: {
        total: this.campaignRepo.countAll(),
      },
      strategies: {
        total: this.strategyRepo.countAll(),
      },
      rules: {
        total: this.ruleRepo.countAll(),
        active: this.ruleRepo.countActive(),
      },
      templates: {
        total: this.templateRepo.countAll(),
      },
      insights: {
        active: this.insightRepo.countActive(),
        total: this.insightRepo.countAll(),
      },
      network: {
        synapses: network.totalSynapses,
        nodes: network.totalNodes,
        avgWeight: network.avgWeight,
      },
      memory: {
        active: this.memoryRepo?.countActive() ?? 0,
        byCategory: this.memoryRepo?.countByCategory() ?? {},
        sessions: this.sessionRepo?.countAll() ?? 0,
      },
    };
  }

  getTopPerformers(limit: number = 10) {
    return {
      topPosts: this.engagementRepo.topPosts(limit),
      platformStats: this.engagementRepo.avgByPlatform(),
      topStrategies: this.strategyRepo.topByConfidence(0.6, limit),
    };
  }

  getDashboardData() {
    return {
      summary: this.getSummary(),
      topPerformers: this.getTopPerformers(5),
      recentInsights: this.insightRepo.listActive(5),
      activeRules: this.ruleRepo.listActive(),
      strongestConnections: this.synapseManager.getStrongestSynapses(10),
    };
  }
}
