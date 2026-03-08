import { getLogger } from '../utils/logger.js';
import { getCurrentVersion } from '../cli/update-check.js';
import type { TradeService } from '../services/trade.service.js';
import type { SignalService } from '../services/signal.service.js';
import type { StrategyService } from '../services/strategy.service.js';
import type { SynapseService } from '../services/synapse.service.js';
import type { AnalyticsService } from '../services/analytics.service.js';
import type { InsightService } from '../services/insight.service.js';
import type { MemoryService } from '../services/memory.service.js';
import type { BacktestService } from '../services/backtest.service.js';
import type { RiskService } from '../services/risk.service.js';
import type { AlertService } from '../services/alert.service.js';
import type { ImportService } from '../services/import.service.js';
import type { LearningEngine } from '../learning/learning-engine.js';
import type { ResearchEngine } from '../research/research-engine.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { ChainRepository } from '../db/repositories/chain.repository.js';
import type { CalibrationRepository } from '../db/repositories/calibration.repository.js';
import type { CrossBrainClient, CrossBrainSubscriptionManager } from '@timmeck/brain-core';
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

const logger = getLogger();

export interface Services {
  trade: TradeService;
  signal: SignalService;
  strategy: StrategyService;
  synapse: SynapseService;
  analytics: AnalyticsService;
  insight: InsightService;
  memory: MemoryService;
  backtest: BacktestService;
  risk: RiskService;
  alert: AlertService;
  import: ImportService;
  ruleRepo: RuleRepository;
  chainRepo: ChainRepository;
  calRepo: CalibrationRepository;
  learning?: LearningEngine;
  research?: ResearchEngine;
  crossBrain?: CrossBrainClient;
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
  attentionEngine?: import('@timmeck/brain-core').AttentionEngine;
  transferEngine?: import('@timmeck/brain-core').TransferEngine;
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
  paper?: import('../paper/paper.service.js').PaperService;
  marketData?: import('../market/market-data-service.js').MarketDataService;
  borgSync?: import('@timmeck/brain-core').BorgSyncEngine;
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
  guardrailEngine?: import('@timmeck/brain-core').GuardrailEngine;
  causalPlanner?: import('@timmeck/brain-core').CausalPlanner;
  researchRoadmap?: import('@timmeck/brain-core').ResearchRoadmap;
  creativeEngine?: import('@timmeck/brain-core').CreativeEngine;
  actionBridge?: import('@timmeck/brain-core').ActionBridgeEngine;
  contentForge?: import('@timmeck/brain-core').ContentForge;
  codeForge?: import('@timmeck/brain-core').CodeForge;
  strategyForge?: import('@timmeck/brain-core').StrategyForge;
  signalRouter?: import('@timmeck/brain-core').CrossBrainSignalRouter;
  strategyMutator?: import('@timmeck/brain-core').StrategyMutator;
  portfolioOptimizer?: import('../paper/portfolio-optimizer.js').PortfolioOptimizer;
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
        logger.info(`[cross-brain] Learned lesson from ${source}`);
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

  private trackToolCall(method: string, durationMs: number, success: boolean): void {
    try {
      this.services.toolTracker?.recordUsage(method, null, durationMs, success ? 'success' : 'failure');
      this.services.userModel?.updateFromInteraction(method, null, success ? 'success' : 'failure');
    } catch { /* best effort */ }
  }

  listMethods(): string[] {
    return Array.from(this.methods.keys()).sort();
  }

  private buildMethodMap(): Map<string, MethodHandler> {
    const s = this.services;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (params: unknown) => (params ?? {}) as any;

    return new Map<string, MethodHandler>([
      // ─── Trade ──────────────────────────────────────────
      ['trade.recordOutcome', (params) => s.trade.recordOutcome(p(params))],
      ['trade.query', (params) => s.trade.query(p(params).search ?? '', p(params).limit)],
      ['trade.recent', (params) => s.trade.getRecent(p(params).limit)],
      ['trade.byPair', (params) => s.trade.getByPair(p(params).pair)],
      ['trade.count', () => s.trade.count()],

      // ─── Signal ─────────────────────────────────────────
      ['signal.weights', (params) => s.signal.getSignalWeights(p(params).signals, p(params).regime)],
      ['signal.confidence', (params) => s.signal.getConfidence(p(params).signals, p(params).regime)],
      ['signal.explain', (params) => s.signal.explainSignal(p(params).fingerprint)],

      // ─── Strategy ───────────────────────────────────────
      ['strategy.dcaMultiplier', (params) => s.strategy.getDCAMultiplier(p(params).regime, p(params).rsi, p(params).volatility)],
      ['strategy.gridParams', (params) => s.strategy.getGridParams(p(params).regime, p(params).volatility, p(params).pair)],

      // ─── Synapse ────────────────────────────────────────
      ['synapse.explore', (params) => s.synapse.explore(p(params).query)],
      ['synapse.findPath', (params) => s.synapse.findPath(p(params).from, p(params).to)],
      ['synapse.stats', () => s.synapse.getStats()],

      // ─── Rules ──────────────────────────────────────────
      ['rule.list', () => s.ruleRepo.getAll()],
      ['rule.count', () => s.ruleRepo.count()],

      // ─── Chains ─────────────────────────────────────────
      ['chain.list', (params) => s.chainRepo.getRecent(p(params).limit ?? 20)],
      ['chain.byPair', (params) => s.chainRepo.getByPair(p(params).pair)],

      // ─── Insights ───────────────────────────────────────
      ['insight.list', (params) => s.insight.getRecent(p(params).limit ?? 20)],
      ['insight.byType', (params) => s.insight.getByType(p(params).type)],
      ['insight.count', () => s.insight.count()],

      // ─── Calibration ────────────────────────────────────
      ['calibration.get', () => s.learning?.getCalibration() ?? s.calRepo.get()],
      ['calibration.history', () => ({
        current: s.learning?.getCalibration() ?? s.calRepo.get(),
        history: s.calRepo.getHistory(20),
      })],

      // ─── Memory ──────────────────────────────────────────
      ['memory.remember', (params) => s.memory.remember(p(params))],
      ['memory.recall', (params) => s.memory.recall(p(params))],
      ['memory.forget', (params) => s.memory.forget(p(params).memoryId ?? p(params).memory_id)],
      ['memory.preferences', () => s.memory.getPreferences()],
      ['memory.decisions', () => s.memory.getDecisions()],
      ['memory.goals', () => s.memory.getGoals()],
      ['memory.lessons', () => s.memory.getLessons()],
      ['memory.stats', () => s.memory.getStats()],
      ['session.start', (params) => s.memory.startSession(p(params))],
      ['session.end', (params) => s.memory.endSession(p(params))],
      ['session.history', (params) => s.memory.getSessionHistory(p(params).limit)],

      // ─── Analytics ──────────────────────────────────────
      ['analytics.summary', () => s.analytics.getSummary()],

      // ─── Backtest ─────────────────────────────────────
      ['backtest.run', (params) => {
        const result = s.backtest.runBacktest(p(params));
        // Convert Maps to plain objects for JSON serialization
        return {
          ...result,
          tradesByPair: Object.fromEntries(result.tradesByPair),
          tradesByRegime: Object.fromEntries(result.tradesByRegime),
        };
      }],
      ['backtest.compare', (params) => s.backtest.compareSignals(p(params).fingerprint1, p(params).fingerprint2)],
      ['backtest.bestSignals', (params) => s.backtest.findBestSignals(p(params))],

      // ─── Risk ─────────────────────────────────────────
      ['risk.kelly', (params) => s.risk.getKellyFraction(p(params).pair, p(params).regime)],
      ['risk.positionSize', (params) => s.risk.getPositionSize(p(params).capitalPct, p(params).signals, p(params).regime)],
      ['risk.metrics', (params) => s.risk.getRiskMetrics(p(params).pair)],

      // ─── Alerts ───────────────────────────────────────
      ['alert.create', (params) => s.alert.createAlert(p(params))],
      ['alert.list', () => s.alert.getAlerts()],
      ['alert.listAll', () => s.alert.getAllAlerts()],
      ['alert.delete', (params) => s.alert.deleteAlert(p(params).id)],
      ['alert.check', (params) => s.alert.checkAlerts(p(params).trade, p(params).context)],
      ['alert.history', (params) => s.alert.getAlertHistory(p(params).alertId, p(params).limit)],

      // ─── Import ───────────────────────────────────────
      ['import.trades', (params) => s.import.importTrades(p(params).trades)],
      ['import.json', (params) => s.import.importFromJson(p(params).json)],

      // ─── Learning ───────────────────────────────────────
      ['learning.run', () => s.learning?.runManual()],

      // ─── Research ───────────────────────────────────────
      ['research.run', () => s.research?.runManual()],

      // ─── Paper Trading ────────────────────────────────────
      ['paper.status', () => s.paper?.getStatus()],
      ['paper.portfolio', () => s.paper?.getPortfolio()],
      ['paper.history', (params) => s.paper?.getHistory(p(params).limit)],
      ['paper.cycle', () => s.paper?.runManualCycle()],
      ['paper.pause', () => s.paper?.pause()],
      ['paper.resume', () => s.paper?.resume()],
      ['paper.reset', () => s.paper?.reset()],

      // ─── Market Data ──────────────────────────────────────
      ['market.providers', async () => {
        if (!s.marketData) throw new Error('MarketDataService not available');
        return s.marketData.getProviderStatus();
      }],
      ['market.prices', async (params) => {
        if (!s.marketData) throw new Error('MarketDataService not available');
        const { crypto, stocks } = p(params);
        const prices = await s.marketData.fetchPrices(crypto ?? [], stocks ?? []);
        return Object.fromEntries(prices);
      }],

      // ─── Reset ──────────────────────────────────────────
      ['reset', () => {
        // This will be wired in TradingCore
        return { success: true, message: 'Reset not available via IPC — use CLI' };
      }],

      // ─── Cross-Brain Notifications ──────────────────────────
      ['cross-brain.notify', (params) => {
        const { source, event, timestamp } = p(params);
        logger.info(`Cross-brain notification from ${source}: ${event}`);
        return { received: true, source, event, timestamp };
      }],

      // ─── Ecosystem ────────────────────────────────────────
      ['ecosystem.status', async () => {
        if (!s.crossBrain) return { peers: [] };
        const peers = await s.crossBrain.broadcast('status');
        return { self: 'trading-brain', peers };
      }],
      ['ecosystem.queryPeer', async (params) => {
        if (!s.crossBrain) throw new Error('Cross-brain client not available');
        const { peer, method, args } = p(params);
        const result = await s.crossBrain.query(peer, method, args);
        if (result === null) throw new Error(`Peer '${peer}' not available`);
        return result;
      }],

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

      // ─── Status (cross-brain) ─────────────────────────────
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

      // ─── AutoResponder ──────────────────────────────────────
      ['responder.status',   () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.autoResponder.getStatus(); }],
      ['responder.history',  (params) => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.autoResponder.getHistory(p(params)?.limit ?? 20); }],
      ['responder.rules',    () => { if (!s.orchestrator) throw new Error('Orchestrator not available'); return s.orchestrator.autoResponder.getRules(); }],
      ['responder.add_rule', (params) => { if (!s.orchestrator) throw new Error('Orchestrator not available'); const pp = p(params); s.orchestrator.autoResponder.addRule(pp); return { added: true }; }],

      // ─── Consciousness ──────────────────────────────────────
      ['consciousness.status',    () => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); return { ...s.thoughtStream.getStats(), engines: s.thoughtStream.getEngineActivity(), clients: s.consciousnessServer?.getClientCount() ?? 0 }; }],
      ['consciousness.thoughts',  (params) => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); const pp = p(params); return pp?.engine ? s.thoughtStream.getByEngine(pp.engine, pp?.limit ?? 50) : s.thoughtStream.getRecent(pp?.limit ?? 50); }],
      ['consciousness.engines',   () => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); return s.thoughtStream.getEngineActivity(); }],
      ['consciousness.clear',     () => { if (!s.thoughtStream) throw new Error('ThoughtStream not available'); s.thoughtStream.clear(); return { cleared: true }; }],
      ['engines.status',          () => s.thoughtStream?.getEngineActivity?.() ?? []],

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

      // ─── Narrative Engine ───────────────────────────────────
      ['narrative.explain',       (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.explainAsync(p(params).topic); }],
      ['narrative.ask',           (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.askAsync(p(params).question); }],
      ['narrative.contradictions',() => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.findContradictions(); }],
      ['narrative.digest',        (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.generateDigest(p(params)?.days ?? 7); }],
      ['narrative.confidence',    (params) => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.getConfidenceReport(p(params).topic); }],
      ['narrative.status',        () => { if (!s.narrativeEngine) throw new Error('NarrativeEngine not available'); return s.narrativeEngine.getStatus(); }],

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
      ['llm.history',              (p: unknown) => { if (!s.llmService) throw new Error('LLMService not available'); const params = (p ?? {}) as Record<string, unknown>; return s.llmService.getUsageHistory((params.hours as number) ?? 24); }],
      ['llm.byTemplate',           () => { if (!s.llmService) throw new Error('LLMService not available'); return s.llmService.getUsageByTemplate(); }],
      ['llm.providers',            async () => { if (!s.llmService) throw new Error('LLMService not available'); return s.llmService.getProviderStatus(); }],
      ['llm.ollamaStatus',         async () => {
        if (!s.llmService) throw new Error('LLMService not available');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ollamaProvider = s.llmService.getProviders().find((p: any) => p.name === 'ollama');
        if (!ollamaProvider || !('getStatus' in ollamaProvider)) {
          return { available: false, host: 'http://localhost:11434', chatModel: '-', embedModel: '-', installedModels: [], runningModels: [] };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (ollamaProvider as any).getStatus();
      }],

      // ─── Borg Sync ──────────────────────────────────────────
      ['borg.status',             () => s.borgSync?.getStatus() ?? { enabled: false }],
      ['borg.history',            (params) => s.borgSync?.getHistory((params as { limit?: number })?.limit) ?? []],
      ['borg.enable',             () => { s.borgSync?.setEnabled(true); return { enabled: true }; }],
      ['borg.disable',            () => { s.borgSync?.setEnabled(false); return { enabled: false }; }],
      ['cross-brain.borgSync',    (params) => s.borgSync?.handleIncomingSync(params as import('@timmeck/brain-core').SyncPacket) ?? { accepted: 0, rejected: 0 }],
      ['cross-brain.borgExport',  () => s.borgSync?.handleExportRequest() ?? { source: 'trading-brain', timestamp: new Date().toISOString(), items: [] }],

      // ─── Intelligence (Sessions 55-65) ────────────────────
      ['rag.search',              async (params) => { if (!s.ragEngine) throw new Error('RAGEngine not available'); return s.ragEngine.search(p(params).query, { collections: p(params).collections, limit: p(params).limit, threshold: p(params).threshold }); }],
      ['rag.status',              () => { if (!s.ragEngine) throw new Error('RAGEngine not available'); return s.ragEngine.getStatus(); }],
      ['rag.index',               async () => { if (!s.ragIndexer) throw new Error('RAGIndexer not available'); const count = await s.ragIndexer.indexAll(); return { indexed: count }; }],
      ['kg.query',                (params) => { if (!s.knowledgeGraph) throw new Error('KnowledgeGraph not available'); return s.knowledgeGraph.query({ subject: p(params).subject, predicate: p(params).predicate, object: p(params).object }); }],
      ['kg.addFact',              (params) => { if (!s.knowledgeGraph) throw new Error('KnowledgeGraph not available'); return s.knowledgeGraph.addFact(p(params).subject, p(params).predicate, p(params).object, p(params).context, p(params).confidence); }],
      ['kg.status',               () => { if (!s.knowledgeGraph) throw new Error('KnowledgeGraph not available'); return s.knowledgeGraph.getStatus(); }],
      ['feedback.record',         (params) => { if (!s.feedbackEngine) throw new Error('FeedbackEngine not available'); return s.feedbackEngine.recordFeedback(p(params).type, p(params).targetId, p(params).signal, p(params).detail); }],
      ['feedback.stats',          () => { if (!s.feedbackEngine) throw new Error('FeedbackEngine not available'); return s.feedbackEngine.getStats(); }],
      ['toolLearning.stats',      (params) => { if (!s.toolTracker) throw new Error('ToolTracker not available'); return s.toolTracker.getToolStats(p(params)?.tool); }],
      ['toolLearning.recommend',  (params) => { if (!s.toolTracker) throw new Error('ToolTracker not available'); return s.toolTracker.recommend(p(params).context); }],
      ['proactive.suggestions',   (params) => { if (!s.proactiveEngine) throw new Error('ProactiveEngine not available'); return s.proactiveEngine.getSuggestions(p(params).limit); }],
      ['proactive.status',        () => { if (!s.proactiveEngine) throw new Error('ProactiveEngine not available'); return s.proactiveEngine.getStatus(); }],
      ['userModel.profile',       () => { if (!s.userModel) throw new Error('UserModel not available'); return s.userModel.getProfile(); }],
      ['userModel.status',        () => { if (!s.userModel) throw new Error('UserModel not available'); return s.userModel.getStatus(); }],
      ['codeHealth.status',       () => { if (!s.codeHealthMonitor) throw new Error('CodeHealthMonitor not available'); return s.codeHealthMonitor.getStatus(); }],
      ['teaching.status',         () => { if (!s.teachingProtocol) throw new Error('TeachingProtocol not available'); return s.teachingProtocol.getStatus(); }],
      ['consensus.status',        () => { if (!s.consensusEngine) throw new Error('ConsensusEngine not available'); return s.consensusEngine.getStatus(); }],
      ['activeLearning.status',   () => { if (!s.activeLearner) throw new Error('ActiveLearner not available'); return s.activeLearner.getStatus(); }],
      ['repoAbsorber.status',     () => { if (!s.repoAbsorber) throw new Error('RepoAbsorber not available'); return s.repoAbsorber.getStatus(); }],
      ['repoAbsorber.absorb',     async () => { if (!s.repoAbsorber) throw new Error('RepoAbsorber not available'); return s.repoAbsorber.absorbNext(); }],

      // Guardrail Engine
      ['guardrail.status',         () => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.getStatus(); }],
      ['guardrail.health',         () => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.checkHealth(); }],
      ['guardrail.validate',       (params) => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.validateParameterChange(p(params).param, p(params).oldVal, p(params).newVal); }],
      ['guardrail.rollback',       (params) => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.rollbackParameters(p(params).steps ?? 1); }],
      ['guardrail.tripBreaker',    (params) => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); s.guardrailEngine.tripCircuitBreaker(p(params).reason); return { tripped: true }; }],
      ['guardrail.resetBreaker',   () => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); s.guardrailEngine.resetCircuitBreaker(); return { reset: true }; }],
      ['guardrail.protectedPaths', () => { if (!s.guardrailEngine) throw new Error('GuardrailEngine not available'); return s.guardrailEngine.getProtectedPaths(); }],

      // Causal Planner
      ['causal.diagnose',          (params) => { if (!s.causalPlanner) throw new Error('CausalPlanner not available'); return s.causalPlanner.diagnose(p(params).metric); }],
      ['causal.interventions',     (params) => { if (!s.causalPlanner) throw new Error('CausalPlanner not available'); return s.causalPlanner.suggestInterventions(p(params).metric); }],
      ['causal.predict',           (params) => { if (!s.causalPlanner) throw new Error('CausalPlanner not available'); return s.causalPlanner.predictOutcome(p(params).intervention); }],
      ['causal.stagnant',          () => { if (!s.causalPlanner) throw new Error('CausalPlanner not available'); return s.causalPlanner.diagnoseStagnantGoals(); }],

      // Research Roadmap
      ['roadmap.list',             (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.listRoadmaps(p(params)?.status); }],
      ['roadmap.create',           (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.createRoadmap(p(params).title, p(params).finalGoalId); }],
      ['roadmap.decompose',        (params) => { if (!s.researchRoadmap || !s.goalEngine) throw new Error('ResearchRoadmap not available'); const goal = s.goalEngine.getGoal(p(params).goalId); if (!goal) throw new Error('Goal not found'); return s.researchRoadmap.decompose(goal, p(params).currentCycle ?? 0); }],
      ['roadmap.dag',              (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.toDAG(p(params).roadmapId); }],
      ['roadmap.progress',         (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.getProgress(p(params).roadmapId); }],
      ['roadmap.ready',            () => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.getReadyGoals(); }],
      ['roadmap.dependencies',     (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); return s.researchRoadmap.getDependencies(p(params).goalId); }],
      ['roadmap.setDependencies',  (params) => { if (!s.researchRoadmap) throw new Error('ResearchRoadmap not available'); s.researchRoadmap.setDependencies(p(params).goalId, p(params).deps); return { set: true }; }],

      // Creative Engine
      ['creative.crossPollinate',  () => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.crossPollinate(); }],
      ['creative.analogies',       (params) => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.findAnalogies(p(params).concept); }],
      ['creative.speculate',       () => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.speculate(); }],
      ['creative.imagine',         (params) => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.imagine(p(params).premise); }],
      ['creative.insights',        (params) => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.getInsights(p(params)?.limit ?? 20, p(params)?.status); }],
      ['creative.convert',         (params) => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return { converted: s.creativeEngine.convertTopInsights(p(params)?.minNovelty ?? 0.5) }; }],
      ['creative.status',          () => { if (!s.creativeEngine) throw new Error('CreativeEngine not available'); return s.creativeEngine.getStatus(); }],

      // ─── ActionBridge ─────────────────────────────────────────────
      ['action.propose',      (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.propose(p(params)); }],
      ['action.queue',        (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.getQueue(p(params).status); }],
      ['action.history',      (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.getHistory(p(params).limit); }],
      ['action.execute',      async (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return await s.actionBridge.executeAction(p(params).id); }],
      ['action.outcome',      (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.recordOutcome(p(params).id, p(params).outcome); }],
      ['action.rollback',     (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.rollback(p(params).id); }],
      ['action.stats',        (params) => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.getSuccessRate(p(params).type, p(params).source); }],
      ['action.status',       () => { if (!s.actionBridge) throw new Error('ActionBridge not available'); return s.actionBridge.getStatus(); }],

      // ─── ContentForge ─────────────────────────────────────────────
      ['content.generate',    async (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); return await s.contentForge.generateFromInsight({ insight: p(params).insight ?? 'Generated via IPC', noveltyScore: p(params).noveltyScore ?? 0.5 }, p(params).platform); }],
      ['content.schedule',    (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.schedule(p(params).id, p(params).when ?? new Date().toISOString()); }],
      ['content.publish',     async (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); return await s.contentForge.publishNow(p(params).id); }],
      ['content.list',        () => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.getSchedule(); }],
      ['content.engagement',  (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.recordEngagement(p(params).id, p(params).metrics); }],
      ['content.best',        (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.getBestPerforming(p(params).limit); }],
      ['content.optimal',     (params) => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.getOptimalTime(p(params).platform); }],
      ['content.status',      () => { if (!s.contentForge) throw new Error('ContentForge not available'); return s.contentForge.getStatus(); }],

      // ─── CodeForge ────────────────────────────────────────────────
      ['codeforge.patterns',  () => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.extractPatterns(); }],
      ['codeforge.generate',  async (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return await s.codeForge.generateUtility(p(params).patternId); }],
      ['codeforge.scaffold',  async (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return await s.codeForge.scaffoldProject(p(params).template, p(params).config); }],
      ['codeforge.test',      async (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return await s.codeForge.generateTest(p(params).targetFile); }],
      ['codeforge.apply',     async (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return await s.codeForge.applyProduct(p(params).id); }],
      ['codeforge.products',  (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.getProducts(p(params).status); }],
      ['codeforge.rollback',  (params) => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.rollback(p(params).id); }],
      ['codeforge.status',    () => { if (!s.codeForge) throw new Error('CodeForge not available'); return s.codeForge.getStatus(); }],

      // ─── StrategyForge ────────────────────────────────────────────
      ['strategy.create',      async (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return await s.strategyForge.createFromPrinciples(p(params).domain); }],
      ['strategy.fromSignals', async (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return await s.strategyForge.createFromSignals(p(params).signals); }],
      ['strategy.backtest',    (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.backtest(p(params).id, p(params).data); }],
      ['strategy.activate',    (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.activate(p(params).id); }],
      ['strategy.pause',       (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.pause(p(params).id); }],
      ['strategy.execute',     async (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return await s.strategyForge.executeStep(p(params).id); }],
      ['strategy.evolve',      async (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return await s.strategyForge.evolve(p(params)?.ids); }],
      ['strategy.active',      () => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.getActive(); }],
      ['strategy.performance', (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.getPerformance(p(params).id); }],
      ['strategy.retire',      (params) => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.retire(p(params).id, p(params).reason); }],
      ['strategy.status',      () => { if (!s.strategyForge) throw new Error('StrategyForge not available'); return s.strategyForge.getStatus(); }],
      ['strategy.bridge.status', () => {
        if (!s.strategyForge || !s.actionBridge) throw new Error('StrategyForge or ActionBridge not available');
        return {
          strategyForge: s.strategyForge.getStatus(),
          actionBridge: s.actionBridge.getStatus(),
          pipeline: 'StrategyForge → ActionBridge → PaperEngine',
          handlerRegistered: true,
        };
      }],

      // ─── Cross-Brain Signals ────────────────────────────────────
      ['signal.cross.emit',    async (params) => { if (!s.signalRouter) throw new Error('SignalRouter not available'); return { signalId: await s.signalRouter.emit(p(params)) }; }],
      ['signal.cross.history', (params) => { if (!s.signalRouter) throw new Error('SignalRouter not available'); return s.signalRouter.getHistory(p(params).limit); }],
      ['signal.cross.status',  () => { if (!s.signalRouter) throw new Error('SignalRouter not available'); return s.signalRouter.getStatus(); }],

      // ─── Strategy Mutation & Portfolio Optimization ────────────────
      ['strategy.mutate',     () => { if (!s.strategyMutator || !s.strategyForge) throw new Error('Not available'); const strategies = s.strategyForge.getActive(); return s.strategyMutator.evolveGeneration(strategies); }],
      ['strategy.generation', () => { if (!s.strategyMutator) throw new Error('Not available'); return { generation: s.strategyMutator.getGeneration() }; }],
      ['portfolio.health',    () => { if (!s.portfolioOptimizer || !s.paper) throw new Error('Not available'); const portfolio = s.paper.getPortfolio(); return s.portfolioOptimizer.checkHealth(portfolio.equity, portfolio.positions.map((p: { symbol: string; usdtAmount: number }) => ({ symbol: p.symbol, usdtAmount: p.usdtAmount }))); }],
      ['portfolio.history',   (params) => { if (!s.portfolioOptimizer) throw new Error('Not available'); return s.portfolioOptimizer.getHistory(p(params).limit); }],

      ['status', () => ({
        name: 'trading-brain',
        version: getCurrentVersion(),
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        methods: this.listMethods().length,
      })],
    ]);
  }
}
