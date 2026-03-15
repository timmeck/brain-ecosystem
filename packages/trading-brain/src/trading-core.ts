import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import type { TradingBrainConfig } from './types/config.types.js';
import { createLogger, getLogger } from './utils/logger.js';
import { getEventBus } from './utils/events.js';
import { getCurrentVersion } from './cli/update-check.js';
import { createConnection } from '@timmeck/brain-core';
import { runMigrations } from './db/migrations/index.js';

// Repositories
import { TradeRepository } from './db/repositories/trade.repository.js';
import { SignalRepository } from './db/repositories/signal.repository.js';
import { SynapseRepository } from './db/repositories/synapse.repository.js';
import { GraphRepository } from './db/repositories/graph.repository.js';
import { RuleRepository } from './db/repositories/rule.repository.js';
import { ChainRepository } from './db/repositories/chain.repository.js';
import { InsightRepository } from './db/repositories/insight.repository.js';
import { CalibrationRepository } from './db/repositories/calibration.repository.js';
import { MemoryRepository } from './db/repositories/memory.repository.js';
import { SessionRepository } from './db/repositories/session.repository.js';
import { AlertRepository } from './db/repositories/alert.repository.js';

// Graph
import { WeightedGraph } from './graph/weighted-graph.js';

// Synapses
import { SynapseManager } from './synapses/synapse-manager.js';

// Services
import { TradeService } from './services/trade.service.js';
import { SignalService } from './services/signal.service.js';
import { StrategyService } from './services/strategy.service.js';
import { SynapseService } from './services/synapse.service.js';
import { AnalyticsService } from './services/analytics.service.js';
import { InsightService } from './services/insight.service.js';
import { MemoryService } from './services/memory.service.js';
import { BacktestService } from './services/backtest.service.js';
import { RiskService } from './services/risk.service.js';
import { AlertService } from './services/alert.service.js';
import { ImportService } from './services/import.service.js';

// Engines
import { LearningEngine } from './learning/learning-engine.js';
import { ResearchEngine } from './research/research-engine.js';
import { PaperEngine } from './paper/paper-engine.js';
import { PaperService } from './paper/paper.service.js';
import { PaperRepository } from './db/repositories/paper.repository.js';
import { PortfolioOptimizer } from './paper/portfolio-optimizer.js';
import { createIntelligenceEngines } from './init/engine-factory.js';

// Market Data
import { MarketDataService } from './market/market-data-service.js';
import { CoinGeckoProvider } from './market/coingecko-provider.js';
import { YahooProvider } from './market/yahoo-provider.js';
import { CCXTProvider } from './market/ccxt-provider.js';

// IPC
import { IpcRouter, type Services } from './ipc/router.js';
import { IpcServer } from '@timmeck/brain-core';

// API & MCP HTTP
import { ApiServer } from './api/server.js';
import { McpHttpServer } from './mcp/http-server.js';

// Cross-Brain
import { CrossBrainClient, CrossBrainNotifier, CrossBrainSubscriptionManager, CrossBrainCorrelator, WebhookService, ExportService, BackupService, AutonomousResearchScheduler, ResearchOrchestrator, DataMiner, TradingDataMinerAdapter, BootstrapService, DreamEngine, ThoughtStream, PredictionEngine, AttentionEngine, TransferEngine, NarrativeEngine, CuriosityEngine, EmergenceEngine, DebateEngine, ParameterRegistry, MetaCognitionLayer, AutoExperimentEngine, SelfTestEngine, TeachEngine, DataScout, runDataScoutMigration, GitHubTrendingAdapter, NpmStatsAdapter, HackerNewsAdapter, SimulationEngine, runSimulationMigration, MemoryPalace, GoalEngine, EvolutionEngine, runEvolutionMigration, ReasoningEngine, EmotionalModel, SelfScanner, SelfModificationEngine, ConceptAbstraction, PeerNetwork, LLMService, OllamaProvider, BorgSyncEngine, MemoryWatchdog, AdaptiveScheduler } from '@timmeck/brain-core';
import type { BorgDataProvider, SyncItem, HypothesisStatus, ExperimentStatus, AnomalyType } from '@timmeck/brain-core';

export class TradingCore {
  private db: Database.Database | null = null;
  private ipcServer: IpcServer | null = null;
  private apiServer: ApiServer | null = null;
  private mcpHttpServer: McpHttpServer | null = null;
  private learningEngine: LearningEngine | null = null;
  private researchEngine: ResearchEngine | null = null;
  private paperEngine: PaperEngine | null = null;
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
  private borgSync: BorgSyncEngine | null = null;
  private retentionTimer: ReturnType<typeof setInterval> | null = null;
  private config: TradingBrainConfig | null = null;
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
    const tradeRepo = new TradeRepository(this.db);
    const signalRepo = new SignalRepository(this.db);
    const synapseRepo = new SynapseRepository(this.db);
    const graphRepo = new GraphRepository(this.db);
    const ruleRepo = new RuleRepository(this.db);
    const chainRepo = new ChainRepository(this.db);
    const insightRepo = new InsightRepository(this.db);
    const calibrationRepo = new CalibrationRepository(this.db);
    const memoryRepo = new MemoryRepository(this.db);
    const sessionRepo = new SessionRepository(this.db);
    const alertRepo = new AlertRepository(this.db);

    // 6. Synapse Manager
    const synapseManager = new SynapseManager(synapseRepo, config.calibration);

    // 7. Weighted Graph (load from DB)
    const graph = new WeightedGraph();
    const graphNodes = graphRepo.getAllNodes();
    for (const node of graphNodes) {
      graph.addNode(node.id, node.type, node.label);
    }
    const graphEdges = graphRepo.getAllEdges();
    for (const edge of graphEdges) {
      graph.addEdge(edge.source, edge.target, edge.weight);
    }
    logger.info(`Graph loaded: ${graphNodes.length} nodes, ${graphEdges.length} edges`);

    // 8. Calibration (load current or use defaults)
    const cal = calibrationRepo.get() ?? config.calibration;
    const tradeCount = () => tradeRepo.count();

    // 9. Services
    const memoryService = new MemoryService(memoryRepo, sessionRepo);
    const tradeService = new TradeService(tradeRepo, signalRepo, chainRepo, synapseManager, graph, cal, config.learning);
    const signalService = new SignalService(synapseManager, graph, cal, tradeCount, ruleRepo, tradeRepo);
    const services: Services = {
      trade: tradeService,
      signal: signalService,
      strategy: new StrategyService(synapseManager, graph, cal, tradeCount),
      synapse: new SynapseService(synapseManager, graph),
      analytics: new AnalyticsService(tradeRepo, ruleRepo, chainRepo, insightRepo, synapseManager, graph, memoryRepo, sessionRepo),
      insight: new InsightService(insightRepo),
      memory: memoryService,
      backtest: new BacktestService(tradeRepo, signalService, synapseManager),
      risk: new RiskService(tradeRepo, signalService, synapseManager),
      alert: new AlertService(alertRepo, signalService),
      import: new ImportService(tradeService),
      ruleRepo,
      chainRepo,
      calRepo: calibrationRepo,
    };

    // 10. Learning Engine
    this.learningEngine = new LearningEngine(
      config.learning,
      cal,
      tradeRepo,
      ruleRepo,
      chainRepo,
      calibrationRepo,
      synapseManager,
      graph,
    );
    this.learningEngine.start();
    logger.info(`Learning engine started (interval: ${config.learning.intervalMs}ms)`);

    // 11. Research Engine
    this.researchEngine = new ResearchEngine(
      config.research,
      tradeRepo,
      insightRepo,
    );
    this.researchEngine.start();
    logger.info(`Research engine started (interval: ${config.research.intervalMs}ms)`);

    // Paper Trading Engine
    const paperRepo = new PaperRepository(this.db);
    this.paperEngine = new PaperEngine(config.paper, tradeService, signalService, paperRepo);
    this.paperEngine.start();
    const paperService = new PaperService(this.paperEngine, paperRepo, config.paper);
    services.paper = paperService;
    if (config.paper.enabled) {
      logger.info(`Paper trading engine started (interval: ${config.paper.intervalMs}ms)`);
    }

    // Market Data Service
    const marketDataService = new MarketDataService();
    marketDataService.registerProvider(new CoinGeckoProvider());
    marketDataService.registerProvider(new YahooProvider());
    services.marketData = marketDataService;
    logger.info('MarketDataService initialized (CoinGecko + Yahoo)');

    // CCXT WebSocket Provider (optional — graceful if ccxt not installed)
    const ccxtProvider = new CCXTProvider();
    ccxtProvider.isAvailable().then(ok => {
      if (ok) {
        marketDataService.registerProvider(ccxtProvider);
        logger.info(`CCXT provider registered (${ccxtProvider.name})`);
        // Auto-start WebSocket streaming for all tracked crypto symbols
        marketDataService.startStreaming(config.paper.cryptoIds).catch(err => {
          logger.debug(`[MarketData] Streaming auto-connect skipped: ${(err as Error).message}`);
        });
      }
    }).catch(() => { /* CCXT not installed — REST fallback stays */ });

    // Expose engines + cross-brain to IPC
    services.learning = this.learningEngine;
    services.research = this.researchEngine;
    // 12. Cross-Brain Client + Notifier
    this.crossBrain = new CrossBrainClient('trading-brain');
    this.notifier = new CrossBrainNotifier(this.crossBrain, 'trading-brain');
    this.paperEngine.setNotifier(this.notifier);
    services.crossBrain = this.crossBrain;

    // 12b. Cross-Brain Correlator
    this.correlator = new CrossBrainCorrelator();

    // 12c. Cross-Brain Subscription Manager
    this.subscriptionManager = new CrossBrainSubscriptionManager('trading-brain');

    // 12b. Webhook, Export, Backup services
    services.webhook = new WebhookService(this.db!);
    services.export = new ExportService(this.db!);
    services.backup = new BackupService(this.db!, config.dbPath);

    // 12c. Autonomous Research Scheduler (Meta-Learning + Causal Inference + Hypothesis)
    const researchScheduler = new AutonomousResearchScheduler(this.db!, {
      brainName: 'trading-brain',
      hyperParams: [
        { name: 'learningRate', value: 0.1, min: 0.01, max: 0.5, step: 0.02 },
        { name: 'decayRate', value: 0.05, min: 0.01, max: 0.2, step: 0.01 },
        { name: 'confidenceThreshold', value: 0.3, min: 0.1, max: 0.9, step: 0.05 },
      ],
    });
    researchScheduler.start();
    services.researchScheduler = researchScheduler;
    services.metaLearning = researchScheduler.metaLearning;
    services.causal = researchScheduler.causalGraph;
    services.hypothesis = researchScheduler.hypothesisEngine;
    logger.info('Autonomous research scheduler started');

    // 12d. Research Orchestrator (feedback loops between all research engines)
    this.orchestrator = new ResearchOrchestrator(this.db!, {
      brainName: 'trading-brain',
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

    // 12e. DataMiner — bootstrap historical data into research engines
    const dataMiner = new DataMiner(this.db!, new TradingDataMinerAdapter(), {
      selfObserver: this.orchestrator.selfObserver,
      anomalyDetective: this.orchestrator.anomalyDetective,
      crossDomain: this.orchestrator.crossDomain,
      causalGraph: researchScheduler.causalGraph,
      hypothesisEngine: researchScheduler.hypothesisEngine,
    });
    this.orchestrator.setDataMiner(dataMiner);
    dataMiner.bootstrap();

    // 12f. Dream Engine — offline memory consolidation
    const dreamEngine = new DreamEngine(this.db!, {
      brainName: 'trading-brain',
      replayBatchSize: 15,
      clusterSimilarityThreshold: 0.80,
    });
    this.orchestrator.setDreamEngine(dreamEngine);
    dreamEngine.start();
    services.dreamEngine = dreamEngine;

    // 12g. Prediction Engine — Proactive Forecasting (2h horizon for trades)
    const predictionEngine = new PredictionEngine(this.db!, {
      brainName: 'trading-brain',
      defaultHorizonMs: 1_200_000,
    });
    this.orchestrator.setPredictionEngine(predictionEngine);
    predictionEngine.start();
    services.predictionEngine = predictionEngine;

    // 12h. Consciousness — ThoughtStream + Dashboard
    const thoughtStream = new ThoughtStream();
    this.orchestrator.setThoughtStream(thoughtStream);
    dreamEngine.setThoughtStream(thoughtStream);
    predictionEngine.setThoughtStream(thoughtStream);
    // ConsciousnessServer removed — unified dashboard serves all UIs
    services.thoughtStream = thoughtStream;

    // 12i. Attention Engine
    this.attentionEngine = new AttentionEngine(this.db!, { brainName: 'trading-brain' });
    this.attentionEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setAttentionEngine(this.attentionEngine);
    services.attentionEngine = this.attentionEngine;

    // 12j. Transfer Engine — cross-domain knowledge transfer
    this.transferEngine = new TransferEngine(this.db!, { brainName: 'trading-brain' });
    this.transferEngine.setThoughtStream(thoughtStream);
    this.transferEngine.seedDefaultRules();
    this.orchestrator.setTransferEngine(this.transferEngine);
    services.transferEngine = this.transferEngine;

    // 12j.6b LLMService — multi-provider (Anthropic Cloud + optional Ollama local)
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

    // 12k. Narrative Engine — natural language explanations of Brain knowledge
    this.narrativeEngine = new NarrativeEngine(this.db!, { brainName: 'trading-brain' });
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
    this.curiosityEngine = new CuriosityEngine(this.db!, { brainName: 'trading-brain', gapThreshold: 0.3 });
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
    this.emergenceEngine = new EmergenceEngine(this.db!, { brainName: 'trading-brain' });
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
    const debateEngine = new DebateEngine(this.db!, { brainName: 'trading-brain', domainDescription: 'trading signals and market intelligence' });
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

    // Re-propagate LLM to engines registered after initial setLLMService call
    if (llmService.isAvailable()) {
      this.orchestrator.setLLMService(llmService);
    }

    // 11j.11 Meta-Cognition: ParameterRegistry + MetaCognitionLayer + AutoExperimentEngine
    const parameterRegistry = new ParameterRegistry(this.db!);
    parameterRegistry.registerAll([
      { engine: 'dream', name: 'prune_threshold', value: 0.15, min: 0.01, max: 0.5, description: 'Synapse prune cutoff weight', category: 'consolidation' },
      { engine: 'dream', name: 'learning_rate', value: 0.15, min: 0.01, max: 0.5, description: 'Dream synapse strengthening rate', category: 'consolidation' },
      { engine: 'dream', name: 'cluster_similarity', value: 0.80, min: 0.5, max: 0.95, description: 'Memory compression similarity threshold', category: 'consolidation' },
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
    services.governanceLayer?.setMetaCognitionLayer(metaCognitionLayer);

    const adaptiveScheduler = new AdaptiveScheduler();
    this.orchestrator.setAdaptiveScheduler(adaptiveScheduler);

    const autoExperimentEngine = new AutoExperimentEngine(
      this.db!, parameterRegistry, this.orchestrator.experimentEngine,
      this.orchestrator.selfObserver, metaCognitionLayer,
    );
    autoExperimentEngine.setPredictionEngine(predictionEngine);
    this.orchestrator.setAutoExperimentEngine(autoExperimentEngine);
    services.autoExperimentEngine = autoExperimentEngine;

    // 12n. SelfTestEngine — validates Brain's own understanding
    const selfTestEngine = new SelfTestEngine(this.db!);
    selfTestEngine.setKnowledgeDistiller(this.orchestrator.knowledgeDistiller);
    selfTestEngine.setPredictionEngine(predictionEngine);
    selfTestEngine.setHypothesisEngine(researchScheduler.hypothesisEngine);
    selfTestEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setSelfTestEngine(selfTestEngine);
    services.selfTestEngine = selfTestEngine;

    // 12o. TeachEngine — packages knowledge for other brains
    const teachEngine = new TeachEngine(this.db!);
    teachEngine.setKnowledgeDistiller(this.orchestrator.knowledgeDistiller);
    teachEngine.setHypothesisEngine(researchScheduler.hypothesisEngine);
    teachEngine.setJournal(this.orchestrator.journal);
    teachEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setTeachEngine(teachEngine);
    services.teachEngine = teachEngine;

    // 12p. DataScout — discovers external data sources
    runDataScoutMigration(this.db!);
    const dataScout = new DataScout(this.db!);
    dataScout.addAdapter(new GitHubTrendingAdapter());
    dataScout.addAdapter(new NpmStatsAdapter());
    dataScout.addAdapter(new HackerNewsAdapter());
    dataScout.setThoughtStream(thoughtStream);
    this.orchestrator.setDataScout(dataScout);
    dataScout.startPeriodicScan(6 * 3600 * 1000);  // every 6h
    services.dataScout = dataScout;

    // 12q. SimulationEngine — what-if scenario simulations
    runSimulationMigration(this.db!);
    const simulationEngine = new SimulationEngine(this.db!);
    simulationEngine.setPredictionEngine(predictionEngine);
    simulationEngine.setCausalGraph(researchScheduler.causalGraph);
    simulationEngine.setMetaCognitionLayer(metaCognitionLayer);
    simulationEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setSimulationEngine(simulationEngine);
    services.simulationEngine = simulationEngine;

    // 12r. MemoryPalace — knowledge connection graph
    const memoryPalace = new MemoryPalace(this.db!, { brainName: 'trading-brain' });
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

    // 12s. GoalEngine — autonomous goal setting and tracking
    const goalEngine = new GoalEngine(this.db!, { brainName: 'trading-brain' });
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

    // 12t. EvolutionEngine — genetic algorithm for parameter optimization
    runEvolutionMigration(this.db!);
    const evolutionEngine = new EvolutionEngine(this.db!, parameterRegistry, { brainName: 'trading-brain' });
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
    const reasoningEngine = new ReasoningEngine(this.db!, { brainName: 'trading-brain' });
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
    const emotionalModel = new EmotionalModel(this.db!, { brainName: 'trading-brain' });
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
    const selfScanner = new SelfScanner(this.db!, { brainName: 'trading-brain' });
    this.orchestrator.setSelfScanner(selfScanner);
    services.selfScanner = selfScanner;

    const selfModificationEngine = new SelfModificationEngine(this.db!, {
      brainName: 'trading-brain',
      projectRoot,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    selfModificationEngine.setSelfScanner(selfScanner);
    selfModificationEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setSelfModificationEngine(selfModificationEngine);
    services.selfModificationEngine = selfModificationEngine;

    // ConceptAbstraction — clusters knowledge into abstract concepts
    const conceptAbstraction = new ConceptAbstraction(this.db!, { brainName: 'trading-brain' });
    conceptAbstraction.setThoughtStream(thoughtStream);
    conceptAbstraction.setDataSources({
      getPrinciples: (domain, limit) => this.orchestrator!.knowledgeDistiller.getPrinciples(domain, limit ?? 500),
      getAntiPatterns: (domain, limit) => this.orchestrator!.knowledgeDistiller.getAntiPatterns(domain, limit ?? 500),
      getHypotheses: (status, limit) => this.orchestrator!.hypothesisEngine.list(status as HypothesisStatus, limit ?? 500),
    });
    this.orchestrator.setConceptAbstraction(conceptAbstraction);
    services.conceptAbstraction = conceptAbstraction;

    // 12e.2 BootstrapService — seeds initial data on first cycle to fix cold-start
    const bootstrapService = new BootstrapService(this.db!, {
      brainName: 'trading-brain',
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

    // ── Intelligence Upgrade (Sessions 55-76) — extracted to init/engine-factory.ts ──
    createIntelligenceEngines({
      db: this.db!, services, orchestrator: this.orchestrator,
      researchScheduler, thoughtStream, llmService, goalEngine,
      parameterRegistry, paperEngine: this.paperEngine, notifier: this.notifier,
    });
    logger.info('Research orchestrator started (40+ engines, feedback loops active, DataMiner bootstrapped, Dream Mode active, Prediction Engine active)');

    // 12e. Borg Sync Engine — collective knowledge sync (opt-in, default: disabled)
    const borgProvider: BorgDataProvider = {
      getShareableItems: (): SyncItem[] => {
        const items: SyncItem[] = [];
        try {
          for (const r of services.ruleRepo.getAll().slice(0, 100)) {
            items.push({ type: 'rule', id: `rule-${r.id}`, title: r.pattern, content: `Trading rule: ${r.pattern} (win_rate: ${r.win_rate}, avg_profit: ${r.avg_profit})`, confidence: r.confidence, source: 'trading-brain', createdAt: r.created_at });
          }
        } catch (err) { logger.debug(`[borg] Failed to load rules: ${(err as Error).message}`); }
        try {
          for (const i of services.insight.getRecent(50)) {
            items.push({ type: 'insight', id: `insight-${i.id}`, title: i.title, content: i.description, confidence: 0.7, source: 'trading-brain', createdAt: i.created_at });
          }
        } catch (err) { logger.debug(`[borg] Failed to load insights: ${(err as Error).message}`); }
        return items;
      },
      importItems: (incoming: SyncItem[], source: string): number => {
        logger.info(`[borg] Received ${incoming.length} items from ${source}`);
        let accepted = 0;
        for (const item of incoming) {
          try {
            services.memory.remember({ key: `borg:${source}:${item.id}`, content: `[${item.type}] ${item.title}: ${item.content}`, category: 'fact', source: 'inferred', tags: ['borg', source] });
            accepted++;
          } catch (err) { logger.debug(`[borg] Import item failed: ${(err as Error).message}`); }
        }
        return accepted;
      },
    };
    this.borgSync = new BorgSyncEngine('trading-brain', this.crossBrain!, borgProvider, {
      enabled: true, mode: 'selective',
      shareTypes: ['rule', 'insight', 'principle'],
      minConfidence: 0.6, relevanceThreshold: 0.4, syncIntervalMs: 120_000,
    });
    services.borgSync = this.borgSync;

    // 12b. MemoryWatchdog — heap leak detection (5 min samples, 1h window)
    const memoryWatchdog = new MemoryWatchdog();
    memoryWatchdog.start();
    services.memoryWatchdog = memoryWatchdog;

    // 13. IPC Server
    const router = new IpcRouter(services);
    this.ipcServer = new IpcServer(router, config.ipc.pipeName, 'trading-brain', 'trading-brain');
    this.ipcServer.start();

    // Wire local handler so cross-brain self-queries resolve locally
    this.crossBrain!.setLocalHandler((method, params) => router.handle(method, params));

    // Wire subscription manager into IPC router
    router.setSubscriptionManager(this.subscriptionManager, this.ipcServer);

    // 13a. Start Borg Sync (after IPC ready)
    this.borgSync.start();

    // 13b. PeerNetwork — UDP multicast auto-discovery
    this.peerNetwork = new PeerNetwork({
      brainName: 'trading-brain',
      httpPort: config.api.port,
      packageVersion: '2.31.0',
      getKnowledgeSummary: () => {
        try {
          const p = this.orchestrator?.knowledgeDistiller?.getPrinciples(undefined, 1000) ?? [];
          const h = this.orchestrator?.hypothesisEngine?.list(undefined, 1000) ?? [];
          const e = this.orchestrator?.experimentEngine?.list(undefined, 1000) ?? [];
          return { principles: p.length, hypotheses: h.length, experiments: e.length };
        } catch (err) { logger.debug(`[peer-network] Knowledge summary failed: ${(err as Error).message}`); return { principles: 0, hypotheses: 0, experiments: 0 }; }
      },
    });
    this.peerNetwork.onPeerDiscovered((peer) => {
      logger.info(`[peer-network] Discovered peer: ${peer.name} (v${peer.packageVersion})`);
      this.crossBrain?.addPeer({ name: peer.name, pipeName: peer.pipeName });

      // Register peer's knowledge as a remote distiller for cross-brain transfers
      if (this.transferEngine && this.crossBrain) {
        const crossBrain = this.crossBrain;
        const peerName = peer.name;
        const remoteDistiller = {
          getPrinciples: (_domain?: string, limit = 50) => {
            if (!remoteDistiller._principleCache) return [];
            return remoteDistiller._principleCache.slice(0, limit);
          },
          getAntiPatterns: (_domain?: string, limit = 50) => {
            if (!remoteDistiller._antiPatternCache) return [];
            return remoteDistiller._antiPatternCache.slice(0, limit);
          },
          _principleCache: [] as Array<{ id: string; domain: string; statement: string; success_rate: number; sample_size: number; confidence: number; source: string }>,
          _antiPatternCache: [] as Array<{ id: string; domain: string; statement: string; failure_rate: number; sample_size: number; confidence: number; source: string }>,
          _refreshInterval: null as ReturnType<typeof setInterval> | null,
          refresh: async () => {
            try {
              const principles = await crossBrain.query(peerName, 'knowledge.principles', { limit: 50 });
              if (Array.isArray(principles)) remoteDistiller._principleCache = principles;
              const antiPatterns = await crossBrain.query(peerName, 'knowledge.antipatterns', { limit: 50 });
              if (Array.isArray(antiPatterns)) remoteDistiller._antiPatternCache = antiPatterns;
            } catch { /* peer may be unreachable */ }
          },
        };
        remoteDistiller.refresh();
        remoteDistiller._refreshInterval = setInterval(() => remoteDistiller.refresh(), 120_000);
        this.transferEngine.registerPeerDistiller(peerName, remoteDistiller as unknown as import('@timmeck/brain-core').KnowledgeDistiller);
        logger.info(`[peer-network] Registered remote distiller for ${peerName} → TransferEngine`);
      }
    });
    this.peerNetwork.onPeerLost((peer) => {
      logger.warn(`[peer-network] Lost peer: ${peer.name}`);
      this.crossBrain?.removePeer(peer.name);
    });
    this.peerNetwork.startDiscovery();
    services.peerNetwork = this.peerNetwork;

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
          memoryMB: Math.round(process.memoryUsage().heapUsed / 1048576),
          uptimeSeconds: Math.round(process.uptime()),
          dbSizeMB: (() => { try { return +(fs.statSync(config.dbPath).size / 1048576).toFixed(2); } catch { return null; } })(),
        }),
      });
      this.apiServer.start();
      logger.info(`REST API enabled on port ${config.api.port}`);
    }

    // 14. MCP HTTP Server (SSE transport for Cursor, Windsurf, Cline, Continue)
    if (config.mcpHttp.enabled) {
      this.mcpHttpServer = new McpHttpServer(config.mcpHttp.port, router);
      this.mcpHttpServer.start();
      logger.info(`MCP HTTP (SSE) enabled on port ${config.mcpHttp.port}`);
    }

    // 14b. DB retention cleanup + optimize (once at start, then every 24h)
    this.runRetentionCleanup(this.db!);
    this.retentionTimer = setInterval(() => { if (this.db) this.runRetentionCleanup(this.db); }, 24 * 60 * 60 * 1000);

    // 15. Event listeners (synapse wiring)
    this.setupEventListeners(synapseManager, services.webhook, researchScheduler, predictionEngine);

    // 15b. Cross-Brain Event Subscriptions
    this.setupCrossBrainSubscriptions();

    // 16. PID file
    const pidPath = path.join(path.dirname(config.dbPath), 'trading-brain.pid');
    fs.writeFileSync(pidPath, String(process.pid));

    // 17. Graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    // 18. Crash recovery (with loop protection)
    process.on('uncaughtException', (err) => {
      // EPIPE = writing to closed stdout/stderr (daemon mode) — ignore silently
      if ((err as NodeJS.ErrnoException).code === 'EPIPE') return;
      try { logger.error('Uncaught exception', { error: err.message, stack: err.stack }); } catch { /* logger may be broken — cannot log */ }
      this.logCrash('uncaughtException', err);
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        try { logger.error('Port conflict during restart — stopping to prevent crash loop'); } catch { /* logger may be broken — cannot log */ }
        return;
      }
      this.restart();
    });
    process.on('unhandledRejection', (reason) => {
      try { logger.error('Unhandled rejection', { reason: String(reason) }); } catch { /* logger may be broken — cannot log */ }
      this.logCrash('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
      this.restart();
    });

    logger.info(`Trading Brain daemon started (PID: ${process.pid})`);
  }

  private logCrash(type: string, err: Error): void {
    if (!this.config) return;
    const crashLog = path.join(path.dirname(this.config.dbPath), 'crashes.log');
    const entry = `[${new Date().toISOString()}] ${type}: ${err.message}\n${err.stack ?? ''}\n\n`;
    try {
      // Rotate crash log if > 5MB (max 1 rotation = 10MB total)
      try {
        const stat = fs.statSync(crashLog);
        if (stat.size > 5 * 1024 * 1024) {
          const rotated = crashLog.replace('.log', '.1.log');
          try { fs.unlinkSync(rotated); } catch { /* no previous rotation — safe to ignore */ }
          fs.renameSync(crashLog, rotated);
        }
      } catch { /* crash log file doesn't exist yet — safe to ignore */ }
      fs.appendFileSync(crashLog, entry);
    } catch { /* crash handler itself failed — cannot log further */ }
  }

  private lastVacuumTime = 0;
  private readonly VACUUM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

  private runRetentionCleanup(db: Database.Database): void {
    const logger = getLogger();
    try {
      const now = Date.now();

      // Clean old insights (> 60 days)
      const insightCutoff = new Date(now - 60 * 86_400_000).toISOString();
      const insightResult = db.prepare("DELETE FROM insights WHERE created_at < ?").run(insightCutoff);
      if (Number(insightResult.changes) > 0) {
        logger.info(`[retention] Cleaned up ${insightResult.changes} old insights`);
      }

      // Clean old price cache (> 30 days)
      const priceCutoff = now - 30 * 86_400_000;
      try {
        const priceResult = db.prepare("DELETE FROM paper_price_cache WHERE timestamp < ?").run(priceCutoff);
        if (Number(priceResult.changes) > 0) {
          logger.info(`[retention] Cleaned up ${priceResult.changes} old cached prices`);
        }
      } catch (err) { logger.debug(`[retention] Price cache cleanup skipped: ${(err as Error).message}`); }

      // Clean old signals (> 90 days)
      const signalCutoff = new Date(now - 90 * 86_400_000).toISOString();
      try {
        const signalResult = db.prepare("DELETE FROM signals WHERE created_at < ?").run(signalCutoff);
        if (Number(signalResult.changes) > 0) {
          logger.info(`[retention] Cleaned up ${signalResult.changes} old signals`);
        }
      } catch (err) { logger.debug(`[retention] Signal cleanup skipped: ${(err as Error).message}`); }

      db.pragma('optimize');

      // VACUUM weekly
      if (now - this.lastVacuumTime > this.VACUUM_INTERVAL_MS) {
        db.pragma('wal_checkpoint(TRUNCATE)');
        db.exec('VACUUM');
        this.lastVacuumTime = now;
        logger.info('[retention] DB vacuumed');
      }
    } catch (err) {
      logger.warn(`[retention] Cleanup failed (non-critical): ${(err as Error).message}`);
    }
  }

  private cleanup(): void {
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
    this.borgSync?.stop();
    this.paperEngine?.stop();
    this.peerNetwork?.stopDiscovery();
    this.subscriptionManager?.disconnectAll();
    this.attentionEngine?.stop();
    // consciousnessServer removed
    this.orchestrator?.stop();
    this.researchEngine?.stop();
    this.learningEngine?.stop();
    this.mcpHttpServer?.stop();
    this.apiServer?.stop();
    this.ipcServer?.stop();
    this.db?.close();

    this.db = null;
    this.ipcServer = null;
    this.apiServer = null;
    this.mcpHttpServer = null;
    this.learningEngine = null;
    this.researchEngine = null;
    this.paperEngine = null;
    this.orchestrator = null;
    this.attentionEngine = null;
    this.narrativeEngine = null;
    this.curiosityEngine = null;
    this.emergenceEngine = null;
    this.debateEngine = null;
    this.peerNetwork = null;
    this.borgSync = null;
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

    logger.info(`Restarting Trading Brain daemon (attempt ${this.restartCount}/3)...`);

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

    // Remove PID file
    if (this.config) {
      const pidPath = path.join(path.dirname(this.config.dbPath), 'trading-brain.pid');
      try { fs.unlinkSync(pidPath); } catch { /* ignore */ }
    }

    logger.info('Trading Brain daemon stopped');
    // Flush logger before exit, with 2s timeout fallback
    const exitTimeout = setTimeout(() => process.exit(0), 2000);
    logger.on('finish', () => { clearTimeout(exitTimeout); process.exit(0); });
    logger.end();
  }

  private setupCrossBrainSubscriptions(): void {
    if (!this.subscriptionManager || !this.correlator) return;
    const logger = getLogger();
    const correlator = this.correlator;

    // Subscribe to brain: error:reported events — flag system instability for trading context
    this.subscriptionManager.subscribe('brain', ['error:reported'], (event: string, data: unknown) => {
      logger.warn(`[cross-brain] System error from brain — flagging active trades for review`, { data });
      correlator.recordEvent('brain', event, data);
      this.orchestrator?.onCrossBrainEvent('brain', event, data as Record<string, unknown>);

      // Check health: if degraded, log warning for trade awareness
      const health = correlator.getHealth();
      if (health.status !== 'healthy') {
        logger.warn(`[cross-brain] Ecosystem health ${health.status} (score: ${health.score}) — trade caution advised`);
      }
    });

    // Subscribe to marketing-brain: post:published for ecosystem awareness
    this.subscriptionManager.subscribe('marketing-brain', ['post:published'], (event: string, data: unknown) => {
      correlator.recordEvent('marketing-brain', event, data);
      this.orchestrator?.onCrossBrainEvent('marketing-brain', event, data as Record<string, unknown>);
    });
  }

  private setupEventListeners(_synapseManager: SynapseManager, webhook?: WebhookService, researchScheduler?: AutonomousResearchScheduler, predictionEngine?: PredictionEngine): void {
    const causal = researchScheduler?.causalGraph;
    const hypothesis = researchScheduler?.hypothesisEngine;
    const bus = getEventBus();
    const notifier = this.notifier;
    const orch = this.orchestrator;

    // Trade recorded → log + notify brain (error correlation) + feed correlator + webhooks + causal + hypothesis + prediction
    bus.on('trade:recorded', ({ tradeId, fingerprint, win }) => {
      getLogger().info(`Trade #${tradeId} recorded: ${fingerprint} (${win ? 'WIN' : 'LOSS'})`);
      notifier?.notifyPeer('brain', 'trade:outcome', { tradeId, fingerprint, win });
      this.correlator?.recordEvent('trading-brain', 'trade:outcome', { tradeId, fingerprint, win });
      webhook?.fire('trade:recorded', { tradeId, fingerprint, win });
      causal?.recordEvent('trading-brain', 'trade:outcome', { tradeId, fingerprint, win });
      hypothesis?.observe({ source: 'trading-brain', type: win ? 'trade:win' : 'trade:loss', value: 1, timestamp: Date.now() });
      orch?.onEvent('trade:recorded', { tradeId, win: win ? 1 : 0 });
      predictionEngine?.recordMetric('trade_win_rate', win ? 1 : 0, 'trade');
    });

    // Synapse updated → log at debug level
    bus.on('synapse:updated', ({ synapseId }) => {
      getLogger().debug(`Synapse updated: ${synapseId}`);
    });

    // Rule learned → log + causal + notify Brain
    bus.on('rule:learned', ({ ruleId, pattern }) => {
      getLogger().info(`New rule #${ruleId} learned: ${pattern}`);
      causal?.recordEvent('trading-brain', 'rule:learned', { ruleId, pattern });
      hypothesis?.observe({ source: 'trading-brain', type: 'rule:learned', value: 1, timestamp: Date.now() });
      orch?.onEvent('rule:learned', { ruleId });
      notifier?.notify('rule:learned', { ruleId, pattern, summary: `New trading rule: "${pattern}"` });
    });

    // Chain detected → log + causal
    bus.on('chain:detected', ({ pair, type, length }) => {
      getLogger().info(`Chain: ${pair} ${type} streak (${length})`);
      causal?.recordEvent('trading-brain', 'chain:detected', { pair, type, length });
      hypothesis?.observe({ source: 'trading-brain', type: 'chain:detected', value: length, timestamp: Date.now() });
    });

    // Insight created → log + causal + notify Brain
    bus.on('insight:created', ({ insightId, type }) => {
      getLogger().info(`New insight #${insightId} (${type})`);
      causal?.recordEvent('trading-brain', 'insight:created', { insightId, type });
      hypothesis?.observe({ source: 'trading-brain', type: 'insight:created', value: 1, timestamp: Date.now() });
      orch?.onEvent('insight:created', { insightId, type });
      notifier?.notify('insight:created', { insightId, type, summary: `New trading insight (${type})` });
    });

    // Calibration updated → log + notify peers (market regime change) + causal
    bus.on('calibration:updated', ({ outcomeCount }) => {
      getLogger().info(`Calibration updated (${outcomeCount} outcomes)`);
      notifier?.notify('signal:calibrated', { outcomeCount });
      causal?.recordEvent('trading-brain', 'calibration:updated', { outcomeCount });
      orch?.onEvent('calibration:updated', { outcomeCount });
    });
  }
}
