#!/usr/bin/env node

// UserPromptSubmit hook — injects Brain's pending notifications into Claude's context.
// Connects to Brain daemon via IPC, fetches unread notifications, prints them to stdout,
// then acknowledges them so they don't appear again.

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IpcClient } from '@timmeck/brain-core';
import { getPipeName } from '../utils/paths.js';

interface NotificationRecord {
  id: number;
  type: string;
  title: string;
  message: string;
  priority: number;
  created_at: string;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

// --- Transcript state persistence ---
const STATE_FILE = path.join(os.homedir(), '.brain', 'transcript-state.json');

interface TranscriptState {
  [sessionId: string]: string; // ISO timestamp
}

function getLastProcessed(sessionId: string): string {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as TranscriptState;
    return data[sessionId] ?? '';
  } catch {
    return '';
  }
}

function saveLastProcessed(sessionId: string, timestamp: string): void {
  let data: TranscriptState = {};
  try {
    data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) as TranscriptState;
  } catch { /* file doesn't exist yet */ }
  data[sessionId] = timestamp;
  fs.writeFileSync(STATE_FILE, JSON.stringify(data), 'utf8');
}

interface TranscriptMessage {
  content: string;
  importance: number;
  tags: string[];
  timestamp: string;
}

interface TranscriptLine {
  type?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string }>;
  };
}

function readNewTranscriptMessages(transcriptPath: string, lastTimestamp: string): TranscriptMessage[] {
  const raw = fs.readFileSync(transcriptPath, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());
  const results: TranscriptMessage[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as TranscriptLine;
      if (entry.type !== 'assistant') continue;
      if (!entry.timestamp) continue;
      if (lastTimestamp && entry.timestamp <= lastTimestamp) continue;

      const content = entry.message?.content;
      if (!Array.isArray(content)) continue;

      // Extract only text blocks, skip tool_use/thinking
      const textParts: string[] = [];
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          textParts.push(block.text);
        }
      }
      if (textParts.length === 0) continue;

      let text = textParts.join('\n');
      // Truncate long responses
      if (text.length > 500) {
        text = text.substring(0, 500) + '...';
      }

      results.push({
        content: text,
        importance: text.length > 200 ? 7 : 5,
        tags: ['claude-code', 'assistant'],
        timestamp: entry.timestamp,
      });
    } catch { /* malformed line — skip */ }
  }

  return results;
}

function formatTag(type: string, title?: string): string {
  // For cross-brain types, derive category from the event title first
  const event = title ?? '';
  if (event.includes('position') || event.includes('paper')) return 'trade';
  if (event.includes('selfmod') || event.includes('improvement')) return 'self';
  if (event.includes('post:') || event.includes('campaign')) return 'mktg';
  if (event.includes('insight')) return 'insight';
  if (event.includes('rule') || event.includes('learn') || event.includes('calibrat')) return 'learn';
  if (event.includes('tech') || event.includes('radar')) return 'tech';
  // Fallback: check type itself
  if (type.includes('trading') || type.includes('position') || type.includes('paper')) return 'trade';
  if (type.includes('selfmod') || type.includes('self-mod') || type.includes('improvement')) return 'self';
  if (type.includes('marketing') || type.includes('post:') || type.includes('campaign')) return 'mktg';
  if (type.includes('insight')) return 'insight';
  if (type.includes('rule') || type.includes('learn') || type.includes('calibrat')) return 'learn';
  if (type.includes('tech') || type.includes('radar')) return 'tech';
  return 'info';
}

function formatNotification(n: NotificationRecord): string {
  const tag = formatTag(n.type, n.title);
  // Try to extract a meaningful one-liner from message JSON
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

async function main(): Promise<void> {
  const userPrompt = await readStdin(); // consume stdin (required by hook protocol)

  const client = new IpcClient(getPipeName(), 3000);
  try {
    await client.connect();

    // Store user prompt in Conversation Memory
    // Claude Code sends JSON: { prompt, session_id, cwd, ... }
    let promptText = userPrompt.trim();
    let sessionId = `claude-${new Date().toISOString().slice(0, 10)}`;
    let transcriptPath = '';
    try {
      const parsed = JSON.parse(promptText) as { prompt?: string; session_id?: string; transcript_path?: string };
      if (parsed.prompt) promptText = parsed.prompt;
      if (parsed.session_id) sessionId = parsed.session_id;
      if (parsed.transcript_path) transcriptPath = parsed.transcript_path;
    } catch { /* not JSON — use raw text */ }

    if (promptText.length > 10) {
      try {
        await client.request('convo.remember', {
          content: promptText,
          category: 'context',
          importance: promptText.length > 200 ? 6 : 4,
          tags: ['claude-code', 'prompt'],
          sessionId,
        });
      } catch { /* ConversationMemory not available */ }
    }

    // Transcript: catch up on assistant responses since last prompt
    if (transcriptPath) {
      try {
        const lastTs = getLastProcessed(sessionId);
        const msgs = readNewTranscriptMessages(transcriptPath, lastTs);
        let newestTs = lastTs;
        for (const msg of msgs) {
          await client.request('convo.remember', {
            content: msg.content,
            category: 'context',
            importance: msg.importance,
            tags: msg.tags,
            sessionId,
          });
          if (msg.timestamp > newestTs) newestTs = msg.timestamp;
        }
        if (newestTs !== lastTs) saveLastProcessed(sessionId, newestTs);
      } catch { /* transcript not readable — no problem */ }
    }

    const pending = await client.request('notification.pending') as NotificationRecord[];
    if (pending?.length) {
      // Print notifications to stdout — injected into Claude's context
      console.log(`\u{1F9E0} Brain (${pending.length} new):`);
      for (const n of pending) {
        console.log(formatNotification(n));
      }
      // Acknowledge all so they don't repeat
      await client.request('notification.ackAll');
    }

    // Inject Conversation Memory context (always, even without notifications)
    try {
      const context = await client.request('convo.context') as string;
      if (context && context.trim().length > 20) {
        console.log('');
        console.log(context);
      }
    } catch { /* ConversationMemory not available */ }
  } catch {
    // Brain daemon not running or unreachable — silent, never block workflow
  } finally {
    client.disconnect();
  }
}

main();
