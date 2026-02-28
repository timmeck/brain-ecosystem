#!/usr/bin/env node

// PostToolUse hook for Bash tool — auto-detects trade outcomes from bot output
// Looks for trade completion patterns in terminal output and records them to Trading Brain
//
// Configured in .claude/settings.json:
// { "hooks": { "PostToolUse": [{ "matcher": { "tool_name": "Bash" }, "hooks": [{ "type": "command", "command": "npx tsx C:/Users/mecklenburg/Desktop/trading-brain/src/hooks/post-tool-use.ts" }] }] } }

import { IpcClient } from '../ipc/client.js';
import { getPipeName } from '../utils/paths.js';

interface HookInput {
  tool_name: string;
  tool_input: { command?: string };
  tool_output?: string;
  tool_response?: { stdout?: string; stderr?: string; exit_code?: number };
}

// Patterns that indicate a trade was completed
const TRADE_PATTERNS = [
  // DCA Bot patterns
  /(?:DCA|dca)\s+(?:bot|trade)\s+(?:completed|finished|closed)\s+(?:on|for)\s+([\w/]+)\s+.*?(win|loss|profit|loss)/i,
  // Grid bot patterns
  /(?:grid|GRID)\s+(?:bot|trade)\s+(?:completed|finished|closed)\s+(?:on|for)\s+([\w/]+)\s+.*?(win|loss|profit|loss)/i,
  // Generic trade outcome
  /trade\s+(?:outcome|result|completed?):\s*([\w/]+)\s+.*?(win|loss|profit|loss)/i,
  // Profit/Loss with pair
  /([\w]+\/[\w]+)\s+.*?(?:P&?L|PnL|profit|loss):\s*([+-]?\$?[\d,.]+)/i,
  // Bot closed position
  /(?:closed|sold|exited)\s+(?:position|trade)\s+(?:on|for|in)\s+([\w/]+)\s+.*?(?:profit|loss|P&?L):\s*([+-]?\$?[\d,.]+)/i,
];

// Extract RSI value from output
const RSI_PATTERN = /RSI[:\s]+(\d+(?:\.\d+)?)/i;
// Extract MACD value from output
const MACD_PATTERN = /MACD[:\s]+([+-]?\d+(?:\.\d+)?)/i;
// Extract trend value
const TREND_PATTERN = /trend[:\s]+([+-]?\d+(?:\.\d+)?)/i;
// Extract volatility value
const VOL_PATTERN = /volatil(?:ity|\.?)[:\s]+(\d+(?:\.\d+)?)/i;
// Extract bot type
const BOT_PATTERN = /(?:bot[_\s]?type|strategy)[:\s]+(dca|grid|spot|futures|scalp)/i;

interface TradeDetection {
  pair: string;
  win: boolean;
  botType: string;
  rsi?: number;
  macdHistogram?: number;
  trendStrength?: number;
  volatility?: number;
}

function detectTrade(output: string): TradeDetection | null {
  for (const pattern of TRADE_PATTERNS) {
    const match = output.match(pattern);
    if (!match) continue;

    const pair = match[1]!;
    const resultText = match[2]!.toLowerCase();
    const win = resultText.includes('win') || resultText.includes('profit') ||
      (resultText.startsWith('+') && !resultText.startsWith('+-'));

    // Try to extract signal values
    const rsiMatch = output.match(RSI_PATTERN);
    const macdMatch = output.match(MACD_PATTERN);
    const trendMatch = output.match(TREND_PATTERN);
    const volMatch = output.match(VOL_PATTERN);
    const botMatch = output.match(BOT_PATTERN);

    return {
      pair: pair.toUpperCase(),
      win,
      botType: botMatch?.[1] ?? 'dca',
      rsi: rsiMatch ? parseFloat(rsiMatch[1]!) : undefined,
      macdHistogram: macdMatch ? parseFloat(macdMatch[1]!) : undefined,
      trendStrength: trendMatch ? parseFloat(trendMatch[1]!) : undefined,
      volatility: volMatch ? parseFloat(volMatch[1]!) : undefined,
    };
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

  const trade = detectTrade(output);
  if (!trade) return;

  const client = new IpcClient(getPipeName(), 3000);
  try {
    await client.connect();

    await client.request('trade.recordOutcome', {
      pair: trade.pair,
      win: trade.win,
      botType: trade.botType,
      signals: {
        rsi: trade.rsi ?? 50,
        macdHistogram: trade.macdHistogram ?? 0,
        trendStrength: trade.trendStrength ?? 0,
        volatility: trade.volatility ?? 0.5,
      },
    });

    process.stderr.write(
      `Trading Brain: Recorded ${trade.win ? 'WIN' : 'LOSS'} for ${trade.pair} (${trade.botType})\n`
    );
  } catch {
    // Hook must never block workflow
  } finally {
    client.disconnect();
  }
}

main();
