/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiskService } from '../../../src/services/risk.service.js';
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

/**
 * Generate a list of trades with a specific win rate and profit profile.
 * Wins get +avgWinPct, losses get -avgLossPct.
 */
function generateTrades(
  count: number,
  winRate: number,
  avgWinPct: number,
  avgLossPct: number,
  overrides: Partial<TradeRecord> = {},
): TradeRecord[] {
  const winCount = Math.round(count * winRate);
  const trades: TradeRecord[] = [];

  for (let i = 0; i < count; i++) {
    const isWin = i < winCount;
    trades.push(
      makeTrade({
        id: i + 1,
        win: isWin ? 1 : 0,
        profit_pct: isWin ? avgWinPct : -avgLossPct,
        created_at: new Date(Date.now() - (count - i) * 60000).toISOString(),
        ...overrides,
      }),
    );
  }

  return trades;
}

describe('RiskService', () => {
  let service: RiskService;
  let tradeRepo: Record<string, ReturnType<typeof vi.fn>>;
  let signalService: Record<string, ReturnType<typeof vi.fn>>;
  let synapseManager: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    tradeRepo = {
      getAll: vi.fn().mockReturnValue([]),
      getByPair: vi.fn().mockReturnValue([]),
    };

    signalService = {};

    synapseManager = {
      getByFingerprint: vi.fn().mockReturnValue(undefined),
    };

    service = new RiskService(
      tradeRepo as unknown as TradeRepository,
      signalService as unknown as SignalService,
      synapseManager as unknown as SynapseManager,
    );
  });

  // ---------------------------------------------------------------------------
  // getKellyFraction
  // ---------------------------------------------------------------------------
  describe('getKellyFraction', () => {
    it('should return avoid recommendation with zeroed fields when no trades exist', () => {
      tradeRepo.getAll.mockReturnValue([]);

      const result = service.getKellyFraction();

      expect(result).toEqual({
        kellyFraction: 0,
        halfKelly: 0,
        brainAdjusted: 0,
        sampleSize: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        recommendation: 'avoid',
      });
    });

    it('should compute a positive Kelly fraction for 60% WR and 2:1 R/R', () => {
      // 60% win rate, avg win = 2%, avg loss = 1%  =>  R = 2
      // K = 0.6 - (1-0.6)/2 = 0.6 - 0.2 = 0.4
      const trades = generateTrades(20, 0.6, 2, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getKellyFraction();

      expect(result.kellyFraction).toBeCloseTo(0.4, 5);
      expect(result.winRate).toBeCloseTo(0.6, 5);
      expect(result.avgWin).toBeCloseTo(2, 5);
      expect(result.avgLoss).toBeCloseTo(1, 5);
      expect(result.sampleSize).toBe(20);
    });

    it('should return a negative Kelly fraction for 30% WR and 1:1 R/R', () => {
      // 30% win rate, avg win = 1%, avg loss = 1%  =>  R = 1
      // K = 0.3 - (1-0.3)/1 = 0.3 - 0.7 = -0.4
      const trades = generateTrades(20, 0.3, 1, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getKellyFraction();

      expect(result.kellyFraction).toBeCloseTo(-0.4, 5);
      expect(result.recommendation).toBe('avoid');
    });

    it('should recommend avoid when kellyFraction is zero', () => {
      // 50% win rate, 1:1 R/R => K = 0.5 - 0.5/1 = 0
      const trades = generateTrades(20, 0.5, 1, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getKellyFraction();

      expect(result.kellyFraction).toBeCloseTo(0, 5);
      expect(result.recommendation).toBe('avoid');
    });

    it('should compute halfKelly as kellyFraction / 2', () => {
      const trades = generateTrades(20, 0.6, 2, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getKellyFraction();

      expect(result.halfKelly).toBeCloseTo(result.kellyFraction / 2, 5);
    });

    it('should compute brainAdjusted using synapse weight for the most frequent fingerprint', () => {
      const fp = 'bullish|strong|up|low';
      const trades = generateTrades(20, 0.6, 2, 1, { fingerprint: fp });
      tradeRepo.getAll.mockReturnValue(trades);
      synapseManager.getByFingerprint.mockReturnValue({ weight: 0.8, activations: 5 });

      const result = service.getKellyFraction();

      // brainAdjusted = halfKelly * brainConfidence
      expect(result.brainAdjusted).toBeCloseTo(result.halfKelly * 0.8, 5);
    });

    it('should use default brainConfidence of 0.5 when synapse has fewer than 3 activations', () => {
      const fp = 'bullish|strong|up|low';
      const trades = generateTrades(20, 0.6, 2, 1, { fingerprint: fp });
      tradeRepo.getAll.mockReturnValue(trades);
      synapseManager.getByFingerprint.mockReturnValue({ weight: 0.9, activations: 2 });

      const result = service.getKellyFraction();

      // Falls back to default 0.5 since activations < 3
      expect(result.brainAdjusted).toBeCloseTo(result.halfKelly * 0.5, 5);
    });

    it('should use default brainConfidence of 0.5 when synapse is undefined', () => {
      const trades = generateTrades(20, 0.6, 2, 1);
      tradeRepo.getAll.mockReturnValue(trades);
      synapseManager.getByFingerprint.mockReturnValue(undefined);

      const result = service.getKellyFraction();

      expect(result.brainAdjusted).toBeCloseTo(result.halfKelly * 0.5, 5);
    });

    it('should recommend avoid when fewer than 10 trades even if Kelly is positive', () => {
      const trades = generateTrades(5, 0.8, 3, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getKellyFraction();

      expect(result.kellyFraction).toBeGreaterThan(0);
      expect(result.recommendation).toBe('avoid');
    });

    it('should recommend aggressive when kellyFraction > 0.25 and sample >= 10', () => {
      // 70% WR, 2:1 R/R => K = 0.7 - 0.3/2 = 0.55
      const trades = generateTrades(20, 0.7, 2, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getKellyFraction();

      expect(result.kellyFraction).toBeGreaterThan(0.25);
      expect(result.recommendation).toBe('aggressive');
    });

    it('should recommend normal when 0.1 < kellyFraction <= 0.25 and sample >= 10', () => {
      // 55% WR, 1.5:1 R/R => K = 0.55 - 0.45/1.5 = 0.55 - 0.3 = 0.25
      // Need something between 0.1 and 0.25 exclusively
      // 55% WR, 1.2:1 R/R => K = 0.55 - 0.45/1.2 = 0.55 - 0.375 = 0.175
      const trades = generateTrades(20, 0.55, 1.2, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getKellyFraction();

      expect(result.kellyFraction).toBeGreaterThan(0.1);
      expect(result.kellyFraction).toBeLessThanOrEqual(0.25);
      expect(result.recommendation).toBe('normal');
    });

    it('should recommend conservative when 0 < kellyFraction <= 0.1 and sample >= 10', () => {
      // 52% WR, 1.1:1 R/R => K = 0.52 - 0.48/1.1 = 0.52 - 0.4363... ≈ 0.0836
      const trades = generateTrades(25, 0.52, 1.1, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getKellyFraction();

      expect(result.kellyFraction).toBeGreaterThan(0);
      expect(result.kellyFraction).toBeLessThanOrEqual(0.1);
      expect(result.recommendation).toBe('conservative');
    });

    it('should filter trades by pair when provided', () => {
      const trades = generateTrades(20, 0.6, 2, 1, { pair: 'ETH/USDT' });
      tradeRepo.getByPair.mockReturnValue(trades);

      const result = service.getKellyFraction('ETH/USDT');

      expect(tradeRepo.getByPair).toHaveBeenCalledWith('ETH/USDT');
      expect(tradeRepo.getAll).not.toHaveBeenCalled();
      expect(result.sampleSize).toBe(20);
    });

    it('should filter trades by regime when provided', () => {
      const bullTrades = generateTrades(10, 0.7, 2, 1, { regime: 'bull' });
      const bearTrades = generateTrades(5, 0.4, 1, 1, { regime: 'bear' });
      tradeRepo.getAll.mockReturnValue([...bullTrades, ...bearTrades]);

      const result = service.getKellyFraction(undefined, 'bull');

      expect(result.sampleSize).toBe(10);
      expect(result.winRate).toBeCloseTo(0.7, 5);
    });

    it('should handle all-winning trades with no losses (avgLoss = 0)', () => {
      const trades = generateTrades(15, 1.0, 2, 0);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getKellyFraction();

      // When avgLoss = 0, kellyFraction falls back to winRate (1.0)
      expect(result.kellyFraction).toBeCloseTo(1.0, 5);
      expect(result.avgLoss).toBe(0);
      expect(result.recommendation).toBe('aggressive');
    });
  });

  // ---------------------------------------------------------------------------
  // getPositionSize
  // ---------------------------------------------------------------------------
  describe('getPositionSize', () => {
    it('should return minimum 1% when Kelly recommends avoid', () => {
      tradeRepo.getAll.mockReturnValue([]);

      const result = service.getPositionSize(0.5, { fingerprint: 'test|fp' });

      expect(result.sizePct).toBe(1);
      expect(result.reason).toContain('minimum size');
    });

    it('should cap position size at 25%', () => {
      // Very favorable Kelly => large raw size, but must be capped
      const trades = generateTrades(20, 0.7, 3, 1);
      tradeRepo.getAll.mockReturnValue(trades);
      // High synapse confidence to push size up
      synapseManager.getByFingerprint.mockReturnValue({ weight: 0.95, activations: 10 });

      const result = service.getPositionSize(1.0, { fingerprint: 'strong|fp' });

      expect(result.sizePct).toBeLessThanOrEqual(25);
    });

    it('should cap conservative position at 5%', () => {
      // Conservative Kelly: ~0.08
      const trades = generateTrades(25, 0.52, 1.1, 1);
      tradeRepo.getAll.mockReturnValue(trades);
      synapseManager.getByFingerprint.mockReturnValue({ weight: 0.9, activations: 5 });

      const result = service.getPositionSize(1.0, { fingerprint: 'test|fp' });

      expect(result.sizePct).toBeLessThanOrEqual(5);
      expect(result.reason).toContain('conservative');
    });

    it('should use synapse weight as confidence when activations >= 3', () => {
      const trades = generateTrades(20, 0.6, 2, 1);
      tradeRepo.getAll.mockReturnValue(trades);
      synapseManager.getByFingerprint.mockReturnValue({ weight: 0.7, activations: 5 });

      const result = service.getPositionSize(0.5, { fingerprint: 'test|fp' });

      expect(result.confidence).toBeCloseTo(0.7, 5);
    });

    it('should use provided signal confidence when synapse is unavailable', () => {
      const trades = generateTrades(20, 0.6, 2, 1);
      tradeRepo.getAll.mockReturnValue(trades);
      synapseManager.getByFingerprint.mockReturnValue(undefined);

      const result = service.getPositionSize(0.5, { fingerprint: 'test|fp', confidence: 0.65 });

      expect(result.confidence).toBeCloseTo(0.65, 5);
    });

    it('should default signal confidence to 0.5 when not provided and no synapse', () => {
      const trades = generateTrades(20, 0.6, 2, 1);
      tradeRepo.getAll.mockReturnValue(trades);
      synapseManager.getByFingerprint.mockReturnValue(undefined);

      const result = service.getPositionSize(0.5, { fingerprint: 'test|fp' });

      expect(result.confidence).toBeCloseTo(0.5, 5);
    });

    it('should return kellyRaw matching the underlying Kelly fraction', () => {
      const trades = generateTrades(20, 0.6, 2, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getPositionSize(0.5, { fingerprint: 'test|fp' });

      expect(result.kellyRaw).toBeCloseTo(0.4, 5);
    });

    it('should include "aggressive" in reason for strong edges', () => {
      const trades = generateTrades(20, 0.7, 3, 1);
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getPositionSize(0.5, { fingerprint: 'test|fp' });

      expect(result.reason).toContain('aggressive');
    });
  });

  // ---------------------------------------------------------------------------
  // getRiskMetrics
  // ---------------------------------------------------------------------------
  describe('getRiskMetrics', () => {
    it('should return zeroed metrics when no trades exist', () => {
      tradeRepo.getAll.mockReturnValue([]);

      const result = service.getRiskMetrics();

      expect(result).toEqual({
        maxDrawdownPct: 0,
        currentDrawdownPct: 0,
        consecutiveLosses: 0,
        maxConsecutiveLosses: 0,
        riskRewardRatio: 0,
        expectancy: 0,
      });
    });

    it('should calculate max drawdown from peak-to-trough on equity curve', () => {
      // Equity curve: +2, +2, -3, -3, +1 => cumulative: 2, 4, 1, -2, -1
      // Peak = 4, trough after peak = -2, drawdown = 6
      const trades = [
        makeTrade({ id: 1, profit_pct: 2, win: 1, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, profit_pct: 2, win: 1, created_at: '2024-01-01T00:02:00Z' }),
        makeTrade({ id: 3, profit_pct: -3, win: 0, created_at: '2024-01-01T00:03:00Z' }),
        makeTrade({ id: 4, profit_pct: -3, win: 0, created_at: '2024-01-01T00:04:00Z' }),
        makeTrade({ id: 5, profit_pct: 1, win: 1, created_at: '2024-01-01T00:05:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      expect(result.maxDrawdownPct).toBeCloseTo(6, 5);
    });

    it('should calculate current drawdown from peak to current equity', () => {
      // Equity curve: +5, -2, -1 => cumulative: 5, 3, 2
      // Peak = 5, current = 2, current drawdown = 3
      const trades = [
        makeTrade({ id: 1, profit_pct: 5, win: 1, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, profit_pct: -2, win: 0, created_at: '2024-01-01T00:02:00Z' }),
        makeTrade({ id: 3, profit_pct: -1, win: 0, created_at: '2024-01-01T00:03:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      expect(result.currentDrawdownPct).toBeCloseTo(3, 5);
    });

    it('should return zero current drawdown when equity is at peak', () => {
      const trades = [
        makeTrade({ id: 1, profit_pct: 2, win: 1, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, profit_pct: 3, win: 1, created_at: '2024-01-01T00:02:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      expect(result.currentDrawdownPct).toBe(0);
    });

    it('should count current consecutive losses from the end', () => {
      const trades = [
        makeTrade({ id: 1, win: 1, profit_pct: 1, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, win: 0, profit_pct: -1, created_at: '2024-01-01T00:02:00Z' }),
        makeTrade({ id: 3, win: 0, profit_pct: -1, created_at: '2024-01-01T00:03:00Z' }),
        makeTrade({ id: 4, win: 0, profit_pct: -1, created_at: '2024-01-01T00:04:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      expect(result.consecutiveLosses).toBe(3);
    });

    it('should return zero consecutive losses when the last trade is a win', () => {
      const trades = [
        makeTrade({ id: 1, win: 0, profit_pct: -1, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, win: 0, profit_pct: -1, created_at: '2024-01-01T00:02:00Z' }),
        makeTrade({ id: 3, win: 1, profit_pct: 2, created_at: '2024-01-01T00:03:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      expect(result.consecutiveLosses).toBe(0);
    });

    it('should track the max consecutive losses ever', () => {
      const trades = [
        makeTrade({ id: 1, win: 0, profit_pct: -1, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, win: 0, profit_pct: -1, created_at: '2024-01-01T00:02:00Z' }),
        makeTrade({ id: 3, win: 0, profit_pct: -1, created_at: '2024-01-01T00:03:00Z' }),
        makeTrade({ id: 4, win: 0, profit_pct: -1, created_at: '2024-01-01T00:04:00Z' }),
        makeTrade({ id: 5, win: 1, profit_pct: 5, created_at: '2024-01-01T00:05:00Z' }),
        makeTrade({ id: 6, win: 0, profit_pct: -1, created_at: '2024-01-01T00:06:00Z' }),
        makeTrade({ id: 7, win: 0, profit_pct: -1, created_at: '2024-01-01T00:07:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      expect(result.maxConsecutiveLosses).toBe(4);
      expect(result.consecutiveLosses).toBe(2);
    });

    it('should calculate risk-reward ratio as avgWin / avgLoss', () => {
      const trades = [
        makeTrade({ id: 1, win: 1, profit_pct: 3, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, win: 1, profit_pct: 5, created_at: '2024-01-01T00:02:00Z' }),
        makeTrade({ id: 3, win: 0, profit_pct: -2, created_at: '2024-01-01T00:03:00Z' }),
        makeTrade({ id: 4, win: 0, profit_pct: -2, created_at: '2024-01-01T00:04:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      // avgWin = (3+5)/2 = 4, avgLoss = (2+2)/2 = 2, ratio = 2
      expect(result.riskRewardRatio).toBeCloseTo(2, 5);
    });

    it('should return Infinity risk-reward when there are no losses', () => {
      const trades = [
        makeTrade({ id: 1, win: 1, profit_pct: 2, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, win: 1, profit_pct: 3, created_at: '2024-01-01T00:02:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      expect(result.riskRewardRatio).toBe(Infinity);
    });

    it('should calculate expectancy as W*avgWin - (1-W)*avgLoss', () => {
      // 2 wins at +3%, 2 losses at -2%
      // WR = 0.5, avgWin = 3, avgLoss = 2
      // E = 0.5*3 - 0.5*2 = 1.5 - 1.0 = 0.5
      const trades = [
        makeTrade({ id: 1, win: 1, profit_pct: 3, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, win: 1, profit_pct: 3, created_at: '2024-01-01T00:02:00Z' }),
        makeTrade({ id: 3, win: 0, profit_pct: -2, created_at: '2024-01-01T00:03:00Z' }),
        makeTrade({ id: 4, win: 0, profit_pct: -2, created_at: '2024-01-01T00:04:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      expect(result.expectancy).toBeCloseTo(0.5, 5);
    });

    it('should return negative expectancy for a losing strategy', () => {
      // 1 win at +1%, 3 losses at -2%
      // WR = 0.25, avgWin = 1, avgLoss = 2
      // E = 0.25*1 - 0.75*2 = 0.25 - 1.5 = -1.25
      const trades = [
        makeTrade({ id: 1, win: 1, profit_pct: 1, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, win: 0, profit_pct: -2, created_at: '2024-01-01T00:02:00Z' }),
        makeTrade({ id: 3, win: 0, profit_pct: -2, created_at: '2024-01-01T00:03:00Z' }),
        makeTrade({ id: 4, win: 0, profit_pct: -2, created_at: '2024-01-01T00:04:00Z' }),
      ];
      tradeRepo.getAll.mockReturnValue(trades);

      const result = service.getRiskMetrics();

      expect(result.expectancy).toBeCloseTo(-1.25, 5);
    });

    it('should filter by pair when provided', () => {
      const ethTrades = [
        makeTrade({ id: 1, pair: 'ETH/USDT', win: 1, profit_pct: 2, created_at: '2024-01-01T00:01:00Z' }),
        makeTrade({ id: 2, pair: 'ETH/USDT', win: 0, profit_pct: -1, created_at: '2024-01-01T00:02:00Z' }),
      ];
      tradeRepo.getByPair.mockReturnValue(ethTrades);

      const result = service.getRiskMetrics('ETH/USDT');

      expect(tradeRepo.getByPair).toHaveBeenCalledWith('ETH/USDT');
      expect(tradeRepo.getAll).not.toHaveBeenCalled();
      expect(result.riskRewardRatio).toBeCloseTo(2, 5);
    });

    it('should use getAll when no pair is specified', () => {
      const trades = [makeTrade({ id: 1, win: 1, profit_pct: 1, created_at: '2024-01-01T00:01:00Z' })];
      tradeRepo.getAll.mockReturnValue(trades);

      service.getRiskMetrics();

      expect(tradeRepo.getAll).toHaveBeenCalled();
      expect(tradeRepo.getByPair).not.toHaveBeenCalled();
    });
  });
});
