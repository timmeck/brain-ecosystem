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
import { CrossBrainClient, CrossBrainNotifier, CrossBrainSubscriptionManager } from '@timmeck/brain-core';

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
  private config: TradingBrainConfig | null = null;
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
    const services: Services = {
      trade: new TradeService(tradeRepo, signalRepo, chainRepo, synapseManager, graph, cal, config.learning),
      signal: new SignalService(synapseManager, graph, cal, tradeCount, ruleRepo, tradeRepo),
      strategy: new StrategyService(synapseManager, graph, cal, tradeCount),
      synapse: new SynapseService(synapseManager, graph),
      analytics: new AnalyticsService(tradeRepo, ruleRepo, chainRepo, insightRepo, synapseManager, graph, memoryRepo, sessionRepo),
      insight: new InsightService(insightRepo),
      memory: memoryService,
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

    // 12b. Cross-Brain Subscription Manager
    this.subscriptionManager = new CrossBrainSubscriptionManager('trading-brain');

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
    this.setupEventListeners(synapseManager);

    // 15b. Cross-Brain Event Subscriptions
    this.setupCrossBrainSubscriptions();

    // 16. PID file
    const pidPath = path.join(path.dirname(config.dbPath), 'trading-brain.pid');
    fs.writeFileSync(pidPath, String(process.pid));

    // 17. Graceful shutdown
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    // 18. Crash recovery
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
    this.subscriptionManager = null;
  }

  restart(): void {
    if (this.restarting) return;
    this.restarting = true;

    const logger = getLogger();
    logger.info('Restarting Trading Brain daemon...');

    try { this.cleanup(); } catch { /* best effort cleanup */ }

    this.restarting = false;
    this.start(this.configPath);
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
    if (!this.subscriptionManager) return;
    const logger = getLogger();

    // Subscribe to brain: error:reported events for system problem awareness during trades
    this.subscriptionManager.subscribe('brain', ['error:reported'], (event: string, data: unknown) => {
      logger.info(`[cross-brain] Received ${event} from brain`, { data });
      // TODO: deeper integration — pause or flag trades when system errors spike
    });
  }

  private setupEventListeners(_synapseManager: SynapseManager): void {
    const bus = getEventBus();
    const notifier = this.notifier;

    // Trade recorded → log + notify brain (error correlation)
    bus.on('trade:recorded', ({ tradeId, fingerprint, win }) => {
      getLogger().info(`Trade #${tradeId} recorded: ${fingerprint} (${win ? 'WIN' : 'LOSS'})`);
      notifier?.notifyPeer('brain', 'trade:outcome', { tradeId, fingerprint, win });
    });

    // Synapse updated → log at debug level
    bus.on('synapse:updated', ({ synapseId }) => {
      getLogger().debug(`Synapse updated: ${synapseId}`);
    });

    // Rule learned → log
    bus.on('rule:learned', ({ ruleId, pattern }) => {
      getLogger().info(`New rule #${ruleId} learned: ${pattern}`);
    });

    // Chain detected → log
    bus.on('chain:detected', ({ pair, type, length }) => {
      getLogger().info(`Chain: ${pair} ${type} streak (${length})`);
    });

    // Insight created → log
    bus.on('insight:created', ({ insightId, type }) => {
      getLogger().info(`New insight #${insightId} (${type})`);
    });

    // Calibration updated → log + notify peers (market regime change)
    bus.on('calibration:updated', ({ outcomeCount }) => {
      getLogger().info(`Calibration updated (${outcomeCount} outcomes)`);
      notifier?.notify('signal:calibrated', { outcomeCount });
    });
  }
}
