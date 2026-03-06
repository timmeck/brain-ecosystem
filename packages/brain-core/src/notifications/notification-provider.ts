/**
 * Notification Provider Interface — Multi-Channel Notifications
 *
 * ═══════════════════════════════════════════════════════════════
 *  PROVIDER EINRICHTEN
 * ═══════════════════════════════════════════════════════════════
 *
 *  InternalProvider (default):
 *    → Speichert Notifications in SQLite. Keine Config nötig.
 *
 *  WebhookProvider (bereits vorhanden):
 *    → WebhookService für HTTP POST Notifications.
 *
 *  Discord (optional):
 *    1. Discord Bot erstellen: https://discord.com/developers/applications
 *       → Bot → Add Bot → Token kopieren
 *       → OAuth2 → URL Generator → Scope: bot → Permissions: Send Messages
 *       → Bot zum Server einladen
 *    2. In .env:
 *       DISCORD_BOT_TOKEN=...
 *       DISCORD_CHANNEL_ID=...    (Rechtsklick auf Channel → Copy Channel ID)
 *
 *  Telegram (optional):
 *    1. Bot erstellen: https://t.me/BotFather → /newbot
 *       → Token kopieren
 *    2. Chat ID finden: Message an Bot senden, dann
 *       https://api.telegram.org/bot<TOKEN>/getUpdates → chat.id
 *    3. In .env:
 *       TELEGRAM_BOT_TOKEN=...
 *       TELEGRAM_CHAT_ID=...
 *
 *  Email (optional):
 *    1. SMTP Server konfigurieren (Gmail, Outlook, eigener SMTP)
 *    2. In .env:
 *       SMTP_HOST=smtp.gmail.com
 *       SMTP_PORT=587
 *       SMTP_USER=deine@email.com
 *       SMTP_PASS=app-password       (Gmail: App-Passwort erstellen!)
 *       NOTIFICATION_EMAIL_TO=empfaenger@email.com
 *
 *  Eigenen Provider bauen:
 *    Implementiere NotificationProvider, registriere mit
 *    notificationService.registerProvider(new MyProvider())
 * ═══════════════════════════════════════════════════════════════
 */

// ── Types ────────────────────────────────────────────────

export interface Notification {
  event: NotificationEvent;
  title: string;
  message: string;
  priority: NotificationPriority;
  data?: Record<string, unknown>;
  timestamp?: number;
}

export type NotificationPriority = 'critical' | 'high' | 'medium' | 'low';

export type NotificationEvent =
  | 'mission.complete'
  | 'trade.signal'
  | 'trade.closed'
  | 'learning.rule_created'
  | 'selfmod.proposal'
  | 'techradar.digest'
  | 'techradar.opportunity'
  | 'system.error'
  | 'system.health'
  | string;  // extensible

export interface NotificationResult {
  provider: string;
  success: boolean;
  error?: string;
}

// ── Provider Interface ───────────────────────────────────

export interface NotificationProvider {
  /** Unique provider name (e.g. 'discord', 'telegram', 'email') */
  readonly name: string;

  /** Check if provider is configured and reachable */
  isAvailable(): Promise<boolean>;

  /** Send a notification */
  send(notification: Notification): Promise<NotificationResult>;

  /** Graceful shutdown */
  shutdown?(): Promise<void>;
}

// ── Provider Status ──────────────────────────────────────

export interface NotificationProviderStatus {
  name: string;
  available: boolean;
  sentCount: number;
}
