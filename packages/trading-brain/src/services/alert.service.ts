import type { AlertRepository, AlertRecord, AlertHistoryRecord } from '../db/repositories/alert.repository.js';
import type { SignalService } from './signal.service.js';
import type { TradeRecord } from '../db/repositories/trade.repository.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../utils/events.js';

export type ConditionType =
  | 'confidence_above'
  | 'confidence_below'
  | 'win_streak'
  | 'loss_streak'
  | 'drawdown';

export interface CreateAlertInput {
  name: string;
  conditionType: ConditionType;
  conditionJson: Record<string, unknown>;
  webhookUrl?: string;
  cooldownMinutes?: number;
}

export interface AlertCheckContext {
  confidence?: number;
  winStreak?: number;
  lossStreak?: number;
  drawdownPct?: number;
  pair?: string;
}

export class AlertService {
  private logger = getLogger();

  constructor(
    private alertRepo: AlertRepository,
    private signalService: SignalService,
  ) {}

  createAlert(input: CreateAlertInput): number {
    const id = this.alertRepo.create({
      name: input.name,
      condition_type: input.conditionType,
      condition_json: JSON.stringify(input.conditionJson),
      webhook_url: input.webhookUrl,
      cooldown_minutes: input.cooldownMinutes,
    });
    this.logger.info(`Alert created: "${input.name}" (${input.conditionType}) id=${id}`);
    return id;
  }

  getAlerts(): AlertRecord[] {
    return this.alertRepo.getActive();
  }

  getAllAlerts(): AlertRecord[] {
    return this.alertRepo.getAll();
  }

  deleteAlert(id: number): void {
    this.alertRepo.delete(id);
    this.logger.info(`Alert deleted: id=${id}`);
  }

  checkAlerts(trade: TradeRecord, context: AlertCheckContext): AlertRecord[] {
    const bus = getEventBus();
    const activeAlerts = this.alertRepo.getActive();
    const triggered: AlertRecord[] = [];

    for (const alert of activeAlerts) {
      // Cooldown check
      if (alert.cooldown_minutes > 0 && alert.last_triggered_at) {
        const lastTriggered = new Date(alert.last_triggered_at).getTime();
        const cooldownMs = alert.cooldown_minutes * 60 * 1000;
        if (Date.now() - lastTriggered < cooldownMs) {
          continue;
        }
      }

      const condition = JSON.parse(alert.condition_json) as Record<string, unknown>;
      const matched = this.evaluateCondition(alert.condition_type as ConditionType, condition, trade, context);

      if (matched) {
        const message = this.buildMessage(alert, trade, context);
        const data = { trade, context, condition };

        this.alertRepo.recordTrigger(alert.id, trade.id, message, data);
        triggered.push(alert);

        bus.emit('alert:triggered', {
          alertId: alert.id,
          name: alert.name,
          conditionType: alert.condition_type,
        });

        this.logger.info(`Alert triggered: "${alert.name}" (${alert.condition_type}) on trade #${trade.id}`);

        // Fire-and-forget webhook
        if (alert.webhook_url) {
          this.fireWebhook(alert.webhook_url, { alert: alert.name, message, data });
        }
      }
    }

    return triggered;
  }

  getAlertHistory(alertId: number, limit: number = 50): AlertHistoryRecord[] {
    return this.alertRepo.getHistory(alertId, limit);
  }

  private evaluateCondition(
    type: ConditionType,
    condition: Record<string, unknown>,
    trade: TradeRecord,
    context: AlertCheckContext,
  ): boolean {
    switch (type) {
      case 'confidence_above': {
        const threshold = condition['threshold'] as number | undefined;
        if (threshold === undefined || context.confidence === undefined) return false;
        return context.confidence > threshold;
      }
      case 'confidence_below': {
        const threshold = condition['threshold'] as number | undefined;
        if (threshold === undefined || context.confidence === undefined) return false;
        return context.confidence < threshold;
      }
      case 'win_streak': {
        const minStreak = condition['minStreak'] as number | undefined;
        const pair = condition['pair'] as string | undefined;
        if (minStreak === undefined || context.winStreak === undefined) return false;
        if (pair && trade.pair !== pair) return false;
        return context.winStreak >= minStreak;
      }
      case 'loss_streak': {
        const minStreak = condition['minStreak'] as number | undefined;
        const pair = condition['pair'] as string | undefined;
        if (minStreak === undefined || context.lossStreak === undefined) return false;
        if (pair && trade.pair !== pair) return false;
        return context.lossStreak >= minStreak;
      }
      case 'drawdown': {
        const threshold = condition['threshold'] as number | undefined;
        if (threshold === undefined || context.drawdownPct === undefined) return false;
        return context.drawdownPct > threshold;
      }
      default:
        this.logger.info(`Unknown condition type: ${type}`);
        return false;
    }
  }

  private buildMessage(alert: AlertRecord, trade: TradeRecord, context: AlertCheckContext): string {
    const parts = [`Alert "${alert.name}" triggered`];
    parts.push(`condition: ${alert.condition_type}`);
    parts.push(`pair: ${trade.pair}`);
    parts.push(`profit: ${trade.profit_pct.toFixed(2)}%`);
    if (context.confidence !== undefined) parts.push(`confidence: ${context.confidence.toFixed(3)}`);
    if (context.winStreak !== undefined) parts.push(`win streak: ${context.winStreak}`);
    if (context.lossStreak !== undefined) parts.push(`loss streak: ${context.lossStreak}`);
    if (context.drawdownPct !== undefined) parts.push(`drawdown: ${context.drawdownPct.toFixed(2)}%`);
    return parts.join(' | ');
  }

  private fireWebhook(url: string, payload: unknown): void {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((err) => {
      this.logger.info(`Webhook failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }
}
