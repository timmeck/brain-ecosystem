import { getLogger } from '../utils/logger.js';
import type { TradeService } from '../services/trade.service.js';
import type { SignalService } from '../services/signal.service.js';
import type { StrategyService } from '../services/strategy.service.js';
import type { SynapseService } from '../services/synapse.service.js';
import type { AnalyticsService } from '../services/analytics.service.js';
import type { InsightService } from '../services/insight.service.js';
import type { MemoryService } from '../services/memory.service.js';
import type { LearningEngine } from '../learning/learning-engine.js';
import type { ResearchEngine } from '../research/research-engine.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { ChainRepository } from '../db/repositories/chain.repository.js';
import type { CalibrationRepository } from '../db/repositories/calibration.repository.js';
import type { CrossBrainClient, CrossBrainSubscriptionManager } from '@timmeck/brain-core';
import type { IpcServer } from '@timmeck/brain-core';

const logger = getLogger();

export interface Services {
  trade: TradeService;
  signal: SignalService;
  strategy: StrategyService;
  synapse: SynapseService;
  analytics: AnalyticsService;
  insight: InsightService;
  memory: MemoryService;
  ruleRepo: RuleRepository;
  chainRepo: ChainRepository;
  calRepo: CalibrationRepository;
  learning?: LearningEngine;
  research?: ResearchEngine;
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
        const { source, event, data, timestamp } = p(params);
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

      // ─── Status (cross-brain) ─────────────────────────────
      ['status', () => ({
        name: 'trading-brain',
        version: '1.3.0',
        uptime: Math.floor(process.uptime()),
        pid: process.pid,
        methods: this.listMethods().length,
      })],
    ]);
  }
}
