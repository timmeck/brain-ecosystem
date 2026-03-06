import type { PaperConfig, PaperPosition, PaperClosedTrade } from './types.js';
import type { PaperRepository } from '../db/repositories/paper.repository.js';
import { getLogger } from '../utils/logger.js';

export class PortfolioManager {
  private logger = getLogger();

  constructor(
    private config: PaperConfig,
    private repo: PaperRepository,
  ) {}

  getBalance(): { balance: number; equity: number } {
    return this.repo.getBalance();
  }

  getOpenPositions(): PaperPosition[] {
    return this.repo.getOpenPositions();
  }

  hasPosition(symbol: string): boolean {
    return this.repo.getPositionBySymbol(symbol) !== undefined;
  }

  canOpenPosition(): boolean {
    return this.repo.countPositions() < this.config.maxPositions;
  }

  /**
   * Calculate position size: maxPositionPct% of equity.
   */
  calcPositionSize(): number {
    const { equity } = this.repo.getBalance();
    return equity * (this.config.maxPositionPct / 100);
  }

  openPosition(pos: PaperPosition): number {
    const posId = this.repo.createPosition(pos);
    this.logger.info(`Paper OPEN: ${pos.symbol} @ ${pos.entryPrice.toFixed(4)} | $${pos.usdtAmount.toFixed(2)} | fp: ${pos.fingerprint}`);
    return posId;
  }

  closePosition(position: PaperPosition, exitPrice: number, exitReason: string): PaperClosedTrade {
    const pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
    const pnlUsdt = position.usdtAmount * (pnlPct / 100);

    const trade: PaperClosedTrade = {
      symbol: position.symbol,
      side: 'long',
      entryPrice: position.entryPrice,
      exitPrice,
      quantity: position.quantity,
      usdtAmount: position.usdtAmount,
      pnlUsdt,
      pnlPct,
      exitReason,
      signalsJson: position.signalsJson,
      fingerprint: position.fingerprint,
      confidence: position.confidence,
      regime: position.regime,
      openedAt: position.openedAt,
      closedAt: new Date().toISOString(),
    };

    // Record trade
    const tradeId = this.repo.createTrade(trade);
    trade.id = tradeId;

    // Remove position
    if (position.id) {
      this.repo.deletePosition(position.id);
    }

    // Update balance: return principal + profit/loss
    const { balance } = this.repo.getBalance();
    const newBalance = balance + position.usdtAmount + pnlUsdt;
    this.repo.updateBalance(newBalance, this.calcEquity(newBalance), `close_${exitReason}`);

    this.logger.info(`Paper CLOSE: ${position.symbol} @ ${exitPrice.toFixed(4)} | ${exitReason} | PnL: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}% ($${pnlUsdt.toFixed(2)})`);

    return trade;
  }

  /**
   * Mark-to-market: update all positions with current prices.
   */
  updatePositionPrices(prices: Map<string, number>): void {
    const positions = this.repo.getOpenPositions();
    for (const pos of positions) {
      const currentPrice = prices.get(pos.symbol);
      if (currentPrice === undefined || !pos.id) continue;

      const pnlPct = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      const highWaterMark = Math.max(pos.highWaterMark, currentPrice);
      this.repo.updatePositionPrice(pos.id, currentPrice, pnlPct, highWaterMark);
    }

    // Update equity
    const { balance } = this.repo.getBalance();
    const equity = this.calcEquity(balance);
    this.repo.updateBalance(balance, equity, 'mark_to_market');
  }

  getPerformanceSummary(): {
    totalPnl: number;
    winRate: number;
    totalTrades: number;
    avgHoldTime: number;
  } {
    const wr = this.repo.getWinRate();
    const totalPnl = this.repo.getTotalPnl();
    const trades = this.repo.getRecentTrades(1000);

    let totalHoldMs = 0;
    for (const t of trades) {
      const openTime = new Date(t.openedAt).getTime();
      const closeTime = new Date(t.closedAt).getTime();
      totalHoldMs += closeTime - openTime;
    }

    return {
      totalPnl,
      winRate: wr.rate,
      totalTrades: wr.total,
      avgHoldTime: trades.length > 0 ? totalHoldMs / trades.length / 3600000 : 0, // in hours
    };
  }

  calcEquity(balance: number): number {
    const positions = this.repo.getOpenPositions();
    let positionValue = 0;
    for (const pos of positions) {
      // Position value = principal + unrealized P&L
      positionValue += pos.usdtAmount * (1 + pos.pnlPct / 100);
    }
    return balance + positionValue;
  }
}
