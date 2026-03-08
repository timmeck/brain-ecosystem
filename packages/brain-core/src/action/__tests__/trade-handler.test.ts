import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { createTradeHandler } from '../handlers/trade-handler.js';
import { ActionBridgeEngine } from '../action-bridge.js';

describe('TradeHandler', () => {
  describe('createTradeHandler', () => {
    it('creates a handler function', () => {
      const handler = createTradeHandler({
        runCycle: vi.fn().mockResolvedValue({ entries: 0, exits: 0 }),
      });
      expect(typeof handler).toBe('function');
    });

    it('calls runCycle on execution', async () => {
      const runCycle = vi.fn().mockResolvedValue({ entries: 1, exits: 0 });
      const handler = createTradeHandler({ runCycle });

      const result = await handler({
        symbol: 'BTC',
        action: 'buy',
        reason: 'BTC > 50000',
        strategyId: 1,
        confidence: 0.85,
      });

      expect(runCycle).toHaveBeenCalledOnce();
      expect(result.triggered).toBe(true);
      expect(result.action).toBe('buy');
      expect(result.symbol).toBe('BTC');
      expect(result.strategyId).toBe(1);
      expect(result.cycleResult.entries).toBe(1);
    });

    it('returns sell action correctly', async () => {
      const handler = createTradeHandler({
        runCycle: vi.fn().mockResolvedValue({ entries: 0, exits: 1 }),
      });

      const result = await handler({
        symbol: 'ETH',
        action: 'sell',
        reason: 'ETH < 3000',
        strategyId: 2,
        confidence: 0.9,
      });

      expect(result.action).toBe('sell');
      expect(result.symbol).toBe('ETH');
      expect(result.cycleResult.exits).toBe(1);
    });

    it('includes portfolio snapshot when getPortfolio provided', async () => {
      const handler = createTradeHandler({
        runCycle: vi.fn().mockResolvedValue({ entries: 1, exits: 0 }),
        getPortfolio: () => ({
          balance: 10000,
          equity: 10500,
          positions: [
            { symbol: 'BTC', side: 'long', pnlPct: 5 },
          ],
        }),
      });

      const result = await handler({ symbol: 'BTC', action: 'buy', strategyId: 1, confidence: 0.8 });
      expect(result.portfolioSnapshot).toBeDefined();
      expect(result.portfolioSnapshot!.balance).toBe(10000);
      expect(result.portfolioSnapshot!.equity).toBe(10500);
      expect(result.portfolioSnapshot!.positionCount).toBe(1);
    });

    it('handles missing portfolio gracefully', async () => {
      const handler = createTradeHandler({
        runCycle: vi.fn().mockResolvedValue({ entries: 0, exits: 0 }),
      });

      const result = await handler({ symbol: 'BTC', action: 'buy', strategyId: 1, confidence: 0.5 });
      expect(result.portfolioSnapshot).toBeUndefined();
    });

    it('handles portfolio error gracefully', async () => {
      const handler = createTradeHandler({
        runCycle: vi.fn().mockResolvedValue({ entries: 0, exits: 0 }),
        getPortfolio: () => { throw new Error('DB error'); },
      });

      const result = await handler({ symbol: 'BTC', action: 'buy', strategyId: 1, confidence: 0.5 });
      expect(result.portfolioSnapshot).toBeUndefined();
    });

    it('defaults missing payload fields', async () => {
      const handler = createTradeHandler({
        runCycle: vi.fn().mockResolvedValue({ entries: 0, exits: 0 }),
      });

      const result = await handler({});
      expect(result.symbol).toBe('UNKNOWN');
      expect(result.action).toBe('buy');
      expect(result.strategyId).toBe(0);
    });

    it('propagates runCycle errors', async () => {
      const handler = createTradeHandler({
        runCycle: vi.fn().mockRejectedValue(new Error('No prices available')),
      });

      await expect(handler({ symbol: 'BTC', action: 'buy', strategyId: 1, confidence: 0.8 }))
        .rejects.toThrow('No prices available');
    });
  });

  describe('Integration with ActionBridgeEngine', () => {
    let db: Database.Database;

    beforeEach(() => { db = new Database(':memory:'); });
    afterEach(() => { db.close(); });

    it('registers and executes trade handler through ActionBridge', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      const runCycle = vi.fn().mockResolvedValue({ entries: 1, exits: 0 });

      engine.registerHandler('execute_trade', createTradeHandler({ runCycle }));

      const id = engine.propose({
        source: 'research',
        type: 'execute_trade',
        title: 'Buy BTC',
        confidence: 0.85,
        payload: { symbol: 'BTC', action: 'buy', strategyId: 1, confidence: 0.85 },
      });

      const result = await engine.executeAction(id);
      expect(result.success).toBe(true);
      expect(runCycle).toHaveBeenCalledOnce();
    });

    it('auto-executes trade when confidence >= 0.8', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      const runCycle = vi.fn().mockResolvedValue({ entries: 0, exits: 1 });

      engine.registerHandler('execute_trade', createTradeHandler({ runCycle }));

      engine.propose({
        source: 'research',
        type: 'execute_trade',
        title: 'Sell ETH',
        confidence: 0.9,
        payload: { symbol: 'ETH', action: 'sell', strategyId: 2, confidence: 0.9 },
      });

      const executed = await engine.processQueue();
      expect(executed).toBe(1);
      expect(runCycle).toHaveBeenCalledOnce();
    });

    it('does not auto-execute when confidence < 0.8', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      engine.registerHandler('execute_trade', createTradeHandler({
        runCycle: vi.fn().mockResolvedValue({ entries: 0, exits: 0 }),
      }));

      engine.propose({
        source: 'research',
        type: 'execute_trade',
        title: 'Low confidence trade',
        confidence: 0.6,
        payload: { symbol: 'BTC', action: 'buy', strategyId: 1, confidence: 0.6 },
      });

      const executed = await engine.processQueue();
      expect(executed).toBe(0);
    });

    it('records failed trade execution', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      engine.registerHandler('execute_trade', createTradeHandler({
        runCycle: vi.fn().mockRejectedValue(new Error('Market closed')),
      }));

      const id = engine.propose({
        source: 'research',
        type: 'execute_trade',
        title: 'Failed trade',
        confidence: 0.9,
        payload: { symbol: 'BTC', action: 'buy', strategyId: 1, confidence: 0.9 },
      });

      const result = await engine.executeAction(id);
      expect(result.success).toBe(false);

      const action = engine.getAction(id);
      expect(action?.status).toBe('failed');
    });
  });
});
