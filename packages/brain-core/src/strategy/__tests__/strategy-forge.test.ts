import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { StrategyForge, runStrategyForgeMigration } from '../strategy-forge.js';
import { ActionBridgeEngine } from '../../action/action-bridge.js';

describe('StrategyForge', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates a strategy from principles', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    forge.setKnowledgeDistiller({
      getPrinciples: () => [
        { id: 'p1', statement: 'Buy when RSI < 30', domain: 'trading', confidence: 0.8, source: 'learned' },
        { id: 'p2', statement: 'Sell when RSI > 70', domain: 'trading', confidence: 0.7, source: 'learned' },
      ],
    });

    const strategy = forge.createFromPrinciples('trading');
    expect(strategy).not.toBeNull();
    expect(strategy!.type).toBe('trade');
    expect(strategy!.rules).toHaveLength(2);
    expect(strategy!.status).toBe('draft');
  });

  it('returns null when no distiller', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    expect(forge.createFromPrinciples('trading')).toBeNull();
  });

  it('returns null when no principles', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    forge.setKnowledgeDistiller({ getPrinciples: () => [] });
    expect(forge.createFromPrinciples('trading')).toBeNull();
  });

  it('creates a strategy from signals', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const strategy = forge.createFromSignals([
      { name: 'RSI', value: 30, direction: 'up' },
      { name: 'MACD', value: 0, direction: 'down' },
    ]);
    expect(strategy).not.toBeNull();
    expect(strategy!.rules).toHaveLength(2);
  });

  it('backtests a strategy', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const strategy = forge.createFromSignals([{ name: 'price', value: 100, direction: 'up' }]);
    const result = forge.backtest(strategy!.id);
    expect(result.strategyId).toBe(strategy!.id);
    expect(result.trades).toBeGreaterThan(0);
    expect(result.sharpeRatio).toBeGreaterThan(0);
  });

  it('activates and pauses a strategy', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const strategy = forge.createFromSignals([{ name: 'X', value: 1, direction: 'up' }]);

    forge.activate(strategy!.id);
    expect(forge.getActive()).toHaveLength(1);

    forge.pause(strategy!.id);
    expect(forge.getActive()).toHaveLength(0);
  });

  it('respects max active strategies', () => {
    const forge = new StrategyForge(db, { brainName: 'test', maxActiveStrategies: 1 });
    const s1 = forge.createFromSignals([{ name: 'A', value: 1, direction: 'up' }]);
    const s2 = forge.createFromSignals([{ name: 'B', value: 2, direction: 'down' }]);

    forge.activate(s1!.id);
    expect(() => forge.activate(s2!.id)).toThrow('Max active strategies');
  });

  it('executes a strategy step', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const strategy = forge.createFromSignals([{ name: 'X', value: 1, direction: 'up' }]);
    forge.activate(strategy!.id);

    const result = forge.executeStep(strategy!.id);
    expect(result.fired).toBeGreaterThanOrEqual(1);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  it('cannot execute inactive strategy', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const strategy = forge.createFromSignals([{ name: 'X', value: 1, direction: 'up' }]);
    expect(() => forge.executeStep(strategy!.id)).toThrow('not active');
  });

  it('evolves strategies by combining best rules', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const s1 = forge.createFromSignals([{ name: 'A', value: 1, direction: 'up' }]);
    const s2 = forge.createFromSignals([{ name: 'B', value: 2, direction: 'down' }]);

    forge.activate(s1!.id);
    forge.activate(s2!.id);

    const evolved = forge.evolve();
    expect(evolved).not.toBeNull();
    expect(evolved!.name).toContain('evolved');
    expect(evolved!.rules.length).toBeGreaterThanOrEqual(1);
  });

  it('retires a strategy', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const strategy = forge.createFromSignals([{ name: 'X', value: 1, direction: 'up' }]);
    forge.retire(strategy!.id, 'underperforming');

    const s = forge.getStrategy(strategy!.id);
    expect(s?.status).toBe('retired');
  });

  it('getPerformance returns metrics', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const strategy = forge.createFromSignals([{ name: 'X', value: 1, direction: 'up' }]);
    forge.activate(strategy!.id);
    forge.executeStep(strategy!.id);

    const perf = forge.getPerformance(strategy!.id);
    expect(perf).not.toBeNull();
    expect(perf!.executions).toBeGreaterThan(0);
  });

  it('getStatus returns overview', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    forge.createFromSignals([{ name: 'X', value: 1, direction: 'up' }]);

    const status = forge.getStatus();
    expect(status.total).toBe(1);
    expect(status.active).toBe(0);
  });

  it('migration is idempotent', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    forge.createFromSignals([{ name: 'Y', value: 5, direction: 'up' }]);
    runStrategyForgeMigration(db);
    const all = forge.getAll();
    expect(all).toHaveLength(1);
  });

  // ─── Session 96: ActionBridge Integration ──────────────────

  it('executeStep returns proposed count', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const strategy = forge.createFromSignals([{ name: 'BTC', value: 50000, direction: 'up' }]);
    forge.activate(strategy!.id);

    const result = forge.executeStep(strategy!.id);
    expect(result).toHaveProperty('proposed');
    expect(result.proposed).toBe(0); // No ActionBridge set
  });

  it('executeStep creates proposals when ActionBridge is set', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const actionBridge = new ActionBridgeEngine(db, { brainName: 'test' });
    forge.setActionBridge(actionBridge);

    const strategy = forge.createFromSignals([{ name: 'BTC', value: 50000, direction: 'up' }]);
    forge.activate(strategy!.id);

    const result = forge.executeStep(strategy!.id);
    expect(result.fired).toBe(1);
    expect(result.proposed).toBe(1);

    const queue = actionBridge.getQueue('pending');
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('execute_trade');
    expect(queue[0].payload.symbol).toBe('BTC');
    expect(queue[0].payload.action).toBe('buy');
    expect(queue[0].payload.strategyId).toBe(strategy!.id);
  });

  it('executeStep creates sell proposals for downward signals', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const actionBridge = new ActionBridgeEngine(db, { brainName: 'test' });
    forge.setActionBridge(actionBridge);

    const strategy = forge.createFromSignals([{ name: 'ETH', value: 3000, direction: 'down' }]);
    forge.activate(strategy!.id);

    forge.executeStep(strategy!.id);

    const queue = actionBridge.getQueue('pending');
    expect(queue).toHaveLength(1);
    expect(queue[0].payload.action).toBe('sell');
    expect(queue[0].payload.symbol).toBe('ETH');
  });

  it('does not propose for non-trade strategies', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const actionBridge = new ActionBridgeEngine(db, { brainName: 'test' });
    forge.setActionBridge(actionBridge);

    // createFromPrinciples with content domain → campaign type
    forge.setKnowledgeDistiller({
      getPrinciples: () => [
        { id: 'p1', statement: 'Post daily updates', domain: 'content', confidence: 0.8, source: 'learned' },
      ],
    });
    const strategy = forge.createFromPrinciples('content');
    forge.activate(strategy!.id);

    const result = forge.executeStep(strategy!.id);
    expect(result.proposed).toBe(0); // campaign type → no trade proposals
  });

  it('multiple rules create multiple proposals', () => {
    const forge = new StrategyForge(db, { brainName: 'test' });
    const actionBridge = new ActionBridgeEngine(db, { brainName: 'test' });
    forge.setActionBridge(actionBridge);

    const strategy = forge.createFromSignals([
      { name: 'BTC', value: 50000, direction: 'up' },
      { name: 'ETH', value: 3000, direction: 'down' },
      { name: 'SOL', value: 100, direction: 'up' },
    ]);
    forge.activate(strategy!.id);

    const result = forge.executeStep(strategy!.id);
    expect(result.fired).toBe(3);
    expect(result.proposed).toBe(3);

    const queue = actionBridge.getQueue('pending');
    expect(queue).toHaveLength(3);
  });
});
