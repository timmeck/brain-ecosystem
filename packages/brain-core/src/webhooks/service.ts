import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface WebhookConfig {
  id?: number;
  url: string;
  events: string[];       // e.g. ['error:reported', 'trade:recorded']
  secret?: string;        // HMAC-SHA256 signing secret
  active?: boolean;
  name?: string;
}

export interface WebhookRecord {
  id: number;
  url: string;
  events: string;         // JSON array
  secret: string | null;
  active: number;
  name: string | null;
  created_at: string;
}

export interface DeliveryRecord {
  id: number;
  webhook_id: number;
  event: string;
  payload: string;
  status: number;         // HTTP status code, 0 = network error
  response: string | null;
  attempts: number;
  created_at: string;
}

export interface WebhookDeliveryResult {
  webhookId: number;
  url: string;
  status: number;
  success: boolean;
  attempts: number;
}

// ── Migration ───────────────────────────────────────────

export function runWebhookMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      secret TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      payload TEXT NOT NULL,
      status INTEGER NOT NULL DEFAULT 0,
      response TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
  `);
}

// ── Service ─────────────────────────────────────────────

export class WebhookService {
  private logger = getLogger();
  private retryDelays = [1000, 3000, 10000]; // 1s, 3s, 10s

  constructor(private db: Database.Database) {
    runWebhookMigration(db);
  }

  /** Register a new webhook endpoint. */
  add(config: WebhookConfig): WebhookRecord {
    const stmt = this.db.prepare(`
      INSERT INTO webhooks (url, events, secret, active, name)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      config.url,
      JSON.stringify(config.events),
      config.secret ?? null,
      config.active !== false ? 1 : 0,
      config.name ?? null,
    );
    this.logger.info(`Webhook #${info.lastInsertRowid} registered: ${config.url}`);
    return this.get(Number(info.lastInsertRowid))!;
  }

  /** Remove a webhook by ID. */
  remove(id: number): boolean {
    const info = this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
    return info.changes > 0;
  }

  /** Get a single webhook by ID. */
  get(id: number): WebhookRecord | null {
    return this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRecord | null;
  }

  /** List all webhooks. */
  list(): WebhookRecord[] {
    return this.db.prepare('SELECT * FROM webhooks ORDER BY created_at DESC').all() as WebhookRecord[];
  }

  /** Toggle a webhook active/inactive. */
  toggle(id: number, active: boolean): boolean {
    const info = this.db.prepare('UPDATE webhooks SET active = ? WHERE id = ?').run(active ? 1 : 0, id);
    return info.changes > 0;
  }

  /** Get delivery history for a webhook (most recent first). */
  history(webhookId?: number, limit = 50): DeliveryRecord[] {
    if (webhookId) {
      return this.db.prepare(
        'SELECT * FROM webhook_deliveries WHERE webhook_id = ? ORDER BY created_at DESC LIMIT ?',
      ).all(webhookId, limit) as DeliveryRecord[];
    }
    return this.db.prepare(
      'SELECT * FROM webhook_deliveries ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as DeliveryRecord[];
  }

  /**
   * Fire an event to all matching webhooks.
   * Returns delivery results (non-blocking — fire and forget with retry).
   */
  async fire(event: string, data: unknown): Promise<WebhookDeliveryResult[]> {
    const webhooks = this.db.prepare(
      'SELECT * FROM webhooks WHERE active = 1',
    ).all() as WebhookRecord[];

    const matching = webhooks.filter(wh => {
      const events: string[] = JSON.parse(wh.events);
      return events.includes('*') || events.includes(event);
    });

    if (matching.length === 0) return [];

    const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    const results: WebhookDeliveryResult[] = [];

    await Promise.all(matching.map(async (wh) => {
      const result = await this.deliver(wh, event, payload);
      results.push(result);
    }));

    return results;
  }

  /** Deliver a payload to a single webhook with retries. */
  private async deliver(
    wh: WebhookRecord,
    event: string,
    payload: string,
  ): Promise<WebhookDeliveryResult> {
    let lastStatus = 0;
    let lastResponse: string | null = null;
    let attempts = 0;

    for (let i = 0; i <= this.retryDelays.length; i++) {
      attempts++;
      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
        };

        // HMAC signing
        if (wh.secret) {
          const signature = crypto
            .createHmac('sha256', wh.secret)
            .update(payload)
            .digest('hex');
          headers['X-Webhook-Signature'] = `sha256=${signature}`;
        }

        const response = await fetch(wh.url, {
          method: 'POST',
          headers,
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });

        lastStatus = response.status;
        lastResponse = await response.text().catch(() => null);

        if (response.ok) {
          this.recordDelivery(wh.id, event, payload, lastStatus, lastResponse, attempts);
          return { webhookId: wh.id, url: wh.url, status: lastStatus, success: true, attempts };
        }
      } catch (err) {
        lastStatus = 0;
        lastResponse = err instanceof Error ? err.message : String(err);
      }

      // Retry delay (don't delay after last attempt)
      if (i < this.retryDelays.length) {
        await this.delay(this.retryDelays[i]!);
      }
    }

    // All retries exhausted
    this.recordDelivery(wh.id, event, payload, lastStatus, lastResponse, attempts);
    this.logger.warn(`Webhook #${wh.id} delivery failed after ${attempts} attempts: ${wh.url}`);
    return { webhookId: wh.id, url: wh.url, status: lastStatus, success: false, attempts };
  }

  private recordDelivery(
    webhookId: number, event: string, payload: string,
    status: number, response: string | null, attempts: number,
  ): void {
    this.db.prepare(`
      INSERT INTO webhook_deliveries (webhook_id, event, payload, status, response, attempts)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(webhookId, event, payload, status, response, attempts);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Cleanup old delivery records. */
  cleanup(olderThanDays = 30): number {
    const info = this.db.prepare(
      `DELETE FROM webhook_deliveries WHERE created_at < datetime('now', '-' || ? || ' days')`,
    ).run(olderThanDays);
    return info.changes;
  }
}
