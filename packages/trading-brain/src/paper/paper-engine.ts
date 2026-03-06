import type { PaperConfig, PaperPosition } from './types.js';
import type { TradeService } from '../services/trade.service.js';
import type { SignalService } from '../services/signal.service.js';
import type { PaperRepository } from '../db/repositories/paper.repository.js';
import { PriceFetcher } from './price-fetcher.js';
import { PortfolioManager } from './portfolio-manager.js';
import { DecisionEngine } from './decision-engine.js';
import { calcAllIndicators } from './indicators.js';
import { getLogger } from '../utils/logger.js';

export class PaperEngine {
  private priceFetcher: PriceFetcher;
  private portfolio: PortfolioManager;
  private decision: DecisionEngine;
  private timer: ReturnType<typeof setInterval> | null = null;
  private cycleCount = 0;
  private lastCycleAt: string | null = null;
  private paused = false;
  private running = false;
  private logger = getLogger();

  constructor(
    private config: PaperConfig,
    private tradeService: TradeService,
    signalService: SignalService,
    private repo: PaperRepository,
  ) {
    this.priceFetcher = new PriceFetcher(config, repo);
    this.portfolio = new PortfolioManager(config, repo);
    this.decision = new DecisionEngine(config, signalService);
  }

  start(): void {
    if (!this.config.enabled) {
      this.logger.info('Paper trading engine disabled');
      return;
    }

    this.running = true;
    this.logger.info(`Paper trading engine started (interval: ${this.config.intervalMs}ms, balance: $${this.config.startingBalance})`);

    // Initial cycle after 30 seconds
    setTimeout(() => {
      if (this.running) this.runCycle().catch(e => this.logger.error('Paper cycle error', { error: String(e) }));
    }, 30_000);

    // Regular interval
    this.timer = setInterval(() => {
      if (!this.paused && this.running) {
        this.runCycle().catch(e => this.logger.error('Paper cycle error', { error: String(e) }));
      }
    }, this.config.intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.logger.info('Paper trading engine stopped');
  }

  pause(): void {
    this.paused = true;
    this.logger.info('Paper trading engine paused');
  }

  resume(): void {
    this.paused = false;
    this.logger.info('Paper trading engine resumed');
  }

  isPaused(): boolean {
    return this.paused;
  }

  isRunning(): boolean {
    return this.running;
  }

  getCycleCount(): number {
    return this.cycleCount;
  }

  getLastCycleAt(): string | null {
    return this.lastCycleAt;
  }

  async runCycle(): Promise<{ entries: number; exits: number }> {
    const start = Date.now();
    let entries = 0;
    let exits = 0;

    try {
      // 1. Fetch prices
      const prices = await this.priceFetcher.fetchAll();

      if (prices.size === 0) {
        this.logger.warn('Paper cycle: no prices available');
        return { entries: 0, exits: 0 };
      }

      // 2. Calculate indicators for all symbols
      const indicatorMap = new Map<string, ReturnType<typeof calcAllIndicators>>();
      for (const symbol of this.priceFetcher.getAllSymbols()) {
        const candles = this.priceFetcher.getCandles(symbol);
        if (candles.length >= 30) {
          indicatorMap.set(symbol, calcAllIndicators(candles));
        }
      }

      // 3. Update trade count for cold-start logic + Mark-to-market
      const perf = this.portfolio.getPerformanceSummary();
      this.decision.setTradeCount(perf.totalTrades);
      this.portfolio.updatePositionPrices(prices);

      // 4. Check exits
      const positions = this.portfolio.getOpenPositions();
      const exitSignals = this.decision.checkExits(positions, prices);

      for (const exit of exitSignals) {
        const closedTrade = this.portfolio.closePosition(exit.position, exit.currentPrice, exit.reason);

        // Feed to Brain learning pipeline
        try {
          const signals = JSON.parse(closedTrade.signalsJson);
          this.tradeService.recordOutcome({
            signals: {
              rsi14: signals.rsi14,
              macd: signals.macd,
              trendScore: signals.trendScore,
              volatility: signals.volatility,
            },
            regime: closedTrade.regime,
            profitPct: closedTrade.pnlPct,
            win: closedTrade.pnlPct > 0,
            botType: 'paper_trader',
            pair: `${closedTrade.symbol}/USDT`,
          });
        } catch (err) {
          this.logger.error(`Failed to record paper trade outcome: ${err}`);
        }

        exits++;
      }

      // 5. Check entries
      if (this.portfolio.canOpenPosition()) {
        const openSymbols = new Set(positions.map(p => p.symbol));
        // Remove closed positions from the set
        for (const exit of exitSignals) {
          openSymbols.delete(exit.position.symbol);
        }

        const entrySignals = this.decision.checkEntries(
          this.priceFetcher.getAllSymbols(),
          prices,
          indicatorMap,
          openSymbols,
        );

        for (const entry of entrySignals) {
          if (!this.portfolio.canOpenPosition()) break;

          const positionSize = this.portfolio.calcPositionSize();
          const quantity = positionSize / entry.price;

          const position: PaperPosition = {
            symbol: entry.symbol,
            side: 'long',
            entryPrice: entry.price,
            quantity,
            usdtAmount: positionSize,
            currentPrice: entry.price,
            pnlPct: 0,
            highWaterMark: entry.price,
            signalsJson: entry.signalsJson,
            fingerprint: entry.fingerprint,
            confidence: entry.confidence,
            regime: entry.regime,
            openedAt: new Date().toISOString(),
          };

          this.portfolio.openPosition(position);

          // Deduct from balance
          const { balance } = this.portfolio.getBalance();
          this.repo.updateBalance(balance - positionSize, balance - positionSize, 'open_position');

          entries++;
        }
      }

      this.cycleCount++;
      this.lastCycleAt = new Date().toISOString();

      const elapsed = Date.now() - start;
      if (entries > 0 || exits > 0) {
        this.logger.info(`Paper cycle #${this.cycleCount}: ${entries} entries, ${exits} exits (${elapsed}ms)`);
      } else {
        this.logger.debug(`Paper cycle #${this.cycleCount}: no trades (${elapsed}ms)`);
      }

    } catch (err) {
      this.logger.error(`Paper cycle error: ${err instanceof Error ? err.message : String(err)}`);
    }

    return { entries, exits };
  }
}
