import type { PaperEngine } from './paper-engine.js';
import type { PaperRepository } from '../db/repositories/paper.repository.js';
import type { PaperConfig, PaperStatus, PaperPosition, PaperClosedTrade } from './types.js';

export class PaperService {
  constructor(
    private engine: PaperEngine,
    private repo: PaperRepository,
    private config: PaperConfig,
  ) {}

  getStatus(): PaperStatus {
    const { balance, equity } = this.repo.getBalance();
    const wr = this.repo.getWinRate();
    const totalPnl = this.repo.getTotalPnl();

    return {
      enabled: this.config.enabled,
      running: this.engine.isRunning(),
      paused: this.engine.isPaused(),
      cycleCount: this.engine.getCycleCount(),
      lastCycleAt: this.engine.getLastCycleAt(),
      balance,
      equity,
      startingBalance: this.config.startingBalance,
      openPositions: this.repo.countPositions(),
      closedTrades: wr.total,
      totalTrades: wr.total,
      winRate: Math.round(wr.rate * 100),
      totalPnl,
      symbols: this.config.cryptoIds.length + this.config.stockSymbols.length,
    };
  }

  getPortfolio(): { balance: number; equity: number; positions: PaperPosition[] } {
    const { balance, equity } = this.repo.getBalance();
    return {
      balance,
      equity,
      positions: this.repo.getOpenPositions(),
    };
  }

  getHistory(limit: number = 20): PaperClosedTrade[] {
    return this.repo.getRecentTrades(limit);
  }

  async runManualCycle(): Promise<{ entries: number; exits: number }> {
    return this.engine.runCycle();
  }

  pause(): { paused: boolean } {
    this.engine.pause();
    return { paused: true };
  }

  resume(): { paused: boolean } {
    this.engine.resume();
    return { paused: false };
  }

  reset(): { success: boolean; balance: number } {
    this.repo.reset(this.config.startingBalance);
    return { success: true, balance: this.config.startingBalance };
  }
}
