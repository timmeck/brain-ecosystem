/**
 * Notification Service — Aggregiert alle Notification Provider
 *
 * Architektur:
 *   NotificationService
 *     ├── InternalProvider (SQLite, default — immer da)
 *     ├── WebhookProvider (HTTP POST — already exists)
 *     ├── DiscordProvider (discord.js, optional)
 *     ├── TelegramProvider (grammy, optional)
 *     └── EmailProvider (nodemailer SMTP, optional)
 *
 * Event-Routing:
 *   Jeder Event-Typ kann an bestimmte Provider geroutet werden.
 *   Default: alle Events → alle verfügbaren Provider.
 *
 * Einrichten:
 *   ```typescript
 *   const service = new NotificationService(db);
 *   service.registerProvider(new DiscordProvider());
 *   service.registerProvider(new TelegramProvider());
 *   service.registerProvider(new EmailProvider());
 *
 *   // Optional: Event-Routing konfigurieren
 *   service.setEventRouting('system.error', ['discord', 'telegram', 'email']);
 *   service.setEventRouting('techradar.digest', ['telegram', 'email']);
 *   service.setEventRouting('learning.rule_created', ['internal']);
 *
 *   await service.notify({
 *     event: 'trade.signal',
 *     title: 'New Trading Signal',
 *     message: 'BTC breakout detected...',
 *     priority: 'high',
 *   });
 *   ```
 */

import Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type {
  NotificationProvider,
  Notification,
  NotificationResult,
  NotificationProviderStatus,
} from './notification-provider.js';

const log = getLogger();

// ── Migration ────────────────────────────────────────────

export function runNotificationMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      provider TEXT NOT NULL,
      success INTEGER NOT NULL DEFAULT 1,
      error TEXT,
      data_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notification_log_event ON notification_log(event);
    CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at);
  `);
}

// ── Service ──────────────────────────────────────────────

export class NotificationService {
  private providers: NotificationProvider[] = [];
  private eventRouting = new Map<string, string[]>(); // event → provider names
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    runNotificationMigration(db);
  }

  /** Register a notification provider */
  registerProvider(provider: NotificationProvider): void {
    if (this.providers.some(p => p.name === provider.name)) return;
    this.providers.push(provider);
    log.debug(`[Notifications] Registered provider: ${provider.name}`);
  }

  /** Remove a provider by name */
  removeProvider(name: string): void {
    this.providers = this.providers.filter(p => p.name !== name);
  }

  /** Get all registered providers */
  getProviders(): NotificationProvider[] {
    return [...this.providers];
  }

  /**
   * Set event routing: which providers handle which events.
   * If no routing is set, all providers receive all events.
   */
  setEventRouting(event: string, providerNames: string[]): void {
    this.eventRouting.set(event, providerNames);
  }

  /** Get current event routing */
  getEventRouting(): Record<string, string[]> {
    return Object.fromEntries(this.eventRouting);
  }

  /**
   * Send a notification to all relevant providers.
   * Uses event routing if configured, otherwise sends to all.
   */
  async notify(notification: Notification): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];
    notification.timestamp = notification.timestamp ?? Date.now();

    // Determine which providers should receive this event
    const targetProviders = this.getTargetProviders(notification.event);

    for (const provider of targetProviders) {
      try {
        const available = await provider.isAvailable();
        if (!available) {
          const result = { provider: provider.name, success: false, error: 'Provider not available' };
          results.push(result);
          this.logNotification(notification, result);
          continue;
        }

        const result = await provider.send(notification);
        results.push(result);
        this.logNotification(notification, result);
      } catch (err) {
        const result = { provider: provider.name, success: false, error: (err as Error).message };
        results.push(result);
        this.logNotification(notification, result);
      }
    }

    return results;
  }

  /** Get target providers for an event based on routing config */
  private getTargetProviders(event: string): NotificationProvider[] {
    const routing = this.eventRouting.get(event);
    if (!routing) return this.providers; // No routing → all providers

    return this.providers.filter(p => routing.includes(p.name));
  }

  /** Log notification to SQLite */
  private logNotification(notification: Notification, result: NotificationResult): void {
    try {
      this.db.prepare(`
        INSERT INTO notification_log (event, title, message, priority, provider, success, error, data_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        notification.event,
        notification.title,
        notification.message,
        notification.priority,
        result.provider,
        result.success ? 1 : 0,
        result.error ?? null,
        notification.data ? JSON.stringify(notification.data) : null,
      );
    } catch {
      // Best effort logging
    }
  }

  /** Get notification history */
  getHistory(options: { event?: string; limit?: number } = {}): Array<{
    id: number; event: string; title: string; message: string;
    priority: string; provider: string; success: boolean; error: string | null; created_at: string;
  }> {
    let sql = 'SELECT * FROM notification_log';
    const params: unknown[] = [];

    if (options.event) {
      sql += ' WHERE event = ?';
      params.push(options.event);
    }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(options.limit ?? 50);

    return (this.db.prepare(sql).all(...params) as any[]).map(r => ({
      ...r,
      success: r.success === 1,
    }));
  }

  /** Get provider status */
  async getProviderStatus(): Promise<NotificationProviderStatus[]> {
    return Promise.all(
      this.providers.map(async p => {
        let available = false;
        try { available = await p.isAvailable(); } catch { /* not available */ }
        return {
          name: p.name,
          available,
          sentCount: 0,
        };
      }),
    );
  }

  /** Graceful shutdown */
  async shutdown(): Promise<void> {
    for (const provider of this.providers) {
      if (provider.shutdown) {
        try { await provider.shutdown(); } catch { /* best effort */ }
      }
    }
  }
}
