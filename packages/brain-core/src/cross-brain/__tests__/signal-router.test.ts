import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { CrossBrainSignalRouter, runSignalRouterMigration } from '../signal-router.js';

describe('CrossBrainSignalRouter', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates and runs migration', () => {
    const router = new CrossBrainSignalRouter(db, 'test-brain');
    const status = router.getStatus();
    expect(status.totalSignals).toBe(0);
    expect(status.handlerCount).toBe(0);
  });

  it('emits a signal and persists it', async () => {
    const router = new CrossBrainSignalRouter(db, 'trading-brain');
    const id = await router.emit({
      targetBrain: 'marketing-brain',
      signalType: 'trade_signal',
      payload: { symbol: 'BTC', direction: 'bullish' },
      confidence: 0.8,
    });

    expect(id).toMatch(/^sig-/);
    const history = router.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].sourceBrain).toBe('trading-brain');
    expect(history[0].targetBrain).toBe('marketing-brain');
    expect(history[0].signalType).toBe('trade_signal');
    expect(history[0].payload.symbol).toBe('BTC');
  });

  it('handles incoming signals and dispatches to handlers', async () => {
    const router = new CrossBrainSignalRouter(db, 'marketing-brain');
    const handler = vi.fn();
    router.onSignal('trade_signal', handler);

    await router.handleIncoming({
      id: 'sig-test-1',
      sourceBrain: 'trading-brain',
      targetBrain: 'marketing-brain',
      signalType: 'trade_signal',
      payload: { symbol: 'ETH', direction: 'bearish' },
      confidence: 0.7,
      timestamp: Date.now(),
      processed: false,
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].payload.symbol).toBe('ETH');
  });

  it('registers multiple handlers for same signal type', async () => {
    const router = new CrossBrainSignalRouter(db, 'test-brain');
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    router.onSignal('trade_signal', handler1);
    router.onSignal('trade_signal', handler2);

    await router.handleIncoming({
      id: 'sig-test-2',
      sourceBrain: 'other-brain',
      targetBrain: 'test-brain',
      signalType: 'trade_signal',
      payload: {},
      confidence: 0.5,
      timestamp: Date.now(),
      processed: false,
    });

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
  });

  it('handles handler errors gracefully', async () => {
    const router = new CrossBrainSignalRouter(db, 'test-brain');
    router.onSignal('bad_signal', () => { throw new Error('Handler crash'); });

    // Should not throw
    await router.handleIncoming({
      id: 'sig-test-3',
      sourceBrain: 'other',
      targetBrain: 'test-brain',
      signalType: 'bad_signal',
      payload: {},
      confidence: 0.5,
      timestamp: Date.now(),
      processed: false,
    });
  });

  it('processQueue processes unprocessed signals', async () => {
    const router = new CrossBrainSignalRouter(db, 'test-brain');
    const handler = vi.fn();
    router.onSignal('test_signal', handler);

    // Directly insert an unprocessed signal
    await router.emit({ targetBrain: 'test-brain', signalType: 'test_signal', payload: { x: 1 } });

    const processed = await router.processQueue();
    expect(processed).toBe(1);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('marks signals as processed', async () => {
    const router = new CrossBrainSignalRouter(db, 'test-brain');
    await router.emit({ targetBrain: 'test-brain', signalType: 'test', payload: {} });

    await router.processQueue();

    // Second process should find nothing
    const processed = await router.processQueue();
    expect(processed).toBe(0);
  });

  it('getStatus returns signal counts by type', async () => {
    const router = new CrossBrainSignalRouter(db, 'brain');
    await router.emit({ targetBrain: 'marketing', signalType: 'trade_signal', payload: {} });
    await router.emit({ targetBrain: 'marketing', signalType: 'trade_signal', payload: {} });
    await router.emit({ targetBrain: 'trading', signalType: 'engagement_signal', payload: {} });

    const status = router.getStatus();
    expect(status.totalSignals).toBe(3);
    expect(status.byType).toHaveLength(2);
  });

  it('getHistory respects limit', async () => {
    const router = new CrossBrainSignalRouter(db, 'brain');
    for (let i = 0; i < 5; i++) {
      await router.emit({ targetBrain: 'other', signalType: 'sig', payload: { i } });
    }

    expect(router.getHistory(3)).toHaveLength(3);
    expect(router.getHistory()).toHaveLength(5);
  });

  it('emits with notifier when set', async () => {
    const router = new CrossBrainSignalRouter(db, 'brain');
    const notifier = { notifyPeer: vi.fn().mockResolvedValue(undefined), notify: vi.fn() };
    router.setNotifier(notifier as any);

    await router.emit({ targetBrain: 'marketing-brain', signalType: 'test', payload: { foo: 'bar' } });

    expect(notifier.notifyPeer).toHaveBeenCalledOnce();
    expect(notifier.notifyPeer.mock.calls[0][0]).toBe('marketing-brain');
    expect(notifier.notifyPeer.mock.calls[0][1]).toBe('signal:test');
  });

  it('handles notifier failure gracefully', async () => {
    const router = new CrossBrainSignalRouter(db, 'brain');
    const notifier = { notifyPeer: vi.fn().mockRejectedValue(new Error('offline')), notify: vi.fn() };
    router.setNotifier(notifier as any);

    // Should not throw
    const id = await router.emit({ targetBrain: 'offline-brain', signalType: 'test', payload: {} });
    expect(id).toMatch(/^sig-/);
  });

  it('handles duplicate incoming signal IDs', async () => {
    const router = new CrossBrainSignalRouter(db, 'brain');

    const signal = {
      id: 'sig-dup-1',
      sourceBrain: 'other',
      targetBrain: 'brain',
      signalType: 'test',
      payload: {},
      confidence: 0.5,
      timestamp: Date.now(),
      processed: false,
    };

    await router.handleIncoming(signal);
    // Second call with same ID should not throw
    await router.handleIncoming(signal);
  });

  it('migration is idempotent', () => {
    const router = new CrossBrainSignalRouter(db, 'brain');
    runSignalRouterMigration(db); // Run again
    const status = router.getStatus();
    expect(status.totalSignals).toBe(0);
  });
});
