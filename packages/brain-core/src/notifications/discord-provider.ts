/**
 * Discord Notification Provider — Bot Messages
 *
 * Einrichten:
 *   1. Discord Bot erstellen: https://discord.com/developers/applications
 *      → Bot → Add Bot → Token kopieren
 *      → OAuth2 → URL Generator → Scope: bot → Permissions: Send Messages
 *      → Bot zum Server einladen
 *   2. In .env:
 *      DISCORD_BOT_TOKEN=...
 *      DISCORD_CHANNEL_ID=...    (Rechtsklick auf Channel → Copy Channel ID)
 */

import { getLogger } from '../utils/logger.js';
import type { NotificationProvider, Notification, NotificationResult } from './notification-provider.js';

export interface DiscordProviderConfig {
  botToken?: string;
  channelId?: string;
}

const PRIORITY_COLORS: Record<string, number> = {
  critical: 0xFF0000,  // red
  high: 0xFF8C00,      // orange
  medium: 0xFFD700,    // gold
  low: 0x32CD32,       // green
};

export class DiscordProvider implements NotificationProvider {
  readonly name = 'discord';

  private readonly botToken: string | null;
  private readonly channelId: string | null;
  private readonly log = getLogger();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any = null;
  private sentCount = 0;

  constructor(config: DiscordProviderConfig = {}) {
    this.botToken = config.botToken ?? process.env.DISCORD_BOT_TOKEN ?? null;
    this.channelId = config.channelId ?? process.env.DISCORD_CHANNEL_ID ?? null;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.botToken || !this.channelId) return false;
    try {
      await this.getClient();
      return true;
    } catch {
      return false;
    }
  }

  async send(notification: Notification): Promise<NotificationResult> {
    try {
      const client = await this.getClient();
      const channel = await client.channels.fetch(this.channelId);

      if (!channel || !('send' in channel)) {
        return { provider: this.name, success: false, error: 'Channel not found or not sendable' };
      }

      await channel.send({
        embeds: [{
          title: notification.title,
          description: notification.message,
          color: PRIORITY_COLORS[notification.priority] ?? 0x808080,
          timestamp: new Date(notification.timestamp ?? Date.now()).toISOString(),
          footer: { text: `Brain Ecosystem — ${notification.event}` },
        }],
      });

      this.sentCount++;
      return { provider: this.name, success: true };
    } catch (err) {
      return { provider: this.name, success: false, error: (err as Error).message };
    }
  }

  async shutdown(): Promise<void> {
    if (this.client) {
      try { await this.client.destroy(); } catch { /* best effort */ }
      this.client = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    if (this.client) return this.client;

    // Dynamic import — discord.js is optional (variable path avoids TS module resolution)
    const modulePath = 'discord.js';
    const { Client, GatewayIntentBits } = await import(/* webpackIgnore: true */ modulePath);

    this.client = new Client({
      intents: [GatewayIntentBits.Guilds],
    });

    await this.client.login(this.botToken);
    return this.client;
  }
}
