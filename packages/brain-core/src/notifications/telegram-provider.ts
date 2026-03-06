/**
 * Telegram Notification Provider — Bot Messages via grammy
 *
 * Einrichten:
 *   1. Bot erstellen: https://t.me/BotFather → /newbot → Token kopieren
 *   2. Chat ID finden: Nachricht an Bot senden, dann
 *      https://api.telegram.org/bot<TOKEN>/getUpdates → chat.id
 *   3. In .env:
 *      TELEGRAM_BOT_TOKEN=...
 *      TELEGRAM_CHAT_ID=...
 */

import { getLogger } from '../utils/logger.js';
import type { NotificationProvider, Notification, NotificationResult } from './notification-provider.js';

export interface TelegramProviderConfig {
  botToken?: string;
  chatId?: string;
}

const PRIORITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🟢',
};

export class TelegramProvider implements NotificationProvider {
  readonly name = 'telegram';

  private readonly botToken: string | null;
  private readonly chatId: string | null;
  private readonly log = getLogger();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private bot: any = null;
  private sentCount = 0;

  constructor(config: TelegramProviderConfig = {}) {
    this.botToken = config.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? null;
    this.chatId = config.chatId ?? process.env.TELEGRAM_CHAT_ID ?? null;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.botToken || !this.chatId) return false;
    try {
      await this.getBot();
      return true;
    } catch {
      return false;
    }
  }

  async send(notification: Notification): Promise<NotificationResult> {
    try {
      const bot = await this.getBot();
      const emoji = PRIORITY_EMOJI[notification.priority] ?? '⚪';

      const text = [
        `${emoji} *${this.escapeMarkdown(notification.title)}*`,
        '',
        this.escapeMarkdown(notification.message),
        '',
        `_${notification.event}_`,
      ].join('\n');

      await bot.api.sendMessage(this.chatId, text, { parse_mode: 'MarkdownV2' });

      this.sentCount++;
      return { provider: this.name, success: true };
    } catch (err) {
      return { provider: this.name, success: false, error: (err as Error).message };
    }
  }

  async shutdown(): Promise<void> {
    this.bot = null;
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getBot(): Promise<any> {
    if (this.bot) return this.bot;

    // Dynamic import — grammy is optional (variable path avoids TS module resolution)
    const modulePath = 'grammy';
    const { Bot } = await import(/* webpackIgnore: true */ modulePath);
    this.bot = new Bot(this.botToken!);
    return this.bot;
  }
}
