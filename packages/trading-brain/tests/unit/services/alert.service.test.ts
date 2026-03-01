/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlertService, type CreateAlertInput, type AlertCheckContext } from '../../../src/services/alert.service.js';
import type { AlertRepository, AlertRecord, AlertHistoryRecord } from '../../../src/db/repositories/alert.repository.js';
import type { SignalService } from '../../../src/services/signal.service.js';
import type { TradeRecord } from '../../../src/db/repositories/trade.repository.js';

// Mock logger and event bus to prevent side effects
vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const mockEmit = vi.fn();
vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({
    emit: mockEmit,
    on: vi.fn(),
  }),
}));

function makeAlert(overrides: Partial<AlertRecord> = {}): AlertRecord {
  return {
    id: 1,
    name: 'Test Alert',
    condition_type: 'confidence_above',
    condition_json: JSON.stringify({ threshold: 0.8 }),
    active: 1,
    webhook_url: null,
    last_triggered_at: null,
    trigger_count: 0,
    cooldown_minutes: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeTrade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return {
    id: 1,
    fingerprint: 'neutral|neutral|flat|low',
    pair: 'BTC/USDT',
    bot_type: 'dca',
    regime: null,
    profit_pct: 1.5,
    win: 1,
    signals_json: '{"rsi14":50,"macd":0,"trendScore":0,"volatility":20}',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('AlertService', () => {
  let service: AlertService;
  let alertRepo: Record<string, ReturnType<typeof vi.fn>>;
  let signalService: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockEmit.mockClear();

    alertRepo = {
      create: vi.fn().mockReturnValue(1),
      getActive: vi.fn().mockReturnValue([]),
      getAll: vi.fn().mockReturnValue([]),
      delete: vi.fn(),
      recordTrigger: vi.fn(),
      getHistory: vi.fn().mockReturnValue([]),
    };

    signalService = {
      evaluate: vi.fn(),
    };

    service = new AlertService(
      alertRepo as unknown as AlertRepository,
      signalService as unknown as SignalService,
    );
  });

  describe('createAlert', () => {
    it('should create an alert and return its id', () => {
      const input: CreateAlertInput = {
        name: 'High Confidence',
        conditionType: 'confidence_above',
        conditionJson: { threshold: 0.9 },
      };

      const id = service.createAlert(input);

      expect(alertRepo.create).toHaveBeenCalledTimes(1);
      expect(alertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'High Confidence',
          condition_type: 'confidence_above',
          condition_json: JSON.stringify({ threshold: 0.9 }),
        }),
      );
      expect(id).toBe(1);
    });
  });

  describe('getAlerts', () => {
    it('should return active alerts', () => {
      const alerts = [makeAlert(), makeAlert({ id: 2, name: 'Second' })];
      alertRepo.getActive.mockReturnValue(alerts);

      const result = service.getAlerts();

      expect(alertRepo.getActive).toHaveBeenCalledTimes(1);
      expect(result).toBe(alerts);
    });
  });

  describe('getAllAlerts', () => {
    it('should return all alerts', () => {
      const alerts = [makeAlert()];
      alertRepo.getAll.mockReturnValue(alerts);

      const result = service.getAllAlerts();

      expect(alertRepo.getAll).toHaveBeenCalledTimes(1);
      expect(result).toBe(alerts);
    });
  });

  describe('deleteAlert', () => {
    it('should delete an alert by id', () => {
      service.deleteAlert(5);

      expect(alertRepo.delete).toHaveBeenCalledTimes(1);
      expect(alertRepo.delete).toHaveBeenCalledWith(5);
    });
  });

  describe('checkAlerts', () => {
    it('should trigger confidence_above when confidence exceeds threshold', () => {
      const alert = makeAlert({
        condition_type: 'confidence_above',
        condition_json: JSON.stringify({ threshold: 0.8 }),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade();
      const context: AlertCheckContext = { confidence: 0.9 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(1);
      expect(triggered[0]).toBe(alert);
      expect(alertRepo.recordTrigger).toHaveBeenCalledTimes(1);
    });

    it('should trigger confidence_below when confidence is below threshold', () => {
      const alert = makeAlert({
        condition_type: 'confidence_below',
        condition_json: JSON.stringify({ threshold: 0.5 }),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade();
      const context: AlertCheckContext = { confidence: 0.3 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(1);
      expect(triggered[0]).toBe(alert);
      expect(alertRepo.recordTrigger).toHaveBeenCalledTimes(1);
    });

    it('should trigger win_streak when winStreak meets minStreak', () => {
      const alert = makeAlert({
        condition_type: 'win_streak',
        condition_json: JSON.stringify({ minStreak: 3 }),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade();
      const context: AlertCheckContext = { winStreak: 4 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(1);
      expect(alertRepo.recordTrigger).toHaveBeenCalledTimes(1);
    });

    it('should trigger loss_streak when lossStreak meets minStreak', () => {
      const alert = makeAlert({
        condition_type: 'loss_streak',
        condition_json: JSON.stringify({ minStreak: 3 }),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade();
      const context: AlertCheckContext = { lossStreak: 5 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(1);
      expect(alertRepo.recordTrigger).toHaveBeenCalledTimes(1);
    });

    it('should trigger drawdown when drawdownPct exceeds threshold', () => {
      const alert = makeAlert({
        condition_type: 'drawdown',
        condition_json: JSON.stringify({ threshold: 10 }),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade();
      const context: AlertCheckContext = { drawdownPct: 15 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(1);
      expect(alertRepo.recordTrigger).toHaveBeenCalledTimes(1);
    });

    it('should respect cooldown and skip recently triggered alerts', () => {
      const recentTimestamp = new Date(Date.now() - 30_000).toISOString(); // 30 seconds ago
      const alert = makeAlert({
        condition_type: 'confidence_above',
        condition_json: JSON.stringify({ threshold: 0.8 }),
        cooldown_minutes: 5,
        last_triggered_at: recentTimestamp,
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade();
      const context: AlertCheckContext = { confidence: 0.95 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(0);
      expect(alertRepo.recordTrigger).not.toHaveBeenCalled();
    });

    it('should filter win_streak by pair when pair is specified in condition', () => {
      const alert = makeAlert({
        condition_type: 'win_streak',
        condition_json: JSON.stringify({ minStreak: 3, pair: 'ETH/USDT' }),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade({ pair: 'BTC/USDT' });
      const context: AlertCheckContext = { winStreak: 5 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(0);
      expect(alertRepo.recordTrigger).not.toHaveBeenCalled();
    });

    it('should not trigger for unknown condition type', () => {
      const alert = makeAlert({
        condition_type: 'unknown_type' as any,
        condition_json: JSON.stringify({}),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade();
      const context: AlertCheckContext = { confidence: 0.9 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(0);
      expect(alertRepo.recordTrigger).not.toHaveBeenCalled();
    });

    it('should emit alert:triggered event when an alert fires', () => {
      const alert = makeAlert({
        id: 7,
        name: 'My Alert',
        condition_type: 'confidence_above',
        condition_json: JSON.stringify({ threshold: 0.5 }),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade();
      const context: AlertCheckContext = { confidence: 0.8 };

      service.checkAlerts(trade, context);

      expect(mockEmit).toHaveBeenCalledWith('alert:triggered', {
        alertId: 7,
        name: 'My Alert',
        conditionType: 'confidence_above',
      });
    });

    it('should not trigger confidence_above when confidence is below threshold', () => {
      const alert = makeAlert({
        condition_type: 'confidence_above',
        condition_json: JSON.stringify({ threshold: 0.8 }),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade();
      const context: AlertCheckContext = { confidence: 0.5 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(0);
      expect(alertRepo.recordTrigger).not.toHaveBeenCalled();
    });

    it('should allow win_streak with matching pair filter', () => {
      const alert = makeAlert({
        condition_type: 'win_streak',
        condition_json: JSON.stringify({ minStreak: 2, pair: 'BTC/USDT' }),
      });
      alertRepo.getActive.mockReturnValue([alert]);

      const trade = makeTrade({ pair: 'BTC/USDT' });
      const context: AlertCheckContext = { winStreak: 3 };

      const triggered = service.checkAlerts(trade, context);

      expect(triggered).toHaveLength(1);
      expect(alertRepo.recordTrigger).toHaveBeenCalledTimes(1);
    });
  });

  describe('getAlertHistory', () => {
    it('should return alert history from the repository', () => {
      const history: AlertHistoryRecord[] = [
        {
          id: 1,
          alert_id: 5,
          trade_id: 10,
          message: 'Alert triggered',
          data_json: null,
          created_at: new Date().toISOString(),
        },
      ];
      alertRepo.getHistory.mockReturnValue(history);

      const result = service.getAlertHistory(5, 25);

      expect(alertRepo.getHistory).toHaveBeenCalledWith(5, 25);
      expect(result).toBe(history);
    });
  });
});
