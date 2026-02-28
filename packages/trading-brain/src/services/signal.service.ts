import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { WeightedGraph } from '../graph/weighted-graph.js';
import type { CalibrationConfig } from '../types/config.types.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { TradeRepository } from '../db/repositories/trade.repository.js';
import { fingerprint, fingerprintSimilarity, classifyVolatility, type SignalInput } from '../signals/fingerprint.js';
import { wilsonScore } from '@timmeck/brain-core';
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

export interface SignalExplanation {
  fingerprint: string;
  wilson: {
    successes: number;
    total: number;
    lowerBound: number;
    z: number;
  };
  sampleSize: number;
  accuracy: {
    wins: number;
    losses: number;
    winRate: number;
  };
  synapse: {
    weight: number;
    activations: number;
    totalProfit: number;
  } | null;
  similarSignals: Array<{
    fingerprint: string;
    similarity: number;
    weight: number;
    activations: number;
  }>;
  relatedPatterns: Array<{
    pattern: string;
    confidence: number;
    sampleCount: number;
    winRate: number;
    avgProfit: number;
  }>;
}

export class SignalService {
  constructor(
    private synapseManager: SynapseManager,
    private graph: WeightedGraph,
    private cal: CalibrationConfig,
    private tradeCount: () => number,
    private ruleRepo?: RuleRepository,
    private tradeRepo?: TradeRepository,
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

  /**
   * Explain the confidence assessment for a specific signal fingerprint.
   * Returns Wilson Score breakdown, sample size, historical accuracy,
   * synapse connections, and related learned patterns.
   */
  explainSignal(fp: string): SignalExplanation {
    const synapse = this.synapseManager.getByFingerprint(fp);

    // Wilson Score breakdown
    const successes = synapse?.wins ?? 0;
    const total = (synapse?.wins ?? 0) + (synapse?.losses ?? 0);
    const lowerBound = total > 0 ? wilsonScore(successes, total, this.cal.wilsonZ) : 0;

    // Similar signals via synapse manager
    const allSynapses = this.synapseManager.getAll();
    const similarSignals: SignalExplanation['similarSignals'] = [];
    for (const syn of allSynapses) {
      if (syn.fingerprint === fp) continue;
      const sim = fingerprintSimilarity(fp, syn.fingerprint);
      if (sim >= 0.5) {
        similarSignals.push({
          fingerprint: syn.fingerprint,
          similarity: sim,
          weight: syn.weight,
          activations: syn.activations,
        });
      }
    }
    similarSignals.sort((a, b) => b.similarity - a.similarity);

    // Related patterns from learned rules
    const relatedPatterns: SignalExplanation['relatedPatterns'] = [];
    if (this.ruleRepo) {
      const rules = this.ruleRepo.getAll();
      for (const rule of rules) {
        const sim = fingerprintSimilarity(fp, rule.pattern);
        if (sim >= 0.5) {
          relatedPatterns.push({
            pattern: rule.pattern,
            confidence: rule.confidence,
            sampleCount: rule.sample_count,
            winRate: rule.win_rate,
            avgProfit: rule.avg_profit,
          });
        }
      }
      relatedPatterns.sort((a, b) => b.confidence - a.confidence);
    }

    return {
      fingerprint: fp,
      wilson: {
        successes,
        total,
        lowerBound,
        z: this.cal.wilsonZ,
      },
      sampleSize: total,
      accuracy: {
        wins: synapse?.wins ?? 0,
        losses: synapse?.losses ?? 0,
        winRate: total > 0 ? successes / total : 0,
      },
      synapse: synapse ? {
        weight: synapse.weight,
        activations: synapse.activations,
        totalProfit: synapse.total_profit,
      } : null,
      similarSignals: similarSignals.slice(0, 10),
      relatedPatterns: relatedPatterns.slice(0, 10),
    };
  }
}
