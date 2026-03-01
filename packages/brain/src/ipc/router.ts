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
import type { LearningEngine } from '../learning/learning-engine.js';
import type { AutoResolutionService } from '../services/auto-resolution.service.js';
import type { CrossBrainClient, CrossBrainSubscriptionManager, EcosystemService } from '@timmeck/brain-core';
import type { IpcServer } from '@timmeck/brain-core';
import type { WebhookService } from '@timmeck/brain-core';
import type { ExportService } from '@timmeck/brain-core';
import type { BackupService } from '@timmeck/brain-core';
import type { MetaLearningEngine } from '@timmeck/brain-core';
import type { CausalGraph } from '@timmeck/brain-core';
import type { HypothesisEngine } from '@timmeck/brain-core';
import type { AutonomousResearchScheduler } from '@timmeck/brain-core';
import type { SelfObserver } from '@timmeck/brain-core';
import type { AdaptiveStrategyEngine } from '@timmeck/brain-core';
import type { ExperimentEngine } from '@timmeck/brain-core';
import type { CrossDomainEngine } from '@timmeck/brain-core';
import type { CounterfactualEngine } from '@timmeck/brain-core';
import type { KnowledgeDistiller } from '@timmeck/brain-core';
import type { ResearchAgendaEngine } from '@timmeck/brain-core';
import type { AnomalyDetective } from '@timmeck/brain-core';
import type { ResearchJournal } from '@timmeck/brain-core';

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
  autoResolution?: AutoResolutionService;
  crossBrain?: CrossBrainClient;
  ecosystem?: EcosystemService;
  webhook?: WebhookService;
  export?: ExportService;
  backup?: BackupService;
  metaLearning?: MetaLearningEngine;
  causal?: CausalGraph;
  hypothesis?: HypothesisEngine;
  researchScheduler?: AutonomousResearchScheduler;
  selfObserver?: SelfObserver;
  adaptiveStrategy?: AdaptiveStrategyEngine;
  experimentEngine?: ExperimentEngine;
  crossDomain?: CrossDomainEngine;
  counterfactual?: CounterfactualEngine;
  knowledgeDistiller?: KnowledgeDistiller;
  researchAgenda?: ResearchAgendaEngine;
  anomalyDetective?: AnomalyDetective;
  journal?: ResearchJournal;
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
        const { ruleId, action } = p(params);
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

      // Auto-Resolution
      ['resolution.suggest',       (params) => {
        if (!s.autoResolution) throw new Error('Auto-resolution service not available');
        return s.autoResolution.getSuggestionsForError(p(params).error_id ?? p(params).errorId);
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
        const { source, event, timestamp } = p(params);
        logger.info(`Cross-brain notification from ${source}: ${event}`);
        return { received: true, source, event, timestamp };
      }],

      // Ecosystem
      ['ecosystem.status',        async () => {
        if (s.ecosystem) return s.ecosystem.getStatus();
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
      ['ecosystem.health',        () => {
        if (!s.ecosystem) throw new Error('Ecosystem service not available');
        return s.ecosystem.getHealth();
      }],
      ['ecosystem.correlations',  (params) => {
        if (!s.ecosystem) throw new Error('Ecosystem service not available');
        return s.ecosystem.getCorrelations(p(params)?.minStrength);
      }],
      ['ecosystem.timeline',      (params) => {
        if (!s.ecosystem) throw new Error('Ecosystem service not available');
        return s.ecosystem.getTimeline(p(params)?.limit);
      }],
      ['ecosystem.analytics',     async () => {
        if (!s.ecosystem) throw new Error('Ecosystem service not available');
        return s.ecosystem.getAggregatedAnalytics();
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

      // Webhooks
      ['webhook.add',             (params) => s.webhook?.add(p(params))],
      ['webhook.remove',          (params) => s.webhook?.remove(p(params).id)],
      ['webhook.list',            () => s.webhook?.list()],
      ['webhook.toggle',          (params) => s.webhook?.toggle(p(params).id, p(params).active)],
      ['webhook.history',         (params) => s.webhook?.history(p(params)?.webhookId, p(params)?.limit)],
      ['webhook.test',            (params) => s.webhook?.fire('test', { message: p(params)?.message ?? 'Test webhook' })],

      // Export
      ['export.tables',           () => s.export?.listTables()],
      ['export.columns',          (params) => s.export?.getColumns(p(params).table)],
      ['export.data',             (params) => s.export?.export(p(params))],
      ['export.stats',            () => s.export?.getStats()],

      // Backup
      ['backup.create',           (params) => s.backup?.create(p(params)?.label)],
      ['backup.list',             () => s.backup?.list()],
      ['backup.restore',          (params) => s.backup?.restore(p(params).filename)],
      ['backup.delete',           (params) => s.backup?.delete(p(params).filename)],
      ['backup.info',             () => s.backup?.getInfo()],

      // ─── Meta-Learning ────────────────────────────────────
      ['meta.status',       () => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.getStatus(); }],
      ['meta.optimize',     () => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.optimize(); }],
      ['meta.history',      (params) => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.getHistory(p(params)?.limit); }],
      ['meta.params',       () => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.getParams(); }],
      ['meta.step',         (params) => { if (!s.metaLearning) throw new Error('Meta-learning not available'); return s.metaLearning.step(p(params).metrics, p(params).score); }],

      // ─── Causal Inference ──────────────────────────────────
      ['causal.record',     (params) => { if (!s.causal) throw new Error('Causal engine not available'); s.causal.recordEvent(p(params).source, p(params).type, p(params).data); return { recorded: true }; }],
      ['causal.analyze',    () => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.analyze(); }],
      ['causal.edges',      (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getEdges(p(params)?.minStrength); }],
      ['causal.chains',     (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.findChains(p(params)?.maxDepth); }],
      ['causal.causes',     (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getCauses(p(params).type); }],
      ['causal.effects',    (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getEffects(p(params).type); }],
      ['causal.analysis',   () => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getAnalysis(); }],
      ['causal.stats',      () => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.getEventStats(); }],

      // ─── Hypothesis Engine ─────────────────────────────────
      ['hypothesis.observe',  (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); s.hypothesis.observe(p(params)); return { observed: true }; }],
      ['hypothesis.generate', () => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.generate(); }],
      ['hypothesis.test',     (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.test(p(params).id); }],
      ['hypothesis.testAll',  () => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.testAll(); }],
      ['hypothesis.list',     (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.list(p(params)?.status, p(params)?.limit); }],
      ['hypothesis.summary',  () => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.getSummary(); }],
      ['hypothesis.propose',  (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.propose(p(params)); }],

      // ─── Autonomous Research ─────────────────────────────
      ['research.status',      () => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); return s.researchScheduler.getStatus(); }],
      ['research.run',         () => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); return s.researchScheduler.runCycle(); }],
      ['research.discoveries', (params) => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); return s.researchScheduler.getDiscoveries(p(params)?.type, p(params)?.limit); }],
      ['research.reports',     (params) => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); return s.researchScheduler.getCycleReports(p(params)?.limit); }],
      ['research.record',      (params) => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); s.researchScheduler.recordEvent(p(params).type, p(params).data); return { recorded: true }; }],
      ['research.onCycle',     (params) => { if (!s.researchScheduler) throw new Error('Research scheduler not available'); s.researchScheduler.onLearningCycleComplete(p(params).metrics, p(params).score); return { recorded: true }; }],

      // ─── Self-Observer ──────────────────────────────────────
      ['observer.record',       (params) => { if (!s.selfObserver) throw new Error('Self-observer not available'); s.selfObserver.record(p(params)); return { recorded: true }; }],
      ['observer.stats',        () => { if (!s.selfObserver) throw new Error('Self-observer not available'); return s.selfObserver.getStats(); }],
      ['observer.analyze',      () => { if (!s.selfObserver) throw new Error('Self-observer not available'); return s.selfObserver.analyze(); }],
      ['observer.insights',     (params) => { if (!s.selfObserver) throw new Error('Self-observer not available'); return s.selfObserver.getInsights(p(params)?.type, p(params)?.limit); }],
      ['observer.plan',         () => { if (!s.selfObserver) throw new Error('Self-observer not available'); return s.selfObserver.getImprovementPlan(); }],

      // ─── Adaptive Strategy ───────────────────────────────────
      ['strategy.status',       () => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.getStatus(); }],
      ['strategy.adapt',        (params) => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.adapt(p(params).strategy, p(params).parameter, p(params).value, p(params).reason, p(params).evidence ?? {}); }],
      ['strategy.adaptations',  (params) => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.getAdaptations(p(params)?.strategy, p(params)?.limit); }],
      ['strategy.revert',       (params) => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.revert(p(params).id, p(params)?.reason); }],
      ['strategy.param',        (params) => { if (!s.adaptiveStrategy) throw new Error('Adaptive strategy not available'); return s.adaptiveStrategy.getParam(p(params).strategy, p(params).parameter); }],

      // ─── Experiment Engine ───────────────────────────────────
      ['experiment.list',       (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.list(p(params)?.status, p(params)?.limit); }],
      ['experiment.propose',    (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.propose(p(params)); }],
      ['experiment.start',      (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.start(p(params).id); }],
      ['experiment.measure',    (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.recordMeasurement(p(params).id, p(params).value); }],
      ['experiment.get',        (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.get(p(params).id); }],
      ['experiment.results',    (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.getResults(p(params)?.limit); }],
      ['experiment.abort',      (params) => { if (!s.experimentEngine) throw new Error('Experiment engine not available'); return s.experimentEngine.abort(p(params).id); }],

      // ─── Cross-Domain Engine ─────────────────────────────────
      ['crossdomain.record',       (params) => { if (!s.crossDomain) throw new Error('Cross-domain engine not available'); s.crossDomain.recordEvent(p(params).brain, p(params).event_type, p(params).data); return { recorded: true }; }],
      ['crossdomain.analyze',      () => { if (!s.crossDomain) throw new Error('Cross-domain engine not available'); return s.crossDomain.analyze(); }],
      ['crossdomain.correlations', (params) => { if (!s.crossDomain) throw new Error('Cross-domain engine not available'); return s.crossDomain.getCorrelations(p(params)?.limit); }],
      ['crossdomain.narrative',    () => { if (!s.crossDomain) throw new Error('Cross-domain engine not available'); return s.crossDomain.getNarrative(); }],

      // ─── Counterfactual Engine ───────────────────────────────
      ['counterfactual.whatif',     (params) => { if (!s.counterfactual) throw new Error('Counterfactual engine not available'); return s.counterfactual.whatIf(p(params)); }],
      ['counterfactual.history',   (params) => { if (!s.counterfactual) throw new Error('Counterfactual engine not available'); return s.counterfactual.getHistory(p(params)?.limit); }],
      ['counterfactual.impact',    (params) => { if (!s.counterfactual) throw new Error('Counterfactual engine not available'); return s.counterfactual.estimateIntervention(p(params).variable, p(params).proposed_value, p(params).current_value); }],

      // ─── Knowledge Distiller ─────────────────────────────────
      ['knowledge.distill',        () => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.distill(); }],
      ['knowledge.summary',        () => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getSummary(); }],
      ['knowledge.principles',     (params) => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getPrinciples(p(params)?.domain, p(params)?.limit); }],
      ['knowledge.antipatterns',   (params) => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getAntiPatterns(p(params)?.domain, p(params)?.limit); }],
      ['knowledge.package',        (params) => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getPackage(p(params).domain); }],
      ['knowledge.evolution',      (params) => { if (!s.knowledgeDistiller) throw new Error('Knowledge distiller not available'); return s.knowledgeDistiller.getEvolution(p(params)?.domain, p(params)?.periods); }],

      // ─── Research Agenda ─────────────────────────────────────
      ['agenda.generate',          () => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.generate(); }],
      ['agenda.list',              (params) => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.getAgenda(p(params)?.limit); }],
      ['agenda.next',              () => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.getNext(); }],
      ['agenda.prioritize',        (params) => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.setPriority(p(params).id, p(params).priority); }],
      ['agenda.ask',               (params) => { if (!s.researchAgenda) throw new Error('Research agenda not available'); return s.researchAgenda.ask(p(params).question, p(params)?.type); }],

      // ─── Anomaly Detective ───────────────────────────────────
      ['anomaly.record',           (params) => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); s.anomalyDetective.recordMetric(p(params).metric, p(params).value); return { recorded: true }; }],
      ['anomaly.detect',           () => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.detect(); }],
      ['anomaly.list',             (params) => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.getAnomalies(p(params)?.type, p(params)?.limit); }],
      ['anomaly.investigate',      (params) => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.investigate(p(params).id); }],
      ['anomaly.history',          (params) => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.getHistory(p(params)?.limit); }],
      ['anomaly.drift',            () => { if (!s.anomalyDetective) throw new Error('Anomaly detective not available'); return s.anomalyDetective.getDriftReport(); }],

      // ─── Research Journal ────────────────────────────────────
      ['journal.write',            (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.write(p(params)); }],
      ['journal.entries',          (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.getEntries(p(params)?.type, p(params)?.limit); }],
      ['journal.summary',          (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.getSummary(p(params)?.limit); }],
      ['journal.milestones',       (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.getMilestones(p(params)?.limit); }],
      ['journal.search',           (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.search(p(params).query, p(params)?.limit); }],
      ['journal.reflect',          () => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.reflect(); }],

      // Status (cross-brain)
      ['status',                  () => ({
        name: 'brain',
        version: '3.7.0',
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        methods: this.listMethods().length,
      })],
    ]);
  }
}
