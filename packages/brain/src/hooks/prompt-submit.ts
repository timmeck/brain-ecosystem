#!/usr/bin/env node

// UserPromptSubmit hook — injects Brain's pending notifications into Claude's context.
// Connects to Brain daemon via IPC, fetches unread notifications, prints them to stdout,
// then acknowledges them so they don't appear again.
//
// Fixes (Session 129):
//   - Session-Counter: ensures session via convo.ensure_session (sessions > 0 in report)
//   - Transcript State → SQLite: uses convo.last_processed / convo.save_processed instead of flat-file
//   - Importance-Heuristik: keyword-based scoring instead of pure length

import * as fs from 'fs';
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

// ── Keyword-based Importance Heuristic ──────────────────

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
  // High importance keywords → 7
  for (const pattern of HIGH_IMPORTANCE_PATTERNS) {
    if (pattern.test(text)) return 7;
  }
  // Medium importance keywords → 6
  for (const pattern of MEDIUM_IMPORTANCE_PATTERNS) {
    if (pattern.test(text)) return 6;
  }
  // Length-based fallback
  if (text.length > 300) return 6;
  if (text.length < 30) return 4;
  return base;
}

// ── Transcript Reading ──────────────────────────────────

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
        importance: calcImportance(text, 5),
        tags: ['claude-code', 'assistant'],
        timestamp: entry.timestamp,
      });
    } catch { /* malformed line — skip */ }
  }

  return results;
}

// ── Notification Formatting ─────────────────────────────

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

// ── Main ────────────────────────────────────────────────

async function main(): Promise<void> {
  const userPrompt = await readStdin(); // consume stdin (required by hook protocol)

  const client = new IpcClient(getPipeName(), 3000);
  try {
    await client.connect();

    // Parse input — Claude Code sends JSON: { prompt, session_id, cwd, ... }
    let promptText = userPrompt.trim();
    let sessionId = `claude-${new Date().toISOString().slice(0, 10)}`;
    let transcriptPath = '';
    try {
      const parsed = JSON.parse(promptText) as { prompt?: string; session_id?: string; transcript_path?: string };
      if (parsed.prompt) promptText = parsed.prompt;
      if (parsed.session_id) sessionId = parsed.session_id;
      if (parsed.transcript_path) transcriptPath = parsed.transcript_path;
    } catch { /* not JSON — use raw text */ }

    // Fix 1: Ensure session exists (fixes session counter = 0)
    try {
      await client.request('convo.ensure_session', { sessionId });
    } catch { /* ConversationMemory not available */ }

    // Store user prompt with keyword-based importance (Fix 3)
    if (promptText.length > 10) {
      try {
        await client.request('convo.remember', {
          content: promptText,
          category: 'context',
          importance: calcImportance(promptText, 4),
          tags: ['claude-code', 'prompt'],
          sessionId,
        });
      } catch { /* ConversationMemory not available */ }
    }

    // Transcript: catch up on assistant responses since last prompt
    // Fix 2: Use SQLite via IPC instead of flat-file
    if (transcriptPath) {
      try {
        const lastTs = await client.request('convo.last_processed', { sessionId }) as string;
        const msgs = readNewTranscriptMessages(transcriptPath, lastTs ?? '');
        let newestTs = lastTs ?? '';
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
        if (newestTs && newestTs !== lastTs) {
          await client.request('convo.save_processed', { sessionId, timestamp: newestTs });
        }
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
