import type { TradeRepository, TradeRecord } from '../db/repositories/trade.repository.js';
import type { SignalService } from './signal.service.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { fingerprintSimilarity } from '../signals/fingerprint.js';
import { getLogger } from '../utils/logger.js';

export interface BacktestOptions {
  pair?: string;
  regime?: string;
  timeframe?: string;
  botType?: string;
  fromDate?: string;
  toDate?: string;
  signalFilter?: string;
}

export interface PairRegimeStats {
  wins: number;
  losses: number;
  profitPct: number;
}

export interface EquityPoint {
  tradeIndex: number;
  cumulativePct: number;
}

export interface BacktestResult {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalProfitPct: number;
  avgProfitPct: number;
  avgWinPct: number;
  avgLossPct: number;
  maxDrawdownPct: number;
  profitFactor: number;
  sharpeRatio: number;
  bestTrade: number;
  worstTrade: number;
  tradesByPair: Map<string, PairRegimeStats>;
  tradesByRegime: Map<string, PairRegimeStats>;
  equityCurve: EquityPoint[];
}

export interface SignalComparison {
  fingerprint1: string;
  fingerprint2: string;
  stats1: { wins: number; losses: number; winRate: number; avgProfitPct: number; sampleSize: number };
  stats2: { wins: number; losses: number; winRate: number; avgProfitPct: number; sampleSize: number };
  similarity: number;
  verdict: string;
}

export interface RankedSignal {
  fingerprint: string;
  wins: number;
  losses: number;
  winRate: number;
  avgProfitPct: number;
  sampleSize: number;
  synapseWeight: number | null;
}

export class BacktestService {
  private logger = getLogger();

  constructor(
    private tradeRepo: TradeRepository,
    private signalService: SignalService,
    private synapseManager: SynapseManager,
  ) {}

  /**
   * Run a backtest on existing historical trades in the DB.
   * Filters trades by the given options and computes performance statistics.
   */
  runBacktest(options: BacktestOptions = {}): BacktestResult {
    const trades = this.filterTrades(options);

    this.logger.info(`Backtest: ${trades.length} trades matched filters`);

    if (trades.length === 0) {
      return this.emptyResult();
    }

    // Sort by created_at ascending for equity curve
    trades.sort((a, b) => a.created_at.localeCompare(b.created_at));

    const wins = trades.filter(t => t.win === 1);
    const losses = trades.filter(t => t.win === 0);

    const totalProfitPct = trades.reduce((sum, t) => sum + t.profit_pct, 0);
    const winProfits = wins.map(t => t.profit_pct);
    const lossProfits = losses.map(t => t.profit_pct);

    const avgWinPct = winProfits.length > 0
      ? winProfits.reduce((s, v) => s + v, 0) / winProfits.length
      : 0;
    const avgLossPct = lossProfits.length > 0
      ? lossProfits.reduce((s, v) => s + v, 0) / lossProfits.length
      : 0;

    const grossWins = winProfits.reduce((s, v) => s + v, 0);
    const grossLosses = Math.abs(lossProfits.reduce((s, v) => s + v, 0));

    // Equity curve + max drawdown
    const equityCurve: EquityPoint[] = [];
    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;

    for (let i = 0; i < trades.length; i++) {
      cumulative += trades[i]!.profit_pct;
      equityCurve.push({ tradeIndex: i, cumulativePct: cumulative });

      if (cumulative > peak) peak = cumulative;
      const drawdown = peak - cumulative;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    // Sharpe ratio (simplified: mean return / stddev of returns)
    const returns = trades.map(t => t.profit_pct);
    const meanReturn = totalProfitPct / trades.length;
    const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length;
    const stddev = Math.sqrt(variance);
    const sharpeRatio = stddev > 0 ? meanReturn / stddev : 0;

    // Best / worst trade
    const profitValues = trades.map(t => t.profit_pct);
    const bestTrade = Math.max(...profitValues);
    const worstTrade = Math.min(...profitValues);

    // Trades by pair
    const tradesByPair = new Map<string, PairRegimeStats>();
    for (const t of trades) {
      const key = t.pair;
      const entry = tradesByPair.get(key) ?? { wins: 0, losses: 0, profitPct: 0 };
      if (t.win === 1) entry.wins++;
      else entry.losses++;
      entry.profitPct += t.profit_pct;
      tradesByPair.set(key, entry);
    }

    // Trades by regime
    const tradesByRegime = new Map<string, PairRegimeStats>();
    for (const t of trades) {
      const key = t.regime ?? 'unknown';
      const entry = tradesByRegime.get(key) ?? { wins: 0, losses: 0, profitPct: 0 };
      if (t.win === 1) entry.wins++;
      else entry.losses++;
      entry.profitPct += t.profit_pct;
      tradesByRegime.set(key, entry);
    }

    const result: BacktestResult = {
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: wins.length / trades.length,
      totalProfitPct,
      avgProfitPct: totalProfitPct / trades.length,
      avgWinPct,
      avgLossPct,
      maxDrawdownPct: maxDrawdown,
      profitFactor: grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? Infinity : 0,
      sharpeRatio,
      bestTrade,
      worstTrade,
      tradesByPair,
      tradesByRegime,
      equityCurve,
    };

    this.logger.info(
      `Backtest complete: ${result.totalTrades} trades | WR: ${(result.winRate * 100).toFixed(1)}% | ` +
      `PF: ${result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)} | ` +
      `Sharpe: ${result.sharpeRatio.toFixed(2)} | MaxDD: ${result.maxDrawdownPct.toFixed(2)}%`,
    );

    return result;
  }

  /**
   * Compare two signal fingerprint patterns head-to-head.
   */
  compareSignals(fingerprint1: string, fingerprint2: string): SignalComparison {
    const trades1 = this.tradeRepo.getByFingerprint(fingerprint1);
    const trades2 = this.tradeRepo.getByFingerprint(fingerprint2);

    const stats1 = this.computeSignalStats(trades1);
    const stats2 = this.computeSignalStats(trades2);

    const similarity = fingerprintSimilarity(fingerprint1, fingerprint2);

    let verdict: string;
    if (stats1.sampleSize < 5 || stats2.sampleSize < 5) {
      verdict = 'insufficient data — need at least 5 trades per signal for a meaningful comparison';
    } else if (stats1.winRate > stats2.winRate + 0.1 && stats1.avgProfitPct > stats2.avgProfitPct) {
      verdict = `${fingerprint1} outperforms (higher win rate and avg profit)`;
    } else if (stats2.winRate > stats1.winRate + 0.1 && stats2.avgProfitPct > stats1.avgProfitPct) {
      verdict = `${fingerprint2} outperforms (higher win rate and avg profit)`;
    } else if (stats1.avgProfitPct > stats2.avgProfitPct) {
      verdict = `${fingerprint1} has better average profit, but win rates are close`;
    } else if (stats2.avgProfitPct > stats1.avgProfitPct) {
      verdict = `${fingerprint2} has better average profit, but win rates are close`;
    } else {
      verdict = 'signals perform similarly — no clear winner';
    }

    this.logger.info(`Signal comparison: ${fingerprint1} vs ${fingerprint2} → ${verdict}`);

    return { fingerprint1, fingerprint2, stats1, stats2, similarity, verdict };
  }

  /**
   * Find top N signal patterns by win rate, requiring a minimum sample size.
   */
  findBestSignals(options: { minSampleSize?: number; topN?: number; pair?: string; regime?: string } = {}): RankedSignal[] {
    const { minSampleSize = 5, topN = 20, pair, regime } = options;

    // Group all trades by fingerprint
    let trades = this.tradeRepo.getAll();
    if (pair) trades = trades.filter(t => t.pair === pair);
    if (regime) trades = trades.filter(t => t.regime === regime);

    const grouped = new Map<string, TradeRecord[]>();
    for (const t of trades) {
      const arr = grouped.get(t.fingerprint) ?? [];
      arr.push(t);
      grouped.set(t.fingerprint, arr);
    }

    const ranked: RankedSignal[] = [];
    for (const [fp, fpTrades] of grouped) {
      if (fpTrades.length < minSampleSize) continue;

      const stats = this.computeSignalStats(fpTrades);
      const synapse = this.synapseManager.getByFingerprint(fp);

      ranked.push({
        fingerprint: fp,
        wins: stats.wins,
        losses: stats.losses,
        winRate: stats.winRate,
        avgProfitPct: stats.avgProfitPct,
        sampleSize: stats.sampleSize,
        synapseWeight: synapse?.weight ?? null,
      });
    }

    ranked.sort((a, b) => {
      // Primary: win rate, secondary: avg profit
      if (Math.abs(a.winRate - b.winRate) > 0.01) return b.winRate - a.winRate;
      return b.avgProfitPct - a.avgProfitPct;
    });

    const result = ranked.slice(0, topN);

    this.logger.info(`findBestSignals: ${result.length} signals found (min sample: ${minSampleSize})`);

    return result;
  }

  private filterTrades(options: BacktestOptions): TradeRecord[] {
    let trades = this.tradeRepo.getAll();

    if (options.pair) {
      trades = trades.filter(t => t.pair === options.pair);
    }
    if (options.regime) {
      trades = trades.filter(t => t.regime === options.regime);
    }
    if (options.botType) {
      trades = trades.filter(t => t.bot_type === options.botType);
    }
    if (options.fromDate) {
      trades = trades.filter(t => t.created_at >= options.fromDate!);
    }
    if (options.toDate) {
      trades = trades.filter(t => t.created_at <= options.toDate!);
    }
    if (options.signalFilter) {
      trades = trades.filter(t => {
        const sim = fingerprintSimilarity(t.fingerprint, options.signalFilter!);
        return sim >= 0.5;
      });
    }

    return trades;
  }

  private computeSignalStats(trades: TradeRecord[]): {
    wins: number;
    losses: number;
    winRate: number;
    avgProfitPct: number;
    sampleSize: number;
  } {
    const wins = trades.filter(t => t.win === 1).length;
    const losses = trades.filter(t => t.win === 0).length;
    const total = trades.length;
    const totalProfit = trades.reduce((s, t) => s + t.profit_pct, 0);

    return {
      wins,
      losses,
      winRate: total > 0 ? wins / total : 0,
      avgProfitPct: total > 0 ? totalProfit / total : 0,
      sampleSize: total,
    };
  }

  private emptyResult(): BacktestResult {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalProfitPct: 0,
      avgProfitPct: 0,
      avgWinPct: 0,
      avgLossPct: 0,
      maxDrawdownPct: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      bestTrade: 0,
      worstTrade: 0,
      tradesByPair: new Map(),
      tradesByRegime: new Map(),
      equityCurve: [],
    };
  }
}
