/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BacktestService } from '../../../src/services/backtest.service.js';
import type { TradeRepository, TradeRecord } from '../../../src/db/repositories/trade.repository.js';
import type { SignalService } from '../../../src/services/signal.service.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';

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

// Mock fingerprintSimilarity so we control similarity values in tests
vi.mock('../../../src/signals/fingerprint.js', () => ({
  fingerprint: (signals: any) => 'neutral|neutral|flat|low',
  fingerprintSimilarity: (fp1: string, fp2: string) => {
    // Simple part-matching similarity for testing
    const parts1 = fp1.split('|');
    const parts2 = fp2.split('|');
    const maxLen = Math.max(parts1.length, parts2.length);
    if (maxLen === 0) return 1;
    let matches = 0;
    for (let i = 0; i < maxLen; i++) {
      if (parts1[i] === parts2[i]) matches++;
    }
    return matches / maxLen;
  },
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
    created_at: '2025-01-15T10:00:00Z',
    ...overrides,
  };
}

describe('BacktestService', () => {
  let service: BacktestService;
  let tradeRepo: Record<string, ReturnType<typeof vi.fn>>;
  let signalService: Record<string, ReturnType<typeof vi.fn>>;
  let synapseManager: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    tradeRepo = {
      getAll: vi.fn().mockReturnValue([]),
      getByFingerprint: vi.fn().mockReturnValue([]),
      getByPair: vi.fn().mockReturnValue([]),
    };

    signalService = {
      getSignalWeights: vi.fn().mockReturnValue({}),
      getConfidence: vi.fn().mockReturnValue(0.5),
    };

    synapseManager = {
      getByFingerprint: vi.fn().mockReturnValue(undefined),
    };

    service = new BacktestService(
      tradeRepo as unknown as TradeRepository,
      signalService as unknown as SignalService,
      synapseManager as unknown as SynapseManager,
    );
  });

  // ---------------------------------------------------------------------------
  // runBacktest
  // ---------------------------------------------------------------------------
  describe('runBacktest', () => {
    it('should return an empty result when there are no trades', () => {
      tradeRepo.getAll.mockReturnValue([]);

      const result = service.runBacktest();

      expect(result.totalTrades).toBe(0);
      expect(result.wins).toBe(0);
      expect(result.losses).toBe(0);
      expect(result.winRate).toBe(0);
      expect(result.totalProfitPct).toBe(0);
      expect(result.avgProfitPct).toBe(0);
      expect(result.avgWinPct).toBe(0);
      expect(result.avgLossPct).toBe(0);
      expect(result.maxDrawdownPct).toBe(0);
      expect(result.profitFactor).toBe(0);
      expect(result.sharpeRatio).toBe(0);
      expect(result.bestTrade).toBe(0);
      expect(result.worstTrade).toBe(0);
      expect(result.tradesByPair.size).toBe(0);
      expect(result.tradesByRegime.size).toBe(0);
      expect(result.equityCurve).toHaveLength(0);
    });

    it('should compute correct stats for a single winning trade', () => {
      tradeRepo.getAll.mockReturnValue([makeTrade({ profit_pct: 3.0, win: 1 })]);

      const result = service.runBacktest();

      expect(result.totalTrades).toBe(1);
      expect(result.wins).toBe(1);
      expect(result.losses).toBe(0);
      expect(result.winRate).toBe(1);
      expect(result.totalProfitPct).toBe(3.0);
      expect(result.avgProfitPct).toBe(3.0);
      expect(result.avgWinPct).toBe(3.0);
      expect(result.avgLossPct).toBe(0);
      expect(result.bestTrade).toBe(3.0);
      expect(result.worstTrade).toBe(3.0);
    });

    it('should compute correct stats for a single losing trade', () => {
      tradeRepo.getAll.mockReturnValue([makeTrade({ profit_pct: -2.0, win: 0 })]);

      const result = service.runBacktest();

      expect(result.totalTrades).toBe(1);
      expect(result.wins).toBe(0);
      expect(result.losses).toBe(1);
      expect(result.winRate).toBe(0);
      expect(result.avgWinPct).toBe(0);
      expect(result.avgLossPct).toBe(-2.0);
      expect(result.bestTrade).toBe(-2.0);
      expect(result.worstTrade).toBe(-2.0);
    });

    it('should compute correct win rate with multiple trades', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: 2.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: -1.0, win: 0, created_at: '2025-01-02T00:00:00Z' }),
        makeTrade({ id: 3, profit_pct: 3.0, win: 1, created_at: '2025-01-03T00:00:00Z' }),
        makeTrade({ id: 4, profit_pct: -0.5, win: 0, created_at: '2025-01-04T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      expect(result.totalTrades).toBe(4);
      expect(result.wins).toBe(2);
      expect(result.losses).toBe(2);
      expect(result.winRate).toBe(0.5);
      expect(result.totalProfitPct).toBeCloseTo(3.5);
      expect(result.avgProfitPct).toBeCloseTo(0.875);
      expect(result.avgWinPct).toBeCloseTo(2.5);
      expect(result.avgLossPct).toBeCloseTo(-0.75);
      expect(result.bestTrade).toBe(3.0);
      expect(result.worstTrade).toBe(-1.0);
    });

    // -- Filter tests --

    it('should filter trades by pair', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, pair: 'BTC/USDT', profit_pct: 2.0, win: 1 }),
        makeTrade({ id: 2, pair: 'ETH/USDT', profit_pct: 1.0, win: 1 }),
        makeTrade({ id: 3, pair: 'BTC/USDT', profit_pct: -1.0, win: 0 }),
      ]);

      const result = service.runBacktest({ pair: 'BTC/USDT' });

      expect(result.totalTrades).toBe(2);
      expect(result.totalProfitPct).toBeCloseTo(1.0);
    });

    it('should filter trades by regime', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, regime: 'bull', profit_pct: 3.0, win: 1 }),
        makeTrade({ id: 2, regime: 'bear', profit_pct: -1.0, win: 0 }),
        makeTrade({ id: 3, regime: 'bull', profit_pct: 1.0, win: 1 }),
      ]);

      const result = service.runBacktest({ regime: 'bull' });

      expect(result.totalTrades).toBe(2);
      expect(result.wins).toBe(2);
      expect(result.totalProfitPct).toBeCloseTo(4.0);
    });

    it('should filter trades by botType', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, bot_type: 'dca', profit_pct: 2.0, win: 1 }),
        makeTrade({ id: 2, bot_type: 'grid', profit_pct: 1.0, win: 1 }),
        makeTrade({ id: 3, bot_type: 'dca', profit_pct: -0.5, win: 0 }),
      ]);

      const result = service.runBacktest({ botType: 'dca' });

      expect(result.totalTrades).toBe(2);
      expect(result.totalProfitPct).toBeCloseTo(1.5);
    });

    it('should filter trades by date range', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: 1.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: 2.0, win: 1, created_at: '2025-02-15T00:00:00Z' }),
        makeTrade({ id: 3, profit_pct: 3.0, win: 1, created_at: '2025-03-30T00:00:00Z' }),
      ]);

      const result = service.runBacktest({
        fromDate: '2025-02-01T00:00:00Z',
        toDate: '2025-03-01T00:00:00Z',
      });

      expect(result.totalTrades).toBe(1);
      expect(result.totalProfitPct).toBeCloseTo(2.0);
    });

    // -- Equity curve + drawdown --

    it('should build a correct equity curve sorted by created_at', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: 2.0, win: 1, created_at: '2025-01-03T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: -1.0, win: 0, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 3, profit_pct: 1.5, win: 1, created_at: '2025-01-02T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      // Sorted by created_at: trade2 (-1.0), trade3 (+1.5), trade1 (+2.0)
      expect(result.equityCurve).toHaveLength(3);
      expect(result.equityCurve[0]!.tradeIndex).toBe(0);
      expect(result.equityCurve[0]!.cumulativePct).toBeCloseTo(-1.0);
      expect(result.equityCurve[1]!.tradeIndex).toBe(1);
      expect(result.equityCurve[1]!.cumulativePct).toBeCloseTo(0.5);
      expect(result.equityCurve[2]!.tradeIndex).toBe(2);
      expect(result.equityCurve[2]!.cumulativePct).toBeCloseTo(2.5);
    });

    it('should compute max drawdown correctly', () => {
      // Sequence: +5, -3, -2, +1 => peak at 5, drops to 0, drawdown = 5
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: 5.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: -3.0, win: 0, created_at: '2025-01-02T00:00:00Z' }),
        makeTrade({ id: 3, profit_pct: -2.0, win: 0, created_at: '2025-01-03T00:00:00Z' }),
        makeTrade({ id: 4, profit_pct: 1.0, win: 1, created_at: '2025-01-04T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      expect(result.maxDrawdownPct).toBeCloseTo(5.0);
    });

    it('should report zero drawdown when all trades are winners', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: 1.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: 2.0, win: 1, created_at: '2025-01-02T00:00:00Z' }),
        makeTrade({ id: 3, profit_pct: 0.5, win: 1, created_at: '2025-01-03T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      expect(result.maxDrawdownPct).toBe(0);
    });

    // -- Profit factor --

    it('should compute profit factor correctly with wins and losses', () => {
      // Gross wins = 2 + 3 = 5, Gross losses = |(-1) + (-2)| = 3, PF = 5/3
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: 2.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: -1.0, win: 0, created_at: '2025-01-02T00:00:00Z' }),
        makeTrade({ id: 3, profit_pct: 3.0, win: 1, created_at: '2025-01-03T00:00:00Z' }),
        makeTrade({ id: 4, profit_pct: -2.0, win: 0, created_at: '2025-01-04T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      expect(result.profitFactor).toBeCloseTo(5 / 3);
    });

    it('should return Infinity profit factor when all trades are wins', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: 2.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: 1.0, win: 1, created_at: '2025-01-02T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      expect(result.profitFactor).toBe(Infinity);
    });

    it('should return 0 profit factor when all trades are losses', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: -1.0, win: 0, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: -2.0, win: 0, created_at: '2025-01-02T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      expect(result.profitFactor).toBe(0);
    });

    // -- Sharpe ratio --

    it('should compute a positive Sharpe ratio for profitable trades', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: 2.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: 3.0, win: 1, created_at: '2025-01-02T00:00:00Z' }),
        makeTrade({ id: 3, profit_pct: 1.0, win: 1, created_at: '2025-01-03T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      expect(result.sharpeRatio).toBeGreaterThan(0);
    });

    it('should return 0 Sharpe ratio when all returns are identical', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, profit_pct: 1.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, profit_pct: 1.0, win: 1, created_at: '2025-01-02T00:00:00Z' }),
        makeTrade({ id: 3, profit_pct: 1.0, win: 1, created_at: '2025-01-03T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      // stddev = 0, so Sharpe = 0
      expect(result.sharpeRatio).toBe(0);
    });

    // -- By-pair and by-regime breakdowns --

    it('should group trades by pair correctly', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, pair: 'BTC/USDT', profit_pct: 2.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, pair: 'ETH/USDT', profit_pct: -1.0, win: 0, created_at: '2025-01-02T00:00:00Z' }),
        makeTrade({ id: 3, pair: 'BTC/USDT', profit_pct: 1.0, win: 1, created_at: '2025-01-03T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      expect(result.tradesByPair.size).toBe(2);

      const btcStats = result.tradesByPair.get('BTC/USDT');
      expect(btcStats).toBeDefined();
      expect(btcStats!.wins).toBe(2);
      expect(btcStats!.losses).toBe(0);
      expect(btcStats!.profitPct).toBeCloseTo(3.0);

      const ethStats = result.tradesByPair.get('ETH/USDT');
      expect(ethStats).toBeDefined();
      expect(ethStats!.wins).toBe(0);
      expect(ethStats!.losses).toBe(1);
      expect(ethStats!.profitPct).toBeCloseTo(-1.0);
    });

    it('should group trades by regime and use "unknown" for null regime', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, regime: 'bull', profit_pct: 2.0, win: 1, created_at: '2025-01-01T00:00:00Z' }),
        makeTrade({ id: 2, regime: null, profit_pct: 1.0, win: 1, created_at: '2025-01-02T00:00:00Z' }),
        makeTrade({ id: 3, regime: 'bull', profit_pct: -0.5, win: 0, created_at: '2025-01-03T00:00:00Z' }),
      ]);

      const result = service.runBacktest();

      expect(result.tradesByRegime.size).toBe(2);

      const bullStats = result.tradesByRegime.get('bull');
      expect(bullStats).toBeDefined();
      expect(bullStats!.wins).toBe(1);
      expect(bullStats!.losses).toBe(1);
      expect(bullStats!.profitPct).toBeCloseTo(1.5);

      const unknownStats = result.tradesByRegime.get('unknown');
      expect(unknownStats).toBeDefined();
      expect(unknownStats!.wins).toBe(1);
      expect(unknownStats!.losses).toBe(0);
      expect(unknownStats!.profitPct).toBeCloseTo(1.0);
    });
  });

  // ---------------------------------------------------------------------------
  // compareSignals
  // ---------------------------------------------------------------------------
  describe('compareSignals', () => {
    it('should return insufficient data verdict when either signal has < 5 trades', () => {
      tradeRepo.getByFingerprint.mockImplementation((fp: string) => {
        if (fp === 'fp1') return [makeTrade(), makeTrade(), makeTrade()]; // 3 trades
        if (fp === 'fp2') return Array.from({ length: 6 }, (_, i) => makeTrade({ id: i }));
        return [];
      });

      const result = service.compareSignals('fp1', 'fp2');

      expect(result.verdict).toContain('insufficient data');
      expect(result.stats1.sampleSize).toBe(3);
      expect(result.stats2.sampleSize).toBe(6);
    });

    it('should return insufficient data when both signals have < 5 trades', () => {
      tradeRepo.getByFingerprint.mockReturnValue([makeTrade()]);

      const result = service.compareSignals('fp1', 'fp2');

      expect(result.verdict).toContain('insufficient data');
    });

    it('should declare a clear winner when one signal outperforms on win rate and avg profit', () => {
      // fp1: 5 wins, high profit
      const fp1Trades = Array.from({ length: 5 }, (_, i) =>
        makeTrade({ id: i, profit_pct: 3.0, win: 1 }),
      );
      // fp2: 3 wins, 2 losses, lower avg profit
      const fp2Trades = [
        makeTrade({ id: 10, profit_pct: 1.0, win: 1 }),
        makeTrade({ id: 11, profit_pct: 1.0, win: 1 }),
        makeTrade({ id: 12, profit_pct: 0.5, win: 1 }),
        makeTrade({ id: 13, profit_pct: -2.0, win: 0 }),
        makeTrade({ id: 14, profit_pct: -1.5, win: 0 }),
      ];

      tradeRepo.getByFingerprint.mockImplementation((fp: string) => {
        if (fp === 'fp1') return fp1Trades;
        if (fp === 'fp2') return fp2Trades;
        return [];
      });

      const result = service.compareSignals('fp1', 'fp2');

      expect(result.verdict).toContain('fp1');
      expect(result.verdict).toContain('outperforms');
      expect(result.stats1.winRate).toBe(1.0);
      expect(result.stats2.winRate).toBeCloseTo(0.6);
    });

    it('should declare fp2 the winner when it outperforms fp1', () => {
      // fp1: 3 wins, 2 losses
      const fp1Trades = [
        makeTrade({ id: 1, profit_pct: 1.0, win: 1 }),
        makeTrade({ id: 2, profit_pct: 0.5, win: 1 }),
        makeTrade({ id: 3, profit_pct: 0.3, win: 1 }),
        makeTrade({ id: 4, profit_pct: -2.0, win: 0 }),
        makeTrade({ id: 5, profit_pct: -1.5, win: 0 }),
      ];
      // fp2: 5 wins
      const fp2Trades = Array.from({ length: 5 }, (_, i) =>
        makeTrade({ id: i + 10, profit_pct: 2.0, win: 1 }),
      );

      tradeRepo.getByFingerprint.mockImplementation((fp: string) => {
        if (fp === 'fp1') return fp1Trades;
        if (fp === 'fp2') return fp2Trades;
        return [];
      });

      const result = service.compareSignals('fp1', 'fp2');

      expect(result.verdict).toContain('fp2');
      expect(result.verdict).toContain('outperforms');
    });

    it('should report similar performance when win rates are close', () => {
      // Both have same win rate and same avg profit
      const trades = Array.from({ length: 5 }, (_, i) =>
        makeTrade({ id: i, profit_pct: 1.0, win: 1 }),
      );

      tradeRepo.getByFingerprint.mockReturnValue(trades);

      const result = service.compareSignals('a|b|c|d', 'a|b|c|d');

      // Same win rate and same avg profit => 'signals perform similarly'
      expect(result.verdict).toContain('similarly');
    });

    it('should return similarity score between the two fingerprints', () => {
      const trades = Array.from({ length: 5 }, (_, i) =>
        makeTrade({ id: i, profit_pct: 1.0, win: 1 }),
      );
      tradeRepo.getByFingerprint.mockReturnValue(trades);

      // 'a|b|c|d' vs 'a|b|x|d' => 3/4 parts match = 0.75
      const result = service.compareSignals('a|b|c|d', 'a|b|x|d');

      expect(result.similarity).toBeCloseTo(0.75);
      expect(result.fingerprint1).toBe('a|b|c|d');
      expect(result.fingerprint2).toBe('a|b|x|d');
    });

    it('should note better avg profit with close win rates', () => {
      // fp1: win rate 0.8, higher avg profit
      const fp1Trades = [
        makeTrade({ id: 1, profit_pct: 5.0, win: 1 }),
        makeTrade({ id: 2, profit_pct: 4.0, win: 1 }),
        makeTrade({ id: 3, profit_pct: 3.0, win: 1 }),
        makeTrade({ id: 4, profit_pct: 2.0, win: 1 }),
        makeTrade({ id: 5, profit_pct: -1.0, win: 0 }),
      ];
      // fp2: win rate 0.8, lower avg profit
      const fp2Trades = [
        makeTrade({ id: 6, profit_pct: 1.0, win: 1 }),
        makeTrade({ id: 7, profit_pct: 1.0, win: 1 }),
        makeTrade({ id: 8, profit_pct: 1.0, win: 1 }),
        makeTrade({ id: 9, profit_pct: 0.5, win: 1 }),
        makeTrade({ id: 10, profit_pct: -0.5, win: 0 }),
      ];

      tradeRepo.getByFingerprint.mockImplementation((fp: string) => {
        if (fp === 'fp1') return fp1Trades;
        if (fp === 'fp2') return fp2Trades;
        return [];
      });

      const result = service.compareSignals('fp1', 'fp2');

      // Win rates are equal (both 0.8), so verdict is about avg profit
      expect(result.verdict).toContain('fp1');
      expect(result.verdict).toContain('better average profit');
    });
  });

  // ---------------------------------------------------------------------------
  // findBestSignals
  // ---------------------------------------------------------------------------
  describe('findBestSignals', () => {
    it('should return empty array when no trades exist', () => {
      tradeRepo.getAll.mockReturnValue([]);

      const result = service.findBestSignals();

      expect(result).toHaveLength(0);
    });

    it('should filter out fingerprints with fewer trades than minSampleSize', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, fingerprint: 'fp_a', profit_pct: 2.0, win: 1 }),
        makeTrade({ id: 2, fingerprint: 'fp_a', profit_pct: 1.0, win: 1 }),
        // fp_a has only 2 trades, below default minSampleSize of 5
      ]);

      const result = service.findBestSignals();

      expect(result).toHaveLength(0);
    });

    it('should include fingerprints meeting the minSampleSize', () => {
      const trades = Array.from({ length: 6 }, (_, i) =>
        makeTrade({ id: i, fingerprint: 'fp_good', profit_pct: 1.5, win: 1 }),
      );
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.findBestSignals({ minSampleSize: 5 });

      expect(result).toHaveLength(1);
      expect(result[0]!.fingerprint).toBe('fp_good');
      expect(result[0]!.wins).toBe(6);
      expect(result[0]!.losses).toBe(0);
      expect(result[0]!.winRate).toBe(1.0);
      expect(result[0]!.sampleSize).toBe(6);
    });

    it('should respect a custom lower minSampleSize', () => {
      tradeRepo.getAll.mockReturnValue([
        makeTrade({ id: 1, fingerprint: 'fp_small', profit_pct: 2.0, win: 1 }),
        makeTrade({ id: 2, fingerprint: 'fp_small', profit_pct: 1.0, win: 1 }),
      ]);

      const result = service.findBestSignals({ minSampleSize: 2 });

      expect(result).toHaveLength(1);
      expect(result[0]!.fingerprint).toBe('fp_small');
    });

    it('should limit results to topN', () => {
      const trades: TradeRecord[] = [];
      // Create 5 distinct fingerprints, each with 5 trades
      for (let fp = 0; fp < 5; fp++) {
        for (let i = 0; i < 5; i++) {
          trades.push(makeTrade({
            id: fp * 5 + i,
            fingerprint: `fp_${fp}`,
            profit_pct: (fp + 1) * 0.5,
            win: 1,
          }));
        }
      }
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.findBestSignals({ topN: 3, minSampleSize: 5 });

      expect(result).toHaveLength(3);
    });

    it('should sort by win rate descending, then by avg profit', () => {
      const trades: TradeRecord[] = [];
      // fp_high: 5/5 wins, avg profit 1.0
      for (let i = 0; i < 5; i++) {
        trades.push(makeTrade({ id: i, fingerprint: 'fp_high', profit_pct: 1.0, win: 1 }));
      }
      // fp_mid: 4/5 wins, avg profit 2.0
      for (let i = 0; i < 4; i++) {
        trades.push(makeTrade({ id: 10 + i, fingerprint: 'fp_mid', profit_pct: 3.0, win: 1 }));
      }
      trades.push(makeTrade({ id: 14, fingerprint: 'fp_mid', profit_pct: -1.0, win: 0 }));

      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.findBestSignals({ minSampleSize: 5 });

      expect(result).toHaveLength(2);
      expect(result[0]!.fingerprint).toBe('fp_high'); // higher win rate (1.0 vs 0.8)
      expect(result[1]!.fingerprint).toBe('fp_mid');
    });

    it('should break win-rate ties by avgProfitPct', () => {
      const trades: TradeRecord[] = [];
      // fp_a: 5/5 wins, avg profit 1.0
      for (let i = 0; i < 5; i++) {
        trades.push(makeTrade({ id: i, fingerprint: 'fp_a', profit_pct: 1.0, win: 1 }));
      }
      // fp_b: 5/5 wins, avg profit 3.0
      for (let i = 0; i < 5; i++) {
        trades.push(makeTrade({ id: 10 + i, fingerprint: 'fp_b', profit_pct: 3.0, win: 1 }));
      }

      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.findBestSignals({ minSampleSize: 5 });

      expect(result).toHaveLength(2);
      // Same win rate, but fp_b has higher avg profit
      expect(result[0]!.fingerprint).toBe('fp_b');
      expect(result[1]!.fingerprint).toBe('fp_a');
    });

    it('should filter by pair when specified', () => {
      const trades: TradeRecord[] = [];
      // fp_btc trades on BTC/USDT
      for (let i = 0; i < 5; i++) {
        trades.push(makeTrade({ id: i, fingerprint: 'fp_btc', pair: 'BTC/USDT', profit_pct: 2.0, win: 1 }));
      }
      // fp_eth trades on ETH/USDT
      for (let i = 0; i < 5; i++) {
        trades.push(makeTrade({ id: 10 + i, fingerprint: 'fp_eth', pair: 'ETH/USDT', profit_pct: 1.0, win: 1 }));
      }

      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.findBestSignals({ pair: 'BTC/USDT', minSampleSize: 5 });

      expect(result).toHaveLength(1);
      expect(result[0]!.fingerprint).toBe('fp_btc');
    });

    it('should filter by regime when specified', () => {
      const trades: TradeRecord[] = [];
      // fp_bull trades in bull regime
      for (let i = 0; i < 5; i++) {
        trades.push(makeTrade({ id: i, fingerprint: 'fp_bull', regime: 'bull', profit_pct: 2.0, win: 1 }));
      }
      // fp_bear trades in bear regime
      for (let i = 0; i < 5; i++) {
        trades.push(makeTrade({ id: 10 + i, fingerprint: 'fp_bear', regime: 'bear', profit_pct: 1.0, win: 1 }));
      }

      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.findBestSignals({ regime: 'bull', minSampleSize: 5 });

      expect(result).toHaveLength(1);
      expect(result[0]!.fingerprint).toBe('fp_bull');
    });

    it('should include synapseWeight from synapseManager when available', () => {
      const trades = Array.from({ length: 5 }, (_, i) =>
        makeTrade({ id: i, fingerprint: 'fp_syn', profit_pct: 1.0, win: 1 }),
      );
      tradeRepo.getAll.mockReturnValue(trades);
      synapseManager.getByFingerprint.mockReturnValue({ weight: 0.72, activations: 10 });

      const result = service.findBestSignals({ minSampleSize: 5 });

      expect(result).toHaveLength(1);
      expect(result[0]!.synapseWeight).toBe(0.72);
    });

    it('should set synapseWeight to null when synapse is not found', () => {
      const trades = Array.from({ length: 5 }, (_, i) =>
        makeTrade({ id: i, fingerprint: 'fp_nosyn', profit_pct: 1.0, win: 1 }),
      );
      tradeRepo.getAll.mockReturnValue(trades);
      synapseManager.getByFingerprint.mockReturnValue(undefined);

      const result = service.findBestSignals({ minSampleSize: 5 });

      expect(result).toHaveLength(1);
      expect(result[0]!.synapseWeight).toBeNull();
    });
  });
});
