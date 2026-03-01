#!/usr/bin/env node

// UserPromptSubmit hook — injects Brain's self-improvement suggestions into Claude's context
// Brain writes improvement requests to ~/.brain/improvement-requests.md during feedback cycles.
// This hook checks for new entries and shows them to Claude automatically.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const IMPROVEMENTS_FILE = path.join(os.homedir(), '.brain', 'improvement-requests.md');
const STATE_FILE = path.join(os.homedir(), '.brain', '.improvement-hook-state');

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

function getLastSeenSize(): number {
  try {
    const state = fs.readFileSync(STATE_FILE, 'utf-8').trim();
    return parseInt(state, 10) || 0;
  } catch {
    return 0;
  }
}

function saveSeenSize(size: number): void {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, String(size));
  } catch {
    // best effort
  }
}

async function main(): Promise<void> {
  await readStdin(); // consume stdin (required by hook protocol)

  if (!fs.existsSync(IMPROVEMENTS_FILE)) return;

  let content: string;
  try {
    content = fs.readFileSync(IMPROVEMENTS_FILE, 'utf-8');
  } catch {
    return;
  }

  const currentSize = content.length;
  const lastSeenSize = getLastSeenSize();

  // File was rewritten/shrunk — reset state and scan from beginning
  if (currentSize < lastSeenSize) {
    saveSeenSize(0);
  }

  // No new content since last check
  if (currentSize <= lastSeenSize) return;

  // Extract only the new part (or full content if file was reset)
  const effectiveLastSeen = currentSize < lastSeenSize ? 0 : lastSeenSize;
  const newContent = content.slice(effectiveLastSeen).trim();
  if (!newContent) return;

  // Extract "Tell Claude:" lines from new content
  const suggestions = newContent
    .split('\n')
    .filter(line => line.includes('Tell Claude:'))
    .map(line => line.replace(/^\d+\.\s*/, '').replace('Tell Claude: ', '').trim())
    .filter(Boolean);

  if (suggestions.length === 0) {
    // Still update state even if no actionable suggestions
    saveSeenSize(currentSize);
    return;
  }

  // Deduplicate
  const unique = [...new Set(suggestions)];

  // Output to stdout — this gets injected into Claude's context
  console.log(`🧠 Brain Self-Improvement Request (${unique.length} new suggestion${unique.length > 1 ? 's' : ''}):`);
  for (const s of unique) {
    console.log(`  → ${s}`);
  }

  // Update state
  saveSeenSize(currentSize);
}

main();
