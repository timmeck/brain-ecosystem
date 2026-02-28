import { getLogger } from '../utils/logger.js';

const logger = getLogger();
import type { PostService } from '../services/post.service.js';
import type { CampaignService } from '../services/campaign.service.js';
import type { StrategyService } from '../services/strategy.service.js';
import type { TemplateService } from '../services/template.service.js';
import type { RuleService } from '../services/rule.service.js';
import type { AudienceService } from '../services/audience.service.js';
import type { SynapseService } from '../services/synapse.service.js';
import type { AnalyticsService } from '../services/analytics.service.js';
import type { InsightService } from '../services/insight.service.js';
import type { MemoryService } from '../services/memory.service.js';
import type { LearningEngine } from '../learning/learning-engine.js';
import type { CrossBrainClient } from '@timmeck/brain-core';

export interface Services {
  post: PostService;
  campaign: CampaignService;
  strategy: StrategyService;
  template: TemplateService;
  rule: RuleService;
  audience: AudienceService;
  synapse: SynapseService;
  analytics: AnalyticsService;
  insight: InsightService;
  memory: MemoryService;
  learning?: LearningEngine;
  crossBrain?: CrossBrainClient;
}

type MethodHandler = (params: unknown) => unknown;

export class IpcRouter {
  private methods: Map<string, MethodHandler>;

  constructor(private services: Services) {
    this.methods = this.buildMethodMap();
  }

  handle(method: string, params: unknown): unknown {
    const handler = this.methods.get(method);
    if (!handler) {
      throw new Error(`Unknown method: ${method}`);
    }

    logger.debug(`IPC: ${method}`, { params });
    const result = handler(params);
    logger.debug(`IPC: ${method} → done`);
    return result;
  }

  listMethods(): string[] {
    return [...this.methods.keys()];
  }

  private buildMethodMap(): Map<string, MethodHandler> {
    const s = this.services;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (params: unknown) => params as any;

    return new Map<string, MethodHandler>([
      // Posts
      ['post.report',          (params) => s.post.report(p(params))],
      ['post.publish',         (params) => s.post.publish(p(params).id ?? p(params).postId, p(params).url)],
      ['post.get',             (params) => s.post.getById(p(params).id)],
      ['post.list',            (params) => s.post.listPosts(p(params))],
      ['post.search',          (params) => s.post.searchPosts(p(params).query, p(params).limit)],
      ['post.similar',         (params) => s.post.findSimilar(p(params).id ?? p(params).postId)],
      ['post.engagement',      (params) => s.post.updateEngagement(p(params))],
      ['post.getEngagement',   (params) => s.post.getEngagement(p(params).id ?? p(params).postId)],
      ['post.top',             (params) => s.post.getTopPosts(p(params)?.limit)],
      ['post.stats',           () => s.post.getPostStats()],
      ['post.platformStats',   () => s.post.getPlatformStats()],

      // Campaigns
      ['campaign.create',      (params) => s.campaign.create(p(params))],
      ['campaign.get',         (params) => s.campaign.getById(p(params).id)],
      ['campaign.list',        () => s.campaign.listCampaigns()],
      ['campaign.stats',       (params) => s.campaign.getStats(p(params).id ?? p(params).campaignId)],
      ['campaign.update',      (params) => s.campaign.update(p(params).id, p(params))],

      // Strategies
      ['strategy.report',      (params) => s.strategy.report(p(params))],
      ['strategy.suggest',     (params) => s.strategy.suggest(p(params).query, p(params).limit)],
      ['strategy.top',         (params) => s.strategy.getTopStrategies(p(params)?.minConfidence, p(params)?.limit)],
      ['strategy.list',        (params) => s.strategy.listAll(p(params)?.limit)],

      // Templates
      ['template.find',        (params) => s.template.find(p(params).query, p(params).limit)],
      ['template.create',      (params) => s.template.create(p(params))],
      ['template.list',        (params) => s.template.listAll(p(params)?.limit)],
      ['template.byPlatform',  (params) => s.template.findByPlatform(p(params).platform, p(params).limit)],
      ['template.use',         (params) => s.template.useTemplate(p(params).templateId, p(params).postId)],

      // Rules
      ['rule.check',           (params) => s.rule.check(p(params).content, p(params).platform)],
      ['rule.list',            () => s.rule.listRules()],
      ['rule.create',          (params) => s.rule.create(p(params))],

      // Audiences
      ['audience.create',      (params) => s.audience.create(p(params))],
      ['audience.list',        () => s.audience.listAll()],
      ['audience.linkPost',    (params) => s.audience.linkToPost(p(params).audienceId, p(params).postId)],

      // Insights
      ['insight.list',         (params) => s.insight.listActive(p(params)?.limit)],
      ['insight.byType',       (params) => s.insight.listByType(p(params).type, p(params).limit)],
      ['insight.byCampaign',   (params) => s.insight.listByCampaign(p(params).campaignId)],

      // Synapses
      ['synapse.context',      (params) => s.synapse.getPostContext(p(params).postId ?? p(params).id)],
      ['synapse.path',         (params) => s.synapse.findPath(p(params).fromType, p(params).fromId, p(params).toType, p(params).toId)],
      ['synapse.related',      (params) => s.synapse.getRelated(p(params))],
      ['synapse.stats',        () => s.synapse.getNetworkStats()],
      ['synapse.strongest',    (params) => s.synapse.getStrongest(p(params)?.limit)],

      // Memory
      ['memory.remember',      (params) => s.memory.remember(p(params))],
      ['memory.recall',        (params) => s.memory.recall(p(params))],
      ['memory.forget',        (params) => s.memory.forget(p(params).memoryId ?? p(params).memory_id)],
      ['memory.preferences',   () => s.memory.getPreferences()],
      ['memory.decisions',     () => s.memory.getDecisions()],
      ['memory.goals',         () => s.memory.getGoals()],
      ['memory.lessons',       () => s.memory.getLessons()],
      ['memory.stats',         () => s.memory.getStats()],
      ['session.start',        (params) => s.memory.startSession(p(params))],
      ['session.end',          (params) => s.memory.endSession(p(params))],
      ['session.history',      (params) => s.memory.getSessionHistory(p(params).limit)],

      // Analytics
      ['analytics.summary',    () => s.analytics.getSummary()],
      ['analytics.top',        (params) => s.analytics.getTopPerformers(p(params)?.limit)],
      ['analytics.dashboard',  () => s.analytics.getDashboardData()],

      // Learning
      ['learning.run',         () => {
        if (!s.learning) throw new Error('Learning engine not available');
        return s.learning.runCycle();
      }],

      // Cross-Brain Notifications
      ['cross-brain.notify',   (params) => {
        const { source, event, data, timestamp } = p(params);
        logger.info(`Cross-brain notification from ${source}: ${event}`);
        return { received: true, source, event, timestamp };
      }],

      // Ecosystem
      ['ecosystem.status',     async () => {
        if (!s.crossBrain) return { peers: [] };
        const peers = await s.crossBrain.broadcast('status');
        return { self: 'marketing-brain', peers };
      }],
      ['ecosystem.queryPeer',  async (params) => {
        if (!s.crossBrain) throw new Error('Cross-brain client not available');
        const { peer, method, args } = p(params);
        const result = await s.crossBrain.query(peer, method, args);
        if (result === null) throw new Error(`Peer '${peer}' not available`);
        return result;
      }],

      // Status (cross-brain)
      ['status',               () => ({
        name: 'marketing-brain',
        version: '0.5.0',
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        methods: this.listMethods().length,
      })],
    ]);
  }
}
