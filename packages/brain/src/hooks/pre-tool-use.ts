#!/usr/bin/env node

// PreToolUse hook — auto-starts a Brain session for context tracking
// Configured in .claude/settings.json:
// { "hooks": { "PreToolUse": [{ "matcher": {}, "hooks": [{ "command": "node <brain-dist>/hooks/pre-tool-use.js" }] }] } }

import crypto from 'node:crypto';
import path from 'node:path';
import { IpcClient } from '../ipc/client.js';
import { getPipeName } from '../utils/paths.js';

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

async function main(): Promise<void> {
  const raw = await readStdin();
  if (!raw.trim()) return;

  // Generate a session key based on working directory
  const sessionKey = crypto.createHash('sha256').update(process.cwd()).digest('hex').slice(0, 32);

  const client = new IpcClient(getPipeName(), 3000);
  try {
    await client.connect();

    // Check if session for this working directory already exists
    const existing = await client.request('session.current', { sessionId: sessionKey });
    if (!existing) {
      await client.request('session.start', {
        sessionId: sessionKey,
        project: path.basename(process.cwd()),
        goals: [],
      });
    }
  } catch {
    // Hook must never block workflow
  } finally {
    client.disconnect();
  }
}

main();
