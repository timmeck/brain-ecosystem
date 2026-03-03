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
import type { PatternExtractor } from '../learning/pattern-extractor.js';
import type { ABTestService } from '../services/ab-test.service.js';
import type { CalendarService } from '../services/calendar.service.js';
import type { CompetitorService } from '../services/competitor.service.js';
import type { SchedulerService } from '../services/scheduler.service.js';
import type { ContentGeneratorService } from '../services/content-generator.service.js';
import type { PlatformAdapterService } from '../services/platform-adapter.service.js';
import type { CrossBrainClient, CrossBrainSubscriptionManager } from '@timmeck/brain-core';
import type { IpcServer } from '@timmeck/brain-core';
import type { WebhookService } from '@timmeck/brain-core';
import type { ExportService } from '@timmeck/brain-core';
import type { BackupService } from '@timmeck/brain-core';
import type { MetaLearningEngine } from '@timmeck/brain-core';
import type { CausalGraph } from '@timmeck/brain-core';
import type { HypothesisEngine } from '@timmeck/brain-core';
import type { AutonomousResearchScheduler } from '@timmeck/brain-core';
import type { SelfObserver } from '@timmeck/brain-core';
import type { AdaptiveStrategyEngine } from '@timmeck/brain-core';
import type { ExperimentEngine } from '@timmeck/brain-core';
import type { CrossDomainEngine } from '@timmeck/brain-core';
import type { CounterfactualEngine } from '@timmeck/brain-core';
import type { KnowledgeDistiller } from '@timmeck/brain-core';
import type { ResearchAgendaEngine } from '@timmeck/brain-core';
import type { AnomalyDetective } from '@timmeck/brain-core';
import type { ResearchJournal } from '@timmeck/brain-core';
import type { DreamEngine } from '@timmeck/brain-core';
import type { ThoughtStream, ConsciousnessServer } from '@timmeck/brain-core';
import type { PredictionEngine } from '@timmeck/brain-core';
import type { ResearchOrchestrator } from '@timmeck/brain-core';

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
  competitor: CompetitorService;
  scheduler: SchedulerService;
  contentGenerator: ContentGeneratorService;
  platformAdapter: PlatformAdapterService;
  learning?: LearningEngine;
  patternExtractor?: PatternExtractor;
  abTest?: ABTestService;
  calendar?: CalendarService;
  crossBrain?: CrossBrainClient;
  webhook?: WebhookService;
  export?: ExportService;
  backup?: BackupService;
  metaLearning?: MetaLearningEngine;
  causal?: CausalGraph;
  hypothesis?: HypothesisEngine;
  researchScheduler?: AutonomousResearchScheduler;
  selfObserver?: SelfObserver;
  adaptiveStrategy?: AdaptiveStrategyEngine;
  experimentEngine?: ExperimentEngine;
  crossDomain?: CrossDomainEngine;
  counterfactual?: CounterfactualEngine;
  knowledgeDistiller?: KnowledgeDistiller;
  researchAgenda?: ResearchAgendaEngine;
  anomalyDetective?: AnomalyDetective;
  journal?: ResearchJournal;
  dreamEngine?: DreamEngine;
  thoughtStream?: ThoughtStream;
  consciousnessServer?: ConsciousnessServer;
  predictionEngine?: PredictionEngine;
  orchestrator?: ResearchOrchestrator;
  attentionEngine?: import('@timmeck/brain-core').AttentionEngine;
  transferEngine?: import('@timmeck/brain-core').TransferEngine;
  narrativeEngine?: import('@timmeck/brain-core').NarrativeEngine;
  curiosityEngine?: import('@timmeck/brain-core').CuriosityEngine;
  emergenceEngine?: import('@timmeck/brain-core').EmergenceEngine;
  debateEngine?: import('@timmeck/brain-core').DebateEngine;
  parameterRegistry?: import('@timmeck/brain-core').ParameterRegistry;
  metaCognitionLayer?: import('@timmeck/brain-core').MetaCognitionLayer;
  autoExperimentEngine?: import('@timmeck/brain-core').AutoExperimentEngine;
  selfTestEngine?: import('@timmeck/brain-core').SelfTestEngine;
  teachEngine?: import('@timmeck/brain-core').TeachEngine;
  dataScout?: import('@timmeck/brain-core').DataScout;
  simulationEngine?: import('@timmeck/brain-core').SimulationEngine;
  memoryPalace?: import('@timmeck/brain-core').MemoryPalace;
  goalEngine?: import('@timmeck/brain-core').GoalEngine;
  evolutionEngine?: import('@timmeck/brain-core').EvolutionEngine;
  reasoningEngine?: import('@timmeck/brain-core').ReasoningEngine;
}

type MethodHandler = (params: unknown) => unknown;

export class IpcRouter {
  private methods: Map<string, MethodHandler>;
  private subscriptionManager: CrossBrainSubscriptionManager | null = null;
  private ipcServer: IpcServer | null = null;

  constructor(private services: Services) {
    this.methods = this.buildMethodMap();
  }

  /**
   * Wire the subscription manager and IPC server for cross-brain event routing.
   */
  setSubscriptionManager(manager: CrossBrainSubscriptionManager, server: IpcServer): void {
    this.subscriptionManager = manager;
    this.ipcServer = server;

    // Register cross-brain subscription handlers
    this.methods.set('cross-brain.subscribe', (params) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { subscriber, events } = params as any;
      server.addSubscriber(subscriber, events);
      return { subscribed: true, subscriber, events };
    });

    this.methods.set('cross-brain.unsubscribe', (params) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { subscriber } = params as any;
      server.removeSubscriber(subscriber);
      return { unsubscribed: true, subscriber };
    });

    this.methods.set('cross-brain.event', (params) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { source, event, data } = params as any;
      logger.info(`Cross-brain event from ${source}: ${event}`);
      manager.handleIncomingEvent(source, event, data);
      return { received: true, source, event };
    });
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

      // Patterns
      ['pattern.extract',      () => {
        if (!s.patternExtractor) throw new Error('Pattern extractor not available');
        return s.patternExtractor.extractPatterns();
      }],
      ['pattern.list',         () => {
        if (!s.patternExtractor) throw new Error('Pattern extractor not available');
        return s.patternExtractor.extractPatterns();
      }],

      // A/B Tests
      ['ab-test.create',       (params) => {
        if (!s.abTest) throw new Error('A/B test service not available');
        return s.abTest.create(p(params));
      }],
      ['ab-test.record',       (params) => {
        if (!s.abTest) throw new Error('A/B test service not available');
        return s.abTest.recordDataPoint(p(params).test_id, p(params).variant, p(params).metric_value);
      }],
      ['ab-test.status',       (params) => {
        if (!s.abTest) throw new Error('A/B test service not available');
        return s.abTest.getStatus(p(params).test_id ?? p(params).id);
      }],
      ['ab-test.list',         (params) => {
        if (!s.abTest) throw new Error('A/B test service not available');
        return s.abTest.listAll(p(params)?.limit);
      }],

      // Calendar
      ['calendar.suggest',     (params) => {
        if (!s.calendar) throw new Error('Calendar service not available');
        return s.calendar.suggestNextPostTime(p(params)?.platform);
      }],
      ['calendar.weekly',      (params) => {
        if (!s.calendar) throw new Error('Calendar service not available');
        return s.calendar.getWeeklySchedule(p(params)?.platform);
      }],

      // Competitors
      ['competitor.add',           (params) => s.competitor.addCompetitor(p(params))],
      ['competitor.list',          () => s.competitor.listCompetitors()],
      ['competitor.remove',        (params) => s.competitor.removeCompetitor(p(params).id)],
      ['competitor.recordPost',    (params) => s.competitor.recordPost(p(params))],
      ['competitor.posts',         (params) => s.competitor.getCompetitorPosts(p(params).competitorId, p(params).limit)],
      ['competitor.analyze',       (params) => s.competitor.analyzeCompetitor(p(params).competitorId ?? p(params).id)],
      ['competitor.compare',       (params) => s.competitor.compareWithSelf(p(params).competitorId ?? p(params).id)],

      // Scheduler
      ['scheduler.schedule',       (params) => s.scheduler.schedulePost(p(params))],
      ['scheduler.list',           () => s.scheduler.listScheduled()],
      ['scheduler.pending',        () => s.scheduler.listPending()],
      ['scheduler.cancel',         (params) => s.scheduler.cancelPost(p(params).id)],
      ['scheduler.checkDue',       () => s.scheduler.checkDue()],
      ['scheduler.reschedule',     (params) => s.scheduler.reschedule(p(params).id, p(params).scheduledAt)],

      // Content Generator
      ['content.generate',         (params) => s.contentGenerator.generateDraft(p(params).platform, p(params).topic)],
      ['content.hashtags',         (params) => s.contentGenerator.suggestHashtags(p(params).platform, p(params).limit)],

      // Platform Adapter
      ['platform.adapt',           (params) => s.platformAdapter.adaptForPlatform(p(params).content, p(params).targetPlatform, p(params).sourceFormat)],
      ['platform.crossAdapt',      (params) => s.platformAdapter.adaptCrossPlatform(p(params).content, p(params).sourcePlatform, p(params).targetPlatforms)],
      ['platform.config',          (params) => s.platformAdapter.getPlatformConfig(p(params).platform)],

      // Cross-Brain Notifications
      ['cross-brain.notify',   (params) => {
        const { source, event, timestamp } = p(params);
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

      // ─── Meta-Learning ────────────────────────────────────
      ['meta.status',       () => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.getStatus(); }],
      ['meta.optimize',     () => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.optimize(); }],
      ['meta.history',      (params) => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.getHistory(p(params)?.limit); }],
      ['meta.params',       () => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.getParams(); }],
      ['meta.step',         (params) => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.step(p(params).metrics, p(params).score); }],

      // ─── Causal Inference ──────────────────────────────────
      ['causal.record',     (params) => { if (!s.causal) throw new Error('Causal engine not available'); s.causal.recordEvent(p(params).source, p(params).type, p(params).data); return { recorded: true }; }],
      ['causal.analyze',    () => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.analyze(); }],
      ['causal.edges',      (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getEdges(p(params)?.minStrength); }],
      ['causal.chains',     (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.findChains(p(params)?.maxDepth); }],
      ['causal.causes',     (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getCauses(p(params).type); }],
      ['causal.effects',    (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getEffects(p(params).type); }],
      ['causal.analysis',   () => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getAnalysis(); }],
      ['causal.stats',      () => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getEventStats(); }],

      // ─── Hypothesis Engine ─────────────────────────────────
      ['hypothesis.observe',  (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); s.hypothesis.observe(p(params)); return { observed: true }; }],
      ['hypothesis.generate', () => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.generate(); }],
      ['hypothesis.test',     (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.test(p(params).id); }],
      ['hypothesis.testAll',  () => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.testAll(); }],
      ['hypothesis.list',     (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.list(p(params)?.status, p(params)?.limit); }],
      ['hypothesis.summary',  () => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.getSummary(); }],
      ['hypothesis.propose',  (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.propose(p(params)); }],

      // ─── Autonomous Research ─────────────────────────────
      ['research.status',      () => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); return s.researchScheduler.getStatus(); }],
      ['research.run',         () => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); return s.researchScheduler.runCycle(); }],
      ['research.discoveries', (params) => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); return s.researchScheduler.getDiscoveries(p(params)?.type, p(params)?.limit); }],
      ['research.reports',     (params) => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); return s.researchScheduler.getCycleReports(p(params)?.limit); }],
      ['research.record',      (params) => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); s.researchScheduler.recordEvent(p(params).type, p(params).data); return { recorded: true }; }],
      ['research.onCycle',     (params) => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); s.researchScheduler.onLearningCycleComplete(p(params).metrics, p(params).score); return { recorded: true }; }],

      // Status (cross-brain)
      // Webhooks
      ['webhook.add',             (params) => s.webhook?.add(p(params))],
      ['webhook.remove',          (params) => s.webhook?.remove(p(params).id)],
      ['webhook.list',            () => s.webhook?.list()],
      ['webhook.toggle',          (params) => s.webhook?.toggle(p(params).id, p(params).active)],
      ['webhook.history',         (params) => s.webhook?.history(p(params)?.webhookId, p(params)?.limit)],
      ['webhook.test',            (params) => s.webhook?.fire('test', { message: p(params)?.message ?? 'Test webhook' })],

      // Export
      ['export.tables',           () => s.export?.listTables()],
      ['export.columns',          (params) => s.export?.getColumns(p(params).table)],
      ['export.data',             (params) => s.export?.export(p(params))],
      ['export.stats',            () => s.export?.getStats()],

      // Backup
      ['backup.create',           (params) => s.backup?.create(p(params)?.label)],
      ['backup.list',             () => s.backup?.list()],
      ['backup.restore',          (params) => s.backup?.restore(p(params).filename)],
      ['backup.delete',           (params) => s.backup?.delete(p(params).filename)],
      ['backup.info',             () => s.backup?.getInfo()],

      // ─── Self-Observer ──────────────────────────────────────
      ['observer.record',       (params) => { if (!s.selfObserver) throw new Error('Self-observer not available'); s.selfObserver.record(p(params)); return { recorded: true }; }],
      ['observer.stats',        () => { if (!s.selfObserver) throw new Error('Self-observer not available'); return s.selfObserver.getStats(); }],
      ['observer.analyze',      () => { if (!s.selfObserver) throw new Error('Self-observer not available'); return s.selfObserver.analyze(); }],
      ['observer.insights',     (params) => { if (!s.selfObserver) throw new Error('Self-observer not available'); return s.selfObserver.getInsights(p(params)?.type, p(params)?.limit); }],
      ['observer.plan',         () => { if (!s.selfObserver) throw new Error('Self-observer not available'); return s.selfObserver.getImprovementPlan(); }],

      // ─── Adaptive Strategy ───────────────────────────────────
      ['strategy.status',       () => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.getStatus(); }],
      ['strategy.adapt',        (params) => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.adapt(p(params).strategy, p(params).parameter, p(params).value, p(params).reason, p(params).evidence ?? {}); }],
      ['strategy.adaptations',  (params) => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.getAdaptations(p(params)?.strategy, p(params)?.limit); }],
      ['strategy.revert',       (params) => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.revert(p(params).id, p(params)?.reason); }],
      ['strategy.param',        (params) => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.getParam(p(params).strategy, p(params).parameter); }],

      // ─── Experiment Engine ───────────────────────────────────
      ['experiment.list',       (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.list(p(params)?.status, p(params)?.limit); }],
      ['experiment.propose',    (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.propose(p(params)); }],
      ['experiment.start',      (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.start(p(params).id); }],
      ['experiment.measure',    (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.recordMeasurement(p(params).id, p(params).value); }],
      ['experiment.get',        (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.get(p(params).id); }],
      ['experiment.results',    (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.getResults(p(params)?.limit); }],
      ['experiment.abort',      (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.abort(p(params).id); }],

      // ─── Cross-Domain Engine ─────────────────────────────────
      ['crossdomain.record',       (params) => { if (!s.crossDomain) throw new Error('Cross-domain engine not available'); s.crossDomain.recordEvent(p(params).brain, p(params).event_type, p(params).data); return { recorded: true }; }],
      ['crossdomain.analyze',      () => { if (!s.crossDomain) throw new Error('Cross-domain engine not available'); return s.crossDomain.analyze(); }],
      ['crossdomain.correlations', (params) => { if (!s.crossDomain) throw new Error('Cross-domain engine not available'); return s.crossDomain.getCorrelations(p(params)?.limit); }],
      ['crossdomain.narrative',    () => { if (!s.crossDomain) throw new Error('Cross-domain engine not available'); return s.crossDomain.getNarrative(); }],

      // ─── Counterfactual Engine ───────────────────────────────
      ['counterfactual.whatif',     (params) => { if (!s.counterfactual) throw new Error('Counterfactual engine not available'); return s.counterfactual.whatIf(p(params)); }],
      ['counterfactual.history',   (params) => { if (!s.counterfactual) throw new Error('Counterfactual engine not available'); return s.counterfactual.getHistory(p(params)?.limit); }],
      ['counterfactual.impact',    (params) => { if (!s.counterfactual) throw new Error('Counterfactual engine not available'); return s.counterfactual.estimateIntervention(p(params).variable, p(params).proposed_value, p(params).current_value); }],

      // ─── Knowledge Distiller ─────────────────────────────────
      ['knowledge.distill',        () => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.distill(); }],
      ['knowledge.summary',        () => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getSummary(); }],
      ['knowledge.principles',     (params) => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getPrinciples(p(params)?.domain, p(params)?.limit); }],
      ['knowledge.antipatterns',   (params) => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getAntiPatterns(p(params)?.domain, p(params)?.limit); }],
      ['knowledge.package',        (params) => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getPackage(p(params).domain); }],
      ['knowledge.evolution',      (params) => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getEvolution(p(params)?.domain, p(params)?.periods); }],

      // ─── Research Agenda ─────────────────────────────────────
      ['agenda.generate',          () => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.generate(); }],
      ['agenda.list',              (params) => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.getAgenda(p(params)?.limit); }],
      ['agenda.next',              () => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.getNext(); }],
      ['agenda.prioritize',        (params) => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.setPriority(p(params).id, p(params).priority); }],
      ['agenda.ask',               (params) => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.ask(p(params).question, p(params)?.type); }],

      // ─── Anomaly Detective ───────────────────────────────────
      ['anomaly.record',           (params) => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); s.anomalyDetective.recordMetric(p(params).metric, p(params).value); return { recorded: true }; }],
      ['anomaly.detect',           () => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.detect(); }],
      ['anomaly.list',             (params) => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.getAnomalies(p(params)?.type, p(params)?.limit); }],
      ['anomaly.investigate',      (params) => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.investigate(p(params).id); }],
      ['anomaly.history',          (params) => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.getHistory(p(params)?.limit); }],
      ['anomaly.drift',            () => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.getDriftReport(); }],

      // ─── Research Journal ────────────────────────────────────
      ['journal.write',            (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.write(p(params)); }],
      ['journal.entries',          (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.getEntries(p(params)?.type, p(params)?.limit); }],
      ['journal.summary',          (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.getSummary(p(params)?.limit); }],
      ['journal.milestones',       (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.getMilestones(p(params)?.limit); }],
      ['journal.search',           (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.search(p(params).query, p(params)?.limit); }],
      ['journal.reflect',          () => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.reflect(); }],

      // ─── Dream Mode ──────────────────────────────────────────
      ['dream.start',              () => { if (!s.dreamEngine) throw new Error('Dream engine not available'); s.dreamEngine.start(); return { started: true }; }],
      ['dream.stop',               () => { if (!s.dreamEngine) throw new Error('Dream engine not available'); s.dreamEngine.stop(); return { stopped: true }; }],
      ['dream.status',             () => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.getStatus(); }],
      ['dream.consolidate',        (params) => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.consolidate(p(params)?.trigger ?? 'manual'); }],
      ['dream.history',            (params) => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.getHistory(p(params)?.limit); }],
      ['dream.journal',            (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.search('dream', p(params)?.limit ?? 10); }],

      // ─── Prediction Engine ───────────────────────────────────
      ['predict.make',           (params) => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return s.predictionEngine.predict(p(params)); }],
      ['predict.list',           (params) => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return s.predictionEngine.list(p(params)?.domain, p(params)?.status, p(params)?.limit); }],
      ['predict.accuracy',       (params) => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return s.predictionEngine.getAccuracy(p(params)?.domain); }],
      ['predict.summary',        () => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return s.predictionEngine.getSummary(); }],
      ['predict.resolve',        () => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return { resolved: s.predictionEngine.resolveExpired() }; }],
      ['predict.record',         (params) => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); s.predictionEngine.recordMetric(p(params).metric, p(params).value, p(params)?.domain); return { recorded: true }; }],

      // ─── AutoResponder ──────────────────────────────────────
      ['responder.status',   () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.autoResponder.getStatus(); }],
      ['responder.history',  (params) => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.autoResponder.getHistory(p(params)?.limit ?? 20); }],
      ['responder.rules',    () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.autoResponder.getRules(); }],
      ['responder.add_rule', (params) => { if (!s.orchestrator) throw new Error('Orchestrator not available'); const pp = p(params); s.orchestrator.autoResponder.addRule(pp); return { added: true }; }],

      // ─── Consciousness ──────────────────────────────────────
      ['consciousness.status',    () => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); return { ...s.thoughtStream.getStats(), engines: s.thoughtStream.getEngineActivity(), clients: s.consciousnessServer?.getClientCount() ?? 0 }; }],
      ['consciousness.thoughts',  (params) => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); const pp = p(params); return pp?.engine ? s.thoughtStream.getByEngine(pp.engine, pp?.limit ?? 50) : s.thoughtStream.getRecent(pp?.limit ?? 50); }],
      ['consciousness.engines',   () => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); return s.thoughtStream.getEngineActivity(); }],
      ['consciousness.clear',     () => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); s.thoughtStream.clear(); return { cleared: true }; }],

      // ─── Attention Engine ───────────────────────────────────
      ['attention.status',        () => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); return s.attentionEngine.getStatus(); }],
      ['attention.focus',         (params) => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); const pp = p(params); s.attentionEngine.setFocus(pp.topic, pp.intensity ?? 2.0); return { focused: true, topic: pp.topic }; }],
      ['attention.timeline',      (params) => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); return s.attentionEngine.getFocusTimeline(p(params)?.limit ?? 50); }],
      ['attention.context',       () => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); return { context: s.attentionEngine.getCurrentContext(), history: s.attentionEngine.getContextHistory(20) }; }],
      ['attention.weights',       () => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); return s.attentionEngine.computeEngineWeights(); }],

      // ─── Transfer Engine ───────────────────────────────────
      ['transfer.status',         () => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getStatus(); }],
      ['transfer.analogies',      (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getAnalogies(p(params)?.limit ?? 20); }],
      ['transfer.rules',          () => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getRules(); }],
      ['transfer.history',        (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getTransferHistory(p(params)?.limit ?? 50); }],
      ['transfer.analyze',        () => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.analyze(); }],

      // ─── Narrative Engine ───────────────────────────────────
      ['narrative.explain',       (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.explain(p(params).topic); }],
      ['narrative.ask',           (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.ask(p(params).question); }],
      ['narrative.contradictions',() => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.findContradictions(); }],
      ['narrative.digest',        (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.generateDigest(p(params)?.days ?? 7); }],
      ['narrative.confidence',    (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.getConfidenceReport(p(params).topic); }],
      ['narrative.status',        () => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.getStatus(); }],

      // ─── Curiosity Engine ──────────────────────────────────
      ['curiosity.status',          () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.getStatus(); }],
      ['curiosity.gaps',            (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.getGaps(p(params)?.limit ?? 10); }],
      ['curiosity.detect',          () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.detectGaps(); }],
      ['curiosity.select',          () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.selectTopic(); }],
      ['curiosity.questions',       (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.getQuestions(p(params)?.limit ?? 20); }],
      ['curiosity.surprises',       () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.detectSurprises(); }],
      ['curiosity.record',          (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); const pp = p(params); s.curiosityEngine.recordOutcome(pp.topic, pp.action, pp.reward, pp.context ?? ''); return { recorded: true }; }],
      ['curiosity.answer',          (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); const pp = p(params); return { answered: s.curiosityEngine.answerQuestion(pp.id, pp.answer) }; }],

      // ─── Emergence Engine ──────────────────────────────────
      ['emergence.status',          () => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getStatus(); }],
      ['emergence.detect',          () => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.detect(); }],
      ['emergence.events',          (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getEvents(p(params)?.limit ?? 20); }],
      ['emergence.events.byType',   (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getEventsByType(p(params)?.type); }],
      ['emergence.metrics',         () => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.recordMetrics(); }],
      ['emergence.metrics.latest',  () => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getLatestMetrics(); }],
      ['emergence.metrics.trend',   (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getMetricsTrend(p(params)?.limit ?? 20); }],
      ['emergence.surprise',        (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return { score: s.emergenceEngine.computeSurpriseScore(p(params).observation, p(params).context ?? {}) }; }],

      // ─── Debate ────────────────────────────────────────────
      ['debate.start',              (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.startDebate(p(params).question); }],
      ['debate.perspective',        (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.generatePerspective(p(params).question); }],
      ['debate.add',                (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); s.debateEngine.addPerspective(p(params).debateId, p(params).perspective); return { added: true }; }],
      ['debate.synthesize',         (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.synthesize(p(params).debateId); }],
      ['debate.get',                (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.getDebate(p(params).debateId); }],
      ['debate.list',               (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.listDebates(p(params)?.limit ?? 20); }],
      ['debate.status',             () => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.getStatus(); }],

      // ─── Meta-Cognition ────────────────────────
      ['metacognition.status',     () => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getStatus(); }],
      ['metacognition.evaluate',   () => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.evaluate(); }],
      ['metacognition.report',     (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getReportCard(p(params).engine); }],
      ['metacognition.trend',      (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getTrend(p(params).engine, p(params)?.limit ?? 10); }],

      // ─── Auto-Experiment ────────────────────────
      ['autoexperiment.status',    () => { if (!s.autoExperimentEngine) throw new Error('AutoExperimentEngine not available'); return s.autoExperimentEngine.getStatus(); }],
      ['autoexperiment.candidates', () => { if (!s.autoExperimentEngine) throw new Error('AutoExperimentEngine not available'); return s.autoExperimentEngine.discoverCandidates(0); }],

      // ─── Parameter Registry ────────────────────
      ['parameter.list',           (params) => { if (!s.parameterRegistry) throw new Error('ParameterRegistry not available'); return s.parameterRegistry.list(p(params)?.engine); }],
      ['parameter.history',        (params) => { if (!s.parameterRegistry) throw new Error('ParameterRegistry not available'); return s.parameterRegistry.getRecentChanges(p(params)?.limit ?? 20); }],

      // ─── Blind Spots ──────────────────────────────────────────
      ['blindspot.detect',        () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.detectBlindSpots(); }],
      ['blindspot.list',          (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.getBlindSpots(p(params)?.limit ?? 10); }],
      ['blindspot.resolve',       (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.resolveBlindSpot(p(params).id); }],

      // ─── Meta Trends ──────────────────────────────────────────
      ['metatrend.record',        (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.recordTrend(p(params).cycle, p(params).stats); }],
      ['metatrend.get',           (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getMetaTrend(p(params)?.windowCycles); }],
      ['metatrend.longterm',      (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getLongTermAnalysis(p(params)?.days); }],
      ['metatrend.seasonal',      () => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.detectSeasonalPatterns(); }],

      // ─── Creative Hypotheses ──────────────────────────────────
      ['hypothesis.creative',     (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.generateCreative(p(params)?.count); }],
      ['hypothesis.creative_stats', () => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.getCreativeStats(); }],

      // ─── Challenges (Advocatus Diaboli) ─────────────────────
      ['challenge.principle',     (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.challenge(p(params).statement); }],
      ['challenge.history',       (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.getChallengeHistory(p(params)?.limit); }],
      ['challenge.vulnerable',    (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.getMostVulnerable(p(params)?.limit); }],

      // ─── Dream Retrospective ──────────────────────────────────
      ['dream.retrospective',     (params) => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.analyzeRetrospective(p(params)?.lastNCycles); }],
      ['dream.retrospective.list', (params) => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.getRetrospective(p(params)?.limit); }],
      ['dream.pruning_efficiency', () => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.getPruningEfficiency(); }],

      // ─── Cross-Brain Dialogue ──────────────────────────────────
      ['dialogue.ask',            (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.formulateQuestion(p(params).topic); }],
      ['dialogue.answer',         (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.answerQuestion(p(params).question); }],
      ['dialogue.record',         (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.recordDialogue(p(params).source, p(params).target, p(params).question, p(params).answer, p(params).context); }],
      ['dialogue.rate',           (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); s.transferEngine.rateDialogue(p(params).id, p(params).usefulness); return { rated: true }; }],
      ['dialogue.history',        (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getDialogueHistory(p(params)?.peer, p(params)?.limit); }],
      ['dialogue.stats',          () => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getDialogueStats(); }],

      // ─── Causal Interventions ──────────────────────────────────
      ['causal.confounders',      (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.detectConfounders(p(params).cause, p(params).effect); }],
      ['causal.evolution',        (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.trackStrengthEvolution(p(params).cause, p(params).effect, p(params)?.windowDays); }],
      ['causal.validate',         (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.validateChain(p(params).chain); }],

      // ─── Emergence Explain ──────────────────────────────────────
      ['emergence.explain',       (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.explain(p(params).eventId); }],

      // ─── Self-Test ──────────────────────────────────────────────
      ['selftest.principle',      (params) => { if (!s.selfTestEngine) throw new Error('SelfTestEngine not available'); return s.selfTestEngine.testPrinciple(p(params).statement); }],
      ['selftest.all',            () => { if (!s.selfTestEngine) throw new Error('SelfTestEngine not available'); return s.selfTestEngine.testAll(); }],
      ['selftest.report',         () => { if (!s.selfTestEngine) throw new Error('SelfTestEngine not available'); return s.selfTestEngine.getUnderstandingReport(); }],
      ['selftest.status',         () => { if (!s.selfTestEngine) throw new Error('SelfTestEngine not available'); return s.selfTestEngine.getStatus(); }],

      // ─── Teach ──────────────────────────────────────────────────
      ['teach.create',            (params) => { if (!s.teachEngine) throw new Error('TeachEngine not available'); return s.teachEngine.createPackage(p(params).targetBrain); }],
      ['teach.get',               (params) => { if (!s.teachEngine) throw new Error('TeachEngine not available'); return s.teachEngine.getPackage(p(params).id); }],
      ['teach.list',              (params) => { if (!s.teachEngine) throw new Error('TeachEngine not available'); return s.teachEngine.listPackages(p(params)?.limit); }],
      ['teach.rate',              (params) => { if (!s.teachEngine) throw new Error('TeachEngine not available'); s.teachEngine.rateEffectiveness(p(params).id, p(params).score); return { rated: true }; }],
      ['teach.status',            () => { if (!s.teachEngine) throw new Error('TeachEngine not available'); return s.teachEngine.getStatus(); }],

      // ─── Scout ──────────────────────────────────────────────────
      ['scout.run',               async () => { if (!s.dataScout) throw new Error('DataScout not available'); return s.dataScout.scout(); }],
      ['scout.discoveries',       (params) => { if (!s.dataScout) throw new Error('DataScout not available'); return s.dataScout.getDiscoveries(p(params)?.source, p(params)?.limit); }],
      ['scout.import',            (params) => { if (!s.dataScout) throw new Error('DataScout not available'); s.dataScout.markImported(p(params).id); return { imported: true }; }],
      ['scout.status',            () => { if (!s.dataScout) throw new Error('DataScout not available'); return s.dataScout.getStatus(); }],

      // ─── Simulation ─────────────────────────────────────────────
      ['simulation.run',          (params) => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.simulate(p(params).scenario); }],
      ['simulation.whatif',       (params) => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.whatIf(p(params).metric, p(params).multiplier); }],
      ['simulation.validate',     (params) => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.validateSimulation(p(params).id, p(params).outcomes); }],
      ['simulation.list',         (params) => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.listSimulations(p(params)?.limit); }],
      ['simulation.status',       () => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.getStatus(); }],

      // ─── Memory Palace ─────────────────────────────────────────
      ['palace.status',           () => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getStatus(); }],
      ['palace.build',            () => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.buildConnections(); }],
      ['palace.connections',      (params) => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getConnections(p(params).type, p(params).id); }],
      ['palace.path',             (params) => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getPath(p(params).fromType, p(params).fromId, p(params).toType, p(params).toId, p(params)?.maxDepth); }],
      ['palace.map',              (params) => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getKnowledgeMap(p(params)?.topic, p(params)?.limit); }],
      ['palace.isolated',         () => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getIsolatedNodes(); }],
      ['palace.add',              (params) => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return { added: s.memoryPalace.addConnection(p(params).sourceType, p(params).sourceId, p(params).targetType, p(params).targetId, p(params).relation, p(params)?.strength) }; }],

      // ─── Goal Engine ──────────────────────────────────────────
      ['goals.status',            () => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.getStatus(); }],
      ['goals.create',            (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.createGoal(p(params).title, p(params).metricName, p(params).targetValue, p(params).deadlineCycles, p(params)); }],
      ['goals.list',              (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.listGoals(p(params)?.status, p(params)?.limit); }],
      ['goals.progress',          (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.getProgress(p(params).goalId); }],
      ['goals.forecast',          (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.forecastCompletion(p(params).goalId); }],
      ['goals.suggest',           (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.suggestGoals(p(params)?.currentCycle ?? 0); }],
      ['goals.pause',             (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return { paused: s.goalEngine.pauseGoal(p(params).goalId) }; }],
      ['goals.resume',            (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return { resumed: s.goalEngine.resumeGoal(p(params).goalId, p(params)?.currentCycle ?? 0) }; }],

      // ─── Evolution Engine ──────────────────────────────────────
      ['evolution.status',         () => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getStatus(); }],
      ['evolution.history',        (params) => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getHistory(p(params)?.limit ?? 20); }],
      ['evolution.best',           () => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getBestIndividual(); }],
      ['evolution.lineage',        (params) => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getLineage(p(params).id); }],
      ['evolution.run',            () => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.runGeneration(); }],
      ['evolution.population',     (params) => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getPopulation(p(params)?.generation); }],
      ['evolution.activate',       (params) => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); s.evolutionEngine.activate(p(params).genome); return { activated: true }; }],

      // ─── Reasoning Engine ──────────────────────────────────
      ['reasoning.status',          () => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.getStatus(); }],
      ['reasoning.infer',           (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.infer(p(params).query); }],
      ['reasoning.abduce',          (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.abduce(p(params).observation); }],
      ['reasoning.temporal',        (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.temporalInfer(p(params).eventType); }],
      ['reasoning.counterfactual',  (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.counterfactual(p(params).event); }],
      ['reasoning.rules',           (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.getRules(p(params)?.limit ?? 50, p(params)?.minConfidence ?? 0); }],
      ['reasoning.proof',           (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.getProofTree(p(params).chainId); }],

      ['status',               () => ({
        name: 'marketing-brain',
        version: '1.14.0',
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        methods: this.listMethods().length,
      })],
    ]);
  }
}
