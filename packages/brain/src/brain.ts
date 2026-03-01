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
import { CrossBrainClient, CrossBrainNotifier, CrossBrainSubscriptionManager, CrossBrainCorrelator, EcosystemService, WebhookService, ExportService, BackupService } from '@timmeck/brain-core';

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
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private config: BrainConfig | null = null;
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
    this.subscriptionManager = null;
    this.correlator = null;
    this.ecosystemService = null;
  }

  restart(): void {
    if (this.restarting) return;
    this.restarting = true;

    const logger = getLogger();
    logger.info('Restarting Brain daemon...');

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
    });

    // Subscribe to trading-brain: trade:outcome for win/loss correlation with errors
    this.subscriptionManager.subscribe('trading-brain', ['trade:outcome'], (event: string, data: unknown) => {
      correlator.recordEvent('trading-brain', event, data);
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
    });

    // Subscribe to marketing-brain: campaign:created for ecosystem awareness
    this.subscriptionManager.subscribe('marketing-brain', ['campaign:created'], (event: string, data: unknown) => {
      correlator.recordEvent('marketing-brain', event, data);
    });
  }

  private setupEventListeners(services: Services, synapseManager: SynapseManager): void {
    const bus = getEventBus();
    const notifier = this.notifier;
    const webhook = services.webhook;

    // Error → Project synapse + notify peers + feed correlator + webhooks
    bus.on('error:reported', ({ errorId, projectId }) => {
      synapseManager.strengthen(
        { type: 'error', id: errorId },
        { type: 'project', id: projectId },
        'co_occurs',
      );
      notifier?.notify('error:reported', { errorId, projectId });
      this.correlator?.recordEvent('brain', 'error:reported', { errorId, projectId });
      webhook?.fire('error:reported', { errorId, projectId });
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

    // Rule learned → log
    bus.on('rule:learned', ({ ruleId, pattern }) => {
      getLogger().info(`New rule #${ruleId} learned: ${pattern}`);
    });

    // Insight created → log + notify marketing (content opportunity) + feed correlator + webhooks
    bus.on('insight:created', ({ insightId, type }) => {
      getLogger().info(`New insight #${insightId} (${type})`);
      notifier?.notifyPeer('marketing-brain', 'insight:created', { insightId, type });
      this.correlator?.recordEvent('brain', 'insight:created', { insightId, type });
      webhook?.fire('insight:created', { insightId, type });
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
