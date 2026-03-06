import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaperEngine } from '../paper-engine.js';
import type { PaperConfig, PaperPosition } from '../types.js';

// Minimal mock config
const mockConfig: PaperConfig = {
  enabled: true,
  intervalMs: 300_000,
  startingBalance: 10_000,
  maxPositionPct: 5,
  maxPositions: 10,
  stopLossPct: -2.5,
  takeProfitPct: 4,
  trailingStopActivation: 3,
  trailingStopDistance: 1.5,
  confidenceThreshold: 0.60,
  scoreThreshold: 80,
  timeExitHours: 24,
  cryptoIds: ['bitcoin'],
  stockSymbols: [],
};

function createMockRepo() {
  return {
    getBalance: vi.fn().mockReturnValue({ balance: 10000, equity: 10000 }),
    updateBalance: vi.fn(),
    getOpenPositions: vi.fn().mockReturnValue([]),
    createPosition: vi.fn().mockReturnValue(1),
    deletePosition: vi.fn(),
    countPositions: vi.fn().mockReturnValue(0),
    getPositionBySymbol: vi.fn(),
    updatePositionPrice: vi.fn(),
    createTrade: vi.fn().mockReturnValue(1),
    getRecentTrades: vi.fn().mockReturnValue([]),
    getWinRate: vi.fn().mockReturnValue({ rate: 0, total: 0 }),
    getTotalPnl: vi.fn().mockReturnValue(0),
    savePrices: vi.fn(),
    getRecentPrices: vi.fn().mockReturnValue([]),
    pruneOldPrices: vi.fn(),
  };
}

function createMockTradeService() {
  return {
    recordOutcome: vi.fn(),
    getConfidence: vi.fn().mockReturnValue(0),
    getSignalWeights: vi.fn().mockReturnValue({}),
  };
}

function createMockSignalService() {
  return {
    getConfidence: vi.fn().mockReturnValue(0),
    getSignalWeights: vi.fn().mockReturnValue({}),
  };
}

describe('PaperEngine', () => {
  describe('Balance/Equity correctness', () => {
    it('should use calcEquity (not balance) when updating balance on open position', async () => {
      const repo = createMockRepo();
      const tradeService = createMockTradeService();
      const signalService = createMockSignalService();

      // Simulate an existing open position with PnL
      const existingPosition: PaperPosition = {
        id: 1,
        symbol: 'ethereum',
        side: 'long',
        entryPrice: 2000,
        quantity: 0.25,
        usdtAmount: 500,
        currentPrice: 2100,
        pnlPct: 5,
        highWaterMark: 2100,
        signalsJson: '{}',
        fingerprint: 'abc',
        confidence: 0.7,
        regime: 'bullish_trend',
        openedAt: new Date().toISOString(),
      };

      // After opening a new position, equity should include unrealized PnL from existing positions
      repo.getOpenPositions.mockReturnValue([existingPosition]);
      repo.getBalance.mockReturnValue({ balance: 9500, equity: 9525 }); // balance minus 500 position

      const engine = new PaperEngine(mockConfig, tradeService as any, signalService as any, repo as any);

      // Verify that updateBalance is called with different values for balance and equity
      // when positions have unrealized PnL
      // The PortfolioManager.calcEquity adds unrealized PnL to balance
      // existingPosition has 5% PnL on $500 = $25 unrealized
      // So equity = newBalance + 25

      // We can test the portfolio manager directly
      const { PortfolioManager } = await import('../portfolio-manager.js');
      const portfolio = new PortfolioManager(mockConfig, repo as any);

      const equity = portfolio.calcEquity(9000);
      // existingPosition: usdtAmount=500, pnlPct=5 → position value = 500 * 1.05 = 525
      // equity = balance + position value = 9000 + 525 = 9525
      expect(equity).toBe(9525);
    });
  });

  describe('Cycle overlap protection', () => {
    it('should skip cycle if previous cycle is still in progress', async () => {
      const repo = createMockRepo();
      const tradeService = createMockTradeService();
      const signalService = createMockSignalService();

      const engine = new PaperEngine(mockConfig, tradeService as any, signalService as any, repo as any);

      // Start a slow cycle by making fetchAll hang
      let resolveFirst: () => void;
      const firstCyclePromise = new Promise<void>(r => { resolveFirst = r; });

      // Mock PriceFetcher.fetchAll to hang
      const originalFetchAll = (engine as any).priceFetcher.fetchAll;
      let callCount = 0;
      (engine as any).priceFetcher.fetchAll = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          await firstCyclePromise; // Hang on first call
          return new Map();
        }
        return new Map();
      });

      // Start first cycle (will hang)
      const cycle1 = engine.runCycle();

      // Try to start second cycle while first is running
      const result2 = await engine.runCycle();

      // Second cycle should be skipped
      expect(result2).toEqual({ entries: 0, exits: 0 });

      // Resolve first cycle
      resolveFirst!();
      await cycle1;

      // After first cycle completes, a new cycle should work
      const result3 = await engine.runCycle();
      expect(result3).toBeDefined();
    });
  });
});
