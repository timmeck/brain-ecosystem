import { describe, it, expect } from 'vitest';
import { detectChain } from '../../../src/learning/chain-detector.js';
import type { TradeRecord } from '../../../src/db/repositories/trade.repository.js';

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 1,
    fingerprint: 'neutral|neutral|flat|low',
    pair: 'BTC/USDT',
    bot_type: 'dca',
    regime: null,
    profit_pct: 1.5,
    win: 1,
    signals_json: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('detectChain', () => {
  it('should return null when recentTrades has fewer than minLength entries', () => {
    const trades = [makeTrade({ id: 1 }), makeTrade({ id: 2 })];
    const latest = makeTrade({ id: 3 });

    const result = detectChain(trades, latest, 3);
    expect(result).toBeNull();
  });

  it('should return null when not enough same-pair trades', () => {
    const trades = [
      makeTrade({ id: 1, pair: 'ETH/USDT', win: 1 }),
      makeTrade({ id: 2, pair: 'ETH/USDT', win: 1 }),
      makeTrade({ id: 3, pair: 'BTC/USDT', win: 1 }),
      makeTrade({ id: 4, pair: 'DOGE/USDT', win: 1 }),
    ];
    const latest = makeTrade({ id: 5, pair: 'BTC/USDT' });

    const result = detectChain(trades, latest, 3);
    expect(result).toBeNull();
  });

  it('should detect a winning streak', () => {
    const trades = [
      makeTrade({ id: 1, pair: 'BTC/USDT', win: 1, profit_pct: 1.0 }),
      makeTrade({ id: 2, pair: 'BTC/USDT', win: 1, profit_pct: 2.0 }),
      makeTrade({ id: 3, pair: 'BTC/USDT', win: 1, profit_pct: 3.0 }),
    ];
    const latest = makeTrade({ id: 3, pair: 'BTC/USDT', win: 1 });

    const result = detectChain(trades, latest, 3);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('winning_streak');
    expect(result!.pair).toBe('BTC/USDT');
    expect(result!.length).toBe(3);
  });

  it('should detect a losing streak', () => {
    const trades = [
      makeTrade({ id: 1, pair: 'ETH/USDT', win: 0, profit_pct: -1.0 }),
      makeTrade({ id: 2, pair: 'ETH/USDT', win: 0, profit_pct: -2.0 }),
      makeTrade({ id: 3, pair: 'ETH/USDT', win: 0, profit_pct: -1.5 }),
    ];
    const latest = makeTrade({ id: 3, pair: 'ETH/USDT', win: 0 });

    const result = detectChain(trades, latest, 3);

    expect(result).not.toBeNull();
    expect(result!.type).toBe('losing_streak');
    expect(result!.pair).toBe('ETH/USDT');
  });

  it('should return null when outcomes are mixed', () => {
    const trades = [
      makeTrade({ id: 1, pair: 'BTC/USDT', win: 1 }),
      makeTrade({ id: 2, pair: 'BTC/USDT', win: 0 }),
      makeTrade({ id: 3, pair: 'BTC/USDT', win: 1 }),
    ];
    const latest = makeTrade({ id: 3, pair: 'BTC/USDT' });

    const result = detectChain(trades, latest, 3);
    expect(result).toBeNull();
  });

  it('should calculate total_profit correctly', () => {
    const trades = [
      makeTrade({ id: 1, pair: 'BTC/USDT', win: 1, profit_pct: 1.5 }),
      makeTrade({ id: 2, pair: 'BTC/USDT', win: 1, profit_pct: 2.0 }),
      makeTrade({ id: 3, pair: 'BTC/USDT', win: 1, profit_pct: 3.5 }),
    ];
    const latest = makeTrade({ id: 3, pair: 'BTC/USDT', win: 1 });

    const result = detectChain(trades, latest, 3);
    expect(result!.total_profit).toBeCloseTo(7.0);
  });

  it('should collect fingerprints from the streak', () => {
    const trades = [
      makeTrade({ id: 1, pair: 'BTC/USDT', win: 1, fingerprint: 'fp1' }),
      makeTrade({ id: 2, pair: 'BTC/USDT', win: 1, fingerprint: 'fp2' }),
      makeTrade({ id: 3, pair: 'BTC/USDT', win: 1, fingerprint: 'fp3' }),
    ];
    const latest = makeTrade({ id: 3, pair: 'BTC/USDT', win: 1 });

    const result = detectChain(trades, latest, 3);
    expect(result!.fingerprints).toEqual(['fp1', 'fp2', 'fp3']);
  });

  it('should only consider last 5 trades', () => {
    // 7 trades, but detectChain slices to last 5
    const trades = [
      makeTrade({ id: 1, pair: 'BTC/USDT', win: 0 }),
      makeTrade({ id: 2, pair: 'BTC/USDT', win: 0 }),
      makeTrade({ id: 3, pair: 'BTC/USDT', win: 1 }),
      makeTrade({ id: 4, pair: 'BTC/USDT', win: 1 }),
      makeTrade({ id: 5, pair: 'BTC/USDT', win: 1 }),
      makeTrade({ id: 6, pair: 'BTC/USDT', win: 1 }),
      makeTrade({ id: 7, pair: 'BTC/USDT', win: 1 }),
    ];
    const latest = makeTrade({ id: 7, pair: 'BTC/USDT', win: 1 });

    const result = detectChain(trades, latest, 3);
    // Last 5 are id 3-7, all wins for BTC/USDT, so last 3 are all wins
    expect(result).not.toBeNull();
    expect(result!.type).toBe('winning_streak');
  });

  it('should use default minLength of 3', () => {
    const trades = [
      makeTrade({ id: 1, pair: 'BTC/USDT', win: 1 }),
      makeTrade({ id: 2, pair: 'BTC/USDT', win: 1 }),
      makeTrade({ id: 3, pair: 'BTC/USDT', win: 1 }),
    ];
    const latest = makeTrade({ id: 3, pair: 'BTC/USDT', win: 1 });

    const result = detectChain(trades, latest);
    expect(result).not.toBeNull();
  });
});
