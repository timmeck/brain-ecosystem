import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock IpcClient before importing
const mockRequest = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();

vi.mock('@timmeck/brain-core', () => ({
  IpcClient: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    request: mockRequest,
    disconnect: mockDisconnect,
  })),
}));

vi.mock('../../utils/paths.js', () => ({
  getPipeName: () => '\\\\.\\pipe\\brain-test',
}));

// Mirror the formatTag / formatNotification logic from prompt-submit.ts for unit testing
function formatTag(type: string, title?: string): string {
  const event = title ?? '';
  if (event.includes('position') || event.includes('paper')) return 'trade';
  if (event.includes('selfmod') || event.includes('improvement')) return 'self';
  if (event.includes('post:') || event.includes('campaign')) return 'mktg';
  if (event.includes('insight')) return 'insight';
  if (event.includes('rule') || event.includes('learn') || event.includes('calibrat')) return 'learn';
  if (event.includes('tech') || event.includes('radar')) return 'tech';
  if (type.includes('trading') || type.includes('position') || type.includes('paper')) return 'trade';
  if (type.includes('selfmod') || type.includes('self-mod') || type.includes('improvement')) return 'self';
  if (type.includes('marketing') || type.includes('post:') || type.includes('campaign')) return 'mktg';
  if (type.includes('insight')) return 'insight';
  if (type.includes('rule') || type.includes('learn') || type.includes('calibrat')) return 'learn';
  if (type.includes('tech') || type.includes('radar')) return 'tech';
  return 'info';
}

interface NotificationRecord {
  id: number;
  type: string;
  title: string;
  message: string;
  priority: number;
  created_at: string;
}

function formatNotification(n: NotificationRecord): string {
  const tag = formatTag(n.type, n.title);
  let detail = n.title;
  try {
    const data = JSON.parse(n.message);
    if (data.summary) {
      detail = data.summary;
    } else if (data.pnl !== undefined) {
      const pnlStr = data.pnl >= 0 ? `+$${data.pnl.toFixed(2)}` : `-$${Math.abs(data.pnl).toFixed(2)}`;
      const pctStr = data.pnlPct !== undefined ? ` (${data.pnlPct >= 0 ? '+' : ''}${data.pnlPct.toFixed(1)}%)` : '';
      detail = `${n.title}: ${pnlStr}${pctStr}`;
    } else if (data.pattern) {
      detail = `${n.title}: "${data.pattern}"`;
    } else {
      detail = n.title;
    }
  } catch {
    detail = n.title;
  }
  return `  [${tag}] ${detail}`;
}

// Mirror calcImportance from prompt-submit.ts for unit testing
const HIGH_IMPORTANCE_PATTERNS = [
  /\b(fix|bug|error|crash|fail|broken|exception)/i,
  /\b(decision|plan|strateg|priorit|direction)/i,
  /\b(hypothesis|experiment|a\/b|metric)/i,
  /\b(refactor|architect|migration|breaking)/i,
];

const MEDIUM_IMPORTANCE_PATTERNS = [
  /\b(implement|feature|add|create|build)/i,
  /\b(test|spec|assert|expect)/i,
  /\b(config|setting|option|parameter)/i,
];

function calcImportance(text: string, base: number): number {
  for (const pattern of HIGH_IMPORTANCE_PATTERNS) {
    if (pattern.test(text)) return 7;
  }
  for (const pattern of MEDIUM_IMPORTANCE_PATTERNS) {
    if (pattern.test(text)) return 6;
  }
  if (text.length > 300) return 6;
  if (text.length < 30) return 4;
  return base;
}

describe('prompt-submit hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockDisconnect.mockReturnValue(undefined);
  });

  describe('formatTag', () => {
    it('maps trade-related types to "trade"', () => {
      expect(formatTag('cross-brain:trading-brain', 'position:closed')).toBe('trade');
      expect(formatTag('position:closed')).toBe('trade');
      expect(formatTag('paper_trade')).toBe('trade');
    });

    it('maps learning types to "learn"', () => {
      expect(formatTag('cross-brain:trading-brain', 'rule:learned')).toBe('learn');
      expect(formatTag('calibration', 'updated')).toBe('learn');
    });

    it('maps selfmod types to "self"', () => {
      expect(formatTag('selfmod')).toBe('self');
      expect(formatTag('self-modification')).toBe('self');
      expect(formatTag('selfmod', 'Self-improvement suggestion')).toBe('self');
    });

    it('maps insight types', () => {
      expect(formatTag('cross-brain:trading-brain', 'insight:created')).toBe('insight');
    });

    it('maps marketing types to "mktg"', () => {
      expect(formatTag('cross-brain:marketing-brain', 'post:published')).toBe('mktg');
      expect(formatTag('campaign', 'campaign:created')).toBe('mktg');
      // rule:learned from marketing-brain maps to 'learn' (event > source)
      expect(formatTag('cross-brain:marketing-brain', 'rule:learned')).toBe('learn');
    });

    it('maps tech radar types', () => {
      expect(formatTag('techradar:scan')).toBe('tech');
    });

    it('defaults to "info"', () => {
      expect(formatTag('unknown')).toBe('info');
    });
  });

  describe('calcImportance', () => {
    it('returns 7 for error/bug/crash keywords', () => {
      expect(calcImportance('There is a bug in the login flow', 5)).toBe(7);
      expect(calcImportance('Fix the crash on startup', 5)).toBe(7);
      expect(calcImportance('Unhandled exception in parser', 5)).toBe(7);
    });

    it('returns 7 for decision/plan/strategy keywords', () => {
      expect(calcImportance('We need a decision on the architecture', 5)).toBe(7);
      expect(calcImportance('The strategy for Q2 marketing', 5)).toBe(7);
      expect(calcImportance('Prioritize the backlog items', 5)).toBe(7);
    });

    it('returns 7 for hypothesis/experiment keywords', () => {
      expect(calcImportance('Test the hypothesis about cycle count', 5)).toBe(7);
      expect(calcImportance('Run an a/b experiment on the engine', 5)).toBe(7);
      expect(calcImportance('Check the metric for accuracy', 5)).toBe(7);
    });

    it('returns 6 for implement/feature/test keywords', () => {
      expect(calcImportance('Implement the new sorting algorithm', 5)).toBe(6);
      expect(calcImportance('Add a feature for dark mode', 5)).toBe(6);
      expect(calcImportance('Write a test for the parser', 5)).toBe(6);
    });

    it('returns 6 for config/setting keywords', () => {
      expect(calcImportance('Update the config for production', 5)).toBe(6);
      expect(calcImportance('Change the setting for timeout', 5)).toBe(6);
    });

    it('uses length-based fallback', () => {
      expect(calcImportance('A'.repeat(301), 5)).toBe(6);  // >300 chars
      expect(calcImportance('short', 5)).toBe(4);           // <30 chars
      expect(calcImportance('A medium length prompt with some content here ok', 5)).toBe(5); // base
    });
  });

  describe('formatNotification', () => {
    it('formats trade close with P&L', () => {
      const n: NotificationRecord = {
        id: 1,
        type: 'cross-brain:trading-brain',
        title: 'position:closed',
        message: JSON.stringify({ pnl: 42.5, pnlPct: 2.1, symbol: 'BTC/USDT' }),
        priority: 0,
        created_at: '2026-03-06T12:00:00Z',
      };
      const result = formatNotification(n);
      expect(result).toContain('[trade]');
      expect(result).toContain('+$42.50');
      expect(result).toContain('+2.1%');
    });

    it('formats negative P&L correctly', () => {
      const n: NotificationRecord = {
        id: 2,
        type: 'cross-brain:trading-brain',
        title: 'position:closed',
        message: JSON.stringify({ pnl: -15.30, pnlPct: -1.5 }),
        priority: 0,
        created_at: '2026-03-06T12:00:00Z',
      };
      const result = formatNotification(n);
      expect(result).toContain('[trade]');
      expect(result).toContain('-$15.30');
      expect(result).toContain('-1.5%');
    });

    it('formats rule with pattern', () => {
      const n: NotificationRecord = {
        id: 3,
        type: 'cross-brain:trading-brain',
        title: 'rule:learned',
        message: JSON.stringify({ pattern: 'RSI<30 + MACD cross' }),
        priority: 0,
        created_at: '2026-03-06T12:00:00Z',
      };
      const result = formatNotification(n);
      expect(result).toContain('[learn]');
      expect(result).toContain('"RSI<30 + MACD cross"');
    });

    it('formats notification with summary', () => {
      const n: NotificationRecord = {
        id: 4,
        type: 'selfmod',
        title: 'Self-improvement suggestion',
        message: JSON.stringify({ summary: 'Extract common IPC patterns' }),
        priority: 0,
        created_at: '2026-03-06T12:00:00Z',
      };
      const result = formatNotification(n);
      expect(result).toContain('[self]');
      expect(result).toContain('Extract common IPC patterns');
    });

    it('falls back to title for unparseable message', () => {
      const n: NotificationRecord = {
        id: 5,
        type: 'info',
        title: 'Something happened',
        message: 'not json',
        priority: 0,
        created_at: '2026-03-06T12:00:00Z',
      };
      const result = formatNotification(n);
      expect(result).toContain('[info]');
      expect(result).toContain('Something happened');
    });
  });

  describe('IPC integration', () => {
    it('does nothing when no pending notifications', async () => {
      mockRequest.mockResolvedValue([]);
      const { IpcClient } = await import('@timmeck/brain-core');
      const client = new IpcClient('\\\\.\\pipe\\test', 3000);
      await client.connect();
      const pending = await client.request('notification.pending') as NotificationRecord[];
      expect(pending).toEqual([]);
    });

    it('calls notification.pending and notification.ackAll', async () => {
      const notifications = [
        { id: 1, type: 'selfmod', title: 'Test', message: '{}', priority: 0, created_at: '' },
      ];
      mockRequest
        .mockResolvedValueOnce(notifications)  // notification.pending
        .mockResolvedValueOnce({ acknowledged: 1 });  // notification.ackAll

      const { IpcClient } = await import('@timmeck/brain-core');
      const client = new IpcClient('\\\\.\\pipe\\test', 3000);
      await client.connect();

      const pending = await client.request('notification.pending');
      expect(pending).toEqual(notifications);

      const ack = await client.request('notification.ackAll');
      expect(ack).toEqual({ acknowledged: 1 });
    });
  });

  describe('transcript processing', () => {
    const STATE_FILE = path.join(os.homedir(), '.brain', 'transcript-state.json');
    let tmpDir: string;
    let origState: string | null = null;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-transcript-test-'));
      // Backup existing state file if present
      try {
        origState = fs.readFileSync(STATE_FILE, 'utf8');
      } catch {
        origState = null;
      }
    });

    afterEach(() => {
      // Restore original state
      if (origState !== null) {
        fs.writeFileSync(STATE_FILE, origState, 'utf8');
      } else {
        try { fs.unlinkSync(STATE_FILE); } catch { /* ok */ }
      }
      try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ok */ }
    });

    // Re-implement helpers locally for unit testing (same logic as prompt-submit.ts)
    function getLastProcessed(sessionId: string): string {
      try {
        const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        return data[sessionId] ?? '';
      } catch {
        return '';
      }
    }

    function saveLastProcessed(sessionId: string, timestamp: string): void {
      let data: Record<string, string> = {};
      try {
        data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      } catch { /* ok */ }
      data[sessionId] = timestamp;
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify(data), 'utf8');
    }

    interface TranscriptMessage {
      content: string;
      importance: number;
      tags: string[];
      timestamp: string;
    }

    function readNewTranscriptMessages(transcriptPath: string, lastTimestamp: string): TranscriptMessage[] {
      const raw = fs.readFileSync(transcriptPath, 'utf8');
      const lines = raw.split('\n').filter((l: string) => l.trim());
      const results: TranscriptMessage[] = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.type !== 'assistant') continue;
          if (!entry.timestamp) continue;
          if (lastTimestamp && entry.timestamp <= lastTimestamp) continue;
          const content = entry.message?.content;
          if (!Array.isArray(content)) continue;
          const textParts: string[] = [];
          for (const block of content) {
            if (block.type === 'text' && block.text) textParts.push(block.text);
          }
          if (textParts.length === 0) continue;
          let text = textParts.join('\n');
          if (text.length > 500) text = text.substring(0, 500) + '...';
          results.push({
            content: text,
            importance: text.length > 200 ? 7 : 5,
            tags: ['claude-code', 'assistant'],
            timestamp: entry.timestamp,
          });
        } catch { /* skip */ }
      }
      return results;
    }

    it('getLastProcessed returns empty for unknown session', () => {
      // Ensure clean state
      try { fs.unlinkSync(STATE_FILE); } catch { /* ok */ }
      expect(getLastProcessed('unknown-session')).toBe('');
    });

    it('saveLastProcessed + getLastProcessed roundtrip', () => {
      const ts = '2026-03-12T10:00:00.000Z';
      saveLastProcessed('test-session', ts);
      expect(getLastProcessed('test-session')).toBe(ts);
    });

    it('saveLastProcessed preserves other sessions', () => {
      saveLastProcessed('session-a', '2026-03-12T09:00:00.000Z');
      saveLastProcessed('session-b', '2026-03-12T10:00:00.000Z');
      expect(getLastProcessed('session-a')).toBe('2026-03-12T09:00:00.000Z');
      expect(getLastProcessed('session-b')).toBe('2026-03-12T10:00:00.000Z');
    });

    it('readNewTranscriptMessages extracts text from assistant messages', () => {
      const transcriptFile = path.join(tmpDir, 'test.jsonl');
      const lines = [
        JSON.stringify({ type: 'user', timestamp: '2026-03-12T10:00:00.000Z', message: { role: 'user', content: 'Hello' } }),
        JSON.stringify({ type: 'assistant', timestamp: '2026-03-12T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] } }),
        JSON.stringify({ type: 'assistant', timestamp: '2026-03-12T10:00:02.000Z', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'Let me help.' }] } }),
      ];
      fs.writeFileSync(transcriptFile, lines.join('\n'), 'utf8');

      const msgs = readNewTranscriptMessages(transcriptFile, '');
      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toBe('Hi there!');
      expect(msgs[0].importance).toBe(5); // short
      expect(msgs[1].content).toBe('Let me help.');
      expect(msgs[1].tags).toEqual(['claude-code', 'assistant']);
    });

    it('readNewTranscriptMessages skips messages before lastTimestamp', () => {
      const transcriptFile = path.join(tmpDir, 'test2.jsonl');
      const lines = [
        JSON.stringify({ type: 'assistant', timestamp: '2026-03-12T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Old message' }] } }),
        JSON.stringify({ type: 'assistant', timestamp: '2026-03-12T10:00:05.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'New message' }] } }),
      ];
      fs.writeFileSync(transcriptFile, lines.join('\n'), 'utf8');

      const msgs = readNewTranscriptMessages(transcriptFile, '2026-03-12T10:00:00.000Z');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('New message');
    });

    it('readNewTranscriptMessages skips tool_use-only messages', () => {
      const transcriptFile = path.join(tmpDir, 'test3.jsonl');
      const lines = [
        JSON.stringify({ type: 'assistant', timestamp: '2026-03-12T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read', input: {} }] } }),
      ];
      fs.writeFileSync(transcriptFile, lines.join('\n'), 'utf8');

      const msgs = readNewTranscriptMessages(transcriptFile, '');
      expect(msgs).toHaveLength(0);
    });

    it('readNewTranscriptMessages truncates long text to 500 chars', () => {
      const transcriptFile = path.join(tmpDir, 'test4.jsonl');
      const longText = 'A'.repeat(600);
      const lines = [
        JSON.stringify({ type: 'assistant', timestamp: '2026-03-12T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: longText }] } }),
      ];
      fs.writeFileSync(transcriptFile, lines.join('\n'), 'utf8');

      const msgs = readNewTranscriptMessages(transcriptFile, '');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toHaveLength(503); // 500 + '...'
      expect(msgs[0].content.endsWith('...')).toBe(true);
      expect(msgs[0].importance).toBe(7); // >200 chars
    });

    it('readNewTranscriptMessages handles malformed lines gracefully', () => {
      const transcriptFile = path.join(tmpDir, 'test5.jsonl');
      const lines = [
        'not json at all',
        JSON.stringify({ type: 'assistant', timestamp: '2026-03-12T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Valid' }] } }),
        '{broken json',
      ];
      fs.writeFileSync(transcriptFile, lines.join('\n'), 'utf8');

      const msgs = readNewTranscriptMessages(transcriptFile, '');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('Valid');
    });

    it('readNewTranscriptMessages joins multiple text blocks', () => {
      const transcriptFile = path.join(tmpDir, 'test6.jsonl');
      const lines = [
        JSON.stringify({ type: 'assistant', timestamp: '2026-03-12T10:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Part 1' }, { type: 'tool_use', id: 't1', name: 'Read', input: {} }, { type: 'text', text: 'Part 2' }] } }),
      ];
      fs.writeFileSync(transcriptFile, lines.join('\n'), 'utf8');

      const msgs = readNewTranscriptMessages(transcriptFile, '');
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe('Part 1\nPart 2');
    });
  });
});
