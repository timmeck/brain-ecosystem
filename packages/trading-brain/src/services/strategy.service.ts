import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { WeightedGraph } from '../graph/weighted-graph.js';
import type { CalibrationConfig } from '../types/config.types.js';
import { fingerprint, fingerprintSimilarity, classifyVolatility, type SignalInput } from '../signals/fingerprint.js';

export interface DCAMultiplierResult {
  multiplier: number;
  reason: string;
}

export interface GridParamsResult {
  spacingMultiplier: number;
  reason: string;
}

export class StrategyService {
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
   * Brain-recommended DCA multiplier based on regime success.
   * Ported from tradingBrain.js getDCAMultiplier().
   */
  getDCAMultiplier(regime: string, rsi: number, volatility: number): DCAMultiplierResult {
    const result: DCAMultiplierResult = { multiplier: 1.0, reason: 'Standard' };
    if (this.tradeCount() < 10) return result;

    const signals: SignalInput = { rsi14: rsi, macd: 0, trendScore: 0, volatility };
    const fp = fingerprint({ ...signals, regime });

    // Try spreading activation from regime node
    const regimeNodeId = `regime_${regime}`;
    let bestWeight = 0.5;
    let bestActivations = 0;

    if (this.graph.nodes[regimeNodeId]) {
      const activated = this.graph.spreadingActivation(regimeNodeId, 1.0, 0.5, 0.05, 3);
      const winNode = activated.find(n => n.id === 'outcome_win');
      const lossNode = activated.find(n => n.id === 'outcome_loss');
      if (winNode || lossNode) {
        const winE = winNode?.activation || 0;
        const lossE = lossNode?.activation || 0;
        const total = winE + lossE;
        if (total > 0) {
          bestWeight = winE / total;
          bestActivations = 10;
        }
      }
    }

    // Fallback: fingerprint similarity scan
    if (bestActivations < 5) {
      for (const syn of this.synapseManager.getAll()) {
        const sim = fingerprintSimilarity(fp, syn.fingerprint);
        if (sim >= 0.6 && syn.activations > bestActivations) {
          bestWeight = syn.weight;
          bestActivations = syn.activations;
        }
      }
    }

    if (bestActivations >= 5) {
      result.multiplier = Math.max(0.3, Math.min(2.5, bestWeight * 2));
      const winRate = bestWeight > 0.5 ? 'hohe' : 'niedrige';
      result.reason = `Brain: ${winRate} Recovery-Rate (n=${bestActivations})`;
    }

    return result;
  }

  /**
   * Brain-recommended grid spacing based on volatility history.
   * Ported from tradingBrain.js getGridParams().
   */
  getGridParams(regime: string, volatility: number, _pair: string): GridParamsResult {
    const result: GridParamsResult = { spacingMultiplier: 1.0, reason: 'Standard' };
    if (this.tradeCount() < 10) return result;

    const volClass = classifyVolatility(volatility);
    const volNodeId = `sig_vol_${volClass}`;

    if (this.graph.nodes[volNodeId]) {
      const activated = this.graph.spreadingActivation(volNodeId, 1.0, 0.5, 0.05, 3);
      const winNode = activated.find(n => n.id === 'outcome_win');
      const lossNode = activated.find(n => n.id === 'outcome_loss');
      if (winNode || lossNode) {
        const winE = winNode?.activation || 0;
        const lossE = lossNode?.activation || 0;
        const ratio = (winE - lossE) / Math.max(winE + lossE, 0.01);
        if (ratio < -0.2) {
          result.spacingMultiplier = 1.3 + Math.abs(ratio) * 0.5;
          result.reason = `Brain: ${volClass} Vol historisch schwach → breitere Grids`;
        } else if (ratio > 0.2) {
          result.spacingMultiplier = 0.7 + (1 - ratio) * 0.3;
          result.reason = `Brain: ${volClass} Vol historisch stark → engere Grids`;
        }
        return result;
      }
    }

    // Fallback: synapse scan
    const signals: SignalInput = { rsi14: 50, macd: 0, trendScore: 0, volatility };
    const fp = fingerprint({ ...signals, regime });
    let totalWeight = 0, count = 0;
    for (const syn of this.synapseManager.getAll()) {
      const sim = fingerprintSimilarity(fp, syn.fingerprint);
      if (sim >= 0.6 && syn.activations >= 3) { totalWeight += syn.weight; count++; }
    }
    if (count >= 2) {
      const avgWeight = totalWeight / count;
      if (avgWeight < 0.4) {
        result.spacingMultiplier = 1.3 + (0.4 - avgWeight);
        result.reason = `Brain: historisch schwach → breitere Grids`;
      } else if (avgWeight > 0.6) {
        result.spacingMultiplier = 0.7 + (1.0 - avgWeight) * 0.5;
        result.reason = `Brain: historisch stark → engere Grids`;
      }
    }

    return result;
  }
}
