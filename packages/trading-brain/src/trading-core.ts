import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import type { TradingBrainConfig } from './types/config.types.js';
import { createLogger, getLogger } from './utils/logger.js';
import { getEventBus } from './utils/events.js';
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

// IPC
import { IpcRouter, type Services } from './ipc/router.js';
import { IpcServer } from '@timmeck/brain-core';

// API & MCP HTTP
import { ApiServer } from './api/server.js';
import { McpHttpServer } from './mcp/http-server.js';

// Cross-Brain
import { CrossBrainClient, CrossBrainNotifier, CrossBrainSubscriptionManager, CrossBrainCorrelator, WebhookService, ExportService, BackupService, AutonomousResearchScheduler, ResearchOrchestrator, DataMiner, TradingDataMinerAdapter, DreamEngine, ThoughtStream, ConsciousnessServer, PredictionEngine, AttentionEngine } from '@timmeck/brain-core';

export class TradingCore {
  private db: Database.Database | null = null;
  private ipcServer: IpcServer | null = null;
  private apiServer: ApiServer | null = null;
  private mcpHttpServer: McpHttpServer | null = null;
  private learningEngine: LearningEngine | null = null;
  private researchEngine: ResearchEngine | null = null;
  private crossBrain: CrossBrainClient | null = null;
  private notifier: CrossBrainNotifier | null = null;
  private subscriptionManager: CrossBrainSubscriptionManager | null = null;
  private correlator: CrossBrainCorrelator | null = null;
  private orchestrator: ResearchOrchestrator | null = null;
  private consciousnessServer: ConsciousnessServer | null = null;
  private attentionEngine: AttentionEngine | null = null;
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

    // Expose engines + cross-brain to IPC
    services.learning = this.learningEngine;
    services.research = this.researchEngine;
    services.crossBrain = this.crossBrain ?? undefined;

    // 12. Cross-Brain Client + Notifier
    this.crossBrain = new CrossBrainClient('trading-brain');
    this.notifier = new CrossBrainNotifier(this.crossBrain, 'trading-brain');

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
      defaultHorizonMs: 7_200_000,
    });
    this.orchestrator.setPredictionEngine(predictionEngine);
    predictionEngine.start();
    services.predictionEngine = predictionEngine;

    // 12h. Consciousness — ThoughtStream + Dashboard
    const thoughtStream = new ThoughtStream();
    this.orchestrator.setThoughtStream(thoughtStream);
    dreamEngine.setThoughtStream(thoughtStream);
    predictionEngine.setThoughtStream(thoughtStream);
    this.consciousnessServer = new ConsciousnessServer({
      port: 7785,
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

    // 12i. Attention Engine
    this.attentionEngine = new AttentionEngine(this.db!, { brainName: 'trading-brain' });
    this.attentionEngine.setThoughtStream(thoughtStream);
    this.orchestrator.setAttentionEngine(this.attentionEngine);
    services.attentionEngine = this.attentionEngine;

    logger.info('Research orchestrator started (9 engines, feedback loops active, DataMiner bootstrapped, Dream Mode active, Prediction Engine active, Consciousness on :7785)');

    // 13. IPC Server
    const router = new IpcRouter(services);
    this.ipcServer = new IpcServer(router, config.ipc.pipeName, 'trading-brain', 'trading-brain');
    this.ipcServer.start();

    // Wire subscription manager into IPC router
    router.setSubscriptionManager(this.subscriptionManager, this.ipcServer);

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

    // 14. MCP HTTP Server (SSE transport for Cursor, Windsurf, Cline, Continue)
    if (config.mcpHttp.enabled) {
      this.mcpHttpServer = new McpHttpServer(config.mcpHttp.port, router);
      this.mcpHttpServer.start();
      logger.info(`MCP HTTP (SSE) enabled on port ${config.mcpHttp.port}`);
    }

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

    logger.info(`Trading Brain daemon started (PID: ${process.pid})`);
  }

  private logCrash(type: string, err: Error): void {
    if (!this.config) return;
    const crashLog = path.join(path.dirname(this.config.dbPath), 'crashes.log');
    const entry = `[${new Date().toISOString()}] ${type}: ${err.message}\n${err.stack ?? ''}\n\n`;
    try { fs.appendFileSync(crashLog, entry); } catch { /* best effort */ }
  }

  private cleanup(): void {
    this.subscriptionManager?.disconnectAll();
    this.attentionEngine?.stop();
    this.consciousnessServer?.stop();
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
    this.orchestrator = null;
    this.consciousnessServer = null;
    this.attentionEngine = null;
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
    process.exit(0);
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

    // Rule learned → log + causal
    bus.on('rule:learned', ({ ruleId, pattern }) => {
      getLogger().info(`New rule #${ruleId} learned: ${pattern}`);
      causal?.recordEvent('trading-brain', 'rule:learned', { ruleId, pattern });
      hypothesis?.observe({ source: 'trading-brain', type: 'rule:learned', value: 1, timestamp: Date.now() });
      orch?.onEvent('rule:learned', { ruleId });
    });

    // Chain detected → log + causal
    bus.on('chain:detected', ({ pair, type, length }) => {
      getLogger().info(`Chain: ${pair} ${type} streak (${length})`);
      causal?.recordEvent('trading-brain', 'chain:detected', { pair, type, length });
      hypothesis?.observe({ source: 'trading-brain', type: 'chain:detected', value: length, timestamp: Date.now() });
    });

    // Insight created → log + causal
    bus.on('insight:created', ({ insightId, type }) => {
      getLogger().info(`New insight #${insightId} (${type})`);
      causal?.recordEvent('trading-brain', 'insight:created', { insightId, type });
      hypothesis?.observe({ source: 'trading-brain', type: 'insight:created', value: 1, timestamp: Date.now() });
      orch?.onEvent('insight:created', { insightId, type });
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
