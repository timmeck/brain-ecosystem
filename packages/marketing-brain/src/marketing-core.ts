import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import type { MarketingBrainConfig } from './types/config.types.js';
import { createLogger, getLogger } from './utils/logger.js';
import { getEventBus } from './utils/events.js';
import { createConnection } from '@timmeck/brain-core';
import { runMigrations } from './db/migrations/index.js';

// Repositories
import { PostRepository } from './db/repositories/post.repository.js';
import { EngagementRepository } from './db/repositories/engagement.repository.js';
import { CampaignRepository } from './db/repositories/campaign.repository.js';
import { StrategyRepository } from './db/repositories/strategy.repository.js';
import { RuleRepository } from './db/repositories/rule.repository.js';
import { TemplateRepository } from './db/repositories/template.repository.js';
import { AudienceRepository } from './db/repositories/audience.repository.js';
import { SynapseRepository } from './db/repositories/synapse.repository.js';
import { InsightRepository } from './db/repositories/insight.repository.js';
import { MemoryRepository } from './db/repositories/memory.repository.js';
import { SessionRepository } from './db/repositories/session.repository.js';
import { ABTestRepository } from './db/repositories/ab-test.repository.js';
import { CompetitorRepository } from './db/repositories/competitor.repository.js';
import { SchedulerRepository } from './db/repositories/scheduler.repository.js';

// Services
import { PostService } from './services/post.service.js';
import { CampaignService } from './services/campaign.service.js';
import { StrategyService } from './services/strategy.service.js';
import { TemplateService } from './services/template.service.js';
import { RuleService } from './services/rule.service.js';
import { AudienceService } from './services/audience.service.js';
import { SynapseService } from './services/synapse.service.js';
import { AnalyticsService } from './services/analytics.service.js';
import { InsightService } from './services/insight.service.js';
import { MemoryService } from './services/memory.service.js';
import { ABTestService } from './services/ab-test.service.js';
import { CalendarService } from './services/calendar.service.js';
import { CompetitorService } from './services/competitor.service.js';
import { SchedulerService } from './services/scheduler.service.js';
import { ContentGeneratorService } from './services/content-generator.service.js';
import { PlatformAdapterService } from './services/platform-adapter.service.js';

// Synapses
import { SynapseManager } from './synapses/synapse-manager.js';

// Engines
import { LearningEngine } from './learning/learning-engine.js';
import { PatternExtractor } from './learning/pattern-extractor.js';
import { ResearchEngine } from './research/research-engine.js';

// IPC
import { IpcRouter, type Services } from './ipc/router.js';
import { IpcServer } from '@timmeck/brain-core';

// API
import { ApiServer } from './api/server.js';

// MCP HTTP
import { McpHttpServer } from './mcp/http-server.js';

// Dashboard
import { createMarketingDashboardServer } from './dashboard/server.js';
import { renderDashboard } from './dashboard/renderer.js';

// Cross-Brain
import { CrossBrainClient, CrossBrainNotifier, CrossBrainSubscriptionManager, CrossBrainCorrelator, WebhookService, ExportService, BackupService, AutonomousResearchScheduler, ResearchOrchestrator, DataMiner, MarketingDataMinerAdapter, DreamEngine, ThoughtStream, ConsciousnessServer, PredictionEngine } from '@timmeck/brain-core';

export class MarketingCore {
  private db: Database.Database | null = null;
  private ipcServer: IpcServer | null = null;
  private apiServer: ApiServer | null = null;
  private mcpHttpServer: McpHttpServer | null = null;
  private dashboardServer: ReturnType<typeof createMarketingDashboardServer> | null = null;
  private learningEngine: LearningEngine | null = null;
  private researchEngine: ResearchEngine | null = null;
  private crossBrain: CrossBrainClient | null = null;
  private notifier: CrossBrainNotifier | null = null;
  private subscriptionManager: CrossBrainSubscriptionManager | null = null;
  private correlator: CrossBrainCorrelator | null = null;
  private orchestrator: ResearchOrchestrator | null = null;
  private consciousnessServer: ConsciousnessServer | null = null;
  private config: MarketingBrainConfig | null = null;
  private configPath?: string;
  private restarting = false;

  start(configPath?: string): void {
    this.configPath = configPath;
    // 1. Config
    this.config = loadConfig(configPath);
    const config = this.config;

    // 2. Ensure data dir
    fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

    // 3. Logger
    createLogger({
      level: config.log.level,
      file: config.log.file,
      maxSize: config.log.maxSize,
      maxFiles: config.log.maxFiles,
    });
    const logger = getLogger();

    // 4. Database
    this.db = createConnection(config.dbPath);
    runMigrations(this.db);
    logger.info(`Database initialized: ${config.dbPath}`);

    // 5. Repositories
    const postRepo = new PostRepository(this.db);
    const engagementRepo = new EngagementRepository(this.db);
    const campaignRepo = new CampaignRepository(this.db);
    const strategyRepo = new StrategyRepository(this.db);
    const ruleRepo = new RuleRepository(this.db);
    const templateRepo = new TemplateRepository(this.db);
    const audienceRepo = new AudienceRepository(this.db);
    const synapseRepo = new SynapseRepository(this.db);
    const insightRepo = new InsightRepository(this.db);
    const memoryRepo = new MemoryRepository(this.db);
    const sessionRepo = new SessionRepository(this.db);
    const abTestRepo = new ABTestRepository(this.db);
    const competitorRepo = new CompetitorRepository(this.db);
    const schedulerRepo = new SchedulerRepository(this.db);

    // 6. Synapse Manager
    const synapseManager = new SynapseManager(synapseRepo, config.synapses);

    // 7. Services
    const memoryService = new MemoryService(memoryRepo, sessionRepo, synapseManager);
    const patternExtractor = new PatternExtractor(this.db);
    const abTestService = new ABTestService(abTestRepo);
    const calendarService = new CalendarService(this.db);
    const services: Services = {
      post: new PostService(postRepo, engagementRepo, synapseManager),
      campaign: new CampaignService(campaignRepo, postRepo, engagementRepo, synapseManager),
      strategy: new StrategyService(strategyRepo, synapseManager),
      template: new TemplateService(templateRepo, synapseManager),
      rule: new RuleService(ruleRepo, synapseManager),
      audience: new AudienceService(audienceRepo, synapseManager),
      synapse: new SynapseService(synapseManager),
      analytics: new AnalyticsService(
        postRepo, engagementRepo, campaignRepo,
        strategyRepo, ruleRepo, templateRepo,
        insightRepo, synapseManager,
        memoryRepo, sessionRepo,
      ),
      insight: new InsightService(insightRepo, synapseManager),
      memory: memoryService,
      competitor: new CompetitorService(competitorRepo),
      scheduler: new SchedulerService(schedulerRepo, calendarService),
      contentGenerator: new ContentGeneratorService(this.db, ruleRepo, templateRepo, calendarService),
      platformAdapter: new PlatformAdapterService(),
      patternExtractor,
      abTest: abTestService,
      calendar: calendarService,
    };

    // 8. Learning Engine
    this.learningEngine = new LearningEngine(
      config.learning, postRepo, engagementRepo,
      ruleRepo, strategyRepo, synapseManager,
    );
    this.learningEngine.start();
    logger.info(`Learning engine started (interval: ${config.learning.intervalMs}ms)`);

    // 9. Research Engine
    this.researchEngine = new ResearchEngine(
      config.research, postRepo, engagementRepo,
      campaignRepo, templateRepo, insightRepo, synapseManager,
    );
    this.researchEngine.start();
    logger.info(`Research engine started (interval: ${config.research.intervalMs}ms)`);

    // Expose learning engine + cross-brain to IPC
    services.learning = this.learningEngine;
    services.crossBrain = this.crossBrain ?? undefined;

    // 10. Cross-Brain Client + Notifier
    this.crossBrain = new CrossBrainClient('marketing-brain');
    this.notifier = new CrossBrainNotifier(this.crossBrain, 'marketing-brain');

    // 10b. Cross-Brain Correlator
    this.correlator = new CrossBrainCorrelator();

    // 10c. Cross-Brain Subscription Manager
    this.subscriptionManager = new CrossBrainSubscriptionManager('marketing-brain');

    // 10d. Webhook, Export, Backup services
    services.webhook = new WebhookService(this.db!);
    services.export = new ExportService(this.db!);
    services.backup = new BackupService(this.db!, config.dbPath);

    // 10e. Autonomous Research Scheduler (Meta-Learning + Causal Inference + Hypothesis)
    const researchScheduler = new AutonomousResearchScheduler(this.db!, {
      brainName: 'marketing-brain',
      hyperParams: [
        { name: 'learningRate', value: 0.1, min: 0.01, max: 0.5, step: 0.02 },
        { name: 'decayRate', value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
        { name: 'engagementWeight', value: 0.5, min: 0.1, max: 1.0, step: 0.05 },
      ],
    });
    researchScheduler.start();
    services.researchScheduler = researchScheduler;
    services.metaLearning = researchScheduler.metaLearning;
    services.causal = researchScheduler.causalGraph;
    services.hypothesis = researchScheduler.hypothesisEngine;
    logger.info('Autonomous research scheduler started');

    // 10f. Research Orchestrator (feedback loops between all research engines)
    this.orchestrator = new ResearchOrchestrator(this.db!, {
      brainName: 'marketing-brain',
    }, researchScheduler.causalGraph);
    this.orchestrator.start();
    services.selfObserver = this.orchestrator.selfObserver;
    services.adaptiveStrategy = this.orchestrator.adaptiveStrategy;
    services.experimentEngine = this.orchestrator.experimentEngine;
    services.crossDomain = this.orchestrator.crossDomain;
    services.counterfactual = this.orchestrator.counterfactual;
    services.knowledgeDistiller = this.orchestrator.knowledgeDistiller;
    services.researchAgenda = this.orchestrator.researchAgenda;
    services.anomalyDetective = this.orchestrator.anomalyDetective;
    services.journal = this.orchestrator.journal;

    // 10g. DataMiner — bootstrap historical data into research engines
    const dataMiner = new DataMiner(this.db!, new MarketingDataMinerAdapter(), {
      selfObserver: this.orchestrator.selfObserver,
      anomalyDetective: this.orchestrator.anomalyDetective,
      crossDomain: this.orchestrator.crossDomain,
      causalGraph: researchScheduler.causalGraph,
      hypothesisEngine: researchScheduler.hypothesisEngine,
    });
    this.orchestrator.setDataMiner(dataMiner);
    dataMiner.bootstrap();

    // 10h. Dream Engine — offline memory consolidation
    const dreamEngine = new DreamEngine(this.db!, {
      brainName: 'marketing-brain',
      replayBatchSize: 15,
      clusterSimilarityThreshold: 0.70,
    });
    this.orchestrator.setDreamEngine(dreamEngine);
    dreamEngine.start();
    services.dreamEngine = dreamEngine;

    // 10i. Prediction Engine — Proactive Forecasting (4h horizon for engagement)
    const predictionEngine = new PredictionEngine(this.db!, {
      brainName: 'marketing-brain',
      defaultHorizonMs: 14_400_000,
    });
    this.orchestrator.setPredictionEngine(predictionEngine);
    predictionEngine.start();
    services.predictionEngine = predictionEngine;

    // 10j. Consciousness — ThoughtStream + Dashboard
    const thoughtStream = new ThoughtStream();
    this.orchestrator.setThoughtStream(thoughtStream);
    dreamEngine.setThoughtStream(thoughtStream);
    predictionEngine.setThoughtStream(thoughtStream);
    this.consciousnessServer = new ConsciousnessServer({
      port: 7786,
      thoughtStream,
      getNetworkState: () => {
        try {
          const nodes = this.db!.prepare('SELECT id, content AS label, category AS type, importance FROM memories WHERE active = 1 LIMIT 200').all();
          const edges = this.db!.prepare('SELECT source_id, target_id, weight FROM synapses LIMIT 500').all();
          return { nodes, edges };
        } catch { return { nodes: [], edges: [] }; }
      },
      getEngineStatus: () => this.orchestrator!.getSummary(),
    });
    this.consciousnessServer.start();
    services.consciousnessServer = this.consciousnessServer;
    services.thoughtStream = thoughtStream;
    logger.info('Research orchestrator started (9 engines, feedback loops active, DataMiner bootstrapped, Dream Mode active, Prediction Engine active, Consciousness on :7786)');

    // 11. IPC Server
    const router = new IpcRouter(services);
    this.ipcServer = new IpcServer(router, config.ipc.pipeName, 'marketing-brain', 'marketing-brain');
    this.ipcServer.start();

    // Wire subscription manager into IPC router
    router.setSubscriptionManager(this.subscriptionManager, this.ipcServer);

    // 12. MCP HTTP Server (SSE for Cursor/Windsurf/Cline)
    if (config.mcpHttp.enabled) {
      this.mcpHttpServer = new McpHttpServer(config.mcpHttp.port, router);
      this.mcpHttpServer.start();
      logger.info(`MCP HTTP server enabled on port ${config.mcpHttp.port}`);
    }

    // 13. REST API Server
    if (config.api.enabled) {
      this.apiServer = new ApiServer({
        port: config.api.port,
        router,
        apiKey: config.api.apiKey,
        healthCheck: () => ({
          db: this.db !== null,
          ipc: this.ipcServer !== null,
          learning: this.learningEngine !== null,
          research: this.researchEngine !== null,
          ecosystemHealth: this.correlator?.getHealth().score ?? null,
        }),
      });
      this.apiServer.start();
      logger.info(`REST API enabled on port ${config.api.port}`);
    }

    // 12. Dashboard Server (SSE)
    if (config.dashboard.enabled) {
      const dashboardHtmlPath = path.resolve(
        path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
        '../dashboard.html',
      );
      const dashServices = {
        analytics: services.analytics,
        insight: services.insight,
        rule: services.rule,
        synapse: services.synapse,
      };
      this.dashboardServer = createMarketingDashboardServer({
        port: config.dashboard.port,
        getDashboardHtml: () => {
          try {
            const template = fs.readFileSync(dashboardHtmlPath, 'utf-8');
            return renderDashboard(template, dashServices);
          } catch {
            return '<html><body><h1>Dashboard HTML not found</h1></body></html>';
          }
        },
        getStats: () => services.analytics.getSummary(),
      });
      this.dashboardServer.start();
      logger.info(`Dashboard server enabled on port ${config.dashboard.port}`);
    }

    // 13. Event listeners (synapse wiring)
    this.setupEventListeners(synapseManager, services.webhook, researchScheduler, predictionEngine);

    // 13b. Cross-Brain Event Subscriptions
    this.setupCrossBrainSubscriptions();

    // 14. PID file
    const pidPath = path.join(path.dirname(config.dbPath), 'marketing-brain.pid');
    fs.writeFileSync(pidPath, String(process.pid));

    // 15. Graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    // 16. Crash recovery — auto-restart on uncaught errors
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception — restarting', { error: err.message, stack: err.stack });
      this.logCrash('uncaughtException', err);
      this.restart();
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection — restarting', { reason: String(reason) });
      this.logCrash('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
      this.restart();
    });

    logger.info(`Marketing Brain daemon started (PID: ${process.pid})`);
  }

  private logCrash(type: string, err: Error): void {
    if (!this.config) return;
    const crashLog = path.join(path.dirname(this.config.dbPath), 'crashes.log');
    const entry = `[${new Date().toISOString()}] ${type}: ${err.message}\n${err.stack ?? ''}\n\n`;
    try { fs.appendFileSync(crashLog, entry); } catch { /* best effort */ }
  }

  private cleanup(): void {
    this.subscriptionManager?.disconnectAll();
    this.consciousnessServer?.stop();
    this.orchestrator?.stop();
    this.researchEngine?.stop();
    this.learningEngine?.stop();
    this.dashboardServer?.stop();
    this.mcpHttpServer?.stop();
    this.apiServer?.stop();
    this.ipcServer?.stop();
    this.db?.close();

    this.db = null;
    this.ipcServer = null;
    this.apiServer = null;
    this.mcpHttpServer = null;
    this.dashboardServer = null;
    this.learningEngine = null;
    this.researchEngine = null;
    this.orchestrator = null;
    this.consciousnessServer = null;
    this.subscriptionManager = null;
    this.correlator = null;
  }

  restart(): void {
    if (this.restarting) return;
    this.restarting = true;

    const logger = getLogger();
    logger.info('Restarting Marketing Brain daemon...');

    try { this.cleanup(); } catch { /* best effort cleanup */ }

    this.restarting = false;
    this.start(this.configPath);
  }

  stop(): void {
    const logger = getLogger();
    logger.info('Shutting down...');

    this.cleanup();

    if (this.config) {
      const pidPath = path.join(path.dirname(this.config.dbPath), 'marketing-brain.pid');
      try { fs.unlinkSync(pidPath); } catch { /* ignore */ }
    }

    logger.info('Marketing Brain daemon stopped');
    process.exit(0);
  }

  private setupCrossBrainSubscriptions(): void {
    if (!this.subscriptionManager || !this.correlator) return;
    const logger = getLogger();
    const correlator = this.correlator;

    // Subscribe to brain: error:reported events — adjust content tone based on project health
    this.subscriptionManager.subscribe('brain', ['error:reported'], (event: string, data: unknown) => {
      logger.info(`[cross-brain] System error from brain — adjusting content context`, { data });
      correlator.recordEvent('brain', event, data);
      this.orchestrator?.onCrossBrainEvent('brain', event, data as Record<string, unknown>);

      const health = correlator.getHealth();
      if (health.status === 'critical') {
        logger.warn(`[cross-brain] Ecosystem critical (score: ${health.score}) — pausing non-urgent content`);
      }
    });

    // Subscribe to brain: insight:created for content opportunity detection
    this.subscriptionManager.subscribe('brain', ['insight:created'], (event: string, data: unknown) => {
      logger.info(`[cross-brain] New insight from brain — potential content opportunity`, { data });
      correlator.recordEvent('brain', event, data);
      this.orchestrator?.onCrossBrainEvent('brain', event, data as Record<string, unknown>);
    });

    // Subscribe to trading-brain: trade:outcome for cross-domain awareness
    this.subscriptionManager.subscribe('trading-brain', ['trade:outcome'], (event: string, data: unknown) => {
      correlator.recordEvent('trading-brain', event, data);
      this.orchestrator?.onCrossBrainEvent('trading-brain', event, data as Record<string, unknown>);
    });
  }

  private setupEventListeners(synapseManager: SynapseManager, webhook?: WebhookService, researchScheduler?: AutonomousResearchScheduler, predictionEngine?: PredictionEngine): void {
    const causal = researchScheduler?.causalGraph;
    const hypothesis = researchScheduler?.hypothesisEngine;
    const bus = getEventBus();
    const notifier = this.notifier;
    const orch = this.orchestrator;

    bus.on('post:created', ({ postId, campaignId }) => {
      if (campaignId) {
        synapseManager.strengthen(
          { type: 'post', id: postId },
          { type: 'campaign', id: campaignId },
          'belongs_to',
        );
      }
    });

    // Post published → notify peers (engagement tracking) + feed correlator + webhooks + causal + hypothesis + prediction
    bus.on('post:published', ({ postId, platform }) => {
      getLogger().info(`Post #${postId} published on ${platform}`);
      notifier?.notify('post:published', { postId, platform });
      this.correlator?.recordEvent('marketing-brain', 'post:published', { postId, platform });
      webhook?.fire('post:published', { postId, platform });
      causal?.recordEvent('marketing-brain', 'post:published', { postId, platform });
      hypothesis?.observe({ source: 'marketing-brain', type: 'post:published', value: 1, timestamp: Date.now() });
      orch?.onEvent('post:published', { postId, platform });
      predictionEngine?.recordMetric('post_count', 1, 'engagement');
    });

    bus.on('strategy:reported', ({ strategyId, postId }) => {
      synapseManager.strengthen(
        { type: 'strategy', id: strategyId },
        { type: 'post', id: postId },
        'improves',
      );
    });

    // Campaign created → notify peers
    bus.on('campaign:created', ({ campaignId, name }) => {
      getLogger().info(`Campaign #${campaignId} created: ${name}`);
      notifier?.notify('campaign:created', { campaignId, name });
    });

    bus.on('rule:learned', ({ ruleId, pattern }) => {
      getLogger().info(`New rule #${ruleId} learned: ${pattern}`);
      causal?.recordEvent('marketing-brain', 'rule:learned', { ruleId, pattern });
      hypothesis?.observe({ source: 'marketing-brain', type: 'rule:learned', value: 1, timestamp: Date.now() });
      orch?.onEvent('rule:learned', { ruleId });
    });

    bus.on('insight:created', ({ insightId, type }) => {
      getLogger().info(`New insight #${insightId} (${type})`);
      notifier?.notifyPeer('brain', 'insight:created', { insightId, type });
      this.correlator?.recordEvent('marketing-brain', 'insight:created', { insightId, type });
      causal?.recordEvent('marketing-brain', 'insight:created', { insightId, type });
      hypothesis?.observe({ source: 'marketing-brain', type: 'insight:created', value: 1, timestamp: Date.now() });
      orch?.onEvent('insight:created', { insightId, type });
    });
  }
}
