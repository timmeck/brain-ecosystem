import path from 'node:path';
import fs from 'node:fs';
import type Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import type { MarketingBrainConfig } from './types/config.types.js';
import { createLogger, getLogger } from './utils/logger.js';
import { getEventBus } from './utils/events.js';
import { createConnection } from './db/connection.js';
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

// Synapses
import { SynapseManager } from './synapses/synapse-manager.js';

// Engines
import { LearningEngine } from './learning/learning-engine.js';
import { ResearchEngine } from './research/research-engine.js';

// IPC
import { IpcRouter, type Services } from './ipc/router.js';
import { IpcServer } from './ipc/server.js';

// API
import { ApiServer } from './api/server.js';

// MCP HTTP
import { McpHttpServer } from './mcp/http-server.js';

// Dashboard
import { DashboardServer } from './dashboard/server.js';
import { renderDashboard } from './dashboard/renderer.js';

// Cross-Brain
import { CrossBrainClient, CrossBrainNotifier } from '@timmeck/brain-core';

export class MarketingCore {
  private db: Database.Database | null = null;
  private ipcServer: IpcServer | null = null;
  private apiServer: ApiServer | null = null;
  private mcpHttpServer: McpHttpServer | null = null;
  private dashboardServer: DashboardServer | null = null;
  private learningEngine: LearningEngine | null = null;
  private researchEngine: ResearchEngine | null = null;
  private crossBrain: CrossBrainClient | null = null;
  private notifier: CrossBrainNotifier | null = null;
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

    // 6. Synapse Manager
    const synapseManager = new SynapseManager(synapseRepo, config.synapses);

    // 7. Services
    const memoryService = new MemoryService(memoryRepo, sessionRepo, synapseManager);
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

    // 11. IPC Server
    const router = new IpcRouter(services);
    this.ipcServer = new IpcServer(router, config.ipc.pipeName);
    this.ipcServer.start();

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
      this.dashboardServer = new DashboardServer({
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
    this.setupEventListeners(synapseManager);

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

  private setupEventListeners(synapseManager: SynapseManager): void {
    const bus = getEventBus();
    const notifier = this.notifier;

    bus.on('post:created', ({ postId, campaignId }) => {
      if (campaignId) {
        synapseManager.strengthen(
          { type: 'post', id: postId },
          { type: 'campaign', id: campaignId },
          'belongs_to',
        );
      }
    });

    // Post published → notify peers (engagement tracking)
    bus.on('post:published', ({ postId, platform }) => {
      getLogger().info(`Post #${postId} published on ${platform}`);
      notifier?.notify('post:published', { postId, platform });
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
    });

    bus.on('insight:created', ({ insightId, type }) => {
      getLogger().info(`New insight #${insightId} (${type})`);
      notifier?.notifyPeer('brain', 'insight:created', { insightId, type });
    });
  }
}
