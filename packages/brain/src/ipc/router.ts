import { getLogger } from '../utils/logger.js';
import { getCurrentVersion } from '../cli/update-check.js';

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
import type { DreamEngine } from '@timmeck/brain-core';
import type { ThoughtStream, ConsciousnessServer } from '@timmeck/brain-core';
import type { PredictionEngine } from '@timmeck/brain-core';
import type { ResearchOrchestrator } from '@timmeck/brain-core';
import type { SignalScanner } from '@timmeck/brain-core';
import type { TechRadarEngine } from '@timmeck/brain-core';
import type { NotificationService as MultiChannelNotificationService } from '@timmeck/brain-core';
import type { CodeGenerator } from '@timmeck/brain-core';
import type { CodeMiner } from '@timmeck/brain-core';
import type { PatternExtractor } from '@timmeck/brain-core';
import type { ProjectScanner } from '../services/project-scanner.js';
import type { ReposignalImporter } from '../services/reposignal-importer.js';

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
  dreamEngine?: DreamEngine;
  thoughtStream?: ThoughtStream;
  consciousnessServer?: ConsciousnessServer;
  predictionEngine?: PredictionEngine;
  orchestrator?: ResearchOrchestrator;
  signalScanner?: SignalScanner;
  techRadar?: TechRadarEngine;
  multiChannelNotifications?: MultiChannelNotificationService;
  codeGenerator?: CodeGenerator;
  codeMiner?: CodeMiner;
  patternExtractor?: PatternExtractor;
  codegenServer?: import('@timmeck/brain-core').CodegenServer;
  attentionEngine?: import('@timmeck/brain-core').AttentionEngine;
  transferEngine?: import('@timmeck/brain-core').TransferEngine;
  commandCenter?: import('@timmeck/brain-core').CommandCenterServer;
  narrativeEngine?: import('@timmeck/brain-core').NarrativeEngine;
  curiosityEngine?: import('@timmeck/brain-core').CuriosityEngine;
  emergenceEngine?: import('@timmeck/brain-core').EmergenceEngine;
  debateEngine?: import('@timmeck/brain-core').DebateEngine;
  parameterRegistry?: import('@timmeck/brain-core').ParameterRegistry;
  metaCognitionLayer?: import('@timmeck/brain-core').MetaCognitionLayer;
  autoExperimentEngine?: import('@timmeck/brain-core').AutoExperimentEngine;
  selfTestEngine?: import('@timmeck/brain-core').SelfTestEngine;
  teachEngine?: import('@timmeck/brain-core').TeachEngine;
  dataScout?: import('@timmeck/brain-core').DataScout;
  simulationEngine?: import('@timmeck/brain-core').SimulationEngine;
  memoryPalace?: import('@timmeck/brain-core').MemoryPalace;
  goalEngine?: import('@timmeck/brain-core').GoalEngine;
  evolutionEngine?: import('@timmeck/brain-core').EvolutionEngine;
  reasoningEngine?: import('@timmeck/brain-core').ReasoningEngine;
  emotionalModel?: import('@timmeck/brain-core').EmotionalModel;
  selfScanner?: import('@timmeck/brain-core').SelfScanner;
  selfModificationEngine?: import('@timmeck/brain-core').SelfModificationEngine;
  conceptAbstraction?: import('@timmeck/brain-core').ConceptAbstraction;
  peerNetwork?: import('@timmeck/brain-core').PeerNetwork;
  llmService?: import('@timmeck/brain-core').LLMService;
  missionEngine?: import('@timmeck/brain-core').ResearchMissionEngine;
  watchdog?: import('@timmeck/brain-core').WatchdogService;
  pluginRegistry?: import('@timmeck/brain-core').PluginRegistry;
  borgSync?: import('@timmeck/brain-core').BorgSyncEngine;
  projectScanner?: ProjectScanner;
  reposignalImporter?: ReposignalImporter;
  ragEngine?: import('@timmeck/brain-core').RAGEngine;
  ragIndexer?: import('@timmeck/brain-core').RAGIndexer;
  knowledgeGraph?: import('@timmeck/brain-core').KnowledgeGraphEngine;
  factExtractor?: import('@timmeck/brain-core').FactExtractor;
  semanticCompressor?: import('@timmeck/brain-core').SemanticCompressor;
  feedbackEngine?: import('@timmeck/brain-core').FeedbackEngine;
  toolTracker?: import('@timmeck/brain-core').ToolTracker;
  toolPatternAnalyzer?: import('@timmeck/brain-core').ToolPatternAnalyzer;
  proactiveEngine?: import('@timmeck/brain-core').ProactiveEngine;
  userModel?: import('@timmeck/brain-core').UserModel;
  codeHealthMonitor?: import('@timmeck/brain-core').CodeHealthMonitor;
  teachingProtocol?: import('@timmeck/brain-core').TeachingProtocol;
  curriculum?: import('@timmeck/brain-core').Curriculum;
  consensusEngine?: import('@timmeck/brain-core').ConsensusEngine;
  activeLearner?: import('@timmeck/brain-core').ActiveLearner;
  repoAbsorber?: import('@timmeck/brain-core').RepoAbsorber;
  featureExtractor?: import('@timmeck/brain-core').FeatureExtractor;
  featureRecommender?: import('@timmeck/brain-core').FeatureRecommender;
  contradictionResolver?: import('@timmeck/brain-core').ContradictionResolver;
  checkpointManager?: import('@timmeck/brain-core').CheckpointManager;
  traceCollector?: import('@timmeck/brain-core').TraceCollector;
  messageRouter?: import('@timmeck/brain-core').MessageRouter;
  telegramBot?: import('@timmeck/brain-core').TelegramBot;
  discordBot?: import('@timmeck/brain-core').DiscordBot;
  benchmarkSuite?: import('@timmeck/brain-core').BenchmarkSuite;
  agentTrainer?: import('@timmeck/brain-core').AgentTrainer;
  toolScopeManager?: import('@timmeck/brain-core').ToolScopeManager;
  pluginMarketplace?: import('@timmeck/brain-core').PluginMarketplace;
  codeSandbox?: import('@timmeck/brain-core').CodeSandbox;
  guardrailEngine?: import('@timmeck/brain-core').GuardrailEngine;
  causalPlanner?: import('@timmeck/brain-core').CausalPlanner;
  researchRoadmap?: import('@timmeck/brain-core').ResearchRoadmap;
  creativeEngine?: import('@timmeck/brain-core').CreativeEngine;
  actionBridge?: import('@timmeck/brain-core').ActionBridgeEngine;
  contentForge?: import('@timmeck/brain-core').ContentForge;
  codeForge?: import('@timmeck/brain-core').CodeForge;
  strategyForge?: import('@timmeck/brain-core').StrategyForge;
  signalRouter?: import('@timmeck/brain-core').CrossBrainSignalRouter;
  chatEngine?: import('@timmeck/brain-core').ChatEngine;
  subAgentFactory?: import('@timmeck/brain-core').SubAgentFactory;
  memoryWatchdog?: import('@timmeck/brain-core').MemoryWatchdog;
  engineRegistry?: import('@timmeck/brain-core').EngineRegistry;
  runtimeInfluenceTracker?: import('@timmeck/brain-core').RuntimeInfluenceTracker;
  loopDetector?: import('@timmeck/brain-core').LoopDetector;
  governanceLayer?: import('@timmeck/brain-core').GovernanceLayer;
  adaptiveScheduler?: import('@timmeck/brain-core').AdaptiveScheduler;
  tokenBudgetTracker?: import('@timmeck/brain-core').EngineTokenBudgetTracker;
  cycleOutcomeTracker?: import('@timmeck/brain-core').CycleOutcomeTracker;
  conversationMemory?: import('@timmeck/brain-core').ConversationMemory;
  browserAgent?: import('@timmeck/brain-core').BrowserAgent;
  brainBot?: import('@timmeck/brain-core').BrainBot;
  autonomousResearchLoop?: import('@timmeck/brain-core').AutonomousResearchLoop;
}

type MethodHandler = (params: unknown) => unknown | Promise<unknown>;

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
      // Route teaching lessons to TeachingProtocol
      if (event === 'teaching.learn' && this.services.teachingProtocol) {
        this.services.teachingProtocol.learn(data);
        // Bridge to TransferEngine so knowledge_transfers table gets populated
        if (this.services.transferEngine && data?.domain && data?.principle) {
          this.services.transferEngine.recordIncomingTransfer(
            data.sourceBrain ?? source, data.domain, data.principle, data.applicability ?? 0.5,
          );
        }
        logger.info(`[cross-brain] Learned lesson from ${source}`);
      }
      // Route teaching feedback
      if (event === 'teaching.feedback') {
        logger.info(`[cross-brain] Teaching feedback from ${source}: accepted=${data?.accepted}, relevance=${data?.relevanceScore}`);
      }
      manager.handleIncomingEvent(source, event, data);
      return { received: true, source, event };
    });
  }

  handle(method: string, params: unknown): unknown | Promise<unknown> {
    const handler = this.methods.get(method);
    if (!handler) {
      throw new Error(`Unknown method: ${method}`);
    }

    const start = Date.now();
    try {
      logger.debug(`IPC: ${method}`, { params });
      const result = handler(params);
      // Wrap async results to catch rejections
      if (result instanceof Promise) {
        return result.then(
          (res) => { this.trackToolCall(method, Date.now() - start, true); return res; },
          (err: Error) => {
            logger.error(`IPC handler error (async) in ${method}: ${err.message}`);
            this.trackToolCall(method, Date.now() - start, false);
            throw err;
          },
        );
      }
      logger.debug(`IPC: ${method} → done`);
      this.trackToolCall(method, Date.now() - start, true);
      return result;
    } catch (err) {
      logger.error(`IPC handler error in ${method}: ${(err as Error).message}`);
      this.trackToolCall(method, Date.now() - start, false);
      throw err;
    }
  }

  /** Fire-and-forget: record tool usage in ToolTracker + UserModel + ScopeCheck. */
  private trackToolCall(method: string, durationMs: number, success: boolean): void {
    try {
      this.services.toolTracker?.recordUsage(method, null, durationMs, success ? 'success' : 'failure');
      this.services.userModel?.updateFromInteraction(method, null, success ? 'success' : 'failure');
      // Fix 7: Dynamic Scoping — log scope check for every tool call (fire & forget)
      if (this.services.toolScopeManager) {
        try {
          this.services.toolScopeManager.checkTool(method, { phase: 'runtime' });
        } catch { /* scope check logging should never disrupt IPC */ }
      }
    } catch { /* best effort — never disrupt IPC flow */ }
  }

  /** Register a dynamic route (e.g. from plugins). */
  registerMethod(method: string, handler: MethodHandler): void {
    this.methods.set(method, handler);
  }

  listMethods(): string[] {
    return [...this.methods.keys()];
  }

  private buildMethodMap(): Map<string, MethodHandler> {
    const s = this.services;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (params: unknown) => (params ?? {}) as any;

    return new Map<string, MethodHandler>([
      // Terminal Lifecycle
      ['terminal.register',       (params) => s.terminal.register(p(params))],
      ['terminal.heartbeat',      (params) => s.terminal.heartbeat(p(params).uuid)],
      ['terminal.disconnect',     (params) => s.terminal.disconnect(p(params).uuid)],

      // Error Brain
      ['error.report',            (params) => {
        const args = p(params);
        const result = s.error.report(args);
        if (args.solution && typeof args.solution === 'string' && args.solution.trim()) {
          const solutionId = s.solution.report({
            errorId: result.errorId,
            description: args.solution,
            source: 'auto_report',
          });
          return { ...result, solutionId };
        }
        return result;
      }],
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
      ['notification.pending',    () => s.notification.list()],
      ['notification.ackAll',     () => {
        const pending = s.notification.list();
        for (const n of pending) {
          s.notification.acknowledge(n.id);
        }
        return { acknowledged: pending.length };
      }],

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
        s.notification.create({
          type: `cross-brain:${source}`,
          title: event,
          message: JSON.stringify(data ?? {}),
          priority: (data as Record<string, unknown>)?.priority as number ?? 0,
        });
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
      ['hypothesis.survival', () => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.getSurvivalMetrics(); }],

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

      // ─── Dream Mode ──────────────────────────────────────────
      ['dream.start',              () => { if (!s.dreamEngine) throw new Error('Dream engine not available'); s.dreamEngine.start(); return { started: true }; }],
      ['dream.stop',               () => { if (!s.dreamEngine) throw new Error('Dream engine not available'); s.dreamEngine.stop(); return { stopped: true }; }],
      ['dream.status',             () => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.getStatus(); }],
      ['dream.consolidate',        (params) => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.consolidate(p(params)?.trigger ?? 'manual'); }],
      ['dream.history',            (params) => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.getHistory(p(params)?.limit); }],
      ['dream.journal',            (params) => { if (!s.journal) throw new Error('Research journal not available'); return s.journal.search('dream', p(params)?.limit ?? 10); }],

      // ─── Prediction Engine ───────────────────────────────────
      ['predict.make',           (params) => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return s.predictionEngine.predict(p(params)); }],
      ['predict.list',           (params) => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return s.predictionEngine.list(p(params)?.domain, p(params)?.status, p(params)?.limit); }],
      ['predict.accuracy',       (params) => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return s.predictionEngine.getAccuracy(p(params)?.domain); }],
      ['predict.summary',        () => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return s.predictionEngine.getSummary(); }],
      ['predict.resolve',        () => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return { resolved: s.predictionEngine.resolveExpired() }; }],
      ['predict.record',         (params) => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); s.predictionEngine.recordMetric(p(params).metric, p(params).value, p(params)?.domain); return { recorded: true }; }],
      ['predict.calibration',    () => { if (!s.predictionEngine) throw new Error('Prediction engine not available'); return s.predictionEngine.getCalibration(); }],

      // ─── Consciousness ──────────────────────────────────────
      ['consciousness.status',    () => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); return { ...s.thoughtStream.getStats(), engines: s.thoughtStream.getEngineActivity(), clients: s.consciousnessServer?.getClientCount() ?? 0 }; }],
      ['consciousness.thoughts',  (params) => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); const pp = p(params); return pp?.engine ? s.thoughtStream.getByEngine(pp.engine, pp?.limit ?? 50) : s.thoughtStream.getRecent(pp?.limit ?? 50); }],
      ['consciousness.engines',   () => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); return s.thoughtStream.getEngineActivity(); }],
      ['consciousness.clear',     () => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); s.thoughtStream.clear(); return { cleared: true }; }],
      ['engines.status',          () => s.thoughtStream?.getEngineActivity?.() ?? []],

      // ─── AutoResponder ────────────────────────────────────
      ['responder.status',        () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.autoResponder.getStatus(); }],
      ['responder.history',       (params) => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.autoResponder.getHistory(p(params)?.limit ?? 20); }],
      ['responder.rules',         () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.autoResponder.getRules(); }],
      ['responder.add_rule',      (params) => { if (!s.orchestrator) throw new Error('Orchestrator not available'); const pp = p(params); s.orchestrator.autoResponder.addRule(pp); return { added: true }; }],

      // ─── Attention Engine ───────────────────────────────────
      ['attention.status',        () => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); return s.attentionEngine.getStatus(); }],
      ['attention.focus',         (params) => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); const pp = p(params); s.attentionEngine.setFocus(pp.topic, pp.intensity ?? 2.0); return { focused: true, topic: pp.topic }; }],
      ['attention.timeline',      (params) => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); return s.attentionEngine.getFocusTimeline(p(params)?.limit ?? 50); }],
      ['attention.context',       () => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); return { context: s.attentionEngine.getCurrentContext(), history: s.attentionEngine.getContextHistory(20) }; }],
      ['attention.weights',       () => { if (!s.attentionEngine) throw new Error('AttentionEngine not available'); return s.attentionEngine.computeEngineWeights(); }],

      // ─── Transfer Engine ───────────────────────────────────
      ['transfer.status',         () => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getStatus(); }],
      ['transfer.analogies',      (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getAnalogies(p(params)?.limit ?? 20); }],
      ['transfer.rules',          () => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getRules(); }],
      ['transfer.history',        (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getTransferHistory(p(params)?.limit ?? 50); }],
      ['transfer.analyze',        () => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.analyze(); }],

      // ─── Narrative Engine ──────────────────────────────────
      ['narrative.explain',        (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.explainAsync(p(params).topic); }],
      ['narrative.ask',            (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.askAsync(p(params).question); }],
      ['narrative.contradictions', () => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.findContradictions(); }],
      ['narrative.digest',         (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.generateDigest(p(params)?.days ?? 7); }],
      ['narrative.confidence',     (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.getConfidenceReport(p(params)?.topic); }],
      ['narrative.status',         () => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.getStatus(); }],

      // ─── Curiosity Engine ──────────────────────────────────
      ['curiosity.status',          () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.getStatus(); }],
      ['curiosity.gaps',            (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.getGaps(p(params)?.limit ?? 10); }],
      ['curiosity.detect',          () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.detectGaps(); }],
      ['curiosity.select',          () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.selectTopic(); }],
      ['curiosity.questions',       (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.getQuestions(p(params)?.limit ?? 20); }],
      ['curiosity.surprises',       () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.detectSurprises(); }],
      ['curiosity.record',          (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); const pp = p(params); s.curiosityEngine.recordOutcome(pp.topic, pp.action, pp.reward, pp.context ?? ''); return { recorded: true }; }],
      ['curiosity.answer',          (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); const pp = p(params); return { answered: s.curiosityEngine.answerQuestion(pp.id, pp.answer) }; }],

      // ─── Emergence Engine ──────────────────────────────────
      ['emergence.status',          () => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getStatus(); }],
      ['emergence.detect',          () => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.detect(); }],
      ['emergence.events',          (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getEvents(p(params)?.limit ?? 20); }],
      ['emergence.events.byType',   (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getEventsByType(p(params)?.type); }],
      ['emergence.metrics',         () => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.recordMetrics(); }],
      ['emergence.metrics.latest',  () => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getLatestMetrics(); }],
      ['emergence.metrics.trend',   (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.getMetricsTrend(p(params)?.limit ?? 20); }],
      ['emergence.surprise',        (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return { score: s.emergenceEngine.computeSurpriseScore(p(params).observation, p(params).context ?? {}) }; }],

      // ─── Debate ────────────────────────────────────────────
      ['debate.start',              (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.startDebate(p(params).question); }],
      ['debate.perspective',        (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.generatePerspective(p(params).question); }],
      ['debate.add',                (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); s.debateEngine.addPerspective(p(params).debateId, p(params).perspective); return { added: true }; }],
      ['debate.synthesize',         (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.synthesizeAsync(p(params).debateId); }],
      ['debate.get',                (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.getDebate(p(params).debateId); }],
      ['debate.list',               (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.listDebates(p(params)?.limit ?? 20); }],
      ['debate.status',             () => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.getStatus(); }],

      // ─── Meta-Cognition ────────────────────────
      ['metacognition.status',     () => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getStatus(); }],
      ['metacognition.evaluate',   () => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.evaluate(); }],
      ['metacognition.report',     (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getReportCard(p(params).engine); }],
      ['metacognition.trend',      (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getTrend(p(params).engine, p(params)?.limit ?? 10); }],

      // ─── Auto-Experiment ────────────────────────
      ['autoexperiment.status',    () => { if (!s.autoExperimentEngine) throw new Error('AutoExperimentEngine not available'); return s.autoExperimentEngine.getStatus(); }],
      ['autoexperiment.candidates', () => { if (!s.autoExperimentEngine) throw new Error('AutoExperimentEngine not available'); return s.autoExperimentEngine.discoverCandidates(0); }],

      // ─── Parameter Registry ────────────────────
      ['parameter.list',           (params) => { if (!s.parameterRegistry) throw new Error('ParameterRegistry not available'); return s.parameterRegistry.list(p(params)?.engine); }],
      ['parameter.history',        (params) => { if (!s.parameterRegistry) throw new Error('ParameterRegistry not available'); return s.parameterRegistry.getRecentChanges(p(params)?.limit ?? 20); }],

      // ─── Command Center Dashboard ─────────────────────────────────
      ['unified.clients',         () => { return { clients: s.commandCenter?.getClientCount?.() ?? 0, port: 7790 }; }],

      // ─── Orchestrator ─────────────────────────────────────
      ['orchestrator.feedback',   () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); s.orchestrator.runFeedbackCycle(); return { triggered: true }; }],
      ['orchestrator.summary',    () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.getSummary(); }],

      // ─── Project Scanner ──────────────────────────────────
      ['scan.project',            (params) => { if (!s.projectScanner) throw new Error('Project scanner not available'); return s.projectScanner.scan(p(params).directory, p(params).project ?? 'unknown', p(params).options); }],
      ['scan.git',                (params) => { if (!s.projectScanner) throw new Error('Project scanner not available'); return s.projectScanner.scanGitHistory(p(params).directory, p(params).project ?? 'unknown', p(params).depth ?? p(params).git_depth ?? 200); }],
      ['scan.logs',               (params) => { if (!s.projectScanner) throw new Error('Project scanner not available'); return s.projectScanner.scanLogFiles(p(params).directory, p(params).project ?? 'unknown'); }],
      ['scan.build',              (params) => { if (!s.projectScanner) throw new Error('Project scanner not available'); return s.projectScanner.scanBuildOutput(p(params).directory, p(params).project ?? 'unknown'); }],
      ['scan.status',             () => { if (!s.projectScanner) throw new Error('Project scanner not available'); return s.projectScanner.getLastResult(); }],

      // ─── Signal Scanner ──────────────────────────────────────
      ['scanner.scan',           async () => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.scan(); }],
      ['scanner.status',         () => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.getStatus(); }],
      ['scanner.stop',           () => { if (!s.signalScanner) throw new Error('Signal scanner not available'); s.signalScanner.abortScan(); return { stopped: true }; }],
      ['scanner.signals',        (params) => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.getSignals(p(params).level, p(params)?.limit); }],
      ['scanner.repo',           (params) => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.getRepo(p(params).github_id ?? p(params).githubId); }],
      ['scanner.trending',       (params) => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.getTrending(p(params)?.limit); }],
      ['scanner.search',         (params) => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.searchRepos(p(params).query ?? '', p(params)?.language, p(params)?.limit); }],
      ['scanner.stats',          () => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.getStats(); }],
      ['scanner.crypto',         (params) => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.getCryptoTokens(p(params)?.limit); }],
      ['scanner.crypto.trending', () => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.getCryptoTrending(); }],
      ['scanner.hn',             (params) => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.getHnMentions(p(params)?.limit); }],
      ['scanner.config',         (params) => { if (!s.signalScanner) throw new Error('Signal scanner not available'); if (p(params) && Object.keys(p(params)).length > 0) return s.signalScanner.updateConfig(p(params)); return s.signalScanner.getConfig(); }],
      ['scanner.import.api',     async (params) => { if (!s.signalScanner) throw new Error('Signal scanner not available'); return s.signalScanner.importFromApi(p(params)?.url, { limit: p(params)?.limit, level: p(params)?.level, adminKey: p(params)?.adminKey }); }],

      // ─── TechRadar ──────────────────────────────────────────
      ['techradar.scan',          async () => { if (!s.techRadar) throw new Error('TechRadar not available'); return s.techRadar.scan(); }],
      ['techradar.digest',        (params) => { if (!s.techRadar) throw new Error('TechRadar not available'); return s.techRadar.getDigest(p(params)?.date); }],
      ['techradar.generateDigest', async (params) => { if (!s.techRadar) throw new Error('TechRadar not available'); return s.techRadar.generateDigest(p(params)?.date); }],
      ['techradar.entries',       (params) => { if (!s.techRadar) throw new Error('TechRadar not available'); return s.techRadar.getEntries({ minScore: p(params)?.minScore, source: p(params)?.source, ring: p(params)?.ring, limit: p(params)?.limit }); }],
      ['techradar.stats',         () => { if (!s.techRadar) throw new Error('TechRadar not available'); return s.techRadar.getStats(); }],
      ['techradar.repos.list',    () => { if (!s.techRadar) throw new Error('TechRadar not available'); return s.techRadar.getWatchedRepos(); }],
      ['techradar.repos.add',     (params) => { if (!s.techRadar) throw new Error('TechRadar not available'); s.techRadar.addWatchedRepo(p(params).repo, p(params)?.reason); return { added: true }; }],
      ['techradar.repos.remove',  (params) => { if (!s.techRadar) throw new Error('TechRadar not available'); s.techRadar.removeWatchedRepo(p(params).repo); return { removed: true }; }],

      // ─── Multi-Channel Notifications ─────────────────────────
      ['notifications.send',      async (params) => { if (!s.multiChannelNotifications) throw new Error('NotificationService not available'); return s.multiChannelNotifications.notify(p(params)); }],
      ['notifications.providers',  async () => { if (!s.multiChannelNotifications) throw new Error('NotificationService not available'); return s.multiChannelNotifications.getProviderStatus(); }],
      ['notifications.history',   (params) => { if (!s.multiChannelNotifications) throw new Error('NotificationService not available'); return s.multiChannelNotifications.getHistory({ event: p(params)?.event, limit: p(params)?.limit }); }],
      ['notifications.routing',   () => { if (!s.multiChannelNotifications) throw new Error('NotificationService not available'); return s.multiChannelNotifications.getEventRouting(); }],

      // ─── Reposignal Import ──────────────────────────────────
      ['import.reposignal',       (params) => { if (!s.reposignalImporter) throw new Error('Reposignal importer not available'); return s.reposignalImporter.import(p(params).dbPath, p(params).options); }],
      ['import.reposignal.status', () => { if (!s.reposignalImporter) throw new Error('Reposignal importer not available'); return s.reposignalImporter.getLastResult(); }],
      ['import.reposignal.stats', () => { if (!s.reposignalImporter) throw new Error('Reposignal importer not available'); return s.reposignalImporter.getStats(); }],

      // ─── CodeGenerator ──────────────────────────────────────
      ['codegen.generate',        async (params) => { if (!s.codeGenerator) throw new Error('CodeGenerator not available (set ANTHROPIC_API_KEY)'); return s.codeGenerator.generate(p(params)); }],
      ['codegen.get',             (params) => { if (!s.codeGenerator) throw new Error('CodeGenerator not available'); return s.codeGenerator.get(p(params).id); }],
      ['codegen.list',            (params) => { if (!s.codeGenerator) throw new Error('CodeGenerator not available'); return s.codeGenerator.list(p(params)?.status, p(params)?.limit); }],
      ['codegen.approve',         (params) => { if (!s.codeGenerator) throw new Error('CodeGenerator not available'); return s.codeGenerator.approve(p(params).id, p(params)?.notes); }],
      ['codegen.reject',          (params) => { if (!s.codeGenerator) throw new Error('CodeGenerator not available'); return s.codeGenerator.reject(p(params).id, p(params)?.notes); }],
      ['codegen.summary',         () => { if (!s.codeGenerator) throw new Error('CodeGenerator not available'); return s.codeGenerator.getSummary(); }],

      // ─── CodeMiner ──────────────────────────────────────────
      ['codeminer.status',        () => { if (!s.codeMiner) throw new Error('CodeMiner not available'); return s.codeMiner.getSummary(); }],
      ['codeminer.patterns',      (params) => { if (!s.patternExtractor) throw new Error('PatternExtractor not available'); return p(params)?.extract ? s.patternExtractor.extractAll() : s.patternExtractor.getPatterns(p(params)?.type, p(params)?.limit); }],

      // ─── Code Self-Improvement ──────────────────────────────
      ['codegen.propose_improvement', (params) => { if (!s.codeGenerator) throw new Error('CodeGenerator not available'); return s.codeGenerator.proposeSelfImprovement(p(params).engine, p(params).problem, p(params).proposedChange); }],
      ['codegen.list_proposals',   (params) => { if (!s.codeGenerator) throw new Error('CodeGenerator not available'); return s.codeGenerator.listProposals(p(params)?.status, p(params)?.limit); }],
      ['codegen.approve_proposal', (params) => { if (!s.codeGenerator) throw new Error('CodeGenerator not available'); return s.codeGenerator.approveProposal(p(params).id); }],
      ['codegen.reject_proposal',  (params) => { if (!s.codeGenerator) throw new Error('CodeGenerator not available'); return s.codeGenerator.rejectProposal(p(params).id); }],

      // ─── Blind Spots ──────────────────────────────────────────
      ['blindspot.detect',        () => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.detectBlindSpots(); }],
      ['blindspot.list',          (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.getBlindSpots(p(params)?.limit ?? 10); }],
      ['blindspot.resolve',       (params) => { if (!s.curiosityEngine) throw new Error('CuriosityEngine not available'); return s.curiosityEngine.resolveBlindSpot(p(params).id); }],

      // ─── Meta Trends ──────────────────────────────────────────
      ['metatrend.record',        (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.recordTrend(p(params).cycle, p(params).stats); }],
      ['metatrend.get',           (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getMetaTrend(p(params)?.windowCycles); }],
      ['metatrend.longterm',      (params) => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.getLongTermAnalysis(p(params)?.days); }],
      ['metatrend.seasonal',      () => { if (!s.metaCognitionLayer) throw new Error('MetaCognitionLayer not available'); return s.metaCognitionLayer.detectSeasonalPatterns(); }],

      // ─── Creative Hypotheses ──────────────────────────────────
      ['hypothesis.creative',     (params) => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.generateCreativeLLM(p(params)?.count); }],
      ['hypothesis.creative_stats', () => { if (!s.hypothesis) throw new Error('Hypothesis engine not available'); return s.hypothesis.getCreativeStats(); }],

      // ─── Challenges (Advocatus Diaboli) ─────────────────────
      ['challenge.principle',     (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.challenge(p(params).statement); }],
      ['challenge.history',       (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.getChallengeHistory(p(params)?.limit); }],
      ['challenge.vulnerable',    (params) => { if (!s.debateEngine) throw new Error('DebateEngine not available'); return s.debateEngine.getMostVulnerable(p(params)?.limit); }],

      // ─── Dream Retrospective ──────────────────────────────────
      ['dream.retrospective',     (params) => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.analyzeRetrospective(p(params)?.lastNCycles); }],
      ['dream.retrospective.list', (params) => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.getRetrospective(p(params)?.limit); }],
      ['dream.pruning_efficiency', () => { if (!s.dreamEngine) throw new Error('Dream engine not available'); return s.dreamEngine.getPruningEfficiency(); }],

      // ─── Cross-Brain Dialogue ──────────────────────────────────
      ['dialogue.ask',            (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.formulateQuestion(p(params).topic); }],
      ['dialogue.answer',         (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.answerQuestion(p(params).question); }],
      ['dialogue.record',         (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.recordDialogue(p(params).source, p(params).target, p(params).question, p(params).answer, p(params).context); }],
      ['dialogue.rate',           (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); s.transferEngine.rateDialogue(p(params).id, p(params).usefulness); return { rated: true }; }],
      ['dialogue.history',        (params) => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getDialogueHistory(p(params)?.peer, p(params)?.limit); }],
      ['dialogue.stats',          () => { if (!s.transferEngine) throw new Error('TransferEngine not available'); return s.transferEngine.getDialogueStats(); }],

      // ─── Causal Interventions ──────────────────────────────────
      ['causal.confounders',      (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.detectConfounders(p(params).cause, p(params).effect); }],
      ['causal.evolution',        (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.trackStrengthEvolution(p(params).cause, p(params).effect, p(params)?.windowDays); }],
      ['causal.validate',         (params) => { if (!s.causal) throw new Error('Causal engine not available'); return s.causal.validateChain(p(params).chain); }],

      // ─── Emergence Explain ──────────────────────────────────────
      ['emergence.explain',       (params) => { if (!s.emergenceEngine) throw new Error('EmergenceEngine not available'); return s.emergenceEngine.explain(p(params).eventId); }],

      // ─── Self-Test ──────────────────────────────────────────────
      ['selftest.principle',      (params) => { if (!s.selfTestEngine) throw new Error('SelfTestEngine not available'); return s.selfTestEngine.testPrinciple(p(params).statement); }],
      ['selftest.all',            () => { if (!s.selfTestEngine) throw new Error('SelfTestEngine not available'); return s.selfTestEngine.testAll(); }],
      ['selftest.report',         () => { if (!s.selfTestEngine) throw new Error('SelfTestEngine not available'); return s.selfTestEngine.getUnderstandingReport(); }],
      ['selftest.status',         () => { if (!s.selfTestEngine) throw new Error('SelfTestEngine not available'); return s.selfTestEngine.getStatus(); }],

      // ─── Teach ──────────────────────────────────────────────────
      ['teach.create',            (params) => { if (!s.teachEngine) throw new Error('TeachEngine not available'); return s.teachEngine.createPackage(p(params).targetBrain); }],
      ['teach.get',               (params) => { if (!s.teachEngine) throw new Error('TeachEngine not available'); return s.teachEngine.getPackage(p(params).id); }],
      ['teach.list',              (params) => { if (!s.teachEngine) throw new Error('TeachEngine not available'); return s.teachEngine.listPackages(p(params)?.limit); }],
      ['teach.rate',              (params) => { if (!s.teachEngine) throw new Error('TeachEngine not available'); s.teachEngine.rateEffectiveness(p(params).id, p(params).score); return { rated: true }; }],
      ['teach.status',            () => { if (!s.teachEngine) throw new Error('TeachEngine not available'); return s.teachEngine.getStatus(); }],

      // ─── Scout ──────────────────────────────────────────────────
      ['scout.run',               async () => { if (!s.dataScout) throw new Error('DataScout not available'); return s.dataScout.scout(); }],
      ['scout.discoveries',       (params) => { if (!s.dataScout) throw new Error('DataScout not available'); return s.dataScout.getDiscoveries(p(params)?.source, p(params)?.limit); }],
      ['scout.import',            (params) => { if (!s.dataScout) throw new Error('DataScout not available'); s.dataScout.markImported(p(params).id); return { imported: true }; }],
      ['scout.status',            () => { if (!s.dataScout) throw new Error('DataScout not available'); return s.dataScout.getStatus(); }],

      // ─── Simulation ─────────────────────────────────────────────
      ['simulation.run',          (params) => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.simulate(p(params).scenario); }],
      ['simulation.whatif',       (params) => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.whatIf(p(params).metric, p(params).multiplier); }],
      ['simulation.validate',     (params) => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.validateSimulation(p(params).id, p(params).outcomes); }],
      ['simulation.list',         (params) => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.listSimulations(p(params)?.limit); }],
      ['simulation.status',       () => { if (!s.simulationEngine) throw new Error('SimulationEngine not available'); return s.simulationEngine.getStatus(); }],

      // ─── Memory Palace ─────────────────────────────────────────
      ['palace.status',           () => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getStatus(); }],
      ['palace.build',            () => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.buildConnections(); }],
      ['palace.connections',      (params) => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getConnections(p(params).type, p(params).id); }],
      ['palace.path',             (params) => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getPath(p(params).fromType, p(params).fromId, p(params).toType, p(params).toId, p(params)?.maxDepth); }],
      ['palace.map',              (params) => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getKnowledgeMap(p(params)?.topic, p(params)?.limit); }],
      ['palace.isolated',         () => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return s.memoryPalace.getIsolatedNodes(); }],
      ['palace.add',              (params) => { if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return { added: s.memoryPalace.addConnection(p(params).sourceType, p(params).sourceId, p(params).targetType, p(params).targetId, p(params).relation, p(params)?.strength) }; }],

      // ─── Goal Engine ──────────────────────────────────────────
      ['goals.status',            () => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.getStatus(); }],
      ['goals.create',            (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.createGoal(p(params).title, p(params).metricName, p(params).targetValue, p(params).deadlineCycles, p(params)); }],
      ['goals.list',              (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.listGoals(p(params)?.status, p(params)?.limit); }],
      ['goals.progress',          (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.getProgress(p(params).goalId); }],
      ['goals.forecast',          (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.forecastCompletion(p(params).goalId); }],
      ['goals.suggest',           (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return s.goalEngine.suggestGoals(p(params)?.currentCycle ?? 0); }],
      ['goals.pause',             (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return { paused: s.goalEngine.pauseGoal(p(params).goalId) }; }],
      ['goals.resume',            (params) => { if (!s.goalEngine) throw new Error('GoalEngine not available'); return { resumed: s.goalEngine.resumeGoal(p(params).goalId, p(params)?.currentCycle ?? 0) }; }],

      // ─── Evolution Engine ──────────────────────────────────────
      ['evolution.status',         () => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getStatus(); }],
      ['evolution.history',        (params) => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getHistory(p(params)?.limit ?? 20); }],
      ['evolution.best',           () => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getBestIndividual(); }],
      ['evolution.lineage',        (params) => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getLineage(p(params).id); }],
      ['evolution.run',            () => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.runGeneration(); }],
      ['evolution.population',     (params) => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); return s.evolutionEngine.getPopulation(p(params)?.generation); }],
      ['evolution.activate',       (params) => { if (!s.evolutionEngine) throw new Error('EvolutionEngine not available'); s.evolutionEngine.activate(p(params).genome); return { activated: true }; }],

      // ─── Reasoning Engine ──────────────────────────────────
      ['reasoning.status',          () => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.getStatus(); }],
      ['reasoning.infer',           (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.infer(p(params).query); }],
      ['reasoning.abduce',          (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.abduce(p(params).observation); }],
      ['reasoning.temporal',        (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.temporalInfer(p(params).eventType); }],
      ['reasoning.counterfactual',  (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.counterfactual(p(params).event); }],
      ['reasoning.rules',           (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.getRules(p(params)?.limit ?? 50, p(params)?.minConfidence ?? 0); }],
      ['reasoning.proof',           (params) => { if (!s.reasoningEngine) throw new Error('ReasoningEngine not available'); return s.reasoningEngine.getProofTree(p(params).chainId); }],

      // ─── Emotional Model ──────────────────────────────
      ['emotional.status',          () => { if (!s.emotionalModel) throw new Error('EmotionalModel not available'); return s.emotionalModel.getStatus(); }],
      ['emotional.mood',            () => { if (!s.emotionalModel) throw new Error('EmotionalModel not available'); return s.emotionalModel.getMood(); }],
      ['emotional.history',         (params) => { if (!s.emotionalModel) throw new Error('EmotionalModel not available'); return s.emotionalModel.getHistory(p(params)?.limit ?? 50); }],
      ['emotional.influences',      (params) => { if (!s.emotionalModel) throw new Error('EmotionalModel not available'); return s.emotionalModel.getInfluences(p(params)?.limit ?? 20); }],
      ['emotional.recommendations', () => { if (!s.emotionalModel) throw new Error('EmotionalModel not available'); return s.emotionalModel.getRecommendations(); }],
      ['emotional.sense',           () => { if (!s.emotionalModel) throw new Error('EmotionalModel not available'); return s.emotionalModel.sense(); }],

      // ─── Self-Modification ──────────────────────────
      ['selfmod.status',           () => { if (!s.selfModificationEngine) throw new Error('SelfModificationEngine not available'); return s.selfModificationEngine.getStatus(); }],
      ['selfmod.list',             (params) => { if (!s.selfModificationEngine) throw new Error('SelfModificationEngine not available'); return s.selfModificationEngine.getHistory(p(params)?.limit ?? 20); }],
      ['selfmod.pending',          () => { if (!s.selfModificationEngine) throw new Error('SelfModificationEngine not available'); return s.selfModificationEngine.getPending(); }],
      ['selfmod.get',              (params) => { if (!s.selfModificationEngine) throw new Error('SelfModificationEngine not available'); return s.selfModificationEngine.getModification(p(params).id); }],
      ['selfmod.approve',          (params) => { if (!s.selfModificationEngine) throw new Error('SelfModificationEngine not available'); return s.selfModificationEngine.approveModification(p(params).id); }],
      ['selfmod.reject',           (params) => { if (!s.selfModificationEngine) throw new Error('SelfModificationEngine not available'); return s.selfModificationEngine.rejectModification(p(params).id, p(params)?.notes); }],
      ['selfmod.scan',             () => { if (!s.selfScanner) throw new Error('SelfScanner not available'); return s.selfScanner.scan(s.selfModificationEngine?.getStatus()?.projectRoot || '.'); }],
      ['selfmod.propose',          (params) => { if (!s.selfModificationEngine) throw new Error('SelfModificationEngine not available'); return s.selfModificationEngine.proposeModification(p(params).title, p(params).problem, p(params).targetFiles, p(params)?.sourceEngine); }],

      // Concept Abstraction
      ['concept.status',           () => { if (!s.conceptAbstraction) throw new Error('ConceptAbstraction not available'); return s.conceptAbstraction.getStatus(); }],
      ['concept.form',             () => { if (!s.conceptAbstraction) throw new Error('ConceptAbstraction not available'); return s.conceptAbstraction.formConcepts(); }],
      ['concept.hierarchy',        (params) => { if (!s.conceptAbstraction) throw new Error('ConceptAbstraction not available'); return s.conceptAbstraction.getHierarchy(p(params).conceptId); }],
      ['concept.members',          (params) => { if (!s.conceptAbstraction) throw new Error('ConceptAbstraction not available'); return s.conceptAbstraction.getMembers(p(params).conceptId); }],
      ['concept.byLevel',          (params) => { if (!s.conceptAbstraction) throw new Error('ConceptAbstraction not available'); return s.conceptAbstraction.getConceptsByLevel(p(params).level ?? 0); }],
      ['concept.transferable',     (params) => { if (!s.conceptAbstraction) throw new Error('ConceptAbstraction not available'); return s.conceptAbstraction.getTransferableConcepts(p(params)?.min ?? 0.3); }],
      ['concept.register',         () => { if (!s.conceptAbstraction) throw new Error('ConceptAbstraction not available'); if (!s.memoryPalace) throw new Error('MemoryPalace not available'); return { registered: s.conceptAbstraction.registerInPalace(s.memoryPalace) }; }],

      // Peer Network
      ['peer.status',              () => { if (!s.peerNetwork) throw new Error('PeerNetwork not available'); return s.peerNetwork.getStatus(); }],
      ['peer.list',                () => { if (!s.peerNetwork) throw new Error('PeerNetwork not available'); return s.peerNetwork.getAvailablePeers(); }],
      ['peer.announce',            () => { if (!s.peerNetwork) throw new Error('PeerNetwork not available'); s.peerNetwork.announce(); return { announced: true }; }],

      // LLM Service
      ['llm.status',               () => { if (!s.llmService) throw new Error('LLMService not available'); return s.llmService.getStats(); }],
      ['llm.history',              (p) => { if (!s.llmService) throw new Error('LLMService not available'); const { hours } = (p ?? {}) as { hours?: number }; return s.llmService.getUsageHistory(hours); }],
      ['llm.byTemplate',           () => { if (!s.llmService) throw new Error('LLMService not available'); return s.llmService.getUsageByTemplate(); }],
      ['llm.providers',            async () => { if (!s.llmService) throw new Error('LLMService not available'); return s.llmService.getProviderStatus(); }],
      ['llm.routing',              (p) => {
        if (!s.llmService) throw new Error('LLMService not available');
        const { template } = (p ?? {}) as { template?: string };
        const router = s.llmService.getRouter();
        if (template) {
          const tier = router.getTier(template as import('@timmeck/brain-core').PromptTemplate);
          const providers = s.llmService.getProviders();
          const chain = router.route(template as import('@timmeck/brain-core').PromptTemplate, providers).map(p => p.name);
          return { template, tier, chain };
        }
        const table = router.getRoutingTable();
        const providers = s.llmService.getProviders();
        const routes = table.map(r => ({
          ...r,
          chain: router.route(r.template, providers).map(p => p.name),
        }));
        return { routes };
      }],
      ['llm.ollamaStatus',         async () => {
        if (!s.llmService) throw new Error('LLMService not available');
        const ollamaProvider = s.llmService.getProviders().find(p => p.name === 'ollama');
        if (!ollamaProvider || !('getStatus' in ollamaProvider)) {
          return { available: false, host: 'http://localhost:11434', chatModel: '-', embedModel: '-', installedModels: [], runningModels: [] };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (ollamaProvider as any).getStatus();
      }],

      // Research Missions
      ['mission.create',           (params) => { if (!s.missionEngine) throw new Error('MissionEngine not available'); const { topic, depth } = (params ?? {}) as { topic: string; depth?: string }; return s.missionEngine.createMission(topic, (depth ?? 'standard') as 'quick' | 'standard' | 'deep'); }],
      ['mission.list',             (params) => { if (!s.missionEngine) throw new Error('MissionEngine not available'); const { status, limit } = (params ?? {}) as { status?: string; limit?: number }; return s.missionEngine.listMissions(status as import('@timmeck/brain-core').MissionStatus | undefined, limit); }],
      ['mission.report',           (params) => { if (!s.missionEngine) throw new Error('MissionEngine not available'); const { id } = (params ?? {}) as { id: number }; return s.missionEngine.getReport(id); }],
      ['mission.cancel',           (params) => { if (!s.missionEngine) throw new Error('MissionEngine not available'); const { id } = (params ?? {}) as { id: number }; return s.missionEngine.cancelMission(id); }],
      ['mission.status',           () => { if (!s.missionEngine) throw new Error('MissionEngine not available'); return s.missionEngine.getStatus(); }],

      // ─── Watchdog ──────────────────────────────────────────
      ['watchdog.status',         () => s.watchdog?.getStatus() ?? []],
      ['watchdog.restart',        (params) => s.watchdog?.restartDaemon(p(params).name) ?? false],

      // ─── Borg Sync ──────────────────────────────────────────
      ['borg.status',             () => s.borgSync?.getStatus() ?? { enabled: false }],
      ['borg.history',            (params) => s.borgSync?.getHistory((params as { limit?: number })?.limit) ?? []],
      ['borg.config',             () => s.borgSync?.getConfig() ?? null],
      ['borg.enable',             () => { s.borgSync?.setEnabled(true); return { enabled: true }; }],
      ['borg.disable',            () => { s.borgSync?.setEnabled(false); return { enabled: false }; }],
      ['borg.sync',               async () => { await s.borgSync?.syncCycle(); return { synced: true }; }],
      ['borg.updateConfig',       (params) => { s.borgSync?.updateConfig(params as Record<string, unknown>); return s.borgSync?.getConfig() ?? null; }],
      ['cross-brain.borgSync',    (params) => s.borgSync?.handleIncomingSync(params as import('@timmeck/brain-core').SyncPacket) ?? { accepted: 0, rejected: 0 }],
      ['cross-brain.borgExport',  () => s.borgSync?.handleExportRequest() ?? { source: 'brain', timestamp: new Date().toISOString(), items: [] }],

      // ─── Plugin Registry ──────────────────────────────────
      ['plugin.list',             () => s.pluginRegistry?.list() ?? []],
      ['plugin.get',              (params) => { const pl = s.pluginRegistry?.get(p(params).name); return pl ? { name: pl.name, version: pl.version, description: pl.description } : null; }],
      ['plugin.routes',           () => s.pluginRegistry?.getRoutes().map(r => ({ plugin: r.plugin, method: r.method })) ?? []],
      ['plugin.tools',            () => s.pluginRegistry?.getTools().map(t => ({ plugin: t.plugin, name: t.name, description: t.description })) ?? []],

      // ─── RAG Pipeline ──────────────────────────────────────
      ['rag.search',              async (params) => { if (!s.ragEngine) throw new Error('RAGEngine not available'); return s.ragEngine.search(p(params).query, { collections: p(params).collections, limit: p(params).limit, threshold: p(params).threshold }); }],
      ['rag.status',              () => { if (!s.ragEngine) throw new Error('RAGEngine not available'); return s.ragEngine.getStatus(); }],
      ['rag.index',               async () => { if (!s.ragIndexer) throw new Error('RAGIndexer not available'); const count = await s.ragIndexer.indexAll(); return { indexed: count }; }],

      // ─── Knowledge Graph ─────────────────────────────────────
      ['kg.query',                (params) => { if (!s.knowledgeGraph) throw new Error('KnowledgeGraph not available'); return s.knowledgeGraph.query({ subject: p(params).subject, predicate: p(params).predicate, object: p(params).object }); }],
      ['kg.addFact',              (params) => { if (!s.knowledgeGraph) throw new Error('KnowledgeGraph not available'); return s.knowledgeGraph.addFact(p(params).subject, p(params).predicate, p(params).object, p(params).context, p(params).confidence); }],
      ['kg.infer',                (params) => { if (!s.knowledgeGraph) throw new Error('KnowledgeGraph not available'); return s.knowledgeGraph.infer(p(params).subject, p(params).predicate); }],
      ['kg.contradictions',       () => { if (!s.knowledgeGraph) throw new Error('KnowledgeGraph not available'); return s.knowledgeGraph.contradictions(); }],
      ['kg.subgraph',             (params) => { if (!s.knowledgeGraph) throw new Error('KnowledgeGraph not available'); return s.knowledgeGraph.subgraph(p(params).topic, p(params).depth); }],
      ['kg.status',               () => { if (!s.knowledgeGraph) throw new Error('KnowledgeGraph not available'); return s.knowledgeGraph.getStatus(); }],

      // ─── Semantic Compression ────────────────────────────────
      ['compression.compress',    async (params) => { if (!s.semanticCompressor) throw new Error('SemanticCompressor not available'); return s.semanticCompressor.compress(p(params).collection, p(params).threshold); }],
      ['compression.stats',       () => { if (!s.semanticCompressor) throw new Error('SemanticCompressor not available'); return s.semanticCompressor.getStats(); }],

      // ─── Feedback Learning ────────────────────────────────────
      ['feedback.record',         (params) => { if (!s.feedbackEngine) throw new Error('FeedbackEngine not available'); return s.feedbackEngine.recordFeedback(p(params).type, p(params).targetId, p(params).signal, p(params).detail); }],
      ['feedback.score',          (params) => { if (!s.feedbackEngine) throw new Error('FeedbackEngine not available'); return s.feedbackEngine.getRewardScore(p(params).type, p(params).targetId); }],
      ['feedback.stats',          () => { if (!s.feedbackEngine) throw new Error('FeedbackEngine not available'); return s.feedbackEngine.getStats(); }],
      ['feedback.history',        (params) => { if (!s.feedbackEngine) throw new Error('FeedbackEngine not available'); return s.feedbackEngine.getFeedbackHistory(p(params).type, p(params).targetId, p(params).limit); }],

      // ─── Tool Learning ────────────────────────────────────────
      ['toolTracker.record',      (params) => { if (!s.toolTracker) throw new Error('ToolTracker not available'); return s.toolTracker.recordUsage(p(params).tool, p(params).context, p(params).duration, p(params).outcome); }],
      ['toolTracker.stats',       (params) => { if (!s.toolTracker) throw new Error('ToolTracker not available'); return s.toolTracker.getToolStats(p(params).tool); }],
      ['toolTracker.recommend',   (params) => { if (!s.toolTracker) throw new Error('ToolTracker not available'); return s.toolTracker.recommend(p(params).context); }],
      ['toolTracker.patterns',    () => { if (!s.toolPatternAnalyzer) throw new Error('ToolPatternAnalyzer not available'); return s.toolPatternAnalyzer.getTransitions(); }],

      // ─── Proactive Suggestions ────────────────────────────────
      ['proactive.analyze',       async (params) => { if (!s.proactiveEngine) throw new Error('ProactiveEngine not available'); return s.proactiveEngine.analyze(p(params)); }],
      ['proactive.suggestions',   (params) => { if (!s.proactiveEngine) throw new Error('ProactiveEngine not available'); return s.proactiveEngine.getSuggestions(p(params).limit); }],
      ['proactive.dismiss',       (params) => { if (!s.proactiveEngine) throw new Error('ProactiveEngine not available'); return s.proactiveEngine.dismiss(p(params).id); }],
      ['proactive.status',        () => { if (!s.proactiveEngine) throw new Error('ProactiveEngine not available'); return s.proactiveEngine.getStatus(); }],

      // ─── User Model ──────────────────────────────────────────
      ['userModel.update',        (params) => { if (!s.userModel) throw new Error('UserModel not available'); return s.userModel.updateFromInteraction(p(params).toolName, p(params).context, p(params).outcome); }],
      ['userModel.profile',       () => { if (!s.userModel) throw new Error('UserModel not available'); return s.userModel.getProfile(); }],
      ['userModel.preference',    (params) => { if (!s.userModel) throw new Error('UserModel not available'); return s.userModel.setPreference(p(params).key, p(params).value); }],
      ['userModel.status',        () => { if (!s.userModel) throw new Error('UserModel not available'); return s.userModel.getStatus(); }],

      // ─── Code Health ─────────────────────────────────────────
      ['codeHealth.scan',         (params) => { if (!s.codeHealthMonitor) throw new Error('CodeHealthMonitor not available'); return s.codeHealthMonitor.scan(p(params).projectPath); }],
      ['codeHealth.trends',       (params) => { if (!s.codeHealthMonitor) throw new Error('CodeHealthMonitor not available'); return s.codeHealthMonitor.trends(p(params).projectPath, p(params).limit); }],
      ['codeHealth.status',       () => { if (!s.codeHealthMonitor) throw new Error('CodeHealthMonitor not available'); return s.codeHealthMonitor.getStatus(); }],

      // ─── Teaching Protocol ────────────────────────────────────
      ['teaching.teach',          (params) => { if (!s.teachingProtocol) throw new Error('TeachingProtocol not available'); return s.teachingProtocol.teach(p(params).targetBrain, { domain: p(params).domain, principle: p(params).principle, evidence: p(params).evidence, applicability: p(params).applicability }); }],
      ['teaching.learn',          (params) => { if (!s.teachingProtocol) throw new Error('TeachingProtocol not available'); return s.teachingProtocol.learn(p(params)); }],
      ['teaching.requestLesson',  (params) => { if (!s.teachingProtocol) throw new Error('TeachingProtocol not available'); return s.teachingProtocol.requestLesson(p(params).fromBrain, p(params).topic); }],
      ['teaching.history',        (params) => { if (!s.teachingProtocol) throw new Error('TeachingProtocol not available'); return s.teachingProtocol.getHistory(p(params).direction, p(params).limit); }],
      ['teaching.curriculum',     () => { if (!s.curriculum) throw new Error('Curriculum not available'); return s.curriculum.getTeachable('brain'); }],
      ['teaching.status',         () => { if (!s.teachingProtocol) throw new Error('TeachingProtocol not available'); return s.teachingProtocol.getStatus(); }],

      // ─── Consensus Decisions ──────────────────────────────────
      ['consensus.propose',       (params) => { if (!s.consensusEngine) throw new Error('ConsensusEngine not available'); return s.consensusEngine.propose({ type: p(params).type, description: p(params).description, options: p(params).options, context: p(params).context }); }],
      ['consensus.vote',          (params) => { if (!s.consensusEngine) throw new Error('ConsensusEngine not available'); return s.consensusEngine.vote(p(params).proposalId, p(params).option, p(params).confidence, p(params).reasoning); }],
      ['consensus.resolve',       (params) => { if (!s.consensusEngine) throw new Error('ConsensusEngine not available'); return s.consensusEngine.resolve(p(params).proposalId); }],
      ['consensus.get',           (params) => { if (!s.consensusEngine) throw new Error('ConsensusEngine not available'); return s.consensusEngine.getProposal(p(params).id); }],
      ['consensus.history',       (params) => { if (!s.consensusEngine) throw new Error('ConsensusEngine not available'); return s.consensusEngine.getHistory(p(params).status, p(params).limit); }],
      ['consensus.status',        () => { if (!s.consensusEngine) throw new Error('ConsensusEngine not available'); return s.consensusEngine.getStatus(); }],

      // ─── Active Learning ──────────────────────────────────────
      ['activeLearning.gaps',     (params) => { if (!s.activeLearner) throw new Error('ActiveLearner not available'); return s.activeLearner.getOpenGaps(p(params).limit); }],
      ['activeLearning.addGap',   (params) => { if (!s.activeLearner) throw new Error('ActiveLearner not available'); return s.activeLearner.addGap(p(params).type, p(params).topic, p(params).description, p(params).impact, p(params).ease); }],
      ['activeLearning.plan',     (params) => { if (!s.activeLearner) throw new Error('ActiveLearner not available'); return s.activeLearner.planLearning(p(params).gapId); }],
      ['activeLearning.close',    (params) => { if (!s.activeLearner) throw new Error('ActiveLearner not available'); return s.activeLearner.closeGap(p(params).gapId, p(params).outcome); }],
      ['activeLearning.status',   () => { if (!s.activeLearner) throw new Error('ActiveLearner not available'); return s.activeLearner.getStatus(); }],

      // ─── Repo Absorber ────────────────────────────────────────
      ['repoAbsorber.status',    () => { if (!s.repoAbsorber) throw new Error('RepoAbsorber not available'); return s.repoAbsorber.getStatus(); }],
      ['repoAbsorber.absorb',    async () => { if (!s.repoAbsorber) throw new Error('RepoAbsorber not available'); return s.repoAbsorber.absorbNext(); }],
      ['repoAbsorber.candidate', () => { if (!s.repoAbsorber) throw new Error('RepoAbsorber not available'); return s.repoAbsorber.getNextCandidate(); }],

      // ─── Feature Extractor ──────────────────────────────────────
      ['features.extract',  async (params) => { if (!s.featureExtractor) throw new Error('FeatureExtractor not available'); return s.featureExtractor.extractFromAbsorbedCode(p(params).repo); }],
      ['features.search',   (params) => { if (!s.featureExtractor) throw new Error('FeatureExtractor not available'); const pp = p(params); return s.featureExtractor.search({ category: pp.category, repo: pp.repo, minUsefulness: pp.minUsefulness, limit: pp.limit, query: pp.query }); }],
      ['features.suggest',  async (params) => { if (!s.featureExtractor) throw new Error('FeatureExtractor not available'); return s.featureExtractor.suggest(p(params).context); }],
      ['features.stats',    () => { if (!s.featureExtractor) throw new Error('FeatureExtractor not available'); return s.featureExtractor.getStats(); }],
      ['features.semantic', async (params) => { if (!s.featureExtractor) throw new Error('FeatureExtractor not available'); const pp = p(params); return s.featureExtractor.semanticSearch(pp.query, pp.limit); }],

      // ─── Feature Recommender ────────────────────────────────────
      ['recommender.cycle',       async () => { if (!s.featureRecommender) throw new Error('FeatureRecommender not available'); return s.featureRecommender.runCycle(); }],
      ['recommender.wishlist',    (params) => { if (!s.featureRecommender) throw new Error('FeatureRecommender not available'); return s.featureRecommender.getWishlist(p(params).status); }],
      ['recommender.connections', (params) => { if (!s.featureRecommender) throw new Error('FeatureRecommender not available'); return s.featureRecommender.getConnections(p(params).featureId); }],
      ['recommender.related',    (params) => { if (!s.featureRecommender) throw new Error('FeatureRecommender not available'); return s.featureRecommender.getRelatedSuggestions(p(params).featureName); }],
      ['recommender.status',      () => { if (!s.featureRecommender) throw new Error('FeatureRecommender not available'); return s.featureRecommender.getStatus(); }],
      ['recommender.adopt',      (params) => { if (!s.featureRecommender) throw new Error('FeatureRecommender not available'); s.featureRecommender.adoptFeature(p(params).wishId); return { adopted: true }; }],
      ['recommender.dismiss',    (params) => { if (!s.featureRecommender) throw new Error('FeatureRecommender not available'); s.featureRecommender.dismissWish(p(params).wishId); return { dismissed: true }; }],

      // Contradiction Resolver
      ['kg.resolve',             () => { if (!s.contradictionResolver) throw new Error('ContradictionResolver not available'); return { resolved: s.contradictionResolver.resolve() }; }],
      ['kg.resolveStatus',       () => { if (!s.contradictionResolver) throw new Error('ContradictionResolver not available'); return s.contradictionResolver.getStatus(); }],

      // Checkpoint Manager
      ['checkpoint.list',        (params) => { if (!s.checkpointManager) throw new Error('CheckpointManager not available'); return s.checkpointManager.listWorkflows(p(params).limit ?? 50); }],
      ['checkpoint.history',     (params) => { if (!s.checkpointManager) throw new Error('CheckpointManager not available'); return s.checkpointManager.history(p(params).workflowId); }],
      ['checkpoint.load',        (params) => { if (!s.checkpointManager) throw new Error('CheckpointManager not available'); return s.checkpointManager.load(p(params).workflowId); }],
      ['checkpoint.fork',        (params) => { if (!s.checkpointManager) throw new Error('CheckpointManager not available'); return { forked: s.checkpointManager.fork(p(params).sourceId, p(params).newId) }; }],
      ['checkpoint.prune',       (params) => { if (!s.checkpointManager) throw new Error('CheckpointManager not available'); return { pruned: s.checkpointManager.prune(p(params)) }; }],
      ['checkpoint.status',      () => { if (!s.checkpointManager) throw new Error('CheckpointManager not available'); return s.checkpointManager.getStatus(); }],

      // Trace Collector (Observability)
      ['trace.start',            (params) => { if (!s.traceCollector) throw new Error('TraceCollector not available'); return { traceId: s.traceCollector.startTrace(p(params).name, p(params).metadata) }; }],
      ['trace.end',              (params) => { if (!s.traceCollector) throw new Error('TraceCollector not available'); s.traceCollector.endTrace(p(params).traceId, p(params).error); return { ok: true }; }],
      ['trace.startSpan',        (params) => { if (!s.traceCollector) throw new Error('TraceCollector not available'); return { spanId: s.traceCollector.startSpan(p(params).traceId, p(params).name, { parentSpanId: p(params).parentSpanId, metadata: p(params).metadata }) }; }],
      ['trace.endSpan',          (params) => { if (!s.traceCollector) throw new Error('TraceCollector not available'); s.traceCollector.endSpan(p(params).spanId, { tokens: p(params).tokens, cost: p(params).cost, error: p(params).error }); return { ok: true }; }],
      ['trace.get',              (params) => { if (!s.traceCollector) throw new Error('TraceCollector not available'); return s.traceCollector.getTrace(p(params).traceId); }],
      ['trace.list',             (params) => { if (!s.traceCollector) throw new Error('TraceCollector not available'); return s.traceCollector.listTraces(p(params)); }],
      ['trace.stats',            () => { if (!s.traceCollector) throw new Error('TraceCollector not available'); return s.traceCollector.getStats(); }],
      ['trace.prune',            (params) => { if (!s.traceCollector) throw new Error('TraceCollector not available'); return { pruned: s.traceCollector.prune(p(params).maxAgeDays) }; }],
      ['trace.status',           () => { if (!s.traceCollector) throw new Error('TraceCollector not available'); return s.traceCollector.getStatus(); }],

      // Messaging Bots
      ['bot.telegram.status',    () => s.telegramBot?.getStatus() ?? { running: false }],
      ['bot.discord.status',     () => s.discordBot?.getStatus() ?? { running: false }],
      ['bot.router.status',      () => s.messageRouter?.getStatus() ?? { messagesReceived: 0, messagesRouted: 0, errors: 0, lastMessageAt: null, uptime: 0 }],

      // Agent Training — Benchmark Suite
      ['benchmark.addCase',      (params) => { if (!s.benchmarkSuite) throw new Error('BenchmarkSuite not available'); return { id: s.benchmarkSuite.addCase(p(params) as import('@timmeck/brain-core').EvalCase) }; }],
      ['benchmark.addCases',     (params) => { if (!s.benchmarkSuite) throw new Error('BenchmarkSuite not available'); return { count: s.benchmarkSuite.addCases(p(params).cases) }; }],
      ['benchmark.getCases',     (params) => { if (!s.benchmarkSuite) throw new Error('BenchmarkSuite not available'); return s.benchmarkSuite.getCases(p(params)); }],
      ['benchmark.getCategories', () => { if (!s.benchmarkSuite) throw new Error('BenchmarkSuite not available'); return s.benchmarkSuite.getCategories(); }],
      ['benchmark.deleteCase',   (params) => { if (!s.benchmarkSuite) throw new Error('BenchmarkSuite not available'); return { deleted: s.benchmarkSuite.deleteCase(p(params).id) }; }],
      ['benchmark.clearCases',   () => { if (!s.benchmarkSuite) throw new Error('BenchmarkSuite not available'); return { cleared: s.benchmarkSuite.clearCases() }; }],
      ['benchmark.history',      (params) => { if (!s.benchmarkSuite) throw new Error('BenchmarkSuite not available'); return s.benchmarkSuite.getHistory(p(params).limit); }],
      ['benchmark.getRun',       (params) => { if (!s.benchmarkSuite) throw new Error('BenchmarkSuite not available'); return s.benchmarkSuite.getRun(p(params).id); }],
      ['benchmark.status',       () => { if (!s.benchmarkSuite) throw new Error('BenchmarkSuite not available'); return s.benchmarkSuite.getStatus(); }],

      // Agent Training — Trainer
      ['trainer.history',        (params) => { if (!s.agentTrainer) throw new Error('AgentTrainer not available'); return s.agentTrainer.getHistory(p(params).limit); }],
      ['trainer.getSession',     (params) => { if (!s.agentTrainer) throw new Error('AgentTrainer not available'); return s.agentTrainer.getSession(p(params).id); }],
      ['trainer.status',         () => { if (!s.agentTrainer) throw new Error('AgentTrainer not available'); return s.agentTrainer.getStatus(); }],

      // Tool Scoping
      ['scope.register',         (params) => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); s.toolScopeManager.registerScope(p(params) as import('@timmeck/brain-core').ToolScope); return { ok: true }; }],
      ['scope.remove',           (params) => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); return { removed: s.toolScopeManager.removeScope(p(params).name) }; }],
      ['scope.get',              (params) => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); return s.toolScopeManager.getScope(p(params).name); }],
      ['scope.list',             () => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); return s.toolScopeManager.listScopes(); }],
      ['scope.available',        (params) => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); return s.toolScopeManager.getAvailableTools(p(params)); }],
      ['scope.check',            (params) => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); return s.toolScopeManager.checkTool(p(params).tool, p(params)); }],
      ['scope.byScope',          (params) => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); return s.toolScopeManager.getToolsByScope(p(params).phase); }],
      ['scope.history',          (params) => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); return s.toolScopeManager.getCheckHistory(p(params).limit); }],
      ['scope.blocked',          (params) => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); return s.toolScopeManager.getTopBlocked(p(params).limit); }],
      ['scope.status',           () => { if (!s.toolScopeManager) throw new Error('ToolScopeManager not available'); return s.toolScopeManager.getStatus(); }],

      // Plugin Marketplace
      ['marketplace.browse',     (params) => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.listAvailable(p(params).category); }],
      ['marketplace.search',     (params) => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.search(p(params).query); }],
      ['marketplace.info',       (params) => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.getPluginInfo(p(params).name); }],
      ['marketplace.categories', () => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.getCategories(); }],
      ['marketplace.featured',   () => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.getFeatured(); }],
      ['marketplace.install',    (params) => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.install(p(params).name, p(params).version); }],
      ['marketplace.uninstall',  (params) => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.uninstall(p(params).name); }],
      ['marketplace.installed',  () => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.getInstalled(); }],
      ['marketplace.updates',    () => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.getUpdates(); }],
      ['marketplace.rate',       (params) => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); s.pluginMarketplace.rate(p(params).name, p(params).rating, p(params).text); return { ok: true }; }],
      ['marketplace.reviews',    (params) => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.getReviews(p(params).name); }],
      ['marketplace.compat',     (params) => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); const info = s.pluginMarketplace.getPluginInfo(p(params).name); if (!info) throw new Error('Plugin not found'); return s.pluginMarketplace.checkCompatibility(info); }],
      ['marketplace.deps',       (params) => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.resolveDependencies(p(params).name); }],
      ['marketplace.status',     () => { if (!s.pluginMarketplace) throw new Error('Marketplace not available'); return s.pluginMarketplace.getStatus(); }],

      // Code Sandbox (76)
      ['sandbox.execute',   async (params) => { if (!s.codeSandbox) throw new Error('Sandbox not available'); return s.codeSandbox.execute(p(params) as import('@timmeck/brain-core').ExecutionRequest); }],
      ['sandbox.validate',  (params) => { if (!s.codeSandbox) throw new Error('Sandbox not available'); return s.codeSandbox.validate(p(params).code, p(params).language); }],
      ['sandbox.history',   (params) => { if (!s.codeSandbox) throw new Error('Sandbox not available'); return s.codeSandbox.getHistory(p(params).limit); }],
      ['sandbox.langStats', () => { if (!s.codeSandbox) throw new Error('Sandbox not available'); return s.codeSandbox.getLanguageStats(); }],
      ['sandbox.docker',    async () => { if (!s.codeSandbox) throw new Error('Sandbox not available'); return { available: await s.codeSandbox.isDockerAvailable() }; }],
      ['sandbox.status',    () => { if (!s.codeSandbox) throw new Error('Sandbox not available'); return s.codeSandbox.getStatus(); }],

      // ─── Governance ────────────────────────────────────────
      ['governance.registry',      () => { if (!s.engineRegistry) throw new Error('EngineRegistry not available'); return s.engineRegistry.list(); }],
      ['governance.profiles',      (params) => { if (!s.engineRegistry) throw new Error('EngineRegistry not available'); const id = p(params)?.id; return id ? s.engineRegistry.get(id) : s.engineRegistry.list(); }],
      ['governance.status',        () => { if (!s.engineRegistry) throw new Error('EngineRegistry not available'); return s.engineRegistry.getStatus(); }],
      ['governance.dependencies',  () => { if (!s.engineRegistry) throw new Error('EngineRegistry not available'); const g = s.engineRegistry.getDependencyGraph(); return Object.fromEntries(g); }],
      ['governance.enable',        (params) => { if (!s.engineRegistry) throw new Error('EngineRegistry not available'); s.engineRegistry.enable(p(params).id); return { enabled: true }; }],
      ['governance.disable',       (params) => { if (!s.engineRegistry) throw new Error('EngineRegistry not available'); s.engineRegistry.disable(p(params).id); return { disabled: true }; }],
      ['governance.influences',    (params) => { if (!s.runtimeInfluenceTracker) throw new Error('RuntimeInfluenceTracker not available'); return s.runtimeInfluenceTracker.buildInfluenceGraph(p(params)?.window ?? 50); }],
      ['governance.influence_status', () => { if (!s.runtimeInfluenceTracker) throw new Error('RuntimeInfluenceTracker not available'); return s.runtimeInfluenceTracker.getStatus(); }],
      ['governance.loops',         () => { if (!s.loopDetector) throw new Error('LoopDetector not available'); return s.loopDetector.getActive(); }],
      ['governance.loop_status',   () => { if (!s.loopDetector) throw new Error('LoopDetector not available'); return s.loopDetector.getStatus(); }],
      ['governance.actions',       (params) => { if (!s.governanceLayer) throw new Error('GovernanceLayer not available'); return s.governanceLayer.getHistory(p(params)?.limit ?? 50); }],
      ['governance.active_actions', (params) => { if (!s.governanceLayer) throw new Error('GovernanceLayer not available'); return s.governanceLayer.getActiveActions(p(params)?.engineId); }],
      ['governance.throttle',      (params) => { if (!s.governanceLayer) throw new Error('GovernanceLayer not available'); s.governanceLayer.throttle(p(params).id, p(params).reason ?? 'manual', 0, 'manual'); return { throttled: true }; }],
      ['governance.cooldown',      (params) => { if (!s.governanceLayer) throw new Error('GovernanceLayer not available'); s.governanceLayer.cooldown(p(params).id, p(params).reason ?? 'manual', p(params).cycles ?? 10, 0, 'manual'); return { cooled: true }; }],
      ['governance.isolate',       (params) => { if (!s.governanceLayer) throw new Error('GovernanceLayer not available'); s.governanceLayer.isolate(p(params).id, p(params).reason ?? 'manual', 0, 'manual'); return { isolated: true }; }],
      ['governance.restore',       (params) => { if (!s.governanceLayer) throw new Error('GovernanceLayer not available'); s.governanceLayer.restore(p(params).id, p(params).reason ?? 'manual', 0, 'manual'); return { restored: true }; }],
      ['governance.layer_status',  () => { if (!s.governanceLayer) throw new Error('GovernanceLayer not available'); return s.governanceLayer.getStatus(); }],

      // ─── Token Budgets ──────────────────────────────────────
      ['governance.token_budgets', () => { if (!s.tokenBudgetTracker) throw new Error('TokenBudgetTracker not available'); return s.tokenBudgetTracker.getStatus(); }],
      ['governance.engine_budget', (params) => { if (!s.tokenBudgetTracker) throw new Error('TokenBudgetTracker not available'); return s.tokenBudgetTracker.getEngineStatus(p(params).id); }],
      ['governance.set_budget',    (params) => { if (!s.parameterRegistry) throw new Error('ParameterRegistry not available'); const pp = p(params); s.parameterRegistry.set(pp.engine, pp.name, pp.value, 'ipc', pp.reason ?? 'manual budget change'); return { updated: true }; }],

      // ─── Cycle Outcomes ─────────────────────────────────────
      ['cycle.rates',          (params) => { if (!s.cycleOutcomeTracker) throw new Error('CycleOutcomeTracker not available'); return s.cycleOutcomeTracker.getRates(p(params).hours ?? 0); }],
      ['cycle.rates_history',  (params) => { if (!s.cycleOutcomeTracker) throw new Error('CycleOutcomeTracker not available'); return s.cycleOutcomeTracker.getRateHistory(p(params).days ?? 30); }],
      ['cycle.recent',         (params) => { if (!s.cycleOutcomeTracker) throw new Error('CycleOutcomeTracker not available'); return s.cycleOutcomeTracker.getRecent(p(params).limit ?? 20); }],

      // ─── Guardrails ────────────────────────────────────────
      ['guardrail.status',         () => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.getStatus(); }],
      ['guardrail.health',         () => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.checkHealth(); }],
      ['guardrail.validate',       (params) => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.validateParameterChange(p(params).param, p(params).oldVal, p(params).newVal); }],
      ['guardrail.rollback',       (params) => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.rollbackParameters(p(params).steps ?? 1); }],
      ['guardrail.tripBreaker',    (params) => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); s.guardrailEngine.tripCircuitBreaker(p(params).reason); return { tripped: true }; }],
      ['guardrail.resetBreaker',   () => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); s.guardrailEngine.resetCircuitBreaker(); return { reset: true }; }],
      ['guardrail.protectedPaths', () => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.getProtectedPaths(); }],

      // ─── Causal Planner ────────────────────────────────────
      ['causal.diagnose',          (params) => { if (!s.causalPlanner) throw new Error('CausalPlanner not available'); return s.causalPlanner.diagnose(p(params).metric); }],
      ['causal.interventions',     (params) => { if (!s.causalPlanner) throw new Error('CausalPlanner not available'); return s.causalPlanner.suggestInterventions(p(params).metric); }],
      ['causal.predict',           (params) => { if (!s.causalPlanner) throw new Error('CausalPlanner not available'); return s.causalPlanner.predictOutcome(p(params).intervention); }],
      ['causal.stagnant',          () => { if (!s.causalPlanner) throw new Error('CausalPlanner not available'); return s.causalPlanner.diagnoseStagnantGoals(); }],

      // ─── Research Roadmap ──────────────────────────────────
      ['roadmap.list',             (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.listRoadmaps(p(params)?.status); }],
      ['roadmap.create',           (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.createRoadmap(p(params).title, p(params).finalGoalId); }],
      ['roadmap.decompose',        (params) => { if (!s.researchRoadmap || !s.goalEngine) throw new Error('ResearchRoadmap not available'); const goal = s.goalEngine.getGoal(p(params).goalId); if (!goal) throw new Error('Goal not found'); return s.researchRoadmap.decompose(goal, p(params).currentCycle ?? 0); }],
      ['roadmap.dag',              (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.toDAG(p(params).roadmapId); }],
      ['roadmap.progress',         (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.getProgress(p(params).roadmapId); }],
      ['roadmap.ready',            () => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.getReadyGoals(); }],
      ['roadmap.dependencies',     (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.getDependencies(p(params).goalId); }],
      ['roadmap.setDependencies',  (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); s.researchRoadmap.setDependencies(p(params).goalId, p(params).deps); return { set: true }; }],

      // ─── Creative Engine ───────────────────────────────────
      ['creative.crossPollinate',  () => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.crossPollinate(); }],
      ['creative.analogies',       (params) => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.findAnalogies(p(params).concept); }],
      ['creative.speculate',       () => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.speculate(); }],
      ['creative.imagine',         (params) => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.imagine(p(params).premise); }],
      ['creative.insights',        (params) => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.getInsights(p(params)?.limit ?? 20, p(params)?.status); }],
      ['creative.convert',         (params) => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return { converted: s.creativeEngine.convertTopInsights(p(params)?.minNovelty ?? 0.5) }; }],
      ['creative.status',          () => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.getStatus(); }],
      ['creative.debug',           () => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.getDebugInfo(); }],

      // ─── Action Bridge ───────────────────────────────────
      ['action.propose',    (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return { id: s.actionBridge.propose(p(params)) }; }],
      ['action.queue',      (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.getQueue(p(params)?.status); }],
      ['action.history',    (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.getHistory(p(params)?.limit); }],
      ['action.execute',    async (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.executeAction(p(params).id); }],
      ['action.outcome',    (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); s.actionBridge.recordOutcome(p(params).id, p(params).outcome); return { ok: true }; }],
      ['action.rollback',   (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); s.actionBridge.rollback(p(params).id); return { ok: true }; }],
      ['action.stats',      (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return { successRate: s.actionBridge.getSuccessRate(p(params)?.type, p(params)?.source) }; }],
      ['action.status',     () => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.getStatus(); }],

      // ─── Content Forge ──────────────────────────────────
      ['content.generate',  (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); const pp = p(params); if (pp.sourceType === 'mission') return s.contentForge.generateFromMission(pp); if (pp.sourceType === 'trend') return s.contentForge.generateFromTrend(pp); if (pp.sourceType === 'principle') return s.contentForge.generateFromPrinciple(pp); return s.contentForge.generateFromInsight(pp, pp.platform); }],
      ['content.schedule',  (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); s.contentForge.schedule(p(params).id, p(params).when); return { ok: true }; }],
      ['content.publish',   async (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.publishNow(p(params).id); }],
      ['content.list',      () => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.getSchedule(); }],
      ['content.engagement',(params) => { if (!s.contentForge) throw new Error('ContentForge not available'); s.contentForge.recordEngagement(p(params).id, p(params).metrics); return { ok: true }; }],
      ['content.best',      (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.getBestPerforming(p(params)?.limit); }],
      ['content.optimal',   (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); return { time: s.contentForge.getOptimalTime(p(params).platform) }; }],
      ['content.status',    () => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.getStatus(); }],

      // ─── Code Forge ─────────────────────────────────────
      ['codeforge.patterns', () => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.extractPatterns(); }],
      ['codeforge.generate', (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.generateUtility(p(params)); }],
      ['codeforge.scaffold', (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.scaffoldProject(p(params).template, p(params).config ?? {}); }],
      ['codeforge.test',     (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.generateTest(p(params).targetFile); }],
      ['codeforge.apply',    (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.applyProduct(p(params).id); }],
      ['codeforge.products', (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.getProducts(p(params)?.status); }],
      ['codeforge.rollback', (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); s.codeForge.rollback(p(params).id); return { ok: true }; }],
      ['codeforge.status',   () => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.getStatus(); }],

      // ─── Strategy Forge ─────────────────────────────────
      ['strategy.create',      (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.createFromPrinciples(p(params).domain); }],
      ['strategy.fromSignals', (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.createFromSignals(p(params).signals); }],
      ['strategy.backtest',    (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.backtest(p(params).id, p(params).data); }],
      ['strategy.activate',    (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); s.strategyForge.activate(p(params).id); return { ok: true }; }],
      ['strategy.pause',       (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); s.strategyForge.pause(p(params).id); return { ok: true }; }],
      ['strategy.execute',     (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.executeStep(p(params).id); }],
      ['strategy.evolve',      (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.evolve(p(params)?.ids); }],
      ['strategy.active',      () => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.getActive(); }],
      ['strategy.performance', (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.getPerformance(p(params).id); }],
      ['strategy.retire',      (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); s.strategyForge.retire(p(params).id, p(params).reason); return { ok: true }; }],
      ['strategy.status',      () => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.getStatus(); }],

      // ─── Cross-Brain Signals ────────────────────────────────────
      ['signal.cross.emit',    async (params) => { if (!s.signalRouter) throw new Error('SignalRouter not available'); return { signalId: await s.signalRouter.emit(p(params)) }; }],
      ['signal.cross.history', (params) => { if (!s.signalRouter) throw new Error('SignalRouter not available'); return s.signalRouter.getHistory(p(params).limit); }],
      ['signal.cross.status',  () => { if (!s.signalRouter) throw new Error('SignalRouter not available'); return s.signalRouter.getStatus(); }],

      // ─── Chat Interface ──────────────────────────────────────────
      ['chat.message', async (params) => { if (!s.chatEngine) throw new Error('ChatEngine not available'); return s.chatEngine.processMessage(p(params).sessionId ?? 'default', p(params).content); }],
      ['chat.multi', async (params) => { if (!s.chatEngine) throw new Error('ChatEngine not available'); return s.chatEngine.processMultiBrain(p(params).session ?? 'default', p(params).message); }],
      ['chat.history', (params) => { if (!s.chatEngine) throw new Error('ChatEngine not available'); return s.chatEngine.getHistory(p(params).sessionId ?? 'default', p(params).limit); }],
      ['chat.status',  () => { if (!s.chatEngine) throw new Error('ChatEngine not available'); return s.chatEngine.getStatus(); }],

      // ─── Sub-Agent Factory ───────────────────────────────────────
      ['subagent.list',   () => { if (!s.subAgentFactory) throw new Error('SubAgentFactory not available'); return s.subAgentFactory.getStatus(); }],
      ['subagent.create', (params) => { if (!s.subAgentFactory) throw new Error('SubAgentFactory not available'); const pp = p(params); if (pp.preset) return s.subAgentFactory.createFromPreset(pp.preset, pp.name)?.getStatus(); return s.subAgentFactory.create(pp)?.getStatus(); }],
      ['subagent.status', (params) => { if (!s.subAgentFactory) throw new Error('SubAgentFactory not available'); const agent = s.subAgentFactory.get(p(params).name); if (!agent) throw new Error(`Agent not found: ${p(params).name}`); return agent.getStatus(); }],
      ['subagent.run',    async (params) => { if (!s.subAgentFactory) throw new Error('SubAgentFactory not available'); const pp = p(params); const agent = s.subAgentFactory.get(pp.name); if (!agent) throw new Error(`Agent not found: ${pp.name}`); return agent.execute(pp.input); }],
      ['subagent.presets', () => { if (!s.subAgentFactory) throw new Error('SubAgentFactory not available'); return s.subAgentFactory.getPresets(); }],

      // ─── Self-Improvement Desires ─────────────────────────────
      ['desires.suggestions',     () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.generateSelfImprovementSuggestions(); }],
      ['desires.structured',      () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.getDesires(); }],
      ['desires.status',          () => {
        if (!s.orchestrator) throw new Error('Orchestrator not available');
        const desires = s.orchestrator.getDesires();
        return { count: desires.length, topPriority: desires[0]?.priority ?? 0, top: desires[0]?.suggestion ?? 'none' };
      }],
      ['desires.actuate',         () => {
        if (!s.orchestrator || !s.actionBridge) throw new Error('Orchestrator/ActionBridge not available');
        const desires = s.orchestrator.getDesires();
        const top = desires.find(d => d.priority >= 5);
        if (!top) return { actuated: false, reason: 'No desire with priority >= 5' };
        let actionType: 'create_goal' | 'start_mission' | 'adjust_parameter' = 'create_goal';
        if (top.key.startsWith('contradiction_')) actionType = 'start_mission';
        else if (top.key.startsWith('no_predictions') || top.key.startsWith('low_accuracy')) actionType = 'adjust_parameter';
        const actionId = s.actionBridge.propose({ source: 'desire' as any, type: actionType, title: `Desire: ${top.suggestion.substring(0, 80)}`, description: top.suggestion, confidence: Math.min(top.priority / 10, 0.9), payload: { desireKey: top.key, priority: top.priority } });
        return { actuated: true, actionId, actionType, desireKey: top.key };
      }],
      ['desires.feedback',        () => {
        if (!s.orchestrator) throw new Error('Orchestrator not available');
        return s.orchestrator.getDesireFeedbackStats();
      }],

      // ─── Conversation Memory ──────────────────────────────
      ['convo.remember',         (params) => { if (!s.conversationMemory) throw new Error('ConversationMemory not available'); return s.conversationMemory.remember(p(params).content, p(params)); }],
      ['convo.recall',           async (params) => { if (!s.conversationMemory) throw new Error('ConversationMemory not available'); return s.conversationMemory.recall(p(params).query, p(params)); }],
      ['convo.search',           (params) => { if (!s.conversationMemory) throw new Error('ConversationMemory not available'); return s.conversationMemory.searchText(p(params).query); }],
      ['convo.context',          (params) => { if (!s.conversationMemory) throw new Error('ConversationMemory not available'); return s.conversationMemory.buildContext(p(params)?.limit); }],
      ['convo.important',        (params) => { if (!s.conversationMemory) throw new Error('ConversationMemory not available'); return s.conversationMemory.getImportant(p(params)?.limit, p(params)?.minImportance); }],
      ['convo.by_category',      (params) => { if (!s.conversationMemory) throw new Error('ConversationMemory not available'); return s.conversationMemory.getByCategory(p(params).category, p(params)?.limit); }],
      ['convo.status',           () => { if (!s.conversationMemory) throw new Error('ConversationMemory not available'); return s.conversationMemory.getStatus(); }],
      ['convo.maintenance',      () => { if (!s.conversationMemory) throw new Error('ConversationMemory not available'); return s.conversationMemory.maintenance(); }],

      // ─── Browser Agent ───────────────────────────────────
      ['browser.execute',        async (params) => { if (!s.browserAgent) throw new Error('BrowserAgent not available'); return s.browserAgent.executeTask(p(params).taskId, p(params).actions); }],
      ['browser.run',            async (params) => { if (!s.browserAgent) throw new Error('BrowserAgent not available'); return s.browserAgent.runAutonomous(p(params).taskId, p(params).task); }],
      ['browser.status',         () => { if (!s.browserAgent) throw new Error('BrowserAgent not available'); return s.browserAgent.getStatus(); }],
      ['browser.shutdown',       async () => { if (!s.browserAgent) throw new Error('BrowserAgent not available'); await s.browserAgent.shutdown(); return { shutdown: true }; }],

      // ─── Brain Bot ──────────────────────────────────────
      ['bot.message',            async (params) => { if (!s.brainBot) throw new Error('BrainBot not available'); return s.brainBot.processMessage(p(params)); }],
      ['bot.commands',           () => { if (!s.brainBot) throw new Error('BrainBot not available'); return s.brainBot.getCommandDefinitions(); }],
      ['bot.status',             () => { if (!s.brainBot) throw new Error('BrainBot not available'); return s.brainBot.getStatus(); }],

      // ─── Autonomous Research ─────────────────────────────
      ['research.autonomous.status',  () => { if (!s.autonomousResearchLoop) throw new Error('AutonomousResearchLoop not available'); return s.autonomousResearchLoop.getStatus(); }],
      ['research.autonomous.config',  () => { if (!s.autonomousResearchLoop) throw new Error('AutonomousResearchLoop not available'); return s.autonomousResearchLoop.getConfig(); }],
      ['research.autonomous.enable',  () => { if (!s.autonomousResearchLoop) throw new Error('AutonomousResearchLoop not available'); s.autonomousResearchLoop.updateConfig({ enabled: true }); s.autonomousResearchLoop.start(); return { enabled: true }; }],
      ['research.autonomous.disable', () => { if (!s.autonomousResearchLoop) throw new Error('AutonomousResearchLoop not available'); s.autonomousResearchLoop.updateConfig({ enabled: false }); s.autonomousResearchLoop.stop(); return { enabled: false }; }],
      ['research.autonomous.cycle',   async () => { if (!s.autonomousResearchLoop) throw new Error('AutonomousResearchLoop not available'); return s.autonomousResearchLoop.cycle(); }],
      ['research.autonomous.update',  (params) => { if (!s.autonomousResearchLoop) throw new Error('AutonomousResearchLoop not available'); s.autonomousResearchLoop.updateConfig(p(params)); return s.autonomousResearchLoop.getConfig(); }],

      // System
      ['system.memory',           () => s.memoryWatchdog?.getStats() ?? { currentMB: Math.round(process.memoryUsage().heapUsed / 1048576), peakMB: 0, trend: 'stable', leakSuspected: false, samples: 0 }],

      // Status (cross-brain)
      ['status',                  () => ({
        name: 'brain',
        version: getCurrentVersion(),
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        methods: this.listMethods().length,
      })],
    ]);
  }
}
