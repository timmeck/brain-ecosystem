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
import { IpcServer } from '@timmeck/brain-core';

// API
import { ApiServer } from './api/server.js';

// MCP HTTP
import { McpHttpServer } from './mcp/http-server.js';

// Dashboard
import { DashboardServer } from './dashboard/server.js';
import { renderDashboard } from './dashboard/renderer.js';

// Social
import { SocialService } from './social/social-service.js';
import { BlueskyProvider } from './social/bluesky-provider.js';
import { RedditProvider } from './social/reddit-provider.js';

// Scheduling
import { SchedulerRepository } from './db/repositories/scheduler.repository.js';
import { SchedulerService } from './services/scheduler.service.js';
import { CalendarService } from './services/calendar.service.js';

// Cross-Brain
import { CrossBrainClient, CrossBrainNotifier, HypothesisEngine, runHypothesisMigration, TransferEngine, BorgSyncEngine, DebateEngine } from '@timmeck/brain-core';
import { createIntelligenceEngines } from './init/engine-factory.js';
import type { BorgDataProvider, SyncItem } from '@timmeck/brain-core';

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
  private transferEngine: TransferEngine | null = null;
  private borgSync: BorgSyncEngine | null = null;
  private debateEngine: DebateEngine | null = null;
  private config: MarketingBrainConfig | null = null;
  private retentionTimer: ReturnType<typeof setInterval> | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private socialPollTimer: ReturnType<typeof setInterval> | null = null;
  private engagementTrackTimer: ReturnType<typeof setInterval> | null = null;
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
    const db = createConnection(config.dbPath);
    this.db = db;
    runMigrations(db);
    logger.info(`Database initialized: ${config.dbPath}`);

    // 5. Repositories
    const postRepo = new PostRepository(db);
    const engagementRepo = new EngagementRepository(db);
    const campaignRepo = new CampaignRepository(db);
    const strategyRepo = new StrategyRepository(db);
    const ruleRepo = new RuleRepository(db);
    const templateRepo = new TemplateRepository(db);
    const audienceRepo = new AudienceRepository(db);
    const synapseRepo = new SynapseRepository(db);
    const insightRepo = new InsightRepository(db);
    const memoryRepo = new MemoryRepository(db);
    const sessionRepo = new SessionRepository(db);

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

    // 9. Research Engine + HypothesisEngine wiring
    this.researchEngine = new ResearchEngine(
      config.research, postRepo, engagementRepo,
      campaignRepo, templateRepo, insightRepo, synapseManager,
    );
    try {
      runHypothesisMigration(db);
      const hypothesisEngine = new HypothesisEngine(db, { minEvidence: 3, confirmThreshold: 0.10, rejectThreshold: 0.5 });
      this.researchEngine.setHypothesisEngine(hypothesisEngine);
      logger.info('HypothesisEngine wired into marketing research');
    } catch (err) {
      logger.warn(`HypothesisEngine setup failed (non-critical): ${(err as Error).message}`);
    }
    this.researchEngine.start();
    logger.info(`Research engine started (interval: ${config.research.intervalMs}ms)`);

    // 9b. TransferEngine for cross-brain knowledge transfer
    try {
      this.transferEngine = new TransferEngine(db, { brainName: 'marketing-brain' });
      this.transferEngine.seedDefaultRules();
      this.researchEngine.setTransferEngine(this.transferEngine);
      services.transferEngine = this.transferEngine;
      logger.info('TransferEngine wired into marketing brain');
    } catch (err) {
      logger.warn(`TransferEngine setup failed (non-critical): ${(err as Error).message}`);
    }

    // 9c. SocialService — auto-register available providers
    const socialService = new SocialService();
    const blueskyProvider = new BlueskyProvider();
    const redditProvider = new RedditProvider();
    blueskyProvider.isAvailable().then(ok => {
      if (ok) {
        socialService.registerProvider(blueskyProvider);
        logger.info('Bluesky provider registered');
      }
    }).catch(() => { /* Bluesky not configured, fine */ });
    redditProvider.isAvailable().then(ok => {
      if (ok) {
        socialService.registerProvider(redditProvider);
        logger.info('Reddit provider registered');
      }
    }).catch(() => { /* Reddit not configured, fine */ });
    services.socialService = socialService;

    // 9d. Scheduler + Calendar — auto-publish due posts every 60s
    const calendarService = new CalendarService(db);
    const schedulerRepo = new SchedulerRepository(db);
    const schedulerService = new SchedulerService(schedulerRepo, calendarService);
    services.scheduler = schedulerService;
    services.calendar = calendarService;
    this.schedulerTimer = setInterval(() => {
      try {
        schedulerService.checkDue();
      } catch (err) {
        logger.warn(`[scheduler] checkDue error: ${(err as Error).message}`);
      }
    }, 60_000);
    logger.info('Scheduler checkDue timer started (every 60s)');

    // 9e. Social Feed Polling — read feeds every 30min (graceful: no credentials → no polling)
    this.socialPollTimer = setInterval(async () => {
      const providers = socialService.getProviders();
      if (providers.length === 0) return;
      try {
        const items = await socialService.readFeed(undefined, { limit: 20 });
        if (items.length > 0) {
          logger.debug(`[social-poll] Read ${items.length} feed items from ${providers.length} provider(s)`);
          // Store notable items as memories for learning
          for (const item of items.slice(0, 5)) {
            try {
              memoryService.remember({
                key: `social:feed:${item.platform}:${item.id}`,
                content: `[${item.platform}] ${item.author}: ${item.text?.slice(0, 200) ?? ''}`,
                category: 'fact',
                source: 'inferred',
                tags: ['social-feed', item.platform],
              });
            } catch { /* duplicate or DB error — skip */ }
          }
        }
      } catch (err) {
        logger.debug(`[social-poll] Feed polling error: ${(err as Error).message}`);
      }
    }, 30 * 60 * 1000);

    // 9f. Engagement Auto-Tracking — check metrics for own posts every 2h
    this.engagementTrackTimer = setInterval(async () => {
      try {
        const recentPosts = postRepo.listPublished(20);
        for (const post of recentPosts) {
          if (!post.url || !post.platform) continue;
          try {
            // Use URL as provider postId (providers parse it internally)
            const metrics = await socialService.getEngagement(post.platform, post.url);
            if (metrics.likes > 0 || metrics.reposts > 0 || metrics.replies > 0) {
              engagementRepo.create({
                post_id: post.id,
                likes: metrics.likes,
                comments: metrics.replies,
                shares: metrics.reposts,
              });
              logger.debug(`[engagement] Updated metrics for post #${post.id}: ${metrics.likes}L/${metrics.reposts}R/${metrics.replies}C`);
            }
          } catch { /* individual post tracking can fail */ }
        }
      } catch (err) {
        logger.debug(`[engagement] Tracking error: ${(err as Error).message}`);
      }
    }, 2 * 60 * 60 * 1000);

    // Expose learning engine + cross-brain to IPC
    services.learning = this.learningEngine;
    // 10. Cross-Brain Client + Notifier
    this.crossBrain = new CrossBrainClient('marketing-brain');
    this.notifier = new CrossBrainNotifier(this.crossBrain, 'marketing-brain');
    services.crossBrain = this.crossBrain;

    // 10b. Borg Sync Engine — collective knowledge sync (opt-in, default: disabled)
    const borgProvider: BorgDataProvider = {
      getShareableItems: (): SyncItem[] => {
        const items: SyncItem[] = [];
        try {
          for (const r of services.rule.listRules().slice(0, 100)) {
            items.push({ type: 'rule', id: `rule-${r.id}`, title: r.pattern, content: `Marketing rule: ${r.pattern} → ${r.recommendation}`, confidence: r.confidence, source: 'marketing-brain', createdAt: r.created_at });
          }
        } catch { /* no rules */ }
        try {
          for (const i of services.insight.listActive(50)) {
            items.push({ type: 'insight', id: `insight-${i.id}`, title: i.title, content: i.description, confidence: i.confidence, source: 'marketing-brain', createdAt: i.created_at });
          }
        } catch { /* no insights */ }
        return items;
      },
      importItems: (incoming: SyncItem[], source: string): number => {
        logger.info(`[borg] Received ${incoming.length} items from ${source}`);
        let accepted = 0;
        for (const item of incoming) {
          try {
            services.memory.remember({ key: `borg:${source}:${item.id}`, content: `[${item.type}] ${item.title}: ${item.content}`, category: 'fact', source: 'inferred', tags: ['borg', source] });
            accepted++;
          } catch { /* duplicate or DB error */ }
        }
        return accepted;
      },
    };
    this.borgSync = new BorgSyncEngine('marketing-brain', this.crossBrain!, borgProvider);
    services.borgSync = this.borgSync;

    // 10c. Debate Engine — multi-perspective debates on marketing questions
    try {
      const debateEngine = new DebateEngine(db, { brainName: 'marketing-brain', domainDescription: 'content strategy and engagement learning' });
      this.debateEngine = debateEngine;
      services.debateEngine = debateEngine;
      logger.info('DebateEngine wired into marketing brain');
    } catch (err) {
      logger.warn(`DebateEngine setup failed (non-critical): ${(err as Error).message}`);
    }

    // ── Intelligence Upgrade (Sessions 55-76) — extracted to init/engine-factory.ts ──
    createIntelligenceEngines({ db, services, notifier: this.notifier });

    // 11. IPC Server
    const router = new IpcRouter(services);
    this.ipcServer = new IpcServer(router, config.ipc.pipeName);
    this.ipcServer.start();

    // Wire local handler so cross-brain self-queries resolve locally
    this.crossBrain!.setLocalHandler((method, params) => router.handle(method, params));

    // 11a. Start Borg Sync (after IPC ready)
    this.borgSync.start();

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

    // 12b. DB retention cleanup + optimize (once at start, then every 24h)
    this.runRetentionCleanup(db);
    this.retentionTimer = setInterval(() => this.runRetentionCleanup(db), 24 * 60 * 60 * 1000);

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
      // EPIPE = writing to closed stdout/stderr (daemon mode) — ignore silently
      if ((err as NodeJS.ErrnoException).code === 'EPIPE') return;
      try { logger.error('Uncaught exception — restarting', { error: err.message, stack: err.stack }); } catch { /* logger may be broken */ }
      this.logCrash('uncaughtException', err);
      this.restart();
    });
    process.on('unhandledRejection', (reason) => {
      try { logger.error('Unhandled rejection — restarting', { reason: String(reason) }); } catch { /* logger may be broken */ }
      this.logCrash('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
      this.restart();
    });

    logger.info(`Marketing Brain daemon started (PID: ${process.pid})`);
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
          try { fs.unlinkSync(rotated); } catch { /* no previous rotation */ }
          fs.renameSync(crashLog, rotated);
        }
      } catch { /* file doesn't exist yet */ }
      fs.appendFileSync(crashLog, entry);
    } catch { /* best effort */ }
  }

  private runRetentionCleanup(db: Database.Database): void {
    const logger = getLogger();
    try {
      const insightCutoff = new Date(Date.now() - 60 * 86_400_000).toISOString(); // 60 days
      const result = db.prepare("DELETE FROM insights WHERE active = 0 AND created_at < ?").run(insightCutoff);
      if (Number(result.changes) > 0) {
        logger.info(`[retention] Cleaned up ${result.changes} old inactive insights`);
      }
      db.pragma('optimize');
    } catch (err) {
      logger.warn(`[retention] Cleanup failed (non-critical): ${(err as Error).message}`);
    }
  }

  private cleanup(): void {
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
      this.retentionTimer = null;
    }
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
    if (this.socialPollTimer) {
      clearInterval(this.socialPollTimer);
      this.socialPollTimer = null;
    }
    if (this.engagementTrackTimer) {
      clearInterval(this.engagementTrackTimer);
      this.engagementTrackTimer = null;
    }
    this.borgSync?.stop();
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
    this.transferEngine = null;
    this.borgSync = null;
    this.debateEngine = null;
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
    // Flush logger before exit, with 2s timeout fallback
    const exitTimeout = setTimeout(() => process.exit(0), 2000);
    logger.on('finish', () => { clearTimeout(exitTimeout); process.exit(0); });
    logger.end();
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
      notifier?.notify('rule:learned', { ruleId, pattern, summary: `New marketing rule: "${pattern}"` });
    });

    bus.on('insight:created', ({ insightId, type }) => {
      getLogger().info(`New insight #${insightId} (${type})`);
      notifier?.notifyPeer('brain', 'insight:created', { insightId, type, summary: `New marketing insight (${type})` });
    });
  }
}
