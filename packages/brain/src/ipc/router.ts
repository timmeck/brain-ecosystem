import { getLogger } from '../utils/logger.js';

const logger = getLogger();
import type { ErrorService } from '../services/error.service.js';
import type { SolutionService } from '../services/solution.service.js';
import type { TerminalService } from '../services/terminal.service.js';
import type { PreventionService } from '../services/prevention.service.js';
import type { CodeService } from '../services/code.service.js';
import type { SynapseService } from '../services/synapse.service.js';
import type { ResearchService } from '../services/research.service.js';
import type { NotificationService } from '../services/notification.service.js';
import type { AnalyticsService } from '../services/analytics.service.js';
import type { GitService } from '../services/git.service.js';
import type { MemoryService } from '../services/memory.service.js';
import type { DecisionService } from '../services/decision.service.js';
import type { ChangelogService } from '../services/changelog.service.js';
import type { TaskService } from '../services/task.service.js';
import type { DocService } from '../services/doc.service.js';
import type { LearningEngine, LearningCycleResult } from '../learning/learning-engine.js';
import type { CrossBrainClient, CrossBrainSubscriptionManager } from '@timmeck/brain-core';
import type { IpcServer } from '@timmeck/brain-core';

export interface Services {
  error: ErrorService;
  solution: SolutionService;
  terminal: TerminalService;
  prevention: PreventionService;
  code: CodeService;
  synapse: SynapseService;
  research: ResearchService;
  notification: NotificationService;
  analytics: AnalyticsService;
  git: GitService;
  memory: MemoryService;
  decision: DecisionService;
  changelog: ChangelogService;
  task: TaskService;
  doc: DocService;
  learning?: LearningEngine;
  crossBrain?: CrossBrainClient;
}

type MethodHandler = (params: unknown) => unknown;

export class IpcRouter {
  private methods: Map<string, MethodHandler>;
  private subscriptionManager: CrossBrainSubscriptionManager | null = null;
  private ipcServer: IpcServer | null = null;

  constructor(private services: Services) {
    this.methods = this.buildMethodMap();
  }

  /**
   * Wire the subscription manager and IPC server for cross-brain event routing.
   */
  setSubscriptionManager(manager: CrossBrainSubscriptionManager, server: IpcServer): void {
    this.subscriptionManager = manager;
    this.ipcServer = server;

    // Register cross-brain subscription handlers
    this.methods.set('cross-brain.subscribe', (params) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { subscriber, events } = params as any;
      server.addSubscriber(subscriber, events);
      return { subscribed: true, subscriber, events };
    });

    this.methods.set('cross-brain.unsubscribe', (params) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { subscriber } = params as any;
      server.removeSubscriber(subscriber);
      return { unsubscribed: true, subscriber };
    });

    this.methods.set('cross-brain.event', (params) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { source, event, data } = params as any;
      logger.info(`Cross-brain event from ${source}: ${event}`);
      manager.handleIncomingEvent(source, event, data);
      return { received: true, source, event };
    });
  }

  handle(method: string, params: unknown): unknown {
    const handler = this.methods.get(method);
    if (!handler) {
      throw new Error(`Unknown method: ${method}`);
    }

    logger.debug(`IPC: ${method}`, { params });
    const result = handler(params);
    logger.debug(`IPC: ${method} → done`);
    return result;
  }

  listMethods(): string[] {
    return [...this.methods.keys()];
  }

  private buildMethodMap(): Map<string, MethodHandler> {
    const s = this.services;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (params: unknown) => params as any;

    return new Map<string, MethodHandler>([
      // Terminal Lifecycle
      ['terminal.register',       (params) => s.terminal.register(p(params))],
      ['terminal.heartbeat',      (params) => s.terminal.heartbeat(p(params).uuid)],
      ['terminal.disconnect',     (params) => s.terminal.disconnect(p(params).uuid)],

      // Error Brain
      ['error.report',            (params) => s.error.report(p(params))],
      ['error.query',             (params) => s.error.query(p(params))],
      ['error.match',             (params) => s.error.matchSimilar(p(params).error_id ?? p(params).errorId)],
      ['error.resolve',           (params) => s.error.resolve(p(params).error_id ?? p(params).errorId, p(params).solution_id ?? p(params).solutionId)],
      ['error.get',               (params) => s.error.getById(p(params).id)],
      ['error.chain',             (params) => s.error.getErrorChain(p(params).error_id ?? p(params).errorId ?? p(params).id)],

      // Solutions
      ['solution.report',         (params) => s.solution.report(p(params))],
      ['solution.query',          (params) => s.solution.findForError(p(params).error_id ?? p(params).errorId)],
      ['solution.rate',           (params) => s.solution.rateOutcome(p(params))],
      ['solution.attempt',        (params) => s.solution.rateOutcome({ ...p(params), success: false })],
      ['solution.efficiency',     () => s.solution.analyzeEfficiency()],

      // Projects
      ['project.list',            () => s.code.listProjects()],

      // Code Brain
      ['code.analyze',            (params) => s.code.analyzeAndRegister(p(params))],
      ['code.find',               (params) => s.code.findReusable(p(params))],
      ['code.similarity',         (params) => s.code.checkSimilarity(p(params).source, p(params).language)],
      ['code.modules',            (params) => s.code.listModules(p(params)?.projectId, p(params)?.language, p(params)?.limit)],
      ['code.get',                (params) => s.code.getById(p(params).id)],

      // Prevention
      ['prevention.check',        (params) => s.prevention.checkRules(p(params).errorType, p(params).message, p(params).projectId)],
      ['prevention.antipatterns',  (params) => s.prevention.checkAntipatterns(p(params).errorType ?? '', p(params).message ?? p(params).error_output ?? '', p(params).projectId)],
      ['prevention.checkCode',    (params) => s.prevention.checkCodeForPatterns(p(params).source, p(params).filePath)],

      // Rules (Learning Explainability)
      ['rule.list',               () => s.prevention.listRules()],
      ['rule.explain',            (params) => {
        const ruleId = p(params).ruleId;
        const rule = s.prevention.getRule(ruleId);
        if (!rule) throw new Error(`Rule #${ruleId} not found`);
        const matchedErrors = s.prevention.checkRules(rule.pattern, '', undefined);
        const connections = s.synapse.getRelated({ nodeType: 'rule', nodeId: ruleId, maxDepth: 2 });
        return { rule, matchedErrors, connections };
      }],
      ['rule.override',           (params) => {
        const { ruleId, action, reason } = p(params);
        const rule = s.prevention.getRule(ruleId);
        if (!rule) throw new Error(`Rule #${ruleId} not found`);
        if (action === 'boost') {
          return s.prevention.updateRule(ruleId, { confidence: Math.min(1.0, rule.confidence + 0.2) });
        } else if (action === 'suppress') {
          return s.prevention.updateRule(ruleId, { confidence: Math.max(0.01, rule.confidence - 0.3) });
        } else if (action === 'delete') {
          return s.prevention.updateRule(ruleId, { active: 0 });
        }
        throw new Error(`Unknown action: ${action}`);
      }],

      // Synapses
      ['synapse.list',            (params) => {
        const limit = p(params)?.limit ?? 20;
        const synapses = s.synapse.getStrongestSynapses(limit);
        return synapses.map((syn) => ({
          sourceType: syn.source_type,
          sourceId: syn.source_id,
          targetType: syn.target_type,
          targetId: syn.target_id,
          weight: syn.weight,
          type: syn.synapse_type,
          lastActivated: syn.last_activated_at,
        }));
      }],
      ['synapse.context',         (params) => s.synapse.getErrorContext(p(params).errorId ?? p(params).error_id ?? p(params).node_id)],
      ['synapse.path',            (params) => s.synapse.findPath(p(params).from_type ?? p(params).fromType, p(params).from_id ?? p(params).fromId, p(params).to_type ?? p(params).toType, p(params).to_id ?? p(params).toId)],
      ['synapse.related',         (params) => s.synapse.getRelated(p(params))],
      ['synapse.stats',           () => s.synapse.getNetworkStats()],

      // Research / Insights
      ['research.insights',       (params) => s.research.getInsights(p(params))],
      ['insight.rate',            (params) => s.research.rateInsight(p(params).id, p(params).rating, p(params).comment)],
      ['research.suggest',        (params) => s.research.getInsights({ limit: 10, activeOnly: true, ...p(params) })],
      ['research.trends',         (params) => s.research.getTrends(p(params)?.projectId, p(params)?.windowDays)],

      // Notifications
      ['notification.list',       (params) => s.notification.list(p(params)?.projectId)],
      ['notification.ack',        (params) => s.notification.acknowledge(p(params).id)],

      // Analytics
      ['analytics.summary',       (params) => s.analytics.getSummary(p(params)?.projectId)],
      ['analytics.network',       (params) => s.analytics.getNetworkOverview(p(params)?.limit)],
      ['analytics.health',        (params) => s.analytics.computeHealthScore(p(params)?.projectId)],
      ['analytics.timeline',      (params) => s.analytics.getTimeSeries(p(params)?.projectId, p(params)?.days)],
      ['analytics.explain',       (params) => s.analytics.explainError(p(params).errorId ?? p(params).error_id)],

      // Git
      ['git.context',             (params) => s.git.getGitContext(p(params)?.cwd)],
      ['git.linkError',           (params) => s.git.linkErrorToCommit(p(params).errorId, p(params).projectId, p(params).commitHash, p(params).relationship)],
      ['git.errorCommits',        (params) => s.git.findIntroducingCommit(p(params).errorId ?? p(params).error_id)],
      ['git.commitErrors',        (params) => s.git.findErrorsByCommit(p(params).commitHash ?? p(params).commit_hash)],
      ['git.diff',                (params) => s.git.captureDiff(p(params)?.cwd)],

      // Learning
      ['learning.run',            () => {
        if (!s.learning) throw new Error('Learning engine not available');
        return s.learning.runCycle();
      }],

      // Cross-Brain Notifications
      ['cross-brain.notify',      (params) => {
        const { source, event, data, timestamp } = p(params);
        logger.info(`Cross-brain notification from ${source}: ${event}`);
        return { received: true, source, event, timestamp };
      }],

      // Ecosystem
      ['ecosystem.status',        async () => {
        if (!s.crossBrain) return { peers: [] };
        const peers = await s.crossBrain.broadcast('status');
        return { self: 'brain', peers };
      }],
      ['ecosystem.queryPeer',     async (params) => {
        if (!s.crossBrain) throw new Error('Cross-brain client not available');
        const { peer, method, args } = p(params);
        const result = await s.crossBrain.query(peer, method, args);
        if (result === null) throw new Error(`Peer '${peer}' not available`);
        return result;
      }],

      // Memory
      ['memory.remember',         (params) => s.memory.remember(p(params))],
      ['memory.recall',           (params) => s.memory.recall(p(params))],
      ['memory.forget',           (params) => s.memory.forget(p(params).memoryId ?? p(params).memory_id)],
      ['memory.preferences',      (params) => s.memory.getPreferences(p(params)?.projectId)],
      ['memory.decisions',        (params) => s.memory.getDecisions(p(params)?.projectId)],
      ['memory.goals',            (params) => s.memory.getGoals(p(params)?.projectId)],
      ['memory.lessons',          (params) => s.memory.getLessons(p(params)?.projectId)],
      ['memory.stats',            () => s.memory.getStats()],

      // Sessions
      ['session.start',           (params) => s.memory.startSession(p(params))],
      ['session.end',             (params) => s.memory.endSession(p(params))],
      ['session.current',         (params) => s.memory.getCurrentSession(p(params).sessionId ?? p(params).session_id)],
      ['session.history',         (params) => s.memory.getSessionHistory(p(params)?.projectId, p(params)?.limit)],

      // Decisions
      ['decision.record',         (params) => s.decision.recordDecision(p(params))],
      ['decision.query',          (params) => s.decision.queryDecisions(p(params))],
      ['decision.get',            (params) => s.decision.getById(p(params).id)],
      ['decision.supersede',      (params) => s.decision.supersedeDecision(p(params).oldId ?? p(params).old_id, p(params).newId ?? p(params).new_id)],

      // Changelog
      ['changelog.record',        (params) => s.changelog.recordChange(p(params))],
      ['changelog.query',         (params) => s.changelog.queryChanges(p(params))],
      ['changelog.get',           (params) => s.changelog.getById(p(params).id)],
      ['changelog.fileHistory',   (params) => s.changelog.getFileHistory(p(params).filePath ?? p(params).file_path, p(params)?.projectId)],

      // Tasks
      ['task.add',                (params) => s.task.addTask(p(params))],
      ['task.update',             (params) => s.task.updateTask(p(params).id, p(params))],
      ['task.list',               (params) => s.task.listTasks(p(params))],
      ['task.get',                (params) => s.task.getById(p(params).id)],
      ['task.context',            (params) => s.task.getTaskContext(p(params).id)],
      ['task.search',             (params) => s.task.searchTasks(p(params).query, p(params)?.limit)],

      // Docs
      ['doc.index',               (params) => s.doc.indexProject(p(params))],
      ['doc.query',               (params) => s.doc.queryDocs(p(params))],
      ['doc.projectContext',      (params) => s.doc.getProjectContext(p(params).projectId ?? p(params).project_id)],
      ['doc.get',                 (params) => s.doc.getById(p(params).id)],

      // Status (cross-brain)
      ['status',                  () => ({
        name: 'brain',
        version: '2.2.0',
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        methods: this.listMethods().length,
      })],
    ]);
  }
}
