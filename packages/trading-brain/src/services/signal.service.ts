import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { WeightedGraph } from '../graph/weighted-graph.js';
import type { CalibrationConfig } from '../types/config.types.js';
import { fingerprint, classifyVolatility, type SignalInput } from '../signals/fingerprint.js';
import { wilsonScore } from '../signals/wilson-score.js';
import { NODE_TYPES } from '../graph/weighted-graph.js';

const DEFAULT_WEIGHTS: Record<string, number> = {
  rsi_oversold: 30,
  rsi_overbought: 30,
  rsi7_oversold: 15,
  rsi7_overbought: 15,
  macd_bullish: 20,
  macd_bearish: 20,
  trend_up: 15,
  trend_down: 15,
  mean_reversion_buy: 10,
  mean_reversion_sell: 10,
  combo_bonus: 0,
};

export class SignalService {
  constructor(
    private synapseManager: SynapseManager,
    private graph: WeightedGraph,
    private cal: CalibrationConfig,
    private tradeCount: () => number,
  ) {}

  updateCalibration(cal: CalibrationConfig): void {
    this.cal = cal;
  }

  /**
   * Get brain-weighted signal strengths based on learned experience.
   * Ported from tradingBrain.js getSignalWeights().
   */
  getSignalWeights(signals: SignalInput, regime?: string): Record<string, number> {
    const weights = { ...DEFAULT_WEIGHTS };
    if (this.tradeCount() < this.cal.minOutcomesForWeights) return weights;

    const fp = fingerprint({ ...signals, regime });
    const synapse = this.synapseManager.getByFingerprint(fp);

    // Direct synapse match (fast path)
    if (synapse && synapse.activations >= this.cal.minActivationsForWeight) {
      const factor = synapse.weight / 0.5;
      for (const key of Object.keys(DEFAULT_WEIGHTS)) {
        if (key !== 'combo_bonus') {
          weights[key] = Math.round(DEFAULT_WEIGHTS[key]! * factor);
        }
      }
    }

    // Spreading activation for combo bonus
    const comboNodeId = `combo_${fp}`;
    if (this.graph.nodes[comboNodeId]) {
      const activated = this.graph.spreadingActivation(
        comboNodeId, 1.0,
        this.cal.spreadingActivationDecay,
        this.cal.spreadingActivationThreshold,
        3,
      );

      let winEnergy = 0;
      let lossEnergy = 0;
      for (const node of activated) {
        if (node.id === 'outcome_win') winEnergy = node.activation;
        if (node.id === 'outcome_loss') lossEnergy = node.activation;
      }

      const netEnergy = winEnergy - lossEnergy;
      if (Math.abs(netEnergy) > 0.05) {
        const spreadBonus = Math.round(netEnergy * 30);
        weights['combo_bonus'] = Math.max(-20, Math.min(30, spreadBonus));
      }

      // Similar combo nodes boost
      let similarBoost = 0;
      for (const node of activated) {
        if (node.type === NODE_TYPES.COMBO && node.id !== comboNodeId && node.activation > 0.1) {
          const simSyn = this.synapseManager.getByFingerprint(node.label);
          if (simSyn && simSyn.weight > 0.6 && simSyn.activations >= 3) {
            similarBoost += Math.round((simSyn.weight - 0.5) * 10 * node.activation);
          }
        }
      }
      weights['combo_bonus'] = Math.max(-20, Math.min(30, (weights['combo_bonus'] ?? 0) + similarBoost));
    }

    return weights;
  }

  /**
   * Get Wilson Score confidence for signal pattern.
   * Ported from tradingBrain.js getConfidence().
   */
  getConfidence(signals: SignalInput, regime?: string): number {
    if (this.tradeCount() < this.cal.minOutcomesForWeights) return 0.5;

    const fp = fingerprint({ ...signals, regime });
    const synapse = this.synapseManager.getByFingerprint(fp);

    if (!synapse || synapse.activations < this.cal.minActivationsForWeight) return 0.5;

    const total = synapse.wins + synapse.losses;
    return wilsonScore(synapse.wins, total, this.cal.wilsonZ);
  }
}
