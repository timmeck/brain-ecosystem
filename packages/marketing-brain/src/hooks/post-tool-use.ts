#!/usr/bin/env node

// PostToolUse hook for Bash tool — auto-detects marketing outcomes and reports to Marketing Brain
// Detects: post outcomes (published/failed), engagement metrics, API errors, campaign deployments
//
// Configured in .claude/settings.json:
// { "hooks": { "PostToolUse": [{ "matcher": { "tool_name": "Bash" }, "hooks": [{ "type": "command", "command": "npx tsx C:/Users/mecklenburg/Desktop/marketing-brain/src/hooks/post-tool-use.ts" }] }] } }

import { IpcClient } from '../ipc/client.js';
import { getPipeName } from '../utils/paths.js';

interface HookInput {
  tool_name: string;
  tool_input: { command?: string };
  tool_output?: string;
  tool_response?: { stdout?: string; stderr?: string; exit_code?: number };
}

// ── Post Outcome Patterns ──────────────────────────────────

const POST_PUBLISHED_PATTERNS = [
  // X / Twitter
  /(?:tweet|post)\s+(?:published|posted|sent)\s+(?:successfully|to)\s+(twitter|x\.com|x)/i,
  /(?:twitter|x)\s+post\s+id[:\s]+(\d+)/i,
  // Reddit
  /(?:post|submission)\s+(?:published|posted|created)\s+(?:to|on)\s+(?:r\/)?(\w+)/i,
  /reddit\s+post\s+(?:url|link)[:\s]+(https?:\/\/\S+)/i,
  // LinkedIn
  /(?:post|article)\s+(?:published|shared)\s+(?:to|on)\s+linkedin/i,
  // Generic
  /(?:published|posted)\s+(?:successfully|to)\s+([\w/.]+)/i,
];

const POST_FAILED_PATTERNS = [
  /(?:failed to|couldn't|could not|error)\s+(?:publish|post|tweet|share)/i,
  /rate\s+limit(?:ed)?\s+(?:hit|exceeded|reached)/i,
  /(?:401|403|429)\s+(?:unauthorized|forbidden|too many requests)/i,
  /auth(?:entication)?\s+(?:failed|expired|invalid)/i,
  /token\s+(?:expired|invalid|revoked)/i,
];

// ── Engagement Patterns ────────────────────────────────────

const ENGAGEMENT_PATTERNS = [
  /(?:likes?|favorites?)[:\s]+(\d+)/i,
  /(?:retweets?|reposts?|shares?)[:\s]+(\d+)/i,
  /(?:replies?|comments?)[:\s]+(\d+)/i,
  /(?:impressions?|views?|reach)[:\s]+(\d[\d,]*)/i,
  /(?:clicks?|link\s+clicks?)[:\s]+(\d+)/i,
];

// ── API Error Patterns ─────────────────────────────────────

const API_ERROR_PATTERNS = [
  /rate\s+limit/i,
  /auth(?:entication)?\s+(?:error|failed|expired)/i,
  /(?:api|oauth)\s+(?:error|failure)/i,
  /(?:connection|timeout)\s+(?:error|refused|timed out)/i,
];

// ── Campaign Patterns ──────────────────────────────────────

const CAMPAIGN_PATTERNS = [
  /campaign\s+['"]?([^'"]+)['"]?\s+(?:deployed|launched|started|activated)/i,
  /(?:deployed|launched)\s+campaign\s+['"]?([^'"]+)['"]?/i,
];

interface PostOutcome {
  type: 'published' | 'failed';
  platform: string;
  identifier?: string;
}

interface EngagementData {
  likes?: number;
  shares?: number;
  replies?: number;
  impressions?: number;
  clicks?: number;
}

function detectPostOutcome(output: string): PostOutcome | null {
  for (const pattern of POST_PUBLISHED_PATTERNS) {
    const match = output.match(pattern);
    if (match) {
      const platform = detectPlatform(output, match[1] ?? '');
      return { type: 'published', platform, identifier: match[1] };
    }
  }

  for (const pattern of POST_FAILED_PATTERNS) {
    if (pattern.test(output)) {
      const platform = detectPlatform(output);
      return { type: 'failed', platform };
    }
  }

  return null;
}

function detectPlatform(output: string, hint: string = ''): string {
  const text = `${output} ${hint}`.toLowerCase();
  if (text.includes('twitter') || text.includes('x.com') || text.includes('tweet')) return 'x';
  if (text.includes('reddit') || text.includes('r/')) return 'reddit';
  if (text.includes('linkedin')) return 'linkedin';
  return 'unknown';
}

function extractEngagement(output: string): EngagementData | null {
  const data: EngagementData = {};
  let found = false;

  for (const pattern of ENGAGEMENT_PATTERNS) {
    const match = output.match(pattern);
    if (!match) continue;
    found = true;

    const key = match[0].toLowerCase();
    const value = parseInt(match[1]!.replace(/,/g, ''), 10);

    if (key.includes('like') || key.includes('favorite')) data.likes = value;
    else if (key.includes('retweet') || key.includes('repost') || key.includes('share')) data.shares = value;
    else if (key.includes('repl') || key.includes('comment')) data.replies = value;
    else if (key.includes('impression') || key.includes('view') || key.includes('reach')) data.impressions = value;
    else if (key.includes('click')) data.clicks = value;
  }

  return found ? data : null;
}

function detectApiError(output: string): string | null {
  for (const pattern of API_ERROR_PATTERNS) {
    if (pattern.test(output)) {
      const match = output.match(pattern);
      return match?.[0] ?? 'API error detected';
    }
  }
  return null;
}

function detectCampaign(output: string): string | null {
  for (const pattern of CAMPAIGN_PATTERNS) {
    const match = output.match(pattern);
    if (match) return match[1] ?? null;
  }
  return null;
}

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

  let input: HookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }

  const output = input.tool_output ?? input.tool_response?.stdout ?? '';
  if (!output) return;

  // Detect what happened
  const postOutcome = detectPostOutcome(output);
  const engagement = extractEngagement(output);
  const apiError = detectApiError(output);
  const campaign = detectCampaign(output);

  // Nothing interesting detected
  if (!postOutcome && !engagement && !apiError && !campaign) return;

  const client = new IpcClient(getPipeName(), 3000);
  try {
    await client.connect();

    // Report post outcome
    if (postOutcome) {
      if (postOutcome.type === 'published') {
        process.stderr.write(`Marketing Brain: Post published on ${postOutcome.platform}\n`);
      } else {
        process.stderr.write(`Marketing Brain: Post failed on ${postOutcome.platform}\n`);
      }
    }

    // Report engagement metrics
    if (engagement) {
      const metrics = Object.entries(engagement)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      process.stderr.write(`Marketing Brain: Engagement detected (${metrics})\n`);
    }

    // Report API errors
    if (apiError) {
      process.stderr.write(`Marketing Brain: API issue — ${apiError}\n`);
    }

    // Report campaign deployment
    if (campaign) {
      process.stderr.write(`Marketing Brain: Campaign deployed — ${campaign}\n`);
    }
  } catch {
    // Hook must never block workflow
  } finally {
    client.disconnect();
  }
}

main();
