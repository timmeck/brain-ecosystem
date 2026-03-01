import { getLogger } from '../utils/logger.js';
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
    return Array.from(this.methods.keys()).sort();
  }

  private buildMethodMap(): Map<string, MethodHandler> {
    const s = this.services;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (params: unknown) => params as any;

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

      ['status', () => ({
        name: 'trading-brain',
        version: '2.5.0',
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        methods: this.listMethods().length,
      })],
    ]);
  }
}
