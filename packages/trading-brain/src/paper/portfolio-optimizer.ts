import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface PortfolioOptimizerConfig {
  maxPositionPct?: number;          // Max % of equity per position (default: 10)
  maxConcentrationPct?: number;     // Max % in single asset (default: 25)
  minDiversification?: number;      // Min number of different assets (default: 3)
  kellyFraction?: number;           // Kelly criterion fraction (default: 0.25 = quarter-Kelly)
  rebalanceThresholdPct?: number;   // Rebalance when position drifts by this % (default: 5)
}

export interface PositionSizeRecommendation {
  symbol: string;
  recommendedSize: number;      // USD amount
  reason: string;
  kellyPct: number;
  concentrationPct: number;
  diversificationOk: boolean;
}

export interface PortfolioHealth {
  totalEquity: number;
  positionCount: number;
  largestPositionPct: number;
  smallestPositionPct: number;
  diversificationScore: number;     // 0-1 (1 = perfectly diversified)
  concentrationRisk: 'low' | 'medium' | 'high';
  recommendations: string[];
}

// ── Migration ──────────────────────────────────────────────

export function runPortfolioOptimizerMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equity REAL NOT NULL,
      position_count INTEGER NOT NULL,
      diversification_score REAL NOT NULL,
      largest_position_pct REAL NOT NULL,
      recommendations TEXT DEFAULT '[]',
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ps_timestamp ON portfolio_snapshots(timestamp);
  `);
}

// ── Optimizer ──────────────────────────────────────────────

const log = getLogger();

export class PortfolioOptimizer {
  private readonly db: Database.Database;
  private readonly config: Required<PortfolioOptimizerConfig>;

  private readonly stmtInsertSnapshot;
  private readonly stmtGetSnapshots;

  constructor(db: Database.Database, config?: PortfolioOptimizerConfig) {
    this.db = db;
    this.config = {
      maxPositionPct: config?.maxPositionPct ?? 10,
      maxConcentrationPct: config?.maxConcentrationPct ?? 25,
      minDiversification: config?.minDiversification ?? 3,
      kellyFraction: config?.kellyFraction ?? 0.25,
      rebalanceThresholdPct: config?.rebalanceThresholdPct ?? 5,
    };

    runPortfolioOptimizerMigration(db);

    this.stmtInsertSnapshot = db.prepare(`INSERT INTO portfolio_snapshots (equity, position_count, diversification_score, largest_position_pct, recommendations, timestamp) VALUES (?, ?, ?, ?, ?, ?)`);
    this.stmtGetSnapshots = db.prepare(`SELECT * FROM portfolio_snapshots ORDER BY timestamp DESC LIMIT ?`);
  }

  /** Calculate optimal position size using Kelly criterion */
  calcPositionSize(
    equity: number,
    symbol: string,
    winRate: number,
    avgWin: number,
    avgLoss: number,
    existingPositions: Array<{ symbol: string; usdtAmount: number }>,
  ): PositionSizeRecommendation {
    // Kelly criterion: f* = (p * b - q) / b
    // where p = win prob, q = loss prob, b = win/loss ratio
    const p = Math.max(0, Math.min(1, winRate));
    const q = 1 - p;
    const b = avgLoss > 0 ? avgWin / avgLoss : 1;
    const kellyPct = Math.max(0, (p * b - q) / b) * this.config.kellyFraction;

    // Position size from Kelly (capped at maxPositionPct)
    const kellySize = equity * kellyPct;
    const maxSize = equity * (this.config.maxPositionPct / 100);
    let recommendedSize = Math.min(kellySize, maxSize);

    // Concentration check: how much is already in this symbol?
    const existing = existingPositions
      .filter(pos => pos.symbol === symbol)
      .reduce((sum, pos) => sum + pos.usdtAmount, 0);
    const totalAfter = existing + recommendedSize;
    const concentrationPct = equity > 0 ? (totalAfter / equity) * 100 : 0;

    if (concentrationPct > this.config.maxConcentrationPct) {
      recommendedSize = Math.max(0, (equity * this.config.maxConcentrationPct / 100) - existing);
    }

    // Diversification check
    const uniqueSymbols = new Set(existingPositions.map(p => p.symbol));
    uniqueSymbols.add(symbol);
    const diversificationOk = uniqueSymbols.size >= this.config.minDiversification || existingPositions.length < this.config.minDiversification;

    let reason = `Kelly ${(kellyPct * 100).toFixed(1)}%`;
    if (recommendedSize < kellySize) reason += ' (capped)';
    if (concentrationPct > this.config.maxConcentrationPct) reason += ' (concentration limit)';

    return {
      symbol,
      recommendedSize: parseFloat(recommendedSize.toFixed(2)),
      reason,
      kellyPct: parseFloat((kellyPct * 100).toFixed(2)),
      concentrationPct: parseFloat(concentrationPct.toFixed(2)),
      diversificationOk,
    };
  }

  /** Assess overall portfolio health */
  checkHealth(
    equity: number,
    positions: Array<{ symbol: string; usdtAmount: number }>,
  ): PortfolioHealth {
    const posCount = positions.length;
    const recommendations: string[] = [];

    if (posCount === 0) {
      return {
        totalEquity: equity,
        positionCount: 0,
        largestPositionPct: 0,
        smallestPositionPct: 0,
        diversificationScore: 0,
        concentrationRisk: 'low',
        recommendations: ['No positions open'],
      };
    }

    // Position size percentages
    const pcts = positions.map(p => equity > 0 ? (p.usdtAmount / equity) * 100 : 0);
    const largestPct = Math.max(...pcts);
    const smallestPct = Math.min(...pcts);

    // Diversification: HHI-based (Herfindahl-Hirschman Index)
    const fractions = positions.map(p => equity > 0 ? p.usdtAmount / equity : 0);
    const hhi = fractions.reduce((sum, f) => sum + f * f, 0);
    const idealHHI = 1 / Math.max(1, posCount);
    const diversificationScore = posCount > 1 ? Math.max(0, 1 - (hhi - idealHHI) / (1 - idealHHI)) : 0;

    // Concentration risk
    let concentrationRisk: 'low' | 'medium' | 'high' = 'low';
    if (largestPct > this.config.maxConcentrationPct) {
      concentrationRisk = 'high';
      recommendations.push(`Position too large: ${largestPct.toFixed(1)}% > ${this.config.maxConcentrationPct}% limit`);
    } else if (largestPct > this.config.maxConcentrationPct * 0.7) {
      concentrationRisk = 'medium';
    }

    // Diversification warning
    const uniqueSymbols = new Set(positions.map(p => p.symbol));
    if (uniqueSymbols.size < this.config.minDiversification) {
      recommendations.push(`Low diversification: ${uniqueSymbols.size} assets (min ${this.config.minDiversification})`);
    }

    // Record snapshot
    this.stmtInsertSnapshot.run(equity, posCount, diversificationScore, largestPct, JSON.stringify(recommendations), Date.now());

    return {
      totalEquity: equity,
      positionCount: posCount,
      largestPositionPct: parseFloat(largestPct.toFixed(2)),
      smallestPositionPct: parseFloat(smallestPct.toFixed(2)),
      diversificationScore: parseFloat(diversificationScore.toFixed(3)),
      concentrationRisk,
      recommendations,
    };
  }

  /** Get snapshot history */
  getHistory(limit = 20): unknown[] {
    return this.stmtGetSnapshots.all(limit);
  }

  /** Check if a position needs rebalancing */
  needsRebalance(
    currentPct: number,
    targetPct: number,
  ): boolean {
    return Math.abs(currentPct - targetPct) >= this.config.rebalanceThresholdPct;
  }
}
