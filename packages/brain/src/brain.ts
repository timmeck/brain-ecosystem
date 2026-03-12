import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import type { BrainConfig } from './types/config.types.js';
import { createLogger, getLogger } from './utils/logger.js';
import { getCurrentVersion } from './cli/update-check.js';
import { createConnection } from '@timmeck/brain-core';
import { runMigrations } from './db/migrations/index.js';

// Repositories
import { ProjectRepository } from './db/repositories/project.repository.js';
import { ErrorRepository } from './db/repositories/error.repository.js';
import { SolutionRepository } from './db/repositories/solution.repository.js';
import { RuleRepository } from './db/repositories/rule.repository.js';
import { AntipatternRepository } from './db/repositories/antipattern.repository.js';
import { TerminalRepository } from './db/repositories/terminal.repository.js';
import { CodeModuleRepository } from './db/repositories/code-module.repository.js';
import { SynapseRepository } from './db/repositories/synapse.repository.js';
import { NotificationRepository } from './db/repositories/notification.repository.js';
import { InsightRepository } from './db/repositories/insight.repository.js';
import { MemoryRepository } from './db/repositories/memory.repository.js';
import { SessionRepository } from './db/repositories/session.repository.js';
import { DecisionRepository } from './db/repositories/decision.repository.js';
import { ChangelogRepository } from './db/repositories/changelog.repository.js';
import { TaskRepository } from './db/repositories/task.repository.js';
import { DocRepository } from './db/repositories/doc.repository.js';

// Services
import { ErrorService } from './services/error.service.js';
import { SolutionService } from './services/solution.service.js';
import { TerminalService } from './services/terminal.service.js';
import { PreventionService } from './services/prevention.service.js';
import { CodeService } from './services/code.service.js';
import { SynapseService } from './services/synapse.service.js';
import { ResearchService } from './services/research.service.js';
import { NotificationService } from './services/notification.service.js';
import { AnalyticsService } from './services/analytics.service.js';
import { GitService } from './services/git.service.js';
import { MemoryService } from './services/memory.service.js';
import { DecisionService } from './services/decision.service.js';
import { ChangelogService } from './services/changelog.service.js';
import { TaskService } from './services/task.service.js';
import { DocService } from './services/doc.service.js';
import { AutoResolutionService } from './services/auto-resolution.service.js';
import { ProjectScanner } from './services/project-scanner.js';
import { ReposignalImporter } from './services/reposignal-importer.js';

// Synapses
import { SynapseManager } from './synapses/synapse-manager.js';

// Engines
import { LearningEngine } from './learning/learning-engine.js';
import { ResearchEngine } from './research/research-engine.js';

// IPC
import { IpcRouter, type Services } from './ipc/router.js';
import { IpcServer } from '@timmeck/brain-core';

// API & MCP HTTP
import { ApiServer } from './api/server.js';
import { McpHttpServer } from './mcp/http-server.js';

// Embeddings
import { EmbeddingEngine } from './embeddings/engine.js';

// Cross-Brain
import { CrossBrainClient, CrossBrainNotifier, CrossBrainSubscriptionManager, CrossBrainCorrelator, EcosystemService, WebhookService, ExportService, BackupService, AutonomousResearchScheduler, ResearchOrchestrator, DataMiner, BrainDataMinerAdapter, ScannerDataMinerAdapter, BootstrapService, DreamEngine, ThoughtStream, PredictionEngine, AttentionEngine, TransferEngine, NarrativeEngine, CuriosityEngine, EmergenceEngine, DebateEngine, ParameterRegistry, MetaCognitionLayer, AutoExperimentEngine, SelfTestEngine, TeachEngine, DataScout, runDataScoutMigration, GitHubTrendingAdapter, NpmStatsAdapter, HackerNewsAdapter, SimulationEngine, runSimulationMigration, MemoryPalace, GoalEngine, EvolutionEngine, runEvolutionMigration, ReasoningEngine, EmotionalModel, SelfScanner, SelfModificationEngine, ConceptAbstraction, PeerNetwork, LLMService, OllamaProvider, ResearchMissionEngine, runMissionMigration, BraveSearchAdapter, JinaReaderAdapter, PlaywrightAdapter, FirecrawlAdapter, CommandCenterServer, WatchdogService, createDefaultWatchdogConfig, PluginRegistry, BorgSyncEngine, GuardrailEngine, CausalPlanner, ResearchRoadmap, CreativeEngine, TelegramBot, DiscordBot, MemoryWatchdog, AdaptiveScheduler, EngineTokenBudgetTracker, CycleOutcomeTracker, runCycleOutcomeMigration, ConversationMemory, BrowserAgent, BrainBot, AutonomousResearchLoop, runAutonomousResearchMigration } from '@timmeck/brain-core';
import type { BorgDataProvider, SyncItem, HypothesisStatus, ExperimentStatus, AnomalyType } from '@timmeck/brain-core';

// Init modules (extracted from God-Class)
import { setupEventListeners, setupCrossBrainSubscriptions } from './init/events-init.js';
import { logCrash as logCrashHelper, runRetentionCleanup as runRetentionHelper, cleanup as cleanupEngines, setupCrashRecovery } from './init/lifecycle.js';
import { createCommandCenter } from './init/dashboard-init.js';
import { createIntelligenceEngines } from './init/engine-factory.js';

export class BrainCore {
  private db: Database.Database | null = null;
  private ipcServer: IpcServer | null = null;
  private apiServer: ApiServer | null = null;
  private mcpHttpServer: McpHttpServer | null = null;
  private embeddingEngine: EmbeddingEngine | null = null;
  private learningEngine: LearningEngine | null = null;
  private researchEngine: ResearchEngine | null = null;
  private crossBrain: CrossBrainClient | null = null;
  private notifier: CrossBrainNotifier | null = null;
  private subscriptionManager: CrossBrainSubscriptionManager | null = null;
  private correlator: CrossBrainCorrelator | null = null;
  private ecosystemService: EcosystemService | null = null;
  private researchScheduler: AutonomousResearchScheduler | null = null;
  private orchestrator: ResearchOrchestrator | null = null;
  private attentionEngine: AttentionEngine | null = null;
  private transferEngine: TransferEngine | null = null;
  private commandCenter: CommandCenterServer | null = null;
  private narrativeEngine: NarrativeEngine | null = null;
  private curiosityEngine: CuriosityEngine | null = null;
  private emergenceEngine: EmergenceEngine | null = null;
  private debateEngine: DebateEngine | null = null;
  private peerNetwork: PeerNetwork | null = null;
  private pluginRegistry: PluginRegistry | null = null;
  private borgSync: BorgSyncEngine | null = null;
  private guardrailEngine: GuardrailEngine | null = null;
  private causalPlanner: CausalPlanner | null = null;
  private researchRoadmap: ResearchRoadmap | null = null;
  private creativeEngine: CreativeEngine | null = null;
  private telegramBot: TelegramBot | null = null;
  private discordBot: DiscordBot | null = null;
  private conversationMemory: ConversationMemory | null = null;
  private browserAgent: BrowserAgent | null = null;
  private brainBot: BrainBot | null = null;
  private autonomousResearchLoop: AutonomousResearchLoop | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private retentionTimer: ReturnType<typeof setInterval> | null = null;
  private config: BrainConfig | null = null;
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
    const projectRepo = new ProjectRepository(this.db);
    const errorRepo = new ErrorRepository(this.db);
    const solutionRepo = new SolutionRepository(this.db);
    const ruleRepo = new RuleRepository(this.db);
    const antipatternRepo = new AntipatternRepository(this.db);
    const terminalRepo = new TerminalRepository(this.db);
    const codeModuleRepo = new CodeModuleRepository(this.db);
    const synapseRepo = new SynapseRepository(this.db);
    const notificationRepo = new NotificationRepository(this.db);
    const insightRepo = new InsightRepository(this.db);
    const memoryRepo = new MemoryRepository(this.db);
    const sessionRepo = new SessionRepository(this.db);
    const decisionRepo = new DecisionRepository(this.db);
    const changelogRepo = new ChangelogRepository(this.db);
    const taskRepo = new TaskRepository(this.db);
    const docRepo = new DocRepository(this.db);

    // 6. Synapse Manager
    const synapseManager = new SynapseManager(synapseRepo, config.synapses);

    // 7. Services
    const memoryService = new MemoryService(memoryRepo, sessionRepo, projectRepo, synapseManager);
    const decisionService = new DecisionService(decisionRepo, projectRepo, synapseManager);
    const changelogService = new ChangelogService(changelogRepo, projectRepo, synapseManager);
    const taskService = new TaskService(taskRepo, memoryRepo, decisionRepo, changelogRepo, projectRepo, synapseManager);
    const docService = new DocService(docRepo, projectRepo, decisionRepo, changelogRepo, taskRepo, synapseManager);

    const services: Services = {
      error: new ErrorService(errorRepo, projectRepo, synapseManager, config.matching),
      solution: new SolutionService(solutionRepo, synapseManager),
      terminal: new TerminalService(terminalRepo, config.terminal.staleTimeout),
      prevention: new PreventionService(ruleRepo, antipatternRepo, synapseManager),
      code: new CodeService(codeModuleRepo, projectRepo, synapseManager),
      synapse: new SynapseService(synapseManager),
      research: new ResearchService(insightRepo, errorRepo, synapseManager),
      notification: new NotificationService(notificationRepo),
      analytics: new AnalyticsService(
        errorRepo, solutionRepo, codeModuleRepo,
        ruleRepo, antipatternRepo, insightRepo,
        synapseManager,
      ),
      git: new GitService(this.db!, synapseManager),
      memory: memoryService,
      decision: decisionService,
      changelog: changelogService,
      task: taskService,
      doc: docService,
    };

    // Wire memory repos into analytics for stats
    services.analytics.setMemoryRepos(memoryRepo, sessionRepo);

    // Auto-Resolution Service
    const autoResolution = new AutoResolutionService(solutionRepo, errorRepo, synapseManager);
    services.error.setAutoResolution(autoResolution);
    services.autoResolution = autoResolution;

    // Project Scanner (smart import: Git + Logs + Build → Errors + Solutions)
    services.projectScanner = new ProjectScanner(services.error, services.solution, services.git);

    // Reposignal Importer (import tech intelligence from reposignal/aisurvival DB)
    services.reposignalImporter = new ReposignalImporter(this.db!);

    // 8. Embedding Engine (local vector search)
    if (config.embeddings.enabled) {
      this.embeddingEngine = new EmbeddingEngine(config.embeddings, this.db!);
      this.embeddingEngine.start();
      // Wire embedding engine into services for hybrid search
      services.error.setEmbeddingEngine(this.embeddingEngine);
      services.code.setEmbeddingEngine(this.embeddingEngine);
      services.memory.setEmbeddingEngine(this.embeddingEngine);
      logger.info('Embedding engine started (model will load in background)');
    }

    // 9. Learning Engine
    this.learningEngine = new LearningEngine(
      config.learning, errorRepo, solutionRepo,
      ruleRepo, antipatternRepo, synapseManager,
    );
    this.learningEngine.start();
    logger.info(`Learning engine started (interval: ${config.learning.intervalMs}ms)`);

    // 10. Research Engine
    this.researchEngine = new ResearchEngine(
      config.research, errorRepo, solutionRepo, projectRepo,
      codeModuleRepo, synapseRepo, insightRepo, synapseManager,
    );
    this.researchEngine.start();
    logger.info(`Research engine started (interval: ${config.research.intervalMs}ms)`);

    // Expose learning engine + cross-brain to IPC
    services.learning = this.learningEngine;
    // 11. Cross-Brain Client + Notifier
    this.crossBrain = new CrossBrainClient('brain');
    this.notifier = new CrossBrainNotifier(this.crossBrain, 'brain');
    services.crossBrain = this.crossBrain;

    // 11b. Cross-Brain Correlator + Ecosystem Service
    this.correlator = new CrossBrainCorrelator();
    this.ecosystemService = new EcosystemService(this.correlator, this.crossBrain);
    services.ecosystem = this.ecosystemService;

    // 11c. Cross-Brain Subscription Manager
    this.subscriptionManager = new CrossBrainSubscriptionManager('brain');

    // 11d. Webhook, Export, Backup services
    services.webhook = new WebhookService(this.db!);
    services.export = new ExportService(this.db!);
    services.backup = new BackupService(this.db!, config.dbPath);

    // 11e. Autonomous Research Scheduler (Meta-Learning + Causal Inference + Hypothesis)
    const researchScheduler = new AutonomousResearchScheduler(this.db!, {
      brainName: 'brain',
      hyperParams: [
        { name: 'learningRate', value: 0.1, min: 0.01, max: 0.5, step: 0.02 },
        { name: 'decayRate', value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
        { name: 'pruneThreshold', value: 0.1, min: 0.01, max: 0.5, step: 0.02 },
      ],
    });
    researchScheduler.start();
    this.researchScheduler = researchScheduler;
    services.researchScheduler = researchScheduler;
    services.metaLearning = researchScheduler.metaLearning;
    services.causal = researchScheduler.causalGraph;
    services.hypothesis = researchScheduler.hypothesisEngine;
    logger.info('Autonomous research scheduler started');

    // 11f. Research Orchestrator (feedback loops between all research engines)
    this.orchestrator = new ResearchOrchestrator(this.db!, {
      brainName: 'brain',
    }, researchScheduler.causalGraph);
    this.orchestrator.setOnSuggestion((suggestions) => {
      for (const s of suggestions) {
        services.notification.create({
          type: 'selfmod',
          title: 'Self-improvement suggestion',
          message: JSON.stringify({ summary: s }),
        });
      }
    });
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

    // 11g. DataMiner — bootstrap historical data into research engines
    const dataMiner = new DataMiner(this.db!, new BrainDataMinerAdapter(), {
      selfObserver: this.orchestrator.selfObserver,
      anomalyDetective: this.orchestrator.anomalyDetective,
      crossDomain: this.orchestrator.crossDomain,
      causalGraph: researchScheduler.causalGraph,
      hypothesisEngine: researchScheduler.hypothesisEngine,
    });
    dataMiner.addAdapter(new ScannerDataMinerAdapter());
    this.orchestrator.setDataMiner(dataMiner);
    dataMiner.bootstrap();

    // 11h. Dream Engine — offline memory consolidation
    const dreamEngine = new DreamEngine(this.db!, { brainName: 'brain' });
    if (this.embeddingEngine) {
      dreamEngine.setEmbeddingEngine(this.embeddingEngine);
    }
    this.orchestrator.setDreamEngine(dreamEngine);
    dreamEngine.start();
    services.dreamEngine = dreamEngine;

    // 11i. Prediction Engine — Proactive Forecasting
    const predictionEngine = new PredictionEngine(this.db!, { brainName: 'brain', defaultHorizonMs: 300_000 });
    this.orchestrator.setPredictionEngine(predictionEngine);
    predictionEngine.start();
    services.predictionEngine = predictionEngine;
    services.orchestrator = this.orchestrator;

    // 11j. Consciousness — ThoughtStream + Dashboard
    const thoughtStream = new ThoughtStream();
    this.orchestrator.setThoughtStream(thoughtStream);
    dreamEngine.setThoughtStream(thoughtStream);
    predictionEngine.setThoughtStream(thoughtStream);

    // 11j.5 Attention Engine — dynamic focus & resource allocation
    const attentionEngine = new AttentionEngine(this.db!, { brainName: 'brain' });
    attentionEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setAttentionEngine(attentionEngine);
    this.attentionEngine = attentionEngine;
    services.attentionEngine = attentionEngine;

    // 11j.6 Transfer Engine — cross-domain knowledge transfer
    const transferEngine = new TransferEngine(this.db!, { brainName: 'brain' });
    transferEngine.setThoughtStream(thoughtStream);
    transferEngine.seedDefaultRules();
    this.orchestrator.setTransferEngine(transferEngine);
    this.transferEngine = transferEngine;
    services.transferEngine = transferEngine;

    // 11j.6b LLMService — multi-provider (Anthropic Cloud + optional Ollama local)
    const llmService = new LLMService(this.db!, {
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxCallsPerHour: 30,
      tokenBudgetPerHour: 100_000,
      tokenBudgetPerDay: 500_000,
      preferLocal: true,
    });

    // Register Ollama if reachable (optional — install from https://ollama.com)
    const ollamaProvider = new OllamaProvider();
    ollamaProvider.isAvailable().then(available => {
      if (available) {
        llmService.registerProvider(ollamaProvider);
        logger.info('Ollama provider registered — local AI for simple tasks');
      }
    }).catch(() => { /* Ollama not available, that's fine */ });

    this.orchestrator.setLLMService(llmService);
    services.llmService = llmService;
    if (llmService.isAvailable()) {
      logger.info('LLMService activated — engines will use multi-provider routing');
    }

    // 11j.7 Narrative Engine — brain explains itself in natural language
    const narrativeEngine = new NarrativeEngine(this.db!, { brainName: 'brain' });
    narrativeEngine.setThoughtStream(thoughtStream);
    narrativeEngine.setDataSources({
      knowledgeDistiller: this.orchestrator.knowledgeDistiller,
      hypothesisEngine: this.orchestrator.hypothesisEngine,
      journal: this.orchestrator.journal,
      predictionEngine: predictionEngine,
      experimentEngine: this.orchestrator.experimentEngine,
      anomalyDetective: this.orchestrator.anomalyDetective,
      attentionEngine,
      transferEngine,
    });
    this.orchestrator.setNarrativeEngine(narrativeEngine);
    this.narrativeEngine = narrativeEngine;
    services.narrativeEngine = narrativeEngine;

    // 11j.8 Curiosity Engine — knowledge gap detection & exploration/exploitation
    const curiosityEngine = new CuriosityEngine(this.db!, { brainName: 'brain', gapThreshold: 0.3 });
    curiosityEngine.setThoughtStream(thoughtStream);
    curiosityEngine.setDataSources({
      attentionEngine,
      knowledgeDistiller: this.orchestrator.knowledgeDistiller,
      hypothesisEngine: this.orchestrator.hypothesisEngine,
      experimentEngine: this.orchestrator.experimentEngine,
      agendaEngine: this.orchestrator.researchAgenda,
      narrativeEngine,
    });
    this.orchestrator.setCuriosityEngine(curiosityEngine);
    this.curiosityEngine = curiosityEngine;
    services.curiosityEngine = curiosityEngine;

    // 11j.9 Emergence Engine — tracks emergent behaviors and complexity metrics
    const emergenceEngine = new EmergenceEngine(this.db!, { brainName: 'brain' });
    emergenceEngine.setThoughtStream(thoughtStream);
    emergenceEngine.setDataSources({
      knowledgeDistiller: this.orchestrator.knowledgeDistiller,
      hypothesisEngine: this.orchestrator.hypothesisEngine,
      journal: this.orchestrator.journal,
      anomalyDetective: this.orchestrator.anomalyDetective,
      experimentEngine: this.orchestrator.experimentEngine,
      curiosityEngine,
      getNetworkStats: () => {
        try {
          const stats = this.db!.prepare('SELECT COUNT(DISTINCT source_type || source_id) + COUNT(DISTINCT target_type || target_id) as nodes, COUNT(*) as synapses, AVG(weight) as avg FROM synapses').get() as { nodes: number; synapses: number; avg: number };
          return { totalNodes: stats.nodes || 0, totalSynapses: stats.synapses || 0, avgWeight: stats.avg || 0, nodesByType: {} };
        } catch { return { totalNodes: 0, totalSynapses: 0, avgWeight: 0, nodesByType: {} }; }
      },
    });
    this.orchestrator.setEmergenceEngine(emergenceEngine);
    this.emergenceEngine = emergenceEngine;
    services.emergenceEngine = emergenceEngine;

    // 11j.10 Debate Engine — multi-perspective debates on key questions
    const debateEngine = new DebateEngine(this.db!, { brainName: 'brain', domainDescription: 'error tracking and code intelligence' });
    debateEngine.setThoughtStream(thoughtStream);
    debateEngine.setDataSources({
      knowledgeDistiller: this.orchestrator.knowledgeDistiller,
      hypothesisEngine: this.orchestrator.hypothesisEngine,
      journal: this.orchestrator.journal,
      anomalyDetective: this.orchestrator.anomalyDetective,
      predictionEngine,
      narrativeEngine,
    });
    this.orchestrator.setDebateEngine(debateEngine);
    this.debateEngine = debateEngine;
    services.debateEngine = debateEngine;

    // Re-propagate LLM to engines registered after initial setLLMService call
    if (llmService.isAvailable()) {
      this.orchestrator.setLLMService(llmService);
    }

    // 11j.11 Meta-Cognition: ParameterRegistry + MetaCognitionLayer + AutoExperimentEngine
    const parameterRegistry = new ParameterRegistry(this.db!);
    parameterRegistry.registerAll([
      // Dream Engine
      { engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.01, max: 0.5, description: 'Synapse prune cutoff weight', category: 'consolidation' },
      { engine: 'dream', name: 'learning_rate', value: 0.15, min: 0.01, max: 0.5, description: 'Dream synapse strengthening rate', category: 'consolidation' },
      { engine: 'dream', name: 'cluster_similarity', value: 0.35, min: 0.1, max: 0.95, description: 'Memory compression similarity threshold', category: 'consolidation' },
      { engine: 'dream', name: 'importance_decay_rate', value: 0.5, min: 0.1, max: 0.9, description: 'Memory importance decay factor', category: 'consolidation' },
      { engine: 'dream', name: 'replay_batch_size', value: 50, min: 5, max: 200, description: 'Memories per replay batch', category: 'consolidation' },
      { engine: 'dream', name: 'max_consolidations', value: 10, min: 1, max: 50, description: 'Max memory clusters per dream cycle', category: 'consolidation' },
      // Attention Engine
      { engine: 'attention', name: 'decay_rate', value: 0.85, min: 0.5, max: 0.99, description: 'Attention score decay per cycle', category: 'focus' },
      { engine: 'attention', name: 'burst_threshold', value: 3, min: 1, max: 10, description: 'Events to trigger urgency', category: 'focus' },
      { engine: 'attention', name: 'burst_window_ms', value: 180000, min: 30000, max: 600000, description: 'Burst detection window', category: 'focus' },
      // Curiosity Engine
      { engine: 'curiosity', name: 'exploration_constant', value: 1.41, min: 0.5, max: 3.0, description: 'UCB1 exploration factor', category: 'exploration' },
      { engine: 'curiosity', name: 'gap_threshold', value: 0.6, min: 0.2, max: 0.9, description: 'Knowledge gap detection cutoff', category: 'exploration' },
      { engine: 'curiosity', name: 'explore_cooldown', value: 5, min: 1, max: 20, description: 'Cycles between explorations', category: 'exploration' },
      { engine: 'curiosity', name: 'max_questions_per_topic', value: 10, min: 3, max: 50, description: 'Max questions generated per topic', category: 'exploration' },
      // AutoResponder
      { engine: 'auto_responder', name: 'max_responses_per_cycle', value: 3, min: 1, max: 10, description: 'Max automatic responses per cycle', category: 'response' },
      { engine: 'auto_responder', name: 'cooldown_ms', value: 1800000, min: 60000, max: 7200000, description: 'Cooldown between responses to same metric', category: 'response' },
      // Adaptive Strategy
      { engine: 'adaptive_strategy', name: 'max_change_rate', value: 0.2, min: 0.05, max: 0.5, description: 'Max % change per adaptation', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'observation_cycles', value: 5, min: 2, max: 20, description: 'Cycles before evaluating', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'revert_threshold', value: 0.1, min: 0.01, max: 0.5, description: 'Performance drop to trigger revert', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'fts_weight', value: 0.5, min: 0.0, max: 1.0, description: 'Full-text search weight', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'semantic_weight', value: 0.5, min: 0.0, max: 1.0, description: 'Semantic search weight', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'min_match_score', value: 0.3, min: 0.05, max: 0.9, description: 'Minimum match score', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'synapse_decay_rate', value: 0.05, min: 0.001, max: 0.3, description: 'Synapse decay rate', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'confidence_threshold', value: 0.6, min: 0.3, max: 0.95, description: 'Learning confidence threshold', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'hypothesis_min_confidence', value: 0.5, min: 0.1, max: 0.9, description: 'Min hypothesis confidence', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'causal_min_strength', value: 0.3, min: 0.05, max: 0.8, description: 'Min causal strength', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'meta_step_size', value: 0.1, min: 0.01, max: 0.5, description: 'Meta-learning step size', category: 'strategy' },
      { engine: 'adaptive_strategy', name: 'research_interval_ms', value: 600000, min: 60000, max: 3600000, description: 'Research interval', category: 'strategy' },
      // Orchestrator
      { engine: 'orchestrator', name: 'distillEvery', value: 5, min: 1, max: 20, description: 'Knowledge distillation frequency (cycles)', category: 'orchestration' },
      { engine: 'orchestrator', name: 'agendaEvery', value: 3, min: 1, max: 15, description: 'Agenda generation frequency (cycles)', category: 'orchestration' },
      { engine: 'orchestrator', name: 'reflectEvery', value: 10, min: 3, max: 50, description: 'Journal reflection frequency (cycles)', category: 'orchestration' },
      // Prediction Engine
      { engine: 'prediction', name: 'ewmaAlpha', value: 0.3, min: 0.05, max: 0.95, description: 'EWMA smoothing factor', category: 'prediction' },
      { engine: 'prediction', name: 'trendBeta', value: 0.1, min: 0.01, max: 0.5, description: 'Holt-Winters trend smoothing', category: 'prediction' },
      { engine: 'prediction', name: 'minConfidence', value: 0.3, min: 0.1, max: 0.8, description: 'Minimum prediction confidence', category: 'prediction' },
      { engine: 'prediction', name: 'minDataPoints', value: 5, min: 3, max: 20, description: 'Min data points before predicting', category: 'prediction' },
      { engine: 'prediction', name: 'maxPredictionsPerCycle', value: 5, min: 1, max: 20, description: 'Max predictions generated per cycle', category: 'prediction' },
      { engine: 'prediction', name: 'defaultHorizonMs', value: 300000, min: 60000, max: 7200000, description: 'Default prediction horizon', category: 'prediction' },
    ]);
    this.orchestrator.setParameterRegistry(parameterRegistry);
    services.parameterRegistry = parameterRegistry;

    const metaCognitionLayer = new MetaCognitionLayer(this.db!);
    this.orchestrator.setMetaCognitionLayer(metaCognitionLayer);
    services.metaCognitionLayer = metaCognitionLayer;
    services.governanceLayer?.setMetaCognitionLayer(metaCognitionLayer);

    const adaptiveScheduler = new AdaptiveScheduler();
    this.orchestrator.setAdaptiveScheduler(adaptiveScheduler);
    services.adaptiveScheduler = adaptiveScheduler;

    const autoExperimentEngine = new AutoExperimentEngine(
      this.db!, parameterRegistry, this.orchestrator.experimentEngine,
      this.orchestrator.selfObserver, metaCognitionLayer,
    );
    autoExperimentEngine.setPredictionEngine(predictionEngine);
    this.orchestrator.setAutoExperimentEngine(autoExperimentEngine);
    services.autoExperimentEngine = autoExperimentEngine;

    // 11j.12 SelfTestEngine — validates Brain's own understanding
    const selfTestEngine = new SelfTestEngine(this.db!);
    selfTestEngine.setKnowledgeDistiller(this.orchestrator.knowledgeDistiller);
    selfTestEngine.setPredictionEngine(predictionEngine);
    selfTestEngine.setHypothesisEngine(researchScheduler.hypothesisEngine);
    selfTestEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setSelfTestEngine(selfTestEngine);
    services.selfTestEngine = selfTestEngine;

    // 11j.13 TeachEngine — packages knowledge for other brains
    const teachEngine = new TeachEngine(this.db!);
    teachEngine.setKnowledgeDistiller(this.orchestrator.knowledgeDistiller);
    teachEngine.setHypothesisEngine(researchScheduler.hypothesisEngine);
    teachEngine.setJournal(this.orchestrator.journal);
    teachEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setTeachEngine(teachEngine);
    services.teachEngine = teachEngine;

    // 11j.14 DataScout — discovers external data sources
    runDataScoutMigration(this.db!);
    const dataScout = new DataScout(this.db!);
    dataScout.addAdapter(new GitHubTrendingAdapter());
    dataScout.addAdapter(new NpmStatsAdapter());
    dataScout.addAdapter(new HackerNewsAdapter());
    dataScout.setThoughtStream(thoughtStream);
    this.orchestrator.setDataScout(dataScout);
    dataScout.startPeriodicScan(6 * 3600 * 1000);  // every 6h
    services.dataScout = dataScout;

    // 11j.15 SimulationEngine — what-if scenario simulations
    runSimulationMigration(this.db!);
    const simulationEngine = new SimulationEngine(this.db!);
    simulationEngine.setPredictionEngine(predictionEngine);
    simulationEngine.setCausalGraph(researchScheduler.causalGraph);
    simulationEngine.setMetaCognitionLayer(metaCognitionLayer);
    simulationEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setSimulationEngine(simulationEngine);
    services.simulationEngine = simulationEngine;

    // 11j.16 MemoryPalace — knowledge connection graph
    const memoryPalace = new MemoryPalace(this.db!, { brainName: 'brain' });
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

    // 11j.17 GoalEngine — autonomous goal setting and tracking
    const goalEngine = new GoalEngine(this.db!, { brainName: 'brain' });
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
      getKnowledgeQuality: () => {
        try { return this.orchestrator!.knowledgeDistiller.getSummary().avgConfidence ?? 0; } catch { return 0; }
      },
      getExperimentCount: () => {
        try { return this.orchestrator!.experimentEngine.list(undefined, 1000).length; } catch { return 0; }
      },
      getConfirmationRate: () => {
        try {
          const summary = this.orchestrator!.hypothesisEngine.getSummary();
          return summary.total > 0 ? summary.confirmed / summary.total : 0;
        } catch { return 0; }
      },
    });
    this.orchestrator.setGoalEngine(goalEngine);
    services.goalEngine = goalEngine;

    // 11j.18 EvolutionEngine — genetic algorithm for parameter optimization
    runEvolutionMigration(this.db!);
    const evolutionEngine = new EvolutionEngine(this.db!, parameterRegistry, { brainName: 'brain' });
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

    // ── Section 11j.19: ReasoningEngine ───────────────────
    const reasoningEngine = new ReasoningEngine(this.db!, { brainName: 'brain' });
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

    // ── Section 11j.20: EmotionalModel ───────────────────
    const emotionalModel = new EmotionalModel(this.db!, { brainName: 'brain' });
    emotionalModel.setThoughtStream(thoughtStream);
    emotionalModel.setDataSources({
      getAutoResponderStatus: () => {
        try {
          const s = this.orchestrator!.autoResponder.getStatus();
          return { totalResponses: s.total_responses, successRate: s.success_rate, recentSeverity: s.recent.map(() => 'medium') };
        } catch { return { totalResponses: 0, successRate: 1, recentSeverity: [] }; }
      },
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
      getMetaTrend: () => {
        try {
          const trends = services.metaCognitionLayer?.getMetaTrend();
          if (!trends || trends.length === 0) return { learningRate: 0.5, discoveryRate: 0.5, direction: 'stable' };
          const latest = trends[trends.length - 1]!;
          const prev = trends.length > 1 ? trends[trends.length - 2]! : latest;
          const direction = latest.learningRate > prev.learningRate ? 'improving' : latest.learningRate < prev.learningRate ? 'declining' : 'stable';
          return { learningRate: latest.learningRate, discoveryRate: latest.discoveryRate, direction };
        } catch { return { learningRate: 0.5, discoveryRate: 0.5, direction: 'stable' }; }
      },
      getReasoningChainCount: () => {
        try { return reasoningEngine.getStatus().chainCount; } catch { return 0; }
      },
      getCreativeHypothesisCount: () => {
        try { return this.orchestrator!.hypothesisEngine.getCreativeStats().total; } catch { return 0; }
      },
      getDebateCount: () => {
        try { return services.debateEngine?.getStatus()?.totalDebates ?? 0; } catch { return 0; }
      },
    });
    this.orchestrator.setEmotionalModel(emotionalModel);
    services.emotionalModel = emotionalModel;

    // ── Section 11j.21: SelfScanner + SelfModificationEngine ───────
    const projectRoot = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), '..', '..', '..', '..');
    const selfScanner = new SelfScanner(this.db!, { brainName: 'brain' });
    this.orchestrator.setSelfScanner(selfScanner);
    services.selfScanner = selfScanner;

    const selfModificationEngine = new SelfModificationEngine(this.db!, {
      brainName: 'brain',
      projectRoot,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    selfModificationEngine.setSelfScanner(selfScanner);
    selfModificationEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setSelfModificationEngine(selfModificationEngine);
    services.selfModificationEngine = selfModificationEngine;

    // 11j.22 ConceptAbstraction — clusters knowledge into abstract concepts
    const conceptAbstraction = new ConceptAbstraction(this.db!, { brainName: 'brain' });
    conceptAbstraction.setThoughtStream(thoughtStream);
    conceptAbstraction.setDataSources({
      getPrinciples: (domain, limit) => this.orchestrator!.knowledgeDistiller.getPrinciples(domain, limit ?? 500),
      getAntiPatterns: (domain, limit) => this.orchestrator!.knowledgeDistiller.getAntiPatterns(domain, limit ?? 500),
      getHypotheses: (status, limit) => this.orchestrator!.hypothesisEngine.list(status as HypothesisStatus, limit ?? 500),
    });
    this.orchestrator.setConceptAbstraction(conceptAbstraction);
    services.conceptAbstraction = conceptAbstraction;

    // 11j.23 BootstrapService — seeds initial data on first cycle to fix cold-start
    const bootstrapService = new BootstrapService(this.db!, {
      brainName: 'brain',
      engineCount: 30,
      mcpToolCount: 134,
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

    services.thoughtStream = thoughtStream;

    // 11j.24 ResearchMissionEngine — autonomous "Research Topic X" → Report
    runMissionMigration(this.db!);
    const missionEngine = new ResearchMissionEngine(this.db!, { brainName: 'brain' });
    missionEngine.setThoughtStream(thoughtStream);
    if (llmService.isAvailable()) {
      missionEngine.setLLMService(llmService);
    }
    if (process.env.BRAVE_SEARCH_API_KEY) {
      missionEngine.setBraveSearch(new BraveSearchAdapter(process.env.BRAVE_SEARCH_API_KEY));
      logger.info('MissionEngine: Brave Search enabled');
    }
    missionEngine.setJinaReader(new JinaReaderAdapter());
    // Advanced web research adapters (optional)
    const playwrightAdapter = new PlaywrightAdapter();
    playwrightAdapter.checkAvailable().then(ok => {
      if (ok) {
        missionEngine.setPlaywrightAdapter(playwrightAdapter);
        logger.info('MissionEngine: Playwright JS-rendering enabled');
      }
    }).catch(() => {});
    if (process.env.FIRECRAWL_API_KEY) {
      missionEngine.setFirecrawlAdapter(new FirecrawlAdapter({ apiKey: process.env.FIRECRAWL_API_KEY }));
      logger.info('MissionEngine: Firecrawl cloud scraping enabled');
    }
    missionEngine.setDataSources({
      knowledgeDistiller: this.orchestrator.knowledgeDistiller,
      hypothesisEngine: this.orchestrator.hypothesisEngine,
      journal: this.orchestrator.journal,
    });
    services.missionEngine = missionEngine;
    this.orchestrator.setMissionEngine(missionEngine);
    logger.info('ResearchMissionEngine activated — "brain missions create <topic>" ready');

    // ── Intelligence Upgrade + Forges + Scanners (extracted to engine-factory.ts) ──
    const intelligenceResult = createIntelligenceEngines({
      db: this.db!, config, services, embeddingEngine: this.embeddingEngine,
      orchestrator: this.orchestrator, researchScheduler, thoughtStream,
      llmService, notifier: this.notifier, goalEngine,
    });
    this.guardrailEngine = intelligenceResult.guardrailEngine;
    this.causalPlanner = intelligenceResult.causalPlanner;
    this.researchRoadmap = intelligenceResult.researchRoadmap;
    this.creativeEngine = intelligenceResult.creativeEngine;
    this.telegramBot = intelligenceResult.telegramBot;
    this.discordBot = intelligenceResult.discordBot;
    this.conversationMemory = intelligenceResult.conversationMemory;
    this.browserAgent = intelligenceResult.browserAgent;
    this.brainBot = intelligenceResult.brainBot;
    const chatEngine = services.chatEngine!;

    // Per-engine token budget tracking
    const tokenBudgetTracker = new EngineTokenBudgetTracker(this.db!, parameterRegistry);
    tokenBudgetTracker.registerDefaults();
    llmService.setTokenBudgetTracker(tokenBudgetTracker);
    if (services.governanceLayer) {
      services.governanceLayer.setTokenBudgetTracker(tokenBudgetTracker);
    }
    services.tokenBudgetTracker = tokenBudgetTracker;
    logger.info('EngineTokenBudgetTracker initialized — per-engine token budgets active');

    // Cycle Outcome Tracking — long-term productive/failed/novelty/efficiency rates
    runCycleOutcomeMigration(this.db!);
    const cycleOutcomeTracker = new CycleOutcomeTracker(this.db!);
    if (services.orchestrator) {
      services.orchestrator.setCycleOutcomeTracker(cycleOutcomeTracker);
    }
    services.cycleOutcomeTracker = cycleOutcomeTracker;
    logger.info('CycleOutcomeTracker initialized — 4-curve cycle metrics active');

    // AutonomousResearchLoop — self-directed web research (opt-in, default: disabled)
    runAutonomousResearchMigration(this.db!);
    const autonomousResearchLoop = new AutonomousResearchLoop(this.db!, { enabled: false });
    autonomousResearchLoop.setThoughtStream(thoughtStream);
    autonomousResearchLoop.setJournal(this.orchestrator.journal);
    autonomousResearchLoop.setSources({
      getCuriosityGaps: (limit) => this.curiosityEngine?.getGaps(limit) ?? [],
      getDesires: () => {
        try {
          const suggestions = this.orchestrator?.selfObserver?.getImprovementPlan() ?? [];
          return suggestions.map((s, i) => ({
            key: s.area ?? `desire_${i}`, suggestion: s.suggestion, priority: s.priority ?? 5,
          }));
        } catch { return []; }
      },
      createMission: (topic, depth) => services.missionEngine!.createMission(topic, depth),
      getMissionStatus: () => {
        const s = services.missionEngine?.getStatus();
        return { activeMissions: s?.activeMissions ?? 0, completedMissions: s?.completedMissions ?? 0, totalMissions: s?.totalMissions ?? 0 };
      },
      observeHypothesis: (obs) => { try { this.orchestrator?.hypothesisEngine?.observe(obs); } catch { /* best effort */ } },
      checkBudget: (engineId) => {
        if (!services.tokenBudgetTracker) return { allowed: true };
        const allBudgets = services.tokenBudgetTracker.getStatus();
        const budget = allBudgets.find(b => b.engineId === engineId);
        return budget ? { allowed: budget.status !== 'exhausted' } : { allowed: true };
      },
    });
    this.autonomousResearchLoop = autonomousResearchLoop;
    services.autonomousResearchLoop = autonomousResearchLoop;
    autonomousResearchLoop.start();
    logger.info('AutonomousResearchLoop initialized — "brain autonomous enable" to activate');

    // 11c. Watchdog — monitoring only (detect peers via PID, run health checks)
    const watchdogConfig = createDefaultWatchdogConfig();
    const watchdog = new WatchdogService(watchdogConfig);
    watchdog.startMonitoring();
    services.watchdog = watchdog;

    // 11d. Plugin Registry (created synchronously, loadAll is async — runs after IPC setup)
    const pluginDir = path.join(config.dataDir, 'plugins');
    this.pluginRegistry = new PluginRegistry(pluginDir);
    services.pluginRegistry = this.pluginRegistry;

    // 11e. Borg Sync Engine — collective knowledge sync (opt-in, default: disabled)
    const borgProvider: BorgDataProvider = {
      getShareableItems: (): SyncItem[] => {
        const items: SyncItem[] = [];
        try {
          const principles = this.orchestrator?.knowledgeDistiller?.getPrinciples(undefined, 100) ?? [];
          for (const p of principles) {
            items.push({ type: 'principle', id: p.id, title: p.statement, content: `${p.domain}: ${p.statement} (source: ${p.source})`, confidence: p.confidence, source: 'brain', createdAt: new Date().toISOString() });
          }
        } catch { /* no principles available */ }
        // Share notable/breakthrough journal entries as insights
        try {
          const entries = this.orchestrator?.journal?.getEntries(undefined, 50) ?? [];
          const notable = entries.filter(e => e.significance === 'notable' || e.significance === 'breakthrough').slice(0, 20);
          for (const e of notable) {
            items.push({ type: 'insight', id: `journal:${e.id ?? e.title.substring(0, 50)}`, title: e.title, content: (e.content ?? '').substring(0, 500), confidence: e.significance === 'breakthrough' ? 0.9 : 0.7, source: 'brain', createdAt: e.created_at ?? new Date().toISOString() });
          }
        } catch { /* no journal available */ }
        return items;
      },
      importItems: (incoming: SyncItem[], source: string): number => {
        logger.info(`[borg] Received ${incoming.length} items from ${source}`);
        // Store as memories for now — brain can process them in future cycles
        let accepted = 0;
        for (const item of incoming) {
          try {
            services.memory?.remember({ key: `borg:${source}:${item.id}`, content: `[${item.type}] ${item.title}: ${item.content}`, category: 'fact', source: 'inferred', tags: ['borg', source] });
            accepted++;
          } catch { /* duplicate or DB error — skip */ }
        }
        return accepted;
      },
    };
    this.borgSync = new BorgSyncEngine('brain', this.crossBrain!, borgProvider, {
      enabled: true, mode: 'selective',
      shareTypes: ['rule', 'insight', 'principle'],
      minConfidence: 0.6, relevanceThreshold: 0.4, syncIntervalMs: 120_000,
    });
    services.borgSync = this.borgSync;

    // 11f. MemoryWatchdog — heap leak detection (5 min samples, 1h window)
    const memoryWatchdog = new MemoryWatchdog();
    memoryWatchdog.start();
    services.memoryWatchdog = memoryWatchdog;

    // 11g. Command Center Dashboard
    this.commandCenter = createCommandCenter({
      services, crossBrain: this.crossBrain!, ecosystemService: this.ecosystemService!,
      correlator: this.correlator!, watchdog, pluginRegistry: this.pluginRegistry!,
      borgSync: this.borgSync!, thoughtStream, debateEngine: this.debateEngine,
    });
    this.commandCenter.start();
    services.commandCenter = this.commandCenter;
    logger.info('Command Center dashboard on :7790');

    // 12. IPC Server
    const router = new IpcRouter(services);
    this.ipcServer = new IpcServer(router, config.ipc.pipeName, 'brain', 'brain');
    this.ipcServer.start();

    // Wire ChatEngine to IPC router for NLU → IPC routing
    chatEngine.setIpcHandler(async (method: string, params?: unknown) => {
      return router.handle(method, params);
    });
    chatEngine.setAvailableRoutes(router.listMethods());

    // Wire local handler so cross-brain self-queries resolve locally
    this.crossBrain!.setLocalHandler((method, params) => router.handle(method, params));

    // Wire subscription manager into IPC router
    router.setSubscriptionManager(this.subscriptionManager, this.ipcServer);

    // Wire BrainBot to IPC dispatch for Discord/Telegram → Brain routing
    if (this.brainBot) {
      this.brainBot.setIpcDispatch(async (route: string, payload?: Record<string, unknown>) => {
        return router.handle(route, payload) as Promise<Record<string, unknown>>;
      });
    }

    // 12c. Plugin Registry — load community plugins (registry created at 11d)
    this.pluginRegistry!.loadAll((name) => ({
      dataDir: path.join(config.dataDir, 'plugins', name),
      log: {
        info: (msg: string) => logger.info(`[plugin:${name}] ${msg}`),
        warn: (msg: string) => logger.warn(`[plugin:${name}] ${msg}`),
        error: (msg: string) => logger.error(`[plugin:${name}] ${msg}`),
        debug: (msg: string) => logger.debug(`[plugin:${name}] ${msg}`),
      },
      callBrain: async (method: string, params?: unknown) => router.handle(method, params),
      notify: async (event: string, data: unknown) => {
        this.crossBrain?.broadcast('cross-brain.notify', { source: `plugin:${name}`, event, data });
      },
    })).then(() => {
      // Register plugin IPC routes dynamically
      for (const route of this.pluginRegistry!.getRoutes()) {
        router.registerMethod(`plugin.${route.plugin}.${route.method}`, route.handler);
      }
      if (this.pluginRegistry!.size > 0) {
        logger.info(`Plugins: ${this.pluginRegistry!.size} loaded, ${this.pluginRegistry!.getRoutes().length} routes, ${this.pluginRegistry!.getTools().length} tools`);
      }
    }).catch((err) => {
      logger.error(`Plugin loading failed: ${(err as Error).message}`);
    });

    // 12d. Wire messaging bots to local IPC + start (optional)
    if (services.messageRouter) {
      // Use local router.handle as IPC dispatch (no need for external client)
      services.messageRouter.setIpcClient({
        request: (method: string, params?: unknown) => router.handle(method, params) as Promise<unknown>,
      });
    }
    if (services.telegramBot?.isConfigured()) {
      services.telegramBot.start().catch(e => logger.warn(`[TelegramBot] Start failed: ${(e as Error).message}`));
    }
    if (services.discordBot?.isConfigured()) {
      services.discordBot.start().catch(e => logger.warn(`[DiscordBot] Start failed: ${(e as Error).message}`));
    }

    // 12e. Start Borg Sync (after IPC/cross-brain ready, respects config.enabled)
    this.borgSync?.start();

    // 12e. PeerNetwork — UDP multicast auto-discovery
    this.peerNetwork = new PeerNetwork({
      brainName: 'brain',
      httpPort: config.api.port,
      packageVersion: '3.36.0',
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

    // 11a. REST API Server
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
          embeddings: this.embeddingEngine !== null,
          ecosystemHealth: this.correlator?.getHealth().score ?? null,
          memoryMB: Math.round(process.memoryUsage().heapUsed / 1048576),
          uptimeSeconds: Math.round(process.uptime()),
          dbSizeMB: (() => { try { return +(fs.statSync(config.dbPath).size / 1048576).toFixed(2); } catch { return null; } })(),
        }),
      });
      this.apiServer.start();
      logger.info(`REST API enabled on port ${config.api.port}`);
    }

    // 11b. MCP HTTP Server (SSE transport for Cursor, Windsurf, Cline, Continue)
    if (config.mcpHttp.enabled) {
      this.mcpHttpServer = new McpHttpServer(config.mcpHttp.port, router);
      this.mcpHttpServer.start();
      logger.info(`MCP HTTP (SSE) enabled on port ${config.mcpHttp.port}`);
    }

    // 12. Terminal cleanup timer
    this.cleanupTimer = setInterval(() => {
      services.terminal.cleanup();
    }, 60_000);

    // 12b. DB retention cleanup + VACUUM (once at start, then every 24h)
    runRetentionHelper(this.db!, config);
    this.retentionTimer = setInterval(() => {
      if (this.db && this.config) runRetentionHelper(this.db, this.config);
    }, 24 * 60 * 60 * 1000);

    // 12c. Conversation Memory periodic maintenance (every 6h)
    this.conversationMemory?.startMaintenanceCycle();

    // 13. Event listeners (synapse wiring)
    setupEventListeners(services, synapseManager, this.notifier, this.correlator, this.orchestrator);

    // 13b. Cross-Brain Event Subscriptions
    setupCrossBrainSubscriptions(this.subscriptionManager, this.correlator, this.orchestrator);

    // 13c. Project Watch — rescan known projects on startup (delayed 5min)
    setTimeout(() => {
      try {
        const projects = projectRepo.getAll();
        const scanner = services.projectScanner;
        if (!scanner || projects.length === 0) return;

        let rescanned = 0;
        for (const proj of projects) {
          if (!proj.path) continue;
          try {
            if (!fs.existsSync(proj.path)) continue;
            scanner.scan(proj.path, proj.name, { skipBuild: true, gitDepth: 50 });
            rescanned++;
          } catch (err) {
            logger.debug(`[project-watch] Rescan failed for ${proj.name}: ${(err as Error).message}`);
          }
        }
        if (rescanned > 0) {
          logger.info(`[project-watch] Startup rescan complete: ${rescanned}/${projects.length} project(s)`);
        }
      } catch (err) {
        logger.debug(`[project-watch] Startup rescan error: ${(err as Error).message}`);
      }
    }, 5 * 60 * 1000);

    // 14. PID file
    const pidPath = path.join(path.dirname(config.dbPath), 'brain.pid');
    fs.writeFileSync(pidPath, String(process.pid));

    // 15. Graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    // 16. Crash recovery — auto-restart on uncaught errors (with loop protection)
    setupCrashRecovery(config, () => this.restart());

    logger.info(`Brain daemon started (PID: ${process.pid})`);
  }

  private logCrash(type: string, err: Error): void {
    logCrashHelper(this.config, type, err);
  }

  private cleanup(): void {
    this.conversationMemory?.stopMaintenanceCycle();
    this.autonomousResearchLoop?.stop();
    cleanupEngines({
      cleanupTimer: this.cleanupTimer, retentionTimer: this.retentionTimer,
      borgSync: this.borgSync, telegramBot: this.telegramBot, discordBot: this.discordBot,
      peerNetwork: this.peerNetwork, pluginRegistry: this.pluginRegistry,
      subscriptionManager: this.subscriptionManager, attentionEngine: this.attentionEngine,
      commandCenter: this.commandCenter, orchestrator: this.orchestrator,
      researchScheduler: this.researchScheduler, researchEngine: this.researchEngine,
      embeddingEngine: this.embeddingEngine, learningEngine: this.learningEngine,
      mcpHttpServer: this.mcpHttpServer, apiServer: this.apiServer,
      ipcServer: this.ipcServer, db: this.db,
    });
    this.cleanupTimer = null;
    this.retentionTimer = null;
    this.db = null;
    this.ipcServer = null;
    this.apiServer = null;
    this.mcpHttpServer = null;
    this.embeddingEngine = null;
    this.learningEngine = null;
    this.researchEngine = null;
    this.orchestrator = null;
    this.commandCenter = null;
    this.narrativeEngine = null;
    this.curiosityEngine = null;
    this.emergenceEngine = null;
    this.guardrailEngine = null;
    this.causalPlanner = null;
    this.researchRoadmap = null;
    this.creativeEngine = null;
    this.subscriptionManager = null;
    this.correlator = null;
    this.ecosystemService = null;
    this.researchScheduler = null;
    this.peerNetwork = null;
    this.pluginRegistry = null;
    this.borgSync = null;
  }

  restart(): void {
    if (this.restarting) return;
    this.restarting = true;

    const logger = getLogger();

    // Rate-limit restarts: max 3 within 60s, then give up
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

    logger.info(`Restarting Brain daemon (attempt ${this.restartCount}/3)...`);

    try { this.cleanup(); } catch { /* best effort cleanup */ }

    // Delay restart to allow OS to release ports
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

    // Remove PID file
    if (this.config) {
      const pidPath = path.join(path.dirname(this.config.dbPath), 'brain.pid');
      try { fs.unlinkSync(pidPath); } catch { /* ignore */ }
    }

    logger.info('Brain daemon stopped');
    // Flush logger before exit, with 2s timeout fallback
    const exitTimeout = setTimeout(() => process.exit(0), 2000);
    logger.on('finish', () => { clearTimeout(exitTimeout); process.exit(0); });
    logger.end();
  }

}
