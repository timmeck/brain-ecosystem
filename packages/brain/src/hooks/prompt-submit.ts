#!/usr/bin/env node

// UserPromptSubmit hook — injects Brain's pending notifications into Claude's context.
// Connects to Brain daemon via IPC, fetches unread notifications, prints them to stdout,
// then acknowledges them so they don't appear again.

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
    try {
      const parsed = JSON.parse(promptText) as { prompt?: string; session_id?: string };
      if (parsed.prompt) promptText = parsed.prompt;
      if (parsed.session_id) sessionId = parsed.session_id;
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
