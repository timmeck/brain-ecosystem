/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportService, type ImportTradeRow } from '../../../src/services/import.service.js';
import type { TradeService } from '../../../src/services/trade.service.js';

// Mock logger and event bus to prevent side effects
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({
    emit: vi.fn(),
    on: vi.fn(),
  }),
}));

function makeValidRow(overrides: Partial<ImportTradeRow> = {}): ImportTradeRow {
  return {
    pair: 'BTC/USDT',
    botType: 'dca',
    profitPct: 2.5,
    win: true,
    signals: { rsi14: 30, macd: 1 },
    ...overrides,
  };
}

describe('ImportService', () => {
  let service: ImportService;
  let tradeService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    tradeService = {
      recordOutcome: vi.fn().mockReturnValue({
        tradeId: 1,
        fingerprint: 'neutral|neutral|flat|low',
        synapseWeight: 0.55,
      }),
    };

    service = new ImportService(tradeService as unknown as TradeService);
  });

  describe('importTrades', () => {
    it('should return 0 imported and 0 failed for an empty array', () => {
      const result = service.importTrades([]);

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(tradeService.recordOutcome).not.toHaveBeenCalled();
    });

    it('should call recordOutcome for each valid trade', () => {
      const trades = [
        makeValidRow({ pair: 'BTC/USDT' }),
        makeValidRow({ pair: 'ETH/USDT', profitPct: -1.0, win: false }),
      ];

      const result = service.importTrades(trades);

      expect(tradeService.recordOutcome).toHaveBeenCalledTimes(2);
      expect(result.imported).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should count failures correctly when a trade throws', () => {
      tradeService.recordOutcome
        .mockReturnValueOnce({ tradeId: 1, fingerprint: 'fp', synapseWeight: 0.5 })
        .mockImplementationOnce(() => { throw new Error('DB error'); })
        .mockReturnValueOnce({ tradeId: 3, fingerprint: 'fp', synapseWeight: 0.5 });

      const trades = [makeValidRow(), makeValidRow(), makeValidRow()];

      const result = service.importTrades(trades);

      expect(result.imported).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Row 1');
      expect(result.errors[0]).toContain('DB error');
    });
  });

  describe('importFromJson', () => {
    it('should parse and import a valid JSON array', () => {
      const rows = [
        { pair: 'BTC/USDT', botType: 'dca', profitPct: 1.5, win: true, signals: { rsi14: 40 } },
        { pair: 'ETH/USDT', botType: 'grid', profitPct: -0.5, win: false, signals: { macd: -1 } },
      ];
      const json = JSON.stringify(rows);

      const result = service.importFromJson(json);

      expect(tradeService.recordOutcome).toHaveBeenCalledTimes(2);
      expect(result.imported).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('should return an error for invalid JSON', () => {
      const result = service.importFromJson('not json {{{');

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('should return an error for non-array JSON', () => {
      const result = service.importFromJson(JSON.stringify({ pair: 'BTC/USDT' }));

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Expected a JSON array');
    });

    it('should fail validation when pair is missing', () => {
      const rows = [{ botType: 'dca', profitPct: 1.0, win: true, signals: { rsi14: 50 } }];
      const result = service.importFromJson(JSON.stringify(rows));

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.some((e: string) => e.includes('pair'))).toBe(true);
    });

    it('should fail validation when botType is missing', () => {
      const rows = [{ pair: 'BTC/USDT', profitPct: 1.0, win: true, signals: { rsi14: 50 } }];
      const result = service.importFromJson(JSON.stringify(rows));

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.some((e: string) => e.includes('botType'))).toBe(true);
    });

    it('should fail validation when profitPct is missing', () => {
      const rows = [{ pair: 'BTC/USDT', botType: 'dca', win: true, signals: { rsi14: 50 } }];
      const result = service.importFromJson(JSON.stringify(rows));

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.some((e: string) => e.includes('profitPct'))).toBe(true);
    });

    it('should fail validation when win is missing', () => {
      const rows = [{ pair: 'BTC/USDT', botType: 'dca', profitPct: 1.0, signals: { rsi14: 50 } }];
      const result = service.importFromJson(JSON.stringify(rows));

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.some((e: string) => e.includes('win'))).toBe(true);
    });

    it('should fail validation when signals is missing', () => {
      const rows = [{ pair: 'BTC/USDT', botType: 'dca', profitPct: 1.0, win: true }];
      const result = service.importFromJson(JSON.stringify(rows));

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors.some((e: string) => e.includes('signals'))).toBe(true);
    });

    it('should handle a mix of valid and invalid rows', () => {
      const rows = [
        { pair: 'BTC/USDT', botType: 'dca', profitPct: 1.5, win: true, signals: { rsi14: 40 } },
        { botType: 'grid', profitPct: -0.5, win: false, signals: { macd: -1 } }, // missing pair
        { pair: 'SOL/USDT', botType: 'dca', profitPct: 0.8, win: true, signals: { rsi14: 55 } },
      ];
      const result = service.importFromJson(JSON.stringify(rows));

      expect(result.imported).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Row 1');
      expect(result.errors[0]).toContain('pair');
    });
  });
});
