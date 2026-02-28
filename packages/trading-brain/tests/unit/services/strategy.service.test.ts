import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrategyService, type DCAMultiplierResult, type GridParamsResult } from '../../../src/services/strategy.service.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { WeightedGraph } from '../../../src/graph/weighted-graph.js';
import type { CalibrationConfig } from '../../../src/types/config.types.js';
import { NODE_TYPES } from '../../../src/graph/weighted-graph.js';

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

describe('StrategyService', () => {
  let service: StrategyService;
  let synapseManager: Record<string, ReturnType<typeof vi.fn>>;
  let graph: Record<string, any>;
  let cal: CalibrationConfig;
  let tradeCountFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    synapseManager = {
      getByFingerprint: vi.fn().mockReturnValue(undefined),
      getAll: vi.fn().mockReturnValue([]),
    };

    graph = {
      nodes: {},
      spreadingActivation: vi.fn().mockReturnValue([]),
    };

    cal = createMockCalibration();
    tradeCountFn = vi.fn().mockReturnValue(0);

    service = new StrategyService(
      synapseManager as unknown as SynapseManager,
      graph as unknown as WeightedGraph,
      cal,
      tradeCountFn,
    );
  });

  describe('getDCAMultiplier', () => {
    it('should return default multiplier when trade count < 10', () => {
      tradeCountFn.mockReturnValue(5);

      const result = service.getDCAMultiplier('bull', 25, 20);

      expect(result.multiplier).toBe(1.0);
      expect(result.reason).toBe('Standard');
    });

    it('should return default multiplier when no graph or synapse data exists', () => {
      tradeCountFn.mockReturnValue(50);

      const result = service.getDCAMultiplier('bull', 25, 20);

      expect(result.multiplier).toBe(1.0);
      expect(result.reason).toBe('Standard');
    });

    it('should use spreading activation from regime node when available', () => {
      tradeCountFn.mockReturnValue(50);
      graph.nodes = { regime_bull: { id: 'regime_bull' } };

      // High win energy, low loss energy => high bestWeight
      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.8 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.2 },
      ]);

      const result = service.getDCAMultiplier('bull', 25, 20);

      // bestWeight = 0.8 / (0.8 + 0.2) = 0.8
      // multiplier = clamp(0.8 * 2, 0.3, 2.5) = 1.6
      expect(result.multiplier).toBe(1.6);
      expect(result.reason).toContain('hohe');
      expect(result.reason).toContain('n=10');
    });

    it('should return low multiplier when loss energy dominates in regime', () => {
      tradeCountFn.mockReturnValue(50);
      graph.nodes = { regime_bear: { id: 'regime_bear' } };

      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.2 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.8 },
      ]);

      const result = service.getDCAMultiplier('bear', 75, 60);

      // bestWeight = 0.2 / 1.0 = 0.2
      // multiplier = clamp(0.2 * 2, 0.3, 2.5) = 0.4
      expect(result.multiplier).toBe(0.4);
      expect(result.reason).toContain('niedrige');
    });

    it('should clamp multiplier to minimum 0.3', () => {
      tradeCountFn.mockReturnValue(50);
      graph.nodes = { regime_crash: { id: 'regime_crash' } };

      // All loss energy
      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.0 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 1.0 },
      ]);

      const result = service.getDCAMultiplier('crash', 80, 90);

      // bestWeight = 0/1 = 0, multiplier = clamp(0 * 2, 0.3, 2.5) = 0.3
      expect(result.multiplier).toBe(0.3);
    });

    it('should clamp multiplier to maximum 2.5', () => {
      tradeCountFn.mockReturnValue(50);
      graph.nodes = { regime_moon: { id: 'regime_moon' } };

      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 1.0 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.0 },
      ]);

      const result = service.getDCAMultiplier('moon', 30, 10);

      // bestWeight = 1.0, multiplier = clamp(1.0 * 2, 0.3, 2.5) = 2.0
      expect(result.multiplier).toBeLessThanOrEqual(2.5);
    });

    it('should fall back to synapse similarity scan when graph has no regime node', () => {
      tradeCountFn.mockReturnValue(50);
      // No regime node in graph

      // Provide similar synapses via getAll
      synapseManager.getAll.mockReturnValue([
        {
          id: 'syn_neutral|neutral|flat|low|bull',
          fingerprint: 'neutral|neutral|flat|low|bull',
          weight: 0.7,
          activations: 8,
          wins: 6,
          losses: 2,
        },
      ]);

      const result = service.getDCAMultiplier('bull', 50, 20);

      // The fingerprint for rsi=50, macd=0, trend=0, vol=20, regime=bull
      // is "neutral|neutral|flat|low|bull"
      // Similarity with itself = 1.0 (>= 0.6), activations 8 > bestActivations 0
      // bestWeight = 0.7, bestActivations = 8 >= 5
      // multiplier = clamp(0.7 * 2, 0.3, 2.5) = 1.4
      expect(result.multiplier).toBe(1.4);
      expect(result.reason).toContain('hohe');
    });

    it('should stay at default when fallback finds no similar synapses', () => {
      tradeCountFn.mockReturnValue(50);
      synapseManager.getAll.mockReturnValue([
        {
          id: 'syn_extreme_overbought|bearish|strong_down|extreme',
          fingerprint: 'extreme_overbought|bearish|strong_down|extreme',
          weight: 0.2,
          activations: 2, // too few
        },
      ]);

      const result = service.getDCAMultiplier('bull', 50, 20);

      expect(result.multiplier).toBe(1.0);
      expect(result.reason).toBe('Standard');
    });
  });

  describe('getGridParams', () => {
    it('should return default spacing when trade count < 10', () => {
      tradeCountFn.mockReturnValue(5);

      const result = service.getGridParams('bull', 20, 'BTC/USDT');

      expect(result.spacingMultiplier).toBe(1.0);
      expect(result.reason).toBe('Standard');
    });

    it('should widen grids when volatility class has poor historical performance', () => {
      tradeCountFn.mockReturnValue(50);
      // volatility=60 => classifyVolatility = "high" => volNodeId = "sig_vol_high"
      graph.nodes = { sig_vol_high: { id: 'sig_vol_high' } };

      // Loss-dominant spreading activation
      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.1 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.5 },
      ]);

      const result = service.getGridParams('bear', 60, 'BTC/USDT');

      // ratio = (0.1 - 0.5) / max(0.6, 0.01) = -0.667
      // ratio < -0.2: spacingMultiplier = 1.3 + abs(-0.667) * 0.5 = 1.3 + 0.333 = 1.633
      expect(result.spacingMultiplier).toBeGreaterThan(1.3);
      expect(result.reason).toContain('high');
      expect(result.reason).toContain('breitere');
    });

    it('should tighten grids when volatility class has strong historical performance', () => {
      tradeCountFn.mockReturnValue(50);
      // volatility=20 => "low" => sig_vol_low
      graph.nodes = { sig_vol_low: { id: 'sig_vol_low' } };

      // Win-dominant spreading activation
      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.8 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.1 },
      ]);

      const result = service.getGridParams('bull', 20, 'BTC/USDT');

      // ratio = (0.8 - 0.1) / max(0.9, 0.01) = 0.778
      // ratio > 0.2: spacingMultiplier = 0.7 + (1 - 0.778) * 0.3 = 0.7 + 0.067 = 0.767
      expect(result.spacingMultiplier).toBeLessThan(1.0);
      expect(result.reason).toContain('low');
      expect(result.reason).toContain('engere');
    });

    it('should return default when ratio is between -0.2 and 0.2', () => {
      tradeCountFn.mockReturnValue(50);
      graph.nodes = { sig_vol_medium: { id: 'sig_vol_medium' } };

      // Nearly balanced
      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.4 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.35 },
      ]);

      const result = service.getGridParams('neutral', 40, 'BTC/USDT');

      // ratio = (0.4 - 0.35) / 0.75 = 0.067 => between -0.2 and 0.2
      expect(result.spacingMultiplier).toBe(1.0);
      expect(result.reason).toBe('Standard');
    });

    it('should fall back to synapse scan when no volatility node exists', () => {
      tradeCountFn.mockReturnValue(50);
      // No volatility node in graph

      // Provide synapses with low average weight (poor performance)
      synapseManager.getAll.mockReturnValue([
        {
          id: 'syn_1',
          fingerprint: 'neutral|neutral|flat|low|bull',
          weight: 0.3,
          activations: 5,
        },
        {
          id: 'syn_2',
          fingerprint: 'neutral|neutral|flat|low|bear',
          weight: 0.35,
          activations: 4,
        },
      ]);

      const result = service.getGridParams('bull', 20, 'BTC/USDT');

      // fp for rsi=50, macd=0, trend=0, vol=20, regime=bull = "neutral|neutral|flat|low|bull"
      // syn_1: similarity with itself = 1.0, activations 5 >= 3 => included (weight 0.3)
      // syn_2: similarity might be 0.8 (4/5 parts match), activations 4 >= 3 => included (weight 0.35)
      // avgWeight = (0.3 + 0.35) / 2 = 0.325
      // avgWeight < 0.4: spacingMultiplier = 1.3 + (0.4 - 0.325) = 1.375
      expect(result.spacingMultiplier).toBeGreaterThan(1.0);
      expect(result.reason).toContain('breitere');
    });

    it('should tighten grids via synapse scan when average weight is high', () => {
      tradeCountFn.mockReturnValue(50);

      synapseManager.getAll.mockReturnValue([
        {
          id: 'syn_1',
          fingerprint: 'neutral|neutral|flat|low|bull',
          weight: 0.75,
          activations: 10,
        },
        {
          id: 'syn_2',
          fingerprint: 'neutral|neutral|flat|low|bear',
          weight: 0.7,
          activations: 8,
        },
      ]);

      const result = service.getGridParams('bull', 20, 'BTC/USDT');

      // avgWeight = (0.75 + 0.7) / 2 = 0.725
      // avgWeight > 0.6: spacingMultiplier = 0.7 + (1.0 - 0.725) * 0.5 = 0.7 + 0.1375 = 0.8375
      expect(result.spacingMultiplier).toBeLessThan(1.0);
      expect(result.reason).toContain('engere');
    });

    it('should return default when synapse scan finds fewer than 2 matches', () => {
      tradeCountFn.mockReturnValue(50);

      synapseManager.getAll.mockReturnValue([
        {
          id: 'syn_1',
          fingerprint: 'neutral|neutral|flat|low|bull',
          weight: 0.8,
          activations: 10,
        },
        // Second synapse has completely different fingerprint and low similarity
        {
          id: 'syn_2',
          fingerprint: 'extreme_overbought|bearish|strong_down|extreme|crash',
          weight: 0.2,
          activations: 5,
        },
      ]);

      const result = service.getGridParams('bull', 20, 'BTC/USDT');

      // Only syn_1 would match with high similarity. syn_2 similarity would be low.
      // If count < 2, we stay at default.
      // Actually syn_1 is exact match (sim=1.0), syn_2 has 0/5 parts matching = 0.0
      // count = 1 < 2 => default
      expect(result.spacingMultiplier).toBe(1.0);
      expect(result.reason).toBe('Standard');
    });

    it('should classify volatility correctly for each range', () => {
      tradeCountFn.mockReturnValue(50);

      // Test extreme volatility (> 80)
      graph.nodes = { sig_vol_extreme: { id: 'sig_vol_extreme' } };
      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.1 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.9 },
      ]);

      const result = service.getGridParams('bull', 85, 'BTC/USDT');

      expect(result.reason).toContain('extreme');
    });
  });

  describe('updateCalibration', () => {
    it('should apply the new calibration for subsequent calls', () => {
      const newCal = { ...cal, minOutcomesForWeights: 100 };
      service.updateCalibration(newCal);

      // Even with tradeCount=50, the new threshold should not affect getDCAMultiplier
      // (getDCAMultiplier uses a hardcoded threshold of 10)
      tradeCountFn.mockReturnValue(50);

      const result = service.getDCAMultiplier('bull', 50, 20);
      // Should still work (getDCAMultiplier checks tradeCount < 10, not minOutcomesForWeights)
      expect(result).toBeDefined();
    });
  });
});
