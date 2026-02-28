import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SignalService } from '../../../src/services/signal.service.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { WeightedGraph, ActivatedNode } from '../../../src/graph/weighted-graph.js';
import type { CalibrationConfig } from '../../../src/types/config.types.js';
import { NODE_TYPES } from '../../../src/graph/weighted-graph.js';
import type { SignalInput } from '../../../src/signals/fingerprint.js';

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

describe('SignalService', () => {
  let service: SignalService;
  let synapseManager: Record<string, ReturnType<typeof vi.fn>>;
  let graph: Record<string, any>;
  let cal: CalibrationConfig;
  let tradeCountFn: ReturnType<typeof vi.fn>;

  const defaultSignals: SignalInput = {
    rsi14: 25,
    macd: 1,
    trendScore: 2,
    volatility: 20,
  };

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

    service = new SignalService(
      synapseManager as unknown as SynapseManager,
      graph as unknown as WeightedGraph,
      cal,
      tradeCountFn,
    );
  });

  describe('getSignalWeights', () => {
    it('should return default weights when trade count is below minimum', () => {
      tradeCountFn.mockReturnValue(5); // below minOutcomesForWeights (10)

      const weights = service.getSignalWeights(defaultSignals);

      expect(weights['rsi_oversold']).toBe(30);
      expect(weights['macd_bullish']).toBe(20);
      expect(weights['trend_up']).toBe(15);
      expect(weights['combo_bonus']).toBe(0);
    });

    it('should return default weights when no synapse match exists', () => {
      tradeCountFn.mockReturnValue(50);
      synapseManager.getByFingerprint.mockReturnValue(undefined);

      const weights = service.getSignalWeights(defaultSignals);

      expect(weights['rsi_oversold']).toBe(30);
      expect(weights['combo_bonus']).toBe(0);
    });

    it('should scale weights by synapse factor when synapse has enough activations', () => {
      tradeCountFn.mockReturnValue(50);
      synapseManager.getByFingerprint.mockReturnValue({
        weight: 0.75,
        activations: 10,
        wins: 8,
        losses: 2,
      });

      const weights = service.getSignalWeights(defaultSignals);

      // factor = 0.75 / 0.5 = 1.5
      expect(weights['rsi_oversold']).toBe(Math.round(30 * 1.5)); // 45
      expect(weights['macd_bullish']).toBe(Math.round(20 * 1.5)); // 30
      expect(weights['trend_up']).toBe(Math.round(15 * 1.5)); // 23 (22.5 rounds to 23)
    });

    it('should not scale combo_bonus by synapse factor', () => {
      tradeCountFn.mockReturnValue(50);
      synapseManager.getByFingerprint.mockReturnValue({
        weight: 0.75,
        activations: 10,
      });

      const weights = service.getSignalWeights(defaultSignals);

      // combo_bonus should not be scaled by the synapse factor
      // It stays at 0 unless graph spreading activation provides a value
      expect(weights['combo_bonus']).toBe(0);
    });

    it('should not scale weights when synapse has too few activations', () => {
      tradeCountFn.mockReturnValue(50);
      synapseManager.getByFingerprint.mockReturnValue({
        weight: 0.8,
        activations: 2, // below minActivationsForWeight (3)
      });

      const weights = service.getSignalWeights(defaultSignals);

      expect(weights['rsi_oversold']).toBe(30);
    });

    it('should compute positive combo_bonus from graph spreading activation (win energy)', () => {
      tradeCountFn.mockReturnValue(50);

      // Setup graph with a matching combo node
      const comboNodeId = expect.any(String);
      graph.nodes = { ['combo_oversold|bullish|up|low']: { id: 'combo_oversold|bullish|up|low' } };

      // Spreading activation returns win energy > loss energy
      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.8 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.2 },
      ]);

      const weights = service.getSignalWeights(defaultSignals);

      // netEnergy = 0.8 - 0.2 = 0.6
      // spreadBonus = round(0.6 * 30) = 18, clamped to [-20, 30] = 18
      expect(weights['combo_bonus']).toBe(18);
    });

    it('should compute negative combo_bonus when loss energy dominates', () => {
      tradeCountFn.mockReturnValue(50);

      graph.nodes = { ['combo_oversold|bullish|up|low']: { id: 'combo_oversold|bullish|up|low' } };

      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.1 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.7 },
      ]);

      const weights = service.getSignalWeights(defaultSignals);

      // netEnergy = 0.1 - 0.7 = -0.6
      // spreadBonus = round(-0.6 * 30) = -18, clamped to [-20, 30] = -18
      expect(weights['combo_bonus']).toBe(-18);
    });

    it('should clamp combo_bonus to maximum of 30', () => {
      tradeCountFn.mockReturnValue(50);

      graph.nodes = { ['combo_oversold|bullish|up|low']: { id: 'combo_oversold|bullish|up|low' } };

      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 1.0 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.0 },
      ]);

      const weights = service.getSignalWeights(defaultSignals);

      // netEnergy = 1.0, spreadBonus = 30, clamped to 30
      expect(weights['combo_bonus']).toBeLessThanOrEqual(30);
    });

    it('should clamp combo_bonus to minimum of -20', () => {
      tradeCountFn.mockReturnValue(50);

      graph.nodes = { ['combo_oversold|bullish|up|low']: { id: 'combo_oversold|bullish|up|low' } };

      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.0 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 1.0 },
      ]);

      const weights = service.getSignalWeights(defaultSignals);

      // netEnergy = -1.0, spreadBonus = -30, clamped to -20
      expect(weights['combo_bonus']).toBeGreaterThanOrEqual(-20);
    });

    it('should add similar combo boost from high-weight neighboring synapses', () => {
      tradeCountFn.mockReturnValue(50);

      graph.nodes = { ['combo_oversold|bullish|up|low']: { id: 'combo_oversold|bullish|up|low' } };

      // Spreading activation returns a similar combo node
      graph.spreadingActivation.mockReturnValue([
        { id: 'outcome_win', type: NODE_TYPES.OUTCOME, label: 'win', activation: 0.3 },
        { id: 'outcome_loss', type: NODE_TYPES.OUTCOME, label: 'loss', activation: 0.1 },
        { id: 'combo_similar', type: NODE_TYPES.COMBO, label: 'similar_fp', activation: 0.5 },
      ]);

      // The similar combo's synapse has high weight
      synapseManager.getByFingerprint.mockImplementation((fp: string) => {
        if (fp === 'similar_fp') {
          return { weight: 0.8, activations: 5, wins: 4, losses: 1 };
        }
        return undefined;
      });

      const weights = service.getSignalWeights(defaultSignals);

      // Base: netEnergy = 0.3 - 0.1 = 0.2, spreadBonus = round(0.2 * 30) = 6
      // Similar boost: (0.8 - 0.5) * 10 * 0.5 = 1.5, round = 2 (approximately)
      // Total combo_bonus = 6 + 2 = 8 (approximately)
      expect(weights['combo_bonus']).toBeGreaterThan(0);
    });

    it('should include regime in fingerprint when provided', () => {
      tradeCountFn.mockReturnValue(50);

      service.getSignalWeights(defaultSignals, 'bull');

      // getByFingerprint should be called with a fingerprint that includes the regime
      const calledFp = synapseManager.getByFingerprint.mock.calls[0]?.[0] as string;
      expect(calledFp).toContain('bull');
    });
  });

  describe('getConfidence', () => {
    it('should return 0.5 when trade count is below minimum', () => {
      tradeCountFn.mockReturnValue(5);

      const confidence = service.getConfidence(defaultSignals);

      expect(confidence).toBe(0.5);
    });

    it('should return 0.5 when no synapse exists for the fingerprint', () => {
      tradeCountFn.mockReturnValue(50);
      synapseManager.getByFingerprint.mockReturnValue(undefined);

      const confidence = service.getConfidence(defaultSignals);

      expect(confidence).toBe(0.5);
    });

    it('should return 0.5 when synapse has too few activations', () => {
      tradeCountFn.mockReturnValue(50);
      synapseManager.getByFingerprint.mockReturnValue({
        weight: 0.8,
        activations: 2, // below minActivationsForWeight (3)
        wins: 2,
        losses: 0,
      });

      const confidence = service.getConfidence(defaultSignals);

      expect(confidence).toBe(0.5);
    });

    it('should return Wilson Score for a synapse with enough data', () => {
      tradeCountFn.mockReturnValue(50);
      synapseManager.getByFingerprint.mockReturnValue({
        weight: 0.7,
        activations: 20,
        wins: 15,
        losses: 5,
      });

      const confidence = service.getConfidence(defaultSignals);

      // Wilson score for 15/20 with z=1.96 should be between 0 and 1
      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThan(1);
      // With 15/20 = 75% win rate and decent sample, lower bound should be > 0.5
      expect(confidence).toBeGreaterThan(0.5);
    });

    it('should return low confidence for a mostly-losing synapse', () => {
      tradeCountFn.mockReturnValue(50);
      synapseManager.getByFingerprint.mockReturnValue({
        weight: 0.3,
        activations: 20,
        wins: 3,
        losses: 17,
      });

      const confidence = service.getConfidence(defaultSignals);

      // 3/20 = 15% win rate, Wilson lower bound should be well below 0.5
      expect(confidence).toBeLessThan(0.5);
    });

    it('should include regime in fingerprint when provided', () => {
      tradeCountFn.mockReturnValue(50);

      service.getConfidence(defaultSignals, 'bear');

      const calledFp = synapseManager.getByFingerprint.mock.calls[0]?.[0] as string;
      expect(calledFp).toContain('bear');
    });
  });

  describe('updateCalibration', () => {
    it('should use the new calibration for subsequent calls', () => {
      const newCal = { ...cal, minOutcomesForWeights: 100 };
      service.updateCalibration(newCal);

      // With tradeCount at 50 (below the new 100 threshold), should return defaults
      tradeCountFn.mockReturnValue(50);
      const weights = service.getSignalWeights(defaultSignals);

      expect(weights['rsi_oversold']).toBe(30);
      expect(weights['combo_bonus']).toBe(0);
    });
  });
});
