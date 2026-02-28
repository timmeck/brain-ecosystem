import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TradeService, type RecordOutcomeInput } from '../../../src/services/trade.service.js';
import type { TradeRepository, TradeRecord } from '../../../src/db/repositories/trade.repository.js';
import type { SignalRepository } from '../../../src/db/repositories/signal.repository.js';
import type { ChainRepository } from '../../../src/db/repositories/chain.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { WeightedGraph } from '../../../src/graph/weighted-graph.js';
import type { CalibrationConfig, LearningConfig } from '../../../src/types/config.types.js';

// Mock logger and event bus to prevent side effects
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({
    emit: vi.fn(),
    on: vi.fn(),
  }),
}));

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 1,
    fingerprint: 'neutral|neutral|flat|low',
    pair: 'BTC/USDT',
    bot_type: 'dca',
    regime: null,
    profit_pct: 1.5,
    win: 1,
    signals_json: '{"rsi14":50,"macd":0,"trendScore":0,"volatility":20}',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createMockCalibration(): CalibrationConfig {
  return {
    learningRate: 0.1,
    weakenPenalty: 0.8,
    decayHalfLifeDays: 30,
    patternExtractionInterval: 60000,
    patternMinSamples: 5,
    patternWilsonThreshold: 0.55,
    wilsonZ: 1.96,
    spreadingActivationDecay: 0.6,
    spreadingActivationThreshold: 0.05,
    minActivationsForWeight: 3,
    minOutcomesForWeights: 10,
  };
}

function createMockLearningConfig(): LearningConfig {
  return {
    intervalMs: 60000,
    fingerprintSimilarityThreshold: 0.6,
    chainMinLength: 3,
    maxChains: 100,
  };
}

describe('TradeService', () => {
  let service: TradeService;
  let tradeRepo: Record<string, ReturnType<typeof vi.fn>>;
  let signalRepo: Record<string, ReturnType<typeof vi.fn>>;
  let chainRepo: Record<string, ReturnType<typeof vi.fn>>;
  let synapseManager: Record<string, ReturnType<typeof vi.fn>>;
  let graph: Record<string, any>;
  let cal: CalibrationConfig;
  let learningConfig: LearningConfig;

  beforeEach(() => {
    tradeRepo = {
      create: vi.fn().mockReturnValue(1),
      getById: vi.fn().mockReturnValue(makeTrade()),
      getRecent: vi.fn().mockReturnValue([]),
      getByPair: vi.fn().mockReturnValue([]),
      search: vi.fn().mockReturnValue([]),
      count: vi.fn().mockReturnValue(0),
    };

    signalRepo = {
      create: vi.fn().mockReturnValue(1),
    };

    chainRepo = {
      create: vi.fn().mockReturnValue(1),
    };

    synapseManager = {
      recordWin: vi.fn().mockReturnValue({ weight: 0.55, activations: 1 }),
      recordLoss: vi.fn().mockReturnValue({ weight: 0.45, activations: 1 }),
    };

    graph = {
      addNode: vi.fn(),
      addEdge: vi.fn(),
      strengthenEdge: vi.fn(),
      weakenEdge: vi.fn(),
      getNodeCount: vi.fn().mockReturnValue(5),
      getEdgeCount: vi.fn().mockReturnValue(8),
      nodes: {},
    };

    cal = createMockCalibration();
    learningConfig = createMockLearningConfig();

    service = new TradeService(
      tradeRepo as unknown as TradeRepository,
      signalRepo as unknown as SignalRepository,
      chainRepo as unknown as ChainRepository,
      synapseManager as unknown as SynapseManager,
      graph as unknown as WeightedGraph,
      cal,
      learningConfig,
    );
  });

  describe('constructor', () => {
    it('should seed recent trades from the repository', () => {
      expect(tradeRepo.getRecent).toHaveBeenCalledWith(10);
    });
  });

  describe('recordOutcome', () => {
    const winInput: RecordOutcomeInput = {
      signals: { rsi14: 25, macd: 1, trendScore: 2, volatility: 20 },
      regime: 'bull',
      profitPct: 2.5,
      win: true,
      botType: 'dca',
      pair: 'BTC/USDT',
    };

    const lossInput: RecordOutcomeInput = {
      signals: { rsi14: 75, macd: -1, trendScore: -2, volatility: 60 },
      regime: 'bear',
      profitPct: -1.8,
      win: false,
      botType: 'grid',
      pair: 'ETH/USDT',
    };

    it('should store the signal combo', () => {
      service.recordOutcome(winInput);

      expect(signalRepo.create).toHaveBeenCalledTimes(1);
      expect(signalRepo.create).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(winInput.signals),
        winInput.regime,
      );
    });

    it('should store the trade record', () => {
      service.recordOutcome(winInput);

      expect(tradeRepo.create).toHaveBeenCalledTimes(1);
      expect(tradeRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pair: 'BTC/USDT',
          bot_type: 'dca',
          regime: 'bull',
          profit_pct: 2.5,
          win: true,
          signals_json: JSON.stringify(winInput.signals),
        }),
      );
    });

    it('should call recordWin on synapse manager for a winning trade', () => {
      service.recordOutcome(winInput);

      expect(synapseManager.recordWin).toHaveBeenCalledTimes(1);
      expect(synapseManager.recordWin).toHaveBeenCalledWith(expect.any(String), 2.5);
      expect(synapseManager.recordLoss).not.toHaveBeenCalled();
    });

    it('should call recordLoss on synapse manager for a losing trade', () => {
      service.recordOutcome(lossInput);

      expect(synapseManager.recordLoss).toHaveBeenCalledTimes(1);
      expect(synapseManager.recordLoss).toHaveBeenCalledWith(expect.any(String), -1.8);
      expect(synapseManager.recordWin).not.toHaveBeenCalled();
    });

    it('should add nodes and edges to the weighted graph', () => {
      service.recordOutcome(winInput);

      // Should add signal nodes, regime, pair, bot_type, combo, and outcome nodes
      expect(graph.addNode).toHaveBeenCalled();
      expect(graph.addEdge).toHaveBeenCalled();
    });

    it('should strengthen graph edges for a winning trade', () => {
      service.recordOutcome(winInput);

      expect(graph.strengthenEdge).toHaveBeenCalled();
    });

    it('should weaken graph edges for a losing trade', () => {
      service.recordOutcome(lossInput);

      expect(graph.weakenEdge).toHaveBeenCalled();
    });

    it('should return tradeId, fingerprint, and synapseWeight', () => {
      const result = service.recordOutcome(winInput);

      expect(result).toHaveProperty('tradeId', 1);
      expect(result).toHaveProperty('fingerprint');
      expect(typeof result.fingerprint).toBe('string');
      expect(result.fingerprint.length).toBeGreaterThan(0);
      expect(result).toHaveProperty('synapseWeight', 0.55);
    });

    it('should look up the trade by ID for chain detection', () => {
      service.recordOutcome(winInput);

      expect(tradeRepo.getById).toHaveBeenCalledWith(1);
    });

    it('should detect a chain when enough consecutive same-pair trades exist', () => {
      // Setup: pre-populate recent trades with 2 wins on BTC/USDT
      const recentWins = [
        makeTrade({ id: 1, pair: 'BTC/USDT', win: 1 }),
        makeTrade({ id: 2, pair: 'BTC/USDT', win: 1 }),
      ];
      tradeRepo.getRecent.mockReturnValue(recentWins);

      // Re-create service so constructor picks up the recent trades
      service = new TradeService(
        tradeRepo as unknown as TradeRepository,
        signalRepo as unknown as SignalRepository,
        chainRepo as unknown as ChainRepository,
        synapseManager as unknown as SynapseManager,
        graph as unknown as WeightedGraph,
        cal,
        learningConfig,
      );

      // This 3rd win on BTC/USDT should trigger a winning_streak chain
      const thirdWin = makeTrade({ id: 3, pair: 'BTC/USDT', win: 1 });
      tradeRepo.getById.mockReturnValue(thirdWin);

      service.recordOutcome(winInput);

      expect(chainRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pair: 'BTC/USDT',
          type: 'winning_streak',
          length: 3,
        }),
      );
    });
  });

  describe('updateCalibration', () => {
    it('should update the calibration config', () => {
      const newCal = { ...cal, learningRate: 0.2 };
      service.updateCalibration(newCal);

      // Record a trade and verify the new learning rate is used in strengthenEdge
      service.recordOutcome({
        signals: { rsi14: 50 },
        profitPct: 1.0,
        win: true,
        botType: 'dca',
        pair: 'BTC/USDT',
      });

      expect(graph.strengthenEdge).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        0.2,
      );
    });
  });

  describe('query', () => {
    it('should delegate to tradeRepo.search with default limit', () => {
      const mockResults = [makeTrade()];
      tradeRepo.search.mockReturnValue(mockResults);

      const result = service.query('BTC');

      expect(tradeRepo.search).toHaveBeenCalledWith('BTC', 50);
      expect(result).toBe(mockResults);
    });

    it('should pass custom limit to tradeRepo.search', () => {
      service.query('ETH', 10);

      expect(tradeRepo.search).toHaveBeenCalledWith('ETH', 10);
    });
  });

  describe('getRecent', () => {
    it('should delegate to tradeRepo.getRecent with default limit', () => {
      const mockResults = [makeTrade()];
      // The constructor already called getRecent(10), so reset the mock
      tradeRepo.getRecent.mockClear();
      tradeRepo.getRecent.mockReturnValue(mockResults);

      const result = service.getRecent();

      expect(tradeRepo.getRecent).toHaveBeenCalledWith(10);
      expect(result).toBe(mockResults);
    });

    it('should pass custom limit', () => {
      tradeRepo.getRecent.mockClear();
      service.getRecent(5);

      expect(tradeRepo.getRecent).toHaveBeenCalledWith(5);
    });
  });

  describe('getByPair', () => {
    it('should delegate to tradeRepo.getByPair', () => {
      const mockResults = [makeTrade({ pair: 'ETH/USDT' })];
      tradeRepo.getByPair.mockReturnValue(mockResults);

      const result = service.getByPair('ETH/USDT');

      expect(tradeRepo.getByPair).toHaveBeenCalledWith('ETH/USDT');
      expect(result).toBe(mockResults);
    });
  });

  describe('count', () => {
    it('should delegate to tradeRepo.count', () => {
      tradeRepo.count.mockReturnValue(42);

      const result = service.count();

      expect(tradeRepo.count).toHaveBeenCalled();
      expect(result).toBe(42);
    });
  });
});
