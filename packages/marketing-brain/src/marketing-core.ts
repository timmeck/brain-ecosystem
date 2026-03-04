import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import type { MarketingBrainConfig } from './types/config.types.js';
import { createLogger, getLogger } from './utils/logger.js';
import { getEventBus } from './utils/events.js';
import { getCurrentVersion } from './cli/update-check.js';
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
import { CrossBrainClient, CrossBrainNotifier, CrossBrainSubscriptionManager, CrossBrainCorrelator, WebhookService, ExportService, BackupService, AutonomousResearchScheduler, ResearchOrchestrator, DataMiner, MarketingDataMinerAdapter, BootstrapService, DreamEngine, ThoughtStream, ConsciousnessServer, PredictionEngine, AttentionEngine, TransferEngine, NarrativeEngine, CuriosityEngine, EmergenceEngine, DebateEngine, ParameterRegistry, MetaCognitionLayer, AutoExperimentEngine, SelfTestEngine, TeachEngine, DataScout, runDataScoutMigration, GitHubTrendingAdapter, NpmStatsAdapter, HackerNewsAdapter, SimulationEngine, runSimulationMigration, MemoryPalace, GoalEngine, EvolutionEngine, runEvolutionMigration, ReasoningEngine, EmotionalModel, SelfScanner, SelfModificationEngine, ConceptAbstraction, PeerNetwork, LLMService } from '@timmeck/brain-core';
import type { HypothesisStatus, ExperimentStatus, AnomalyType } from '@timmeck/brain-core';

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
  private attentionEngine: AttentionEngine | null = null;
  private transferEngine: TransferEngine | null = null;
  private narrativeEngine: NarrativeEngine | null = null;
  private curiosityEngine: CuriosityEngine | null = null;
  private emergenceEngine: EmergenceEngine | null = null;
  private debateEngine: DebateEngine | null = null;
  private peerNetwork: PeerNetwork | null = null;
  private config: MarketingBrainConfig | null = null;
  private configPath?: string;
  private restarting = false;
  private restartCount = 0;
  private restartWindowStart = 0;

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
    services.orchestrator = this.orchestrator;

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
      defaultHorizonMs: 1_800_000,
    });
    this.orchestrator.setPredictionEngine(predictionEngine);
    predictionEngine.start();
    services.predictionEngine = predictionEngine;

    // 10j. Consciousness — ThoughtStream + Dashboard
    const thoughtStream = new ThoughtStream();
    this.orchestrator.setThoughtStream(thoughtStream);
    dreamEngine.setThoughtStream(thoughtStream);
    predictionEngine.setThoughtStream(thoughtStream);
    // ConsciousnessServer removed — unified dashboard serves all UIs
    services.thoughtStream = thoughtStream;

    // 10k. Attention Engine
    this.attentionEngine = new AttentionEngine(this.db!, { brainName: 'marketing-brain' });
    this.attentionEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setAttentionEngine(this.attentionEngine);
    services.attentionEngine = this.attentionEngine;

    // 10l. Transfer Engine — cross-domain knowledge transfer
    this.transferEngine = new TransferEngine(this.db!, { brainName: 'marketing-brain' });
    this.transferEngine.setThoughtStream(thoughtStream);
    this.transferEngine.seedDefaultRules();
    this.orchestrator.setTransferEngine(this.transferEngine);
    services.transferEngine = this.transferEngine;

    // 10j.6b LLMService — central Claude API wrapper for intelligent features
    const llmService = new LLMService(this.db!, {
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxCallsPerHour: 30,
      tokenBudgetPerHour: 100_000,
      tokenBudgetPerDay: 500_000,
    });
    this.orchestrator.setLLMService(llmService);
    services.llmService = llmService;

    // 10m. Narrative Engine — natural language explanations of Brain knowledge
    this.narrativeEngine = new NarrativeEngine(this.db!, { brainName: 'marketing-brain' });
    this.narrativeEngine.setDataSources({
      knowledgeDistiller: this.orchestrator.knowledgeDistiller,
      hypothesisEngine: researchScheduler.hypothesisEngine,
      journal: this.orchestrator.journal,
      predictionEngine,
      experimentEngine: this.orchestrator.experimentEngine,
      anomalyDetective: this.orchestrator.anomalyDetective,
      attentionEngine: this.attentionEngine,
      transferEngine: this.transferEngine,
    });
    this.orchestrator.setNarrativeEngine(this.narrativeEngine);
    services.narrativeEngine = this.narrativeEngine;

    // 12l. Curiosity Engine — knowledge gap detection & exploration/exploitation
    this.curiosityEngine = new CuriosityEngine(this.db!, { brainName: 'marketing-brain', gapThreshold: 0.3 });
    this.curiosityEngine.setThoughtStream(thoughtStream);
    this.curiosityEngine.setDataSources({
      attentionEngine: this.attentionEngine!,
      knowledgeDistiller: this.orchestrator.knowledgeDistiller,
      hypothesisEngine: this.orchestrator.hypothesisEngine,
      experimentEngine: this.orchestrator.experimentEngine,
      agendaEngine: this.orchestrator.researchAgenda,
      narrativeEngine: this.narrativeEngine!,
    });
    this.orchestrator.setCuriosityEngine(this.curiosityEngine);
    services.curiosityEngine = this.curiosityEngine;

    // 12m. Emergence Engine — tracks emergent behaviors and complexity
    this.emergenceEngine = new EmergenceEngine(this.db!, { brainName: 'marketing-brain' });
    this.emergenceEngine.setThoughtStream(thoughtStream);
    this.emergenceEngine.setDataSources({
      knowledgeDistiller: this.orchestrator.knowledgeDistiller,
      hypothesisEngine: this.orchestrator.hypothesisEngine,
      journal: this.orchestrator.journal,
      anomalyDetective: this.orchestrator.anomalyDetective,
      experimentEngine: this.orchestrator.experimentEngine,
      curiosityEngine: this.curiosityEngine!,
      getNetworkStats: () => {
        try {
          const stats = this.db!.prepare('SELECT COUNT(DISTINCT source_type || source_id) + COUNT(DISTINCT target_type || target_id) as nodes, COUNT(*) as synapses, AVG(weight) as avg FROM synapses').get() as { nodes: number; synapses: number; avg: number };
          return { totalNodes: stats.nodes || 0, totalSynapses: stats.synapses || 0, avgWeight: stats.avg || 0, nodesByType: {} };
        } catch { return { totalNodes: 0, totalSynapses: 0, avgWeight: 0, nodesByType: {} }; }
      },
    });
    this.orchestrator.setEmergenceEngine(this.emergenceEngine);
    services.emergenceEngine = this.emergenceEngine;

    // Debate Engine
    const debateEngine = new DebateEngine(this.db!, { brainName: 'marketing-brain', domainDescription: 'social media marketing and content intelligence' });
    debateEngine.setThoughtStream(thoughtStream);
    debateEngine.setDataSources({
      knowledgeDistiller: this.orchestrator.knowledgeDistiller,
      hypothesisEngine: this.orchestrator.hypothesisEngine,
      journal: this.orchestrator.journal,
      anomalyDetective: this.orchestrator.anomalyDetective,
      predictionEngine,
      narrativeEngine: this.narrativeEngine!,
    });
    this.orchestrator.setDebateEngine(debateEngine);
    this.debateEngine = debateEngine;
    services.debateEngine = debateEngine;

    // 11j.11 Meta-Cognition: ParameterRegistry + MetaCognitionLayer + AutoExperimentEngine
    const parameterRegistry = new ParameterRegistry(this.db!);
    parameterRegistry.registerAll([
      { engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.01, max: 0.5, description: 'Synapse prune cutoff weight', category: 'consolidation' },
      { engine: 'dream', name: 'learning_rate', value: 0.15, min: 0.01, max: 0.5, description: 'Dream synapse strengthening rate', category: 'consolidation' },
      { engine: 'dream', name: 'cluster_similarity', value: 0.70, min: 0.5, max: 0.95, description: 'Memory compression similarity threshold', category: 'consolidation' },
      { engine: 'dream', name: 'importance_decay_rate', value: 0.5, min: 0.1, max: 0.9, description: 'Memory importance decay factor', category: 'consolidation' },
      { engine: 'dream', name: 'replay_batch_size', value: 15, min: 5, max: 100, description: 'Memories per replay batch', category: 'consolidation' },
      { engine: 'attention', name: 'decay_rate', value: 0.85, min: 0.5, max: 0.99, description: 'Attention score decay per cycle', category: 'focus' },
      { engine: 'attention', name: 'burst_threshold', value: 3, min: 1, max: 10, description: 'Events to trigger urgency', category: 'focus' },
      { engine: 'attention', name: 'burst_window_ms', value: 180000, min: 30000, max: 600000, description: 'Burst detection window', category: 'focus' },
      { engine: 'curiosity', name: 'exploration_constant', value: 1.41, min: 0.5, max: 3.0, description: 'UCB1 exploration factor', category: 'exploration' },
      { engine: 'curiosity', name: 'gap_threshold', value: 0.6, min: 0.2, max: 0.9, description: 'Knowledge gap detection cutoff', category: 'exploration' },
      { engine: 'curiosity', name: 'explore_cooldown', value: 5, min: 1, max: 20, description: 'Cycles between explorations', category: 'exploration' },
      { engine: 'curiosity', name: 'max_questions_per_topic', value: 10, min: 3, max: 50, description: 'Max questions generated per topic', category: 'exploration' },
      { engine: 'auto_responder', name: 'max_responses_per_cycle', value: 3, min: 1, max: 10, description: 'Max automatic responses per cycle', category: 'response' },
      { engine: 'auto_responder', name: 'cooldown_ms', value: 1800000, min: 60000, max: 7200000, description: 'Cooldown between responses', category: 'response' },
      { engine: 'orchestrator', name: 'distillEvery', value: 5, min: 1, max: 20, description: 'Knowledge distillation frequency', category: 'orchestration' },
      { engine: 'orchestrator', name: 'agendaEvery', value: 3, min: 1, max: 15, description: 'Agenda generation frequency', category: 'orchestration' },
      { engine: 'orchestrator', name: 'reflectEvery', value: 10, min: 3, max: 50, description: 'Journal reflection frequency', category: 'orchestration' },
    ]);
    this.orchestrator.setParameterRegistry(parameterRegistry);
    services.parameterRegistry = parameterRegistry;

    const metaCognitionLayer = new MetaCognitionLayer(this.db!);
    this.orchestrator.setMetaCognitionLayer(metaCognitionLayer);
    services.metaCognitionLayer = metaCognitionLayer;

    const autoExperimentEngine = new AutoExperimentEngine(
      this.db!, parameterRegistry, this.orchestrator.experimentEngine,
      this.orchestrator.selfObserver, metaCognitionLayer,
    );
    autoExperimentEngine.setPredictionEngine(predictionEngine);
    this.orchestrator.setAutoExperimentEngine(autoExperimentEngine);
    services.autoExperimentEngine = autoExperimentEngine;

    // 11n. SelfTestEngine — validates Brain's own understanding
    const selfTestEngine = new SelfTestEngine(this.db!);
    selfTestEngine.setKnowledgeDistiller(this.orchestrator.knowledgeDistiller);
    selfTestEngine.setPredictionEngine(predictionEngine);
    selfTestEngine.setHypothesisEngine(researchScheduler.hypothesisEngine);
    selfTestEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setSelfTestEngine(selfTestEngine);
    services.selfTestEngine = selfTestEngine;

    // 11o. TeachEngine — packages knowledge for other brains
    const teachEngine = new TeachEngine(this.db!);
    teachEngine.setKnowledgeDistiller(this.orchestrator.knowledgeDistiller);
    teachEngine.setHypothesisEngine(researchScheduler.hypothesisEngine);
    teachEngine.setJournal(this.orchestrator.journal);
    teachEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setTeachEngine(teachEngine);
    services.teachEngine = teachEngine;

    // 11p. DataScout — discovers external data sources
    runDataScoutMigration(this.db!);
    const dataScout = new DataScout(this.db!);
    dataScout.addAdapter(new GitHubTrendingAdapter());
    dataScout.addAdapter(new NpmStatsAdapter());
    dataScout.addAdapter(new HackerNewsAdapter());
    dataScout.setThoughtStream(thoughtStream);
    this.orchestrator.setDataScout(dataScout);
    services.dataScout = dataScout;

    // 11q. SimulationEngine — what-if scenario simulations
    runSimulationMigration(this.db!);
    const simulationEngine = new SimulationEngine(this.db!);
    simulationEngine.setPredictionEngine(predictionEngine);
    simulationEngine.setCausalGraph(researchScheduler.causalGraph);
    simulationEngine.setMetaCognitionLayer(metaCognitionLayer);
    simulationEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setSimulationEngine(simulationEngine);
    services.simulationEngine = simulationEngine;

    // 11r. MemoryPalace — knowledge connection graph
    const memoryPalace = new MemoryPalace(this.db!, { brainName: 'marketing-brain' });
    memoryPalace.setThoughtStream(thoughtStream);
    memoryPalace.setDataSources({
      getHypotheses: (status, limit) => this.orchestrator!.hypothesisEngine.list(status as HypothesisStatus, limit ?? 200),
      getPrinciples: (domain, limit) => this.orchestrator!.knowledgeDistiller.getPrinciples(domain, limit ?? 200),
      getAntiPatterns: (domain, limit) => this.orchestrator!.knowledgeDistiller.getAntiPatterns(domain, limit ?? 200),
      getExperiments: (status, limit) => this.orchestrator!.experimentEngine.list(status as ExperimentStatus, limit ?? 200),
      getJournalEntries: (limit) => this.orchestrator!.journal.getEntries(undefined, limit ?? 200) as Array<{ id?: number; title: string; tags: string[]; data?: unknown }>,
      getAnomalies: (type, limit) => this.orchestrator!.anomalyDetective.getAnomalies(type as AnomalyType, limit ?? 200),
      getCuriosityGaps: (limit) => this.curiosityEngine ? this.curiosityEngine.getGaps(limit ?? 100) : [],
    });
    this.orchestrator.setMemoryPalace(memoryPalace);
    services.memoryPalace = memoryPalace;

    // 11s. GoalEngine — autonomous goal setting and tracking
    const goalEngine = new GoalEngine(this.db!, { brainName: 'marketing-brain' });
    goalEngine.setThoughtStream(thoughtStream);
    goalEngine.setDataSources({
      getPredictionAccuracy: () => {
        try {
          const summary = predictionEngine.getSummary();
          const domains = (summary?.by_domain ?? []) as Array<{ accuracy_rate?: number }>;
          return domains.length > 0 ? (domains[0]?.accuracy_rate ?? 0) : 0;
        } catch { return 0; }
      },
      getActiveGaps: () => {
        try { return this.curiosityEngine ? this.curiosityEngine.getStatus().activeGaps : 0; } catch { return 0; }
      },
      getPrincipleCount: () => {
        try { return this.orchestrator!.knowledgeDistiller.getPrinciples(undefined, 1000).length; } catch { return 0; }
      },
      getExperimentCount: () => {
        try { return this.orchestrator!.experimentEngine.list(undefined, 1000).length; } catch { return 0; }
      },
    });
    this.orchestrator.setGoalEngine(goalEngine);
    services.goalEngine = goalEngine;

    // 11t. EvolutionEngine — genetic algorithm for parameter optimization
    runEvolutionMigration(this.db!);
    const evolutionEngine = new EvolutionEngine(this.db!, parameterRegistry, { brainName: 'marketing-brain' });
    evolutionEngine.setThoughtStream(thoughtStream);
    evolutionEngine.setDataSources({
      getReportCards: () => {
        try { return metaCognitionLayer.getLatestReportCards() as Array<{ engine: string; combined_score: number }>; } catch { return []; }
      },
      getGoalProgress: () => {
        try {
          const status = goalEngine.getStatus();
          return status.activeGoals > 0 ? status.achievedGoals / (status.achievedGoals + status.activeGoals + status.failedGoals || 1) : 0;
        } catch { return 0; }
      },
      getPredictionAccuracy: () => {
        try {
          const summary = predictionEngine.getSummary();
          const domains = (summary?.by_domain ?? []) as Array<{ accuracy_rate?: number }>;
          return domains.length > 0 ? (domains[0]?.accuracy_rate ?? 0) : 0;
        } catch { return 0; }
      },
      getPrincipleCount: () => {
        try { return this.orchestrator!.knowledgeDistiller.getPrinciples(undefined, 1000).length; } catch { return 0; }
      },
      getHypothesisCount: () => {
        try { return this.orchestrator!.hypothesisEngine.list(undefined, 1000).length; } catch { return 0; }
      },
    });
    evolutionEngine.initializePopulation();
    this.orchestrator.setEvolutionEngine(evolutionEngine);
    services.evolutionEngine = evolutionEngine;

    // ReasoningEngine — multi-step logical inference chains
    const reasoningEngine = new ReasoningEngine(this.db!, { brainName: 'marketing-brain' });
    reasoningEngine.setThoughtStream(thoughtStream);
    reasoningEngine.setDataSources({
      getConfirmedHypotheses: () => {
        try { return this.orchestrator!.hypothesisEngine.list('confirmed' as HypothesisStatus, 200); } catch { return []; }
      },
      getPrinciples: (domain, limit) => {
        try { return this.orchestrator!.knowledgeDistiller.getPrinciples(domain, limit ?? 200); } catch { return []; }
      },
      getCausalEdges: (minStrength) => {
        try { return this.orchestrator!.causalGraph?.getEdges(minStrength ?? 0.2) ?? []; } catch { return []; }
      },
      getCausalEffects: (eventType) => {
        try { return this.orchestrator!.causalGraph?.getEffects(eventType) ?? []; } catch { return []; }
      },
    });
    this.orchestrator.setReasoningEngine(reasoningEngine);
    services.reasoningEngine = reasoningEngine;

    // EmotionalModel — unified emotional state
    const emotionalModel = new EmotionalModel(this.db!, { brainName: 'marketing-brain' });
    emotionalModel.setThoughtStream(thoughtStream);
    emotionalModel.setDataSources({
      getCuriosityStatus: () => {
        try {
          const s = services.curiosityEngine!.getStatus();
          return { activeGaps: s.activeGaps, avgGapScore: s.topGaps.length > 0 ? s.topGaps.reduce((a, g) => a + g.gapScore, 0) / s.topGaps.length : 0, explorationRate: s.explorationRate };
        } catch { return { activeGaps: 0, avgGapScore: 0, explorationRate: 0 }; }
      },
      getEmergenceStatus: () => {
        try {
          const s = services.emergenceEngine!.getStatus();
          return { recentEvents: s.totalEvents, avgSurprise: s.avgSurpriseScore };
        } catch { return { recentEvents: 0, avgSurprise: 0 }; }
      },
      getHypothesisConfidence: () => {
        try {
          const all = this.orchestrator!.hypothesisEngine.list(undefined, 100);
          const avg = all.length > 0 ? all.reduce((s, h) => s + (h.confidence ?? 0), 0) / all.length : 0.5;
          const confirmed = all.filter(h => h.status === 'confirmed').length;
          return { avgConfidence: avg, confirmedRate: all.length > 0 ? confirmed / all.length : 0 };
        } catch { return { avgConfidence: 0.5, confirmedRate: 0 }; }
      },
      getPredictionAccuracy: () => {
        try {
          const summary = services.predictionEngine?.getSummary();
          return (summary as Record<string, unknown> | undefined)?.overallAccuracy as number ?? 0.5;
        } catch { return 0.5; }
      },
      getReportCards: () => {
        try { return services.metaCognitionLayer?.getLatestReportCards() ?? []; } catch { return []; }
      },
      getAttentionStatus: () => {
        try {
          const s = services.attentionEngine!.getStatus();
          const topUrgency = s.urgentTopics.length / 10;
          return { avgUrgency: Math.min(topUrgency, 1), burstCount: s.totalEvents > 50 ? Math.floor(s.totalEvents / 10) : 0, contextSwitches: s.contextHistory.length };
        } catch { return { avgUrgency: 0, burstCount: 0, contextSwitches: 0 }; }
      },
      getReasoningChainCount: () => {
        try { return reasoningEngine.getStatus().chainCount; } catch { return 0; }
      },
      getDebateCount: () => {
        try { return services.debateEngine?.getStatus()?.totalDebates ?? 0; } catch { return 0; }
      },
    });
    this.orchestrator.setEmotionalModel(emotionalModel);
    services.emotionalModel = emotionalModel;

    // ── SelfScanner + SelfModificationEngine ───────
    const projectRoot = path.resolve(path.dirname(config.dbPath), '..');
    const selfScanner = new SelfScanner(this.db!, { brainName: 'marketing-brain' });
    this.orchestrator.setSelfScanner(selfScanner);
    services.selfScanner = selfScanner;

    const selfModificationEngine = new SelfModificationEngine(this.db!, {
      brainName: 'marketing-brain',
      projectRoot,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    selfModificationEngine.setSelfScanner(selfScanner);
    selfModificationEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setSelfModificationEngine(selfModificationEngine);
    services.selfModificationEngine = selfModificationEngine;

    // ConceptAbstraction — clusters knowledge into abstract concepts
    const conceptAbstraction = new ConceptAbstraction(this.db!, { brainName: 'marketing-brain' });
    conceptAbstraction.setThoughtStream(thoughtStream);
    conceptAbstraction.setDataSources({
      getPrinciples: (domain, limit) => this.orchestrator!.knowledgeDistiller.getPrinciples(domain, limit ?? 500),
      getAntiPatterns: (domain, limit) => this.orchestrator!.knowledgeDistiller.getAntiPatterns(domain, limit ?? 500),
      getHypotheses: (status, limit) => this.orchestrator!.hypothesisEngine.list(status as HypothesisStatus, limit ?? 500),
    });
    this.orchestrator.setConceptAbstraction(conceptAbstraction);
    services.conceptAbstraction = conceptAbstraction;

    // 10g.2 BootstrapService — seeds initial data on first cycle to fix cold-start
    const bootstrapService = new BootstrapService(this.db!, {
      brainName: 'marketing-brain',
      engineCount: 30,
      mcpToolCount: 128,
      version: getCurrentVersion(),
    });
    bootstrapService.setEngines({
      selfObserver: this.orchestrator.selfObserver,
      anomalyDetective: this.orchestrator.anomalyDetective,
      journal: this.orchestrator.journal,
      hypothesisEngine: this.orchestrator.hypothesisEngine,
      predictionEngine,
      parameterRegistry,
    });
    this.orchestrator.setBootstrapService(bootstrapService);

    logger.info('Research orchestrator started (30+ engines, feedback loops active, DataMiner bootstrapped, Dream Mode active, Prediction Engine active)');

    // 11. IPC Server
    const router = new IpcRouter(services);
    this.ipcServer = new IpcServer(router, config.ipc.pipeName, 'marketing-brain', 'marketing-brain');
    this.ipcServer.start();

    // Wire subscription manager into IPC router
    router.setSubscriptionManager(this.subscriptionManager, this.ipcServer);

    // 11b. PeerNetwork — UDP multicast auto-discovery
    this.peerNetwork = new PeerNetwork({
      brainName: 'marketing-brain',
      httpPort: config.api.port,
      packageVersion: '1.32.0',
      getKnowledgeSummary: () => {
        try {
          const p = this.orchestrator?.knowledgeDistiller?.getPrinciples(undefined, 1000) ?? [];
          const h = this.orchestrator?.hypothesisEngine?.list(undefined, 1000) ?? [];
          const e = this.orchestrator?.experimentEngine?.list(undefined, 1000) ?? [];
          return { principles: p.length, hypotheses: h.length, experiments: e.length };
        } catch { return { principles: 0, hypotheses: 0, experiments: 0 }; }
      },
    });
    this.peerNetwork.onPeerDiscovered((peer) => {
      logger.info(`[peer-network] Discovered peer: ${peer.name} (v${peer.packageVersion})`);
      this.crossBrain?.addPeer({ name: peer.name, pipeName: peer.pipeName });
    });
    this.peerNetwork.onPeerLost((peer) => {
      logger.warn(`[peer-network] Lost peer: ${peer.name}`);
      this.crossBrain?.removePeer(peer.name);
    });
    this.peerNetwork.startDiscovery();
    services.peerNetwork = this.peerNetwork;

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

    // 16. Crash recovery (with loop protection)
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack });
      this.logCrash('uncaughtException', err);
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        logger.error('Port conflict during restart — stopping to prevent crash loop');
        return;
      }
      this.restart();
    });
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled rejection', { reason: String(reason) });
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
    this.peerNetwork?.stopDiscovery();
    this.subscriptionManager?.disconnectAll();
    this.attentionEngine?.stop();
    // consciousnessServer removed
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
    this.attentionEngine = null;
    this.narrativeEngine = null;
    this.curiosityEngine = null;
    this.emergenceEngine = null;
    this.debateEngine = null;
    this.peerNetwork = null;
    this.subscriptionManager = null;
    this.correlator = null;
  }

  restart(): void {
    if (this.restarting) return;
    this.restarting = true;

    const logger = getLogger();

    const now = Date.now();
    if (now - this.restartWindowStart > 60_000) {
      this.restartCount = 0;
      this.restartWindowStart = now;
    }
    this.restartCount++;
    if (this.restartCount > 3) {
      logger.error('Too many restarts (>3 in 60s) — exiting. Watchdog will recover.');
      this.logCrash('restart-limit', new Error('Exceeded 3 restarts in 60 seconds'));
      process.exit(1);
    }

    logger.info(`Restarting Marketing Brain daemon (attempt ${this.restartCount}/3)...`);

    try { this.cleanup(); } catch { /* best effort cleanup */ }

    setTimeout(() => {
      this.restarting = false;
      try {
        this.start(this.configPath);
      } catch (err) {
        logger.error('Restart failed', { error: err instanceof Error ? err.message : String(err) });
        this.restarting = false;
      }
    }, 1000);
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
