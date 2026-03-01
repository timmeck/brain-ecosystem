import type { TradeRepository, TradeRecord } from '../db/repositories/trade.repository.js';
import type { SignalService } from './signal.service.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { getLogger } from '../utils/logger.js';

export interface KellyResult {
  kellyFraction: number;
  halfKelly: number;
  brainAdjusted: number;
  sampleSize: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  recommendation: 'aggressive' | 'normal' | 'conservative' | 'avoid';
}

export interface PositionSizeResult {
  sizePct: number;
  kellyRaw: number;
  confidence: number;
  reason: string;
}

export interface RiskMetrics {
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  consecutiveLosses: number;
  maxConsecutiveLosses: number;
  riskRewardRatio: number;
  expectancy: number;
}

export class RiskService {
  private logger = getLogger();

  constructor(
    private tradeRepo: TradeRepository,
    private signalService: SignalService,
    private synapseManager: SynapseManager,
  ) {}

  /**
   * Calculate Kelly Criterion fraction for position sizing.
   * K = W - (1-W)/R where W = win rate, R = avg win / avg loss ratio.
   */
  getKellyFraction(pair?: string, regime?: string): KellyResult {
    const trades = this.getFilteredTrades(pair, regime);

    if (trades.length === 0) {
      this.logger.info('Kelly: no trades found for given filters');
      return {
        kellyFraction: 0,
        halfKelly: 0,
        brainAdjusted: 0,
        sampleSize: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
        recommendation: 'avoid',
      };
    }

    const wins = trades.filter(t => t.win === 1);
    const losses = trades.filter(t => t.win === 0);

    const winRate = wins.length / trades.length;

    const avgWin = wins.length > 0
      ? wins.reduce((s, t) => s + t.profit_pct, 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? Math.abs(losses.reduce((s, t) => s + t.profit_pct, 0) / losses.length)
      : 0;

    // Kelly formula: K = W - (1-W)/R
    // R = avgWin / avgLoss (win/loss ratio)
    let kellyFraction = 0;
    if (avgLoss > 0) {
      const R = avgWin / avgLoss;
      kellyFraction = winRate - (1 - winRate) / R;
    } else if (winRate > 0) {
      // No losses recorded — Kelly would be 1, but cap it
      kellyFraction = winRate;
    }

    const halfKelly = kellyFraction / 2;

    // Brain-adjusted: use synapse confidence for the most common fingerprint
    let brainConfidence = 0.5;
    if (trades.length > 0) {
      // Find the most frequent fingerprint in the filtered trades
      const fpCounts = new Map<string, number>();
      for (const t of trades) {
        fpCounts.set(t.fingerprint, (fpCounts.get(t.fingerprint) ?? 0) + 1);
      }
      let topFp = '';
      let topCount = 0;
      for (const [fp, count] of fpCounts) {
        if (count > topCount) {
          topFp = fp;
          topCount = count;
        }
      }
      if (topFp) {
        const synapse = this.synapseManager.getByFingerprint(topFp);
        if (synapse && synapse.activations >= 3) {
          brainConfidence = synapse.weight;
        }
      }
    }
    const brainAdjusted = halfKelly * brainConfidence;

    // Recommendation
    let recommendation: KellyResult['recommendation'];
    if (trades.length < 10 || kellyFraction <= 0) {
      recommendation = 'avoid';
    } else if (kellyFraction > 0.25) {
      recommendation = 'aggressive';
    } else if (kellyFraction > 0.1) {
      recommendation = 'normal';
    } else {
      recommendation = 'conservative';
    }

    this.logger.info(
      `Kelly: K=${kellyFraction.toFixed(3)} | half=${halfKelly.toFixed(3)} | ` +
      `brainAdj=${brainAdjusted.toFixed(3)} | WR=${(winRate * 100).toFixed(1)}% | ` +
      `n=${trades.length} → ${recommendation}`,
    );

    return {
      kellyFraction,
      halfKelly,
      brainAdjusted,
      sampleSize: trades.length,
      winRate,
      avgWin,
      avgLoss,
      recommendation,
    };
  }

  /**
   * Get a recommended position size based on Kelly Criterion and signal confidence.
   * Caps at 25% of capital per position.
   */
  getPositionSize(
    capitalPct: number,
    signals: { fingerprint: string; confidence?: number },
    regime?: string,
  ): PositionSizeResult {
    const MAX_POSITION_PCT = 25;
    const MIN_POSITION_PCT = 1;

    // Get Kelly for the regime context
    const kelly = this.getKellyFraction(undefined, regime);

    // Signal confidence from synapse
    let confidence = signals.confidence ?? 0.5;
    const synapse = this.synapseManager.getByFingerprint(signals.fingerprint);
    if (synapse && synapse.activations >= 3) {
      confidence = synapse.weight;
    }

    let sizePct: number;
    let reason: string;

    if (kelly.recommendation === 'avoid') {
      sizePct = MIN_POSITION_PCT;
      reason = 'minimum size — Kelly suggests avoiding (insufficient data or negative edge)';
    } else {
      // Base size from half-Kelly, scaled by confidence and capital percentage
      sizePct = kelly.halfKelly * confidence * capitalPct * 100;

      // Clamp to reasonable limits
      sizePct = Math.max(MIN_POSITION_PCT, Math.min(MAX_POSITION_PCT, sizePct));

      if (kelly.recommendation === 'conservative') {
        sizePct = Math.min(sizePct, 5);
        reason = `conservative — Kelly edge is thin (K=${kelly.kellyFraction.toFixed(3)})`;
      } else if (kelly.recommendation === 'aggressive') {
        reason = `aggressive — strong edge detected (K=${kelly.kellyFraction.toFixed(3)}, conf=${confidence.toFixed(2)})`;
      } else {
        reason = `normal — solid edge (K=${kelly.kellyFraction.toFixed(3)}, conf=${confidence.toFixed(2)})`;
      }
    }

    this.logger.info(
      `Position size: ${sizePct.toFixed(1)}% | Kelly raw: ${kelly.kellyFraction.toFixed(3)} | ` +
      `confidence: ${confidence.toFixed(2)} | ${reason}`,
    );

    return {
      sizePct,
      kellyRaw: kelly.kellyFraction,
      confidence,
      reason,
    };
  }

  /**
   * Get risk metrics for overall portfolio or a specific pair.
   */
  getRiskMetrics(pair?: string): RiskMetrics {
    const trades = pair ? this.tradeRepo.getByPair(pair) : this.tradeRepo.getAll();

    if (trades.length === 0) {
      return {
        maxDrawdownPct: 0,
        currentDrawdownPct: 0,
        consecutiveLosses: 0,
        maxConsecutiveLosses: 0,
        riskRewardRatio: 0,
        expectancy: 0,
      };
    }

    // Sort ascending by date for sequential analysis
    const sorted = [...trades].sort((a, b) => a.created_at.localeCompare(b.created_at));

    // Max drawdown (peak-to-trough on equity curve)
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (const t of sorted) {
      cumulative += t.profit_pct;
      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Current drawdown
    const currentDrawdown = peak - cumulative;

    // Consecutive losses (current streak + max ever)
    let currentStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    for (const t of sorted) {
      if (t.win === 0) {
        tempStreak++;
        if (tempStreak > maxStreak) maxStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    // Current streak: count from the end
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i]!.win === 0) {
        currentStreak++;
      } else {
        break;
      }
    }

    // Win/loss stats
    const wins = sorted.filter(t => t.win === 1);
    const losses = sorted.filter(t => t.win === 0);

    const avgWin = wins.length > 0
      ? wins.reduce((s, t) => s + t.profit_pct, 0) / wins.length
      : 0;
    const avgLoss = losses.length > 0
      ? Math.abs(losses.reduce((s, t) => s + t.profit_pct, 0) / losses.length)
      : 0;

    const winRate = wins.length / sorted.length;

    // Risk-reward ratio: avgWin / avgLoss
    const riskRewardRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;

    // Expectancy: W * avgWin - (1-W) * avgLoss
    const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;

    this.logger.info(
      `Risk metrics${pair ? ` (${pair})` : ''}: MaxDD=${maxDrawdown.toFixed(2)}% | ` +
      `CurDD=${currentDrawdown.toFixed(2)}% | ConsLoss=${currentStreak}/${maxStreak} | ` +
      `RR=${riskRewardRatio === Infinity ? '∞' : riskRewardRatio.toFixed(2)} | E=${expectancy.toFixed(3)}`,
    );

    return {
      maxDrawdownPct: maxDrawdown,
      currentDrawdownPct: currentDrawdown,
      consecutiveLosses: currentStreak,
      maxConsecutiveLosses: maxStreak,
      riskRewardRatio,
      expectancy,
    };
  }

  private getFilteredTrades(pair?: string, regime?: string): TradeRecord[] {
    let trades: TradeRecord[];

    if (pair) {
      trades = this.tradeRepo.getByPair(pair);
    } else {
      trades = this.tradeRepo.getAll();
    }

    if (regime) {
      trades = trades.filter(t => t.regime === regime);
    }

    return trades;
  }
}
