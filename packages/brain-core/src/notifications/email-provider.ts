/**
 * Email Notification Provider — SMTP via nodemailer
 *
 * Einrichten:
 *   1. SMTP Server konfigurieren (Gmail, Outlook, eigener SMTP)
 *      Gmail: App-Passwort erstellen unter
 *      https://myaccount.google.com/apppasswords
 *   2. In .env:
 *      SMTP_HOST=smtp.gmail.com
 *      SMTP_PORT=587
 *      SMTP_USER=deine@email.com
 *      SMTP_PASS=app-password
 *      NOTIFICATION_EMAIL_TO=empfaenger@email.com
 *      NOTIFICATION_EMAIL_FROM=Brain Ecosystem <brain@example.com>   (optional)
 */

import { getLogger } from '../utils/logger.js';
import type { NotificationProvider, Notification, NotificationResult } from './notification-provider.js';

export interface EmailProviderConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  from?: string;
  to?: string;
}

export class EmailProvider implements NotificationProvider {
  readonly name = 'email';

  private readonly smtpHost: string | null;
  private readonly smtpPort: number;
  private readonly smtpUser: string | null;
  private readonly smtpPass: string | null;
  private readonly from: string;
  private readonly to: string | null;
  private readonly log = getLogger();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transporter: any = null;
  private sentCount = 0;

  constructor(config: EmailProviderConfig = {}) {
    this.smtpHost = config.smtpHost ?? process.env.SMTP_HOST ?? null;
    this.smtpPort = config.smtpPort ?? Number(process.env.SMTP_PORT ?? 587);
    this.smtpUser = config.smtpUser ?? process.env.SMTP_USER ?? null;
    this.smtpPass = config.smtpPass ?? process.env.SMTP_PASS ?? null;
    this.from = config.from ?? process.env.NOTIFICATION_EMAIL_FROM ?? `Brain Ecosystem <${this.smtpUser ?? 'brain@localhost'}>`;
    this.to = config.to ?? process.env.NOTIFICATION_EMAIL_TO ?? null;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.smtpHost || !this.smtpUser || !this.smtpPass || !this.to) return false;
    try {
      const transporter = await this.getTransporter();
      await transporter.verify();
      return true;
    } catch {
      return false;
    }
  }

  async send(notification: Notification): Promise<NotificationResult> {
    try {
      const transporter = await this.getTransporter();

      const priorityLabel = notification.priority === 'critical' ? '[CRITICAL] ' :
        notification.priority === 'high' ? '[HIGH] ' : '';

      await transporter.sendMail({
        from: this.from,
        to: this.to,
        subject: `${priorityLabel}Brain: ${notification.title}`,
        text: `${notification.title}\n\n${notification.message}\n\nEvent: ${notification.event}\nPriority: ${notification.priority}\nTime: ${new Date(notification.timestamp ?? Date.now()).toISOString()}`,
        html: `
          <h2>${notification.title}</h2>
          <p>${notification.message.replace(/\n/g, '<br>')}</p>
          <hr>
          <small>Event: ${notification.event} | Priority: ${notification.priority} | ${new Date(notification.timestamp ?? Date.now()).toISOString()}</small>
        `,
      });

      this.sentCount++;
      return { provider: this.name, success: true };
    } catch (err) {
      return { provider: this.name, success: false, error: (err as Error).message };
    }
  }

  async shutdown(): Promise<void> {
    if (this.transporter) {
      try { this.transporter.close(); } catch { /* best effort */ }
      this.transporter = null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getTransporter(): Promise<any> {
    if (this.transporter) return this.transporter;

    // Dynamic import — nodemailer is optional (variable path avoids TS module resolution)
    const modulePath = 'nodemailer';
    const nodemailer = await import(/* webpackIgnore: true */ modulePath);
    this.transporter = nodemailer.createTransport({
      host: this.smtpHost,
      port: this.smtpPort,
      secure: this.smtpPort === 465,
      auth: {
        user: this.smtpUser,
        pass: this.smtpPass,
      },
    } as any);

    return this.transporter;
  }
}
