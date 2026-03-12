import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { BrainBot } from '../../../src/chat/brain-bot.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

describe('BrainBot', () => {
  let db: Database.Database;
  let bot: BrainBot;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    bot = new BrainBot(db, { platform: 'discord' });
  });

  afterEach(() => {
    db.close();
  });

  // ── Construction ────────────────────────────────────────

  it('should create tables on construction', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='brain_bot_log'").all();
    expect(tables.length).toBe(1);
  });

  // ── Message Parsing ─────────────────────────────────────

  it('should parse regular message', () => {
    const msg = bot.parseMessage('discord', 'user1', 'Hello brain!');
    expect(msg.isCommand).toBe(false);
    expect(msg.content).toBe('Hello brain!');
    expect(msg.platform).toBe('discord');
    expect(msg.userId).toBe('user1');
  });

  it('should parse slash command', () => {
    const msg = bot.parseMessage('telegram', 'user2', '/status');
    expect(msg.isCommand).toBe(true);
    expect(msg.command).toBe('status');
    expect(msg.args).toEqual([]);
  });

  it('should parse command with args', () => {
    const msg = bot.parseMessage('generic', 'user3', '/predict accuracy rate');
    expect(msg.isCommand).toBe(true);
    expect(msg.command).toBe('predict');
    expect(msg.args).toEqual(['accuracy', 'rate']);
  });

  it('should parse command with channel', () => {
    const msg = bot.parseMessage('discord', 'user1', '/help', 'channel-123');
    expect(msg.channelId).toBe('channel-123');
  });

  // ── Command Processing ──────────────────────────────────

  it('should handle /help command', async () => {
    const msg = bot.parseMessage('generic', 'user1', '/help');
    const response = await bot.processMessage(msg);
    expect(response.text).toContain('Available Commands');
    expect(response.text).toContain('/status');
    expect(response.text).toContain('/research');
  });

  it('should handle unknown command', async () => {
    const msg = bot.parseMessage('generic', 'user1', '/nonexistent');
    const response = await bot.processMessage(msg);
    expect(response.text).toContain('Unknown command');
    expect(response.text).toContain('/help');
  });

  it('should handle /status without IPC', async () => {
    const msg = bot.parseMessage('generic', 'user1', '/status');
    const response = await bot.processMessage(msg);
    expect(response.text).toContain('IPC not connected');
  });

  it('should handle /status with IPC', async () => {
    const ipc = vi.fn().mockResolvedValue({ errors: { total: 42 }, insights: { active: 10 } });
    bot.setIpcDispatch(ipc);
    const msg = bot.parseMessage('generic', 'user1', '/status');
    const response = await bot.processMessage(msg);
    expect(response.text).toContain('Brain Status');
    expect(ipc).toHaveBeenCalledWith('brain.status');
  });

  it('should handle /research with args', async () => {
    const ipc = vi.fn().mockResolvedValue({ id: 7, topic: 'AI reasoning' });
    bot.setIpcDispatch(ipc);
    const msg = bot.parseMessage('generic', 'user1', '/research AI reasoning');
    const response = await bot.processMessage(msg);
    expect(response.text).toContain('Research mission started');
    expect(response.text).toContain('AI reasoning');
    expect(ipc).toHaveBeenCalledWith('research.mission', { topic: 'AI reasoning', depth: 'standard' });
  });

  // ── Natural Language ────────────────────────────────────

  it('should fallback when no ChatEngine', async () => {
    const msg = bot.parseMessage('generic', 'user1', 'What is the status?');
    const response = await bot.processMessage(msg);
    expect(response.text).toContain('ChatEngine not connected');
  });

  it('should route through ChatEngine when available', async () => {
    const mockChat = {
      processMessage: vi.fn().mockResolvedValue({ content: 'Brain is healthy. 42 errors tracked.' }),
    };
    bot.setChatEngine(mockChat as never);
    const msg = bot.parseMessage('discord', 'user1', 'How is the brain doing?');
    const response = await bot.processMessage(msg);
    expect(response.text).toContain('Brain is healthy');
    expect(mockChat.processMessage).toHaveBeenCalledWith('bot_discord_user1', 'How is the brain doing?');
  });

  // ── Response Formatting ─────────────────────────────────

  it('should include Discord embed for Discord messages', async () => {
    const msg = bot.parseMessage('discord', 'user1', '/help');
    const response = await bot.processMessage(msg);
    expect(response.embed).toBeDefined();
    expect(response.embed!.color).toBe(0x7289DA);
    expect(response.embed!.title).toBe('Brain');
    expect(response.markdown).toBeDefined();
  });

  it('should include HTML for Telegram messages', async () => {
    const msg = bot.parseMessage('telegram', 'user1', '/help');
    const response = await bot.processMessage(msg);
    expect(response.html).toBeDefined();
    expect(response.html).toContain('<b>');
  });

  // ── Logging ─────────────────────────────────────────────

  it('should log messages to database', async () => {
    const msg = bot.parseMessage('discord', 'user1', '/help', 'ch-1');
    await bot.processMessage(msg);
    const rows = db.prepare('SELECT * FROM brain_bot_log').all() as Array<Record<string, unknown>>;
    expect(rows.length).toBe(1);
    expect(rows[0]!.platform).toBe('discord');
    expect(rows[0]!.user_id).toBe('user1');
    expect(rows[0]!.channel_id).toBe('ch-1');
    expect(rows[0]!.is_command).toBe(1);
    expect(rows[0]!.command).toBe('help');
  });

  // ── Status ──────────────────────────────────────────────

  it('should report accurate status', async () => {
    const msg1 = bot.parseMessage('generic', 'user1', '/help');
    const msg2 = bot.parseMessage('generic', 'user1', 'hello');
    await bot.processMessage(msg1);
    await bot.processMessage(msg2);

    const status = bot.getStatus();
    expect(status.platform).toBe('discord');
    expect(status.messagesProcessed).toBe(2);
    expect(status.commandsProcessed).toBe(1);
    expect(status.errors).toBe(0);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  // ── Command Definitions ─────────────────────────────────

  it('should return command definitions for platform registration', () => {
    const defs = bot.getCommandDefinitions();
    expect(defs.length).toBeGreaterThanOrEqual(5);
    const names = defs.map(d => d.name);
    expect(names).toContain('status');
    expect(names).toContain('help');
    expect(names).toContain('research');
    expect(names).toContain('predict');
    expect(names).toContain('report');
  });
});
