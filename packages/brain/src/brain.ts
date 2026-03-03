import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import type { BrainConfig } from './types/config.types.js';
import { createLogger, getLogger } from './utils/logger.js';
import { getEventBus } from './utils/events.js';
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
import { CrossBrainClient, CrossBrainNotifier, CrossBrainSubscriptionManager, CrossBrainCorrelator, EcosystemService, WebhookService, ExportService, BackupService, AutonomousResearchScheduler, ResearchOrchestrator, DataMiner, BrainDataMinerAdapter, ScannerDataMinerAdapter, BootstrapService, DreamEngine, ThoughtStream, ConsciousnessServer, PredictionEngine, SignalScanner, CodeMiner, PatternExtractor, ContextBuilder, CodeGenerator, CodegenServer, AttentionEngine, TransferEngine, UnifiedDashboardServer, NarrativeEngine, CuriosityEngine, EmergenceEngine, DebateEngine, ParameterRegistry, MetaCognitionLayer, AutoExperimentEngine, SelfTestEngine, TeachEngine, DataScout, runDataScoutMigration, GitHubTrendingAdapter, NpmStatsAdapter, HackerNewsAdapter, SimulationEngine, runSimulationMigration, MemoryPalace, GoalEngine, EvolutionEngine, runEvolutionMigration, ReasoningEngine, EmotionalModel, SelfScanner, SelfModificationEngine, ConceptAbstraction } from '@timmeck/brain-core';
import type { HypothesisStatus } from '@timmeck/brain-core';
import type { ExperimentStatus } from '@timmeck/brain-core';
import type { AnomalyType } from '@timmeck/brain-core';

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
  private unifiedServer: UnifiedDashboardServer | null = null;
  private narrativeEngine: NarrativeEngine | null = null;
  private curiosityEngine: CuriosityEngine | null = null;
  private emergenceEngine: EmergenceEngine | null = null;
  private debateEngine: DebateEngine | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
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
    services.crossBrain = this.crossBrain ?? undefined;

    // 11. Cross-Brain Client + Notifier
    this.crossBrain = new CrossBrainClient('brain');
    this.notifier = new CrossBrainNotifier(this.crossBrain, 'brain');

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
    const predictionEngine = new PredictionEngine(this.db!, { brainName: 'brain', defaultHorizonMs: 600_000 });
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

    // 11j.11 Meta-Cognition: ParameterRegistry + MetaCognitionLayer + AutoExperimentEngine
    const parameterRegistry = new ParameterRegistry(this.db!);
    parameterRegistry.registerAll([
      // Dream Engine
      { engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.01, max: 0.5, description: 'Synapse prune cutoff weight', category: 'consolidation' },
      { engine: 'dream', name: 'learning_rate', value: 0.15, min: 0.01, max: 0.5, description: 'Dream synapse strengthening rate', category: 'consolidation' },
      { engine: 'dream', name: 'cluster_similarity', value: 0.75, min: 0.5, max: 0.95, description: 'Memory compression similarity threshold', category: 'consolidation' },
      { engine: 'dream', name: 'importance_decay_rate', value: 0.5, min: 0.1, max: 0.9, description: 'Memory importance decay factor', category: 'consolidation' },
      { engine: 'dream', name: 'replay_batch_size', value: 20, min: 5, max: 100, description: 'Memories per replay batch', category: 'consolidation' },
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
          return (summary as { confirmation_rate?: number }).confirmation_rate ?? 0;
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
      version: '3.33.0',
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

    logger.info('Research orchestrator started (30+ engines, feedback loops active, DataMiner bootstrapped, Dream Mode active, Prediction Engine active)');

    // 11k. Signal Scanner — GitHub/HN/Crypto signal tracking
    if (config.scanner.enabled) {
      const signalScanner = new SignalScanner(this.db!, config.scanner);
      this.orchestrator.setSignalScanner(signalScanner);
      signalScanner.start();
      services.signalScanner = signalScanner;
      logger.info(`Signal scanner started (interval: ${config.scanner.scanIntervalMs}ms, token: ${config.scanner.githubToken ? 'yes' : 'NO — set GITHUB_TOKEN'})`);
    }

    // 11l. CodeMiner — mine repo contents from GitHub (needs GITHUB_TOKEN)
    let patternExtractor: PatternExtractor | undefined;
    if (config.scanner.githubToken) {
      const codeMiner = new CodeMiner(this.db!, { githubToken: config.scanner.githubToken });
      patternExtractor = new PatternExtractor(this.db!);
      this.orchestrator.setCodeMiner(codeMiner);
      services.codeMiner = codeMiner;
      services.patternExtractor = patternExtractor;
      void codeMiner.bootstrap();
      logger.info('CodeMiner activated (GITHUB_TOKEN set)');
    }

    // 11m. CodeGenerator — autonomous code generation (needs ANTHROPIC_API_KEY)
    if (process.env.ANTHROPIC_API_KEY) {
      const codeGenerator = new CodeGenerator(this.db!, { brainName: 'brain', apiKey: process.env.ANTHROPIC_API_KEY });
      const contextBuilder = new ContextBuilder(
        this.orchestrator.knowledgeDistiller,
        this.orchestrator.journal,
        patternExtractor ?? null,
        services.signalScanner ?? null,
      );
      codeGenerator.setContextBuilder(contextBuilder);
      codeGenerator.setThoughtStream(thoughtStream);
      this.orchestrator.setCodeGenerator(codeGenerator);
      services.codeGenerator = codeGenerator;

      logger.info('CodeGenerator activated (ANTHROPIC_API_KEY set)');

      // Wire ContextBuilder with SelfScanner into SelfModificationEngine
      if (services.selfModificationEngine && services.selfScanner) {
        const selfmodCtx = new ContextBuilder(
          this.orchestrator.knowledgeDistiller,
          this.orchestrator.journal,
          patternExtractor ?? null,
          services.signalScanner ?? null,
        );
        selfmodCtx.setSelfScanner(services.selfScanner);
        services.selfModificationEngine.setContextBuilder(selfmodCtx);
      }
    }

    // 11n. Unified Dashboard — single Mission Control UI on :7788
    const getNetworkState = () => {
      try {
        const nodes: { id: string; label: string; type: string; importance: number }[] = [];
        const projects = this.db!.prepare('SELECT id, name AS label FROM projects LIMIT 20').all() as { id: number; label: string }[];
        for (const p of projects) nodes.push({ id: `project:${p.id}`, label: p.label, type: 'project', importance: 1.0 });
        const errors = this.db!.prepare('SELECT id, message AS label FROM errors LIMIT 50').all() as { id: number; label: string }[];
        for (const e of errors) nodes.push({ id: `error:${e.id}`, label: e.label.substring(0, 60), type: 'error', importance: 0.8 });
        const solutions = this.db!.prepare('SELECT id, description AS label FROM solutions LIMIT 30').all() as { id: number; label: string }[];
        for (const s of solutions) nodes.push({ id: `solution:${s.id}`, label: s.label.substring(0, 60), type: 'solution', importance: 0.7 });
        const modules = this.db!.prepare('SELECT id, name AS label FROM code_modules ORDER BY reusability_score DESC LIMIT 100').all() as { id: number; label: string }[];
        for (const m of modules) nodes.push({ id: `code_module:${m.id}`, label: m.label, type: 'code_module', importance: 0.5 });
        const insights = this.db!.prepare('SELECT id, title AS label, type FROM insights WHERE active = 1 ORDER BY priority DESC LIMIT 50').all() as { id: number; label: string; type: string }[];
        for (const i of insights) nodes.push({ id: `insight:${i.id}`, label: i.label.substring(0, 60), type: 'insight', importance: 0.6 });
        const memories = this.db!.prepare('SELECT id, content AS label, category AS type, importance FROM memories WHERE active = 1 LIMIT 50').all() as { id: number; label: string; type: string; importance: number }[];
        for (const m of memories) nodes.push({ id: `memory:${m.id}`, label: m.label.substring(0, 60), type: m.type || 'memory', importance: m.importance });
        const edges = this.db!.prepare('SELECT source_type, source_id, target_type, target_id, weight FROM synapses ORDER BY weight DESC LIMIT 500').all() as { source_type: string; source_id: number; target_type: string; target_id: number; weight: number }[];
        const mappedEdges = edges.map(e => ({ source: `${e.source_type}:${e.source_id}`, target: `${e.target_type}:${e.target_id}`, weight: e.weight }));
        return { nodes, edges: mappedEdges };
      } catch { return { nodes: [], edges: [] }; }
    };

    this.unifiedServer = new UnifiedDashboardServer({
      port: 7788,
      thoughtStream,
      getOverview: () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summary = this.orchestrator?.getSummary() as Record<string, any> | undefined;
        const attStatus = this.attentionEngine?.getStatus();
        return {
          healthScore: typeof summary?.feedbackCycles === 'number' ? Math.min(100, 50 + summary.feedbackCycles) : null,
          brains: {
            brain: {
              status: this.db ? 'running' : 'stopped',
              cycle: summary?.feedbackCycles ?? 0,
              principles: summary?.knowledge?.principles ?? 0,
              hypotheses: summary?.hypotheses?.total ?? 0,
              experiments: Array.isArray(summary?.experiments) ? summary.experiments.length : 0,
              focus: attStatus?.currentContext ?? 'unknown',
            },
          },
          transfer: this.transferEngine?.getStatus(),
          attention: attStatus,
        };
      },
      getTransferStatus: () => {
        if (!this.transferEngine) return null;
        const status = this.transferEngine.getStatus();
        return {
          ...status,
          analogies: this.transferEngine.getAnalogies(20),
          rules: this.transferEngine.getRules(),
          history: this.transferEngine.getTransferHistory(30),
          transferScore: this.transferEngine.getTransferScore(),
        };
      },
      getAttentionStatus: () => this.attentionEngine?.getStatus() ?? null,
      getNotifications: () => thoughtStream.getRecent(100).filter(
        (t: { significance?: string }) => t.significance === 'breakthrough' || t.significance === 'notable',
      ),
      onTriggerFeedback: () => { this.orchestrator?.runFeedbackCycle(); },
      getNetworkState,
      getEngineStatus: () => this.orchestrator?.getSummary(),
      codeGenerator: (services.codeGenerator as CodeGenerator) ?? null,
      codeMiner: (services.codeMiner as CodeMiner) ?? null,
      patternExtractor: (patternExtractor as PatternExtractor) ?? null,
      selfModificationEngine: (services.selfModificationEngine as SelfModificationEngine) ?? null,
      getEmotionalStatus: () => (services.emotionalModel as EmotionalModel)?.getMood?.() ?? null,
      onChat: (question: string) => {
        if (!this.narrativeEngine) return { role: 'brain' as const, content: 'NarrativeEngine not available yet.', timestamp: Date.now() };
        try {
          // Store user message as observation (Brain remembers conversations)
          this.orchestrator?.selfObserver?.record({
            event_type: 'user_chat',
            category: 'query_quality',
            metrics: { message: question, source: 'dashboard_chat' },
          });

          const explanation = this.narrativeEngine.explain(question);
          const answer = this.narrativeEngine.ask(question);
          const mood = (services.emotionalModel as EmotionalModel)?.getMood?.();
          const parts: string[] = [];
          if (answer.answer && answer.answer !== 'No relevant knowledge found.') {
            parts.push(answer.answer);
          }
          if (explanation.details.length > 0) {
            parts.push(explanation.details.slice(0, 5).join('\n'));
          }
          if (explanation.confidence > 0) {
            parts.push(`\nConfidence: ${(explanation.confidence * 100).toFixed(0)}%`);
          }
          if (parts.length === 0) {
            parts.push(`I don't have knowledge about "${question}" yet. This is now a research priority.`);
            // Add to research agenda
            this.orchestrator?.researchAgenda?.ask?.(`User asked: "${question}" — investigate and gather data`, 'knowledge_gap');
          }
          if (mood) parts.push(`\n[Mood: ${mood.mood}]`);
          return { role: 'brain' as const, content: parts.join('\n'), timestamp: Date.now(), details: { explanation, answer } };
        } catch (err) {
          return { role: 'brain' as const, content: `Error: ${(err as Error).message}`, timestamp: Date.now() };
        }
      },
      onIngest: (content: string, source: string) => {
        let items = 0;
        // Split content into lines/paragraphs and store as observations
        const lines = content.split(/\n+/).filter(l => l.trim().length > 5);
        for (const line of lines.slice(0, 100)) {
          this.orchestrator?.selfObserver?.record({
            event_type: 'data_ingest',
            category: 'tool_usage',
            metrics: { content: line.trim(), source },
          });
          items++;
        }
        // Also store as journal entry for narrative access
        if (this.orchestrator?.journal) {
          this.orchestrator.journal.recordDiscovery(
            `Data Ingested: ${source}`,
            content.slice(0, 2000),
            { source, items, timestamp: Date.now() },
            'routine',
          );
        }
        // Emit thought about ingestion
        thoughtStream.emit(
          'knowledge_distiller',
          'discovering',
          `Ingested ${items} data points from "${source}"`,
          items > 10 ? 'notable' : 'routine',
        );
        return { stored: true, items };
      },
    });
    this.unifiedServer.start();
    services.unifiedServer = this.unifiedServer;
    logger.info('Unified Mission Control dashboard on :7788');

    // 12. IPC Server
    const router = new IpcRouter(services);
    this.ipcServer = new IpcServer(router, config.ipc.pipeName, 'brain', 'brain');
    this.ipcServer.start();

    // Wire subscription manager into IPC router
    router.setSubscriptionManager(this.subscriptionManager, this.ipcServer);

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

    // 13. Event listeners (synapse wiring)
    this.setupEventListeners(services, synapseManager);

    // 13b. Cross-Brain Event Subscriptions
    this.setupCrossBrainSubscriptions();

    // 14. PID file
    const pidPath = path.join(path.dirname(config.dbPath), 'brain.pid');
    fs.writeFileSync(pidPath, String(process.pid));

    // 15. Graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    // 16. Crash recovery — auto-restart on uncaught errors (with loop protection)
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack });
      this.logCrash('uncaughtException', err);
      // Don't restart on port conflicts — it will just loop
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

    logger.info(`Brain daemon started (PID: ${process.pid})`);
  }

  private logCrash(type: string, err: Error): void {
    if (!this.config) return;
    const crashLog = path.join(path.dirname(this.config.dbPath), 'crashes.log');
    const entry = `[${new Date().toISOString()}] ${type}: ${err.message}\n${err.stack ?? ''}\n\n`;
    try { fs.appendFileSync(crashLog, entry); } catch { /* best effort */ }
  }

  private cleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.subscriptionManager?.disconnectAll();
    this.attentionEngine?.stop();
    this.unifiedServer?.stop();
    this.orchestrator?.stop();
    this.researchScheduler?.stop();
    this.researchEngine?.stop();
    this.embeddingEngine?.stop();
    this.learningEngine?.stop();
    this.mcpHttpServer?.stop();
    this.apiServer?.stop();
    this.ipcServer?.stop();
    this.db?.close();

    this.db = null;
    this.ipcServer = null;
    this.apiServer = null;
    this.mcpHttpServer = null;
    this.embeddingEngine = null;
    this.learningEngine = null;
    this.researchEngine = null;
    this.orchestrator = null;
    this.unifiedServer = null;
    this.narrativeEngine = null;
    this.curiosityEngine = null;
    this.emergenceEngine = null;
    this.subscriptionManager = null;
    this.correlator = null;
    this.ecosystemService = null;
    this.researchScheduler = null;
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
    process.exit(0);
  }

  private setupCrossBrainSubscriptions(): void {
    if (!this.subscriptionManager || !this.correlator) return;
    const logger = getLogger();
    const correlator = this.correlator;

    // Subscribe to trading-brain: trade:completed events for error-trade correlation
    this.subscriptionManager.subscribe('trading-brain', ['trade:completed'], (event: string, data: unknown) => {
      logger.info(`[cross-brain] Received ${event} from trading-brain`, { data });
      correlator.recordEvent('trading-brain', event, data);
      this.orchestrator?.onCrossBrainEvent('trading-brain', event, data as Record<string, unknown>);
    });

    // Subscribe to trading-brain: trade:outcome for win/loss correlation with errors
    this.subscriptionManager.subscribe('trading-brain', ['trade:outcome'], (event: string, data: unknown) => {
      correlator.recordEvent('trading-brain', event, data);
      this.orchestrator?.onCrossBrainEvent('trading-brain', event, data as Record<string, unknown>);
      const d = data as Record<string, unknown> | null;
      if (d && d.win === false) {
        // Check if correlator detected error-trade-loss pattern
        const lossCorrelations = correlator.getCorrelations(0.3)
          .filter(c => c.type === 'error-trade-loss');
        if (lossCorrelations.length > 0) {
          logger.warn(`[cross-brain] Trade loss correlated with recent errors (strength: ${lossCorrelations[0].strength.toFixed(2)})`);
        }
      }
    });

    // Subscribe to marketing-brain: post:published events for project activity tracking
    this.subscriptionManager.subscribe('marketing-brain', ['post:published'], (event: string, data: unknown) => {
      logger.info(`[cross-brain] Received ${event} from marketing-brain`, { data });
      correlator.recordEvent('marketing-brain', event, data);
      this.orchestrator?.onCrossBrainEvent('marketing-brain', event, data as Record<string, unknown>);
    });

    // Subscribe to marketing-brain: campaign:created for ecosystem awareness
    this.subscriptionManager.subscribe('marketing-brain', ['campaign:created'], (event: string, data: unknown) => {
      correlator.recordEvent('marketing-brain', event, data);
      this.orchestrator?.onCrossBrainEvent('marketing-brain', event, data as Record<string, unknown>);
    });
  }

  private setupEventListeners(services: Services, synapseManager: SynapseManager): void {
    const bus = getEventBus();
    const notifier = this.notifier;
    const webhook = services.webhook;
    const causal = services.causal;
    const hypothesis = services.hypothesis;
    const orch = this.orchestrator;

    // Error → Project synapse + notify peers + feed correlator + webhooks + causal + hypothesis + orchestrator + prediction
    bus.on('error:reported', ({ errorId, projectId }) => {
      synapseManager.strengthen(
        { type: 'error', id: errorId },
        { type: 'project', id: projectId },
        'co_occurs',
      );
      notifier?.notify('error:reported', { errorId, projectId });
      this.correlator?.recordEvent('brain', 'error:reported', { errorId, projectId });
      webhook?.fire('error:reported', { errorId, projectId });
      causal?.recordEvent('brain', 'error:reported', { errorId, projectId });
      hypothesis?.observe({ source: 'brain', type: 'error:reported', value: 1, timestamp: Date.now() });
      orch?.onEvent('error:reported', { errorId, projectId });
      services.predictionEngine?.recordMetric('error_count', 1, 'error');
    });

    // Solution applied → strengthen or weaken
    bus.on('solution:applied', ({ errorId, solutionId, success }) => {
      if (success) {
        synapseManager.strengthen(
          { type: 'solution', id: solutionId },
          { type: 'error', id: errorId },
          'solves',
        );
      } else {
        const synapse = synapseManager.find(
          { type: 'solution', id: solutionId },
          { type: 'error', id: errorId },
          'solves',
        );
        if (synapse) synapseManager.weaken(synapse.id, 0.7);
      }
    });

    // Module registered → link to project
    bus.on('module:registered', ({ moduleId, projectId }) => {
      synapseManager.strengthen(
        { type: 'code_module', id: moduleId },
        { type: 'project', id: projectId },
        'co_occurs',
      );
    });

    // Rule learned → log + causal + hypothesis
    bus.on('rule:learned', ({ ruleId, pattern }) => {
      getLogger().info(`New rule #${ruleId} learned: ${pattern}`);
      causal?.recordEvent('brain', 'rule:learned', { ruleId, pattern });
      hypothesis?.observe({ source: 'brain', type: 'rule:learned', value: 1, timestamp: Date.now() });
      orch?.onEvent('rule:learned', { ruleId });
    });

    // Insight created → log + notify marketing (content opportunity) + feed correlator + webhooks + causal + hypothesis
    bus.on('insight:created', ({ insightId, type }) => {
      getLogger().info(`New insight #${insightId} (${type})`);
      notifier?.notifyPeer('marketing-brain', 'insight:created', { insightId, type });
      this.correlator?.recordEvent('brain', 'insight:created', { insightId, type });
      webhook?.fire('insight:created', { insightId, type });
      causal?.recordEvent('brain', 'insight:created', { insightId, type });
      hypothesis?.observe({ source: 'brain', type: 'insight:created', value: 1, timestamp: Date.now() });
      orch?.onEvent('insight:created', { insightId, type });
    });

    // Solution applied → orchestrator + prediction
    bus.on('solution:applied', ({ errorId, solutionId, success }) => {
      orch?.onEvent('solution:applied', { errorId, solutionId, success: success ? 1 : 0 });
      services.predictionEngine?.recordMetric('resolution_success', success ? 1 : 0, 'error');
    });

    // Memory → Project synapse
    bus.on('memory:created', ({ memoryId, projectId }) => {
      if (projectId) {
        synapseManager.strengthen(
          { type: 'memory', id: memoryId },
          { type: 'project', id: projectId },
          'co_occurs',
        );
      }
    });

    // Session → Project synapse
    bus.on('session:ended', ({ sessionId }) => {
      getLogger().info(`Session #${sessionId} ended`);
    });

    // Decision → Project synapse
    bus.on('decision:recorded', ({ decisionId, projectId }) => {
      if (projectId) {
        synapseManager.strengthen(
          { type: 'decision', id: decisionId },
          { type: 'project', id: projectId },
          'co_occurs',
        );
      }
    });

    // Task created → log
    bus.on('task:created', ({ taskId }) => {
      getLogger().info(`Task #${taskId} created`);
    });

    // Task completed → log
    bus.on('task:completed', ({ taskId }) => {
      getLogger().info(`Task #${taskId} completed`);
    });
  }
}
