// ── BrainBot ───────────────────────────────────────────────
//
// Bridge zwischen Chat-Plattformen (Discord, Telegram) und ChatEngine.
// Empfängt Nachrichten, routet durch ChatEngine, sendet Antwort zurück.
//
// Unterstützt Slash-Commands: /status, /report, /predict, /research
// Response-Formatter für Discord Embed und Telegram HTML.

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ChatEngine } from './chat-engine.js';

// ── Types ─────────────────────────────────────────────────

export interface BrainBotConfig {
  /** Max response length. Default: 2000 */
  maxResponseLength?: number;
  /** Session prefix for platform isolation. Default: 'bot' */
  sessionPrefix?: string;
  /** Platform: discord | telegram | generic. Default: 'generic' */
  platform?: 'discord' | 'telegram' | 'generic';
}

export interface BotMessage {
  platform: 'discord' | 'telegram' | 'generic';
  userId: string;
  channelId?: string;
  content: string;
  isCommand: boolean;
  command?: string;
  args?: string[];
}

export interface BotResponse {
  text: string;
  markdown?: string;
  html?: string;
  embed?: DiscordEmbed;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

export interface BrainBotStatus {
  platform: string;
  messagesProcessed: number;
  commandsProcessed: number;
  errors: number;
  uptime: number;
}

// ── Migration ─────────────────────────────────────────────

export function runBrainBotMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS brain_bot_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      user_id TEXT NOT NULL,
      channel_id TEXT,
      content TEXT NOT NULL,
      response TEXT,
      is_command INTEGER DEFAULT 0,
      command TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_bot_log_created ON brain_bot_log(created_at);
  `);
}

// ── Slash Commands ────────────────────────────────────────

interface SlashCommand {
  name: string;
  description: string;
  handler: (args: string[], ipc: IpcDispatch | null) => Promise<string>;
}

type IpcDispatch = (route: string, payload?: Record<string, unknown>) => Promise<Record<string, unknown>>;

function buildSlashCommands(): SlashCommand[] {
  return [
    {
      name: 'status',
      description: 'Show Brain status summary',
      handler: async (_args, ipc) => {
        if (!ipc) return 'IPC not connected. Run `brain start` first.';
        try {
          const data = await ipc('brain.status') as Record<string, unknown>;
          const lines = ['**Brain Status**'];
          if (data.errors) lines.push(`Errors: ${JSON.stringify(data.errors)}`);
          if (data.insights) lines.push(`Insights: ${JSON.stringify(data.insights)}`);
          if (data.hypotheses) lines.push(`Hypotheses: ${JSON.stringify(data.hypotheses)}`);
          if (data.predictions) lines.push(`Predictions: ${JSON.stringify(data.predictions)}`);
          return lines.join('\n');
        } catch (err) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },
    {
      name: 'report',
      description: 'Generate a quick status report',
      handler: async (_args, ipc) => {
        if (!ipc) return 'IPC not connected.';
        try {
          const data = await ipc('brain.report') as Record<string, unknown>;
          return typeof data.summary === 'string' ? data.summary : JSON.stringify(data).slice(0, 1500);
        } catch (err) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },
    {
      name: 'predict',
      description: 'Get prediction for a metric',
      handler: async (args, ipc) => {
        if (!ipc) return 'IPC not connected.';
        const metric = args[0] ?? 'general';
        try {
          const data = await ipc('prediction.predict', { metric }) as Record<string, unknown>;
          return `**Prediction for "${metric}":**\n${JSON.stringify(data, null, 2).slice(0, 1000)}`;
        } catch (err) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },
    {
      name: 'research',
      description: 'Start a research mission on a topic',
      handler: async (args, ipc) => {
        if (!ipc) return 'IPC not connected.';
        const topic = args.join(' ') || 'general trends';
        try {
          const data = await ipc('research.mission', { topic, depth: 'standard' }) as Record<string, unknown>;
          return `**Research mission started:**\nTopic: ${topic}\nID: ${data.id ?? 'pending'}`;
        } catch (err) {
          return `Error: ${(err as Error).message}`;
        }
      },
    },
    {
      name: 'help',
      description: 'Show available commands',
      handler: async () => {
        return [
          '**Available Commands:**',
          '`/status` — Brain status summary',
          '`/report` — Quick status report',
          '`/predict <metric>` — Get prediction',
          '`/research <topic>` — Start research mission',
          '`/help` — This help message',
          '',
          'You can also ask questions in natural language!',
        ].join('\n');
      },
    },
  ];
}

// ── Response Formatting ──────────────────────────────────

function toDiscordEmbed(text: string, title = 'Brain'): DiscordEmbed {
  return {
    title,
    description: text.slice(0, 4096),
    color: 0x7289DA, // Discord blurple
    footer: { text: 'Brain Ecosystem' },
    timestamp: new Date().toISOString(),
  };
}

function toTelegramHTML(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '\n');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '...';
}

// ── BrainBot ─────────────────────────────────────────────

export class BrainBot {
  private readonly db: Database.Database;
  private readonly config: Required<BrainBotConfig>;
  private readonly log = getLogger();
  private chatEngine: ChatEngine | null = null;
  private ipcDispatch: IpcDispatch | null = null;
  private readonly commands: SlashCommand[];
  private messagesProcessed = 0;
  private commandsProcessed = 0;
  private errors = 0;
  private readonly startTime = Date.now();

  // Prepared statements
  private readonly stmtLog;

  constructor(db: Database.Database, config: BrainBotConfig = {}) {
    this.db = db;
    this.config = {
      maxResponseLength: config.maxResponseLength ?? 2000,
      sessionPrefix: config.sessionPrefix ?? 'bot',
      platform: config.platform ?? 'generic',
    };

    runBrainBotMigration(db);

    this.stmtLog = db.prepare(
      'INSERT INTO brain_bot_log (platform, user_id, channel_id, content, response, is_command, command, duration_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );

    this.commands = buildSlashCommands();
  }

  // ── Setters ────────────────────────────────────────────

  setChatEngine(engine: ChatEngine): void { this.chatEngine = engine; }
  setIpcDispatch(dispatch: IpcDispatch): void { this.ipcDispatch = dispatch; }

  // ── Message Processing ─────────────────────────────────

  /** Parse an incoming message into a BotMessage. */
  parseMessage(platform: 'discord' | 'telegram' | 'generic', userId: string, content: string, channelId?: string): BotMessage {
    const trimmed = content.trim();
    const isCommand = trimmed.startsWith('/');

    if (isCommand) {
      const parts = trimmed.slice(1).split(/\s+/);
      return {
        platform, userId, channelId, content: trimmed,
        isCommand: true,
        command: parts[0]!.toLowerCase(),
        args: parts.slice(1),
      };
    }

    return { platform, userId, channelId, content: trimmed, isCommand: false };
  }

  /** Process a message and return a response. */
  async processMessage(msg: BotMessage): Promise<BotResponse> {
    const start = Date.now();

    try {
      let responseText: string;

      if (msg.isCommand && msg.command) {
        // Handle slash command
        const cmd = this.commands.find(c => c.name === msg.command);
        if (cmd) {
          responseText = await cmd.handler(msg.args ?? [], this.ipcDispatch);
          this.commandsProcessed++;
        } else {
          responseText = `Unknown command: /${msg.command}. Type /help for available commands.`;
        }
      } else if (this.chatEngine) {
        // Route through ChatEngine for natural language
        const sessionId = `${this.config.sessionPrefix}_${msg.platform}_${msg.userId}`;
        const chatMsg = await this.chatEngine.processMessage(sessionId, msg.content);
        responseText = chatMsg.content;
      } else {
        responseText = 'ChatEngine not connected. Use /commands or connect ChatEngine for natural language.';
      }

      this.messagesProcessed++;

      // Format response
      const text = truncate(responseText, this.config.maxResponseLength);
      const response: BotResponse = { text };

      if (msg.platform === 'discord') {
        response.embed = toDiscordEmbed(text);
        response.markdown = text;
      } else if (msg.platform === 'telegram') {
        response.html = toTelegramHTML(text);
      }

      // Log
      const duration = Date.now() - start;
      this.stmtLog.run(
        msg.platform, msg.userId, msg.channelId ?? null,
        msg.content, text.slice(0, 500),
        msg.isCommand ? 1 : 0, msg.command ?? null, duration,
      );

      return response;
    } catch (err) {
      this.errors++;
      this.log.error(`[brain-bot] Error processing message: ${(err as Error).message}`);
      return { text: `Error: ${(err as Error).message}` };
    }
  }

  // ── Command Registration ──────────────────────────────

  /** Get all slash commands for platform registration (e.g. Discord slash commands). */
  getCommandDefinitions(): Array<{ name: string; description: string }> {
    return this.commands.map(c => ({ name: c.name, description: c.description }));
  }

  // ── Status ────────────────────────────────────────────

  getStatus(): BrainBotStatus {
    return {
      platform: this.config.platform,
      messagesProcessed: this.messagesProcessed,
      commandsProcessed: this.commandsProcessed,
      errors: this.errors,
      uptime: Date.now() - this.startTime,
    };
  }
}
