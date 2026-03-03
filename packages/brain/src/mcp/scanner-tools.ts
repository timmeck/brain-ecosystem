import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IpcClient } from '@timmeck/brain-core';
import type { IpcRouter } from '../ipc/router.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;
type BrainCall = (method: string, params?: unknown) => Promise<unknown> | unknown;

function textResult(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text' as const, text }] };
}

/** Register scanner tools using IPC client (for stdio MCP transport) */
export function registerScannerTools(server: McpServer, ipc: IpcClient): void {
  registerScannerToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register scanner tools using router directly (for HTTP MCP transport inside daemon) */
export function registerScannerToolsDirect(server: McpServer, router: IpcRouter): void {
  registerScannerToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerScannerToolsWithCaller(server: McpServer, call: BrainCall): void {

  // ═══════════════════════════════════════════════════════════════════
  // GitHub Signal Scanner — Track emerging repos, crypto, HN mentions
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_scan_now',
    'Trigger an immediate GitHub signal scan. Scans emerging repos (created <7d), trending repos (13 languages), HackerNews mentions, and crypto tokens. Returns scan results with discovery counts.',
    {},
    async () => {
      const result: AnyResult = await call('scanner.scan', {});
      const lines = [
        'Signal Scan Complete:',
        `  Duration: ${result.duration_ms}ms`,
        `  Repos discovered: ${result.repos_discovered}`,
        `  Repos updated: ${result.repos_updated}`,
        `  New breakouts: ${result.new_breakouts}`,
        `  New signals: ${result.new_signals}`,
        `  HN mentions: ${result.hn_mentions_found}`,
        `  Crypto tokens: ${result.crypto_tokens_scanned}`,
      ];
      if (result.errors?.length > 0) {
        lines.push(`  Errors: ${result.errors.join(', ')}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_scanner_status',
    'Get the current status of the GitHub signal scanner: running state, total repos tracked, signal distribution (breakout/signal/watch/noise), and last scan results.',
    {},
    async () => {
      const status: AnyResult = await call('scanner.status', {});
      const lines = [
        'Signal Scanner Status:',
        `  Running: ${status.running}`,
        `  Enabled: ${status.enabled}`,
        `  Total repos: ${status.total_repos}`,
        `  Active repos: ${status.total_active}`,
        '',
        'Signal Distribution:',
        `  Breakout: ${status.by_level?.breakout ?? 0}`,
        `  Signal: ${status.by_level?.signal ?? 0}`,
        `  Watch: ${status.by_level?.watch ?? 0}`,
        `  Noise: ${status.by_level?.noise ?? 0}`,
      ];
      if (status.next_scan_at) {
        lines.push(`\nNext scan: ${status.next_scan_at}`);
      }
      if (status.last_scan) {
        lines.push(`\nLast scan: ${status.last_scan.finished_at} (${status.last_scan.duration_ms}ms)`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_get_signals',
    'Get repos by signal level (breakout/signal/watch). Breakout repos are the most interesting — fast-growing, well-discussed, technically strong.',
    {
      level: z.enum(['breakout', 'signal', 'watch']).describe('Signal level to filter by'),
      limit: z.number().optional().describe('Max results (default: 30)'),
    },
    async (params) => {
      const repos: AnyResult[] = await call('scanner.signals', {
        level: params.level,
        limit: params.limit ?? 30,
      }) as AnyResult[];

      if (!repos || repos.length === 0) {
        return textResult(`No repos at "${params.level}" level yet. Run brain_scan_now first.`);
      }

      const lines = [`${params.level.toUpperCase()} Repos (${repos.length}):\n`];
      for (const r of repos) {
        const vel = r.star_velocity_24h > 0 ? ` (+${r.star_velocity_24h}★/24h)` : '';
        lines.push(`★${r.current_stars}${vel} ${r.full_name} — ${r.signal_score.toFixed(1)}pts [${r.phase}]`);
        if (r.description) lines.push(`  ${r.description.substring(0, 100)}`);
        lines.push(`  ${r.url}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_get_trending',
    'Get top trending repos sorted by star velocity (stars gained in last 24 hours).',
    {
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const repos: AnyResult[] = await call('scanner.trending', {
        limit: params.limit ?? 20,
      }) as AnyResult[];

      if (!repos || repos.length === 0) {
        return textResult('No trending repos yet. Run brain_scan_now first.');
      }

      const lines = [`Top Trending (${repos.length}):\n`];
      for (const r of repos) {
        lines.push(`+${r.star_velocity_24h}★/24h | ★${r.current_stars} ${r.full_name} [${r.signal_level}]`);
        if (r.description) lines.push(`  ${r.description.substring(0, 100)}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_search_repos',
    'Search scanned repos by name, language, or topic. Returns repos sorted by signal score.',
    {
      query: z.string().optional().describe('Search query (matches name, description, topics)'),
      language: z.string().optional().describe('Filter by programming language'),
      limit: z.number().optional().describe('Max results (default: 30)'),
    },
    async (params) => {
      const repos: AnyResult[] = await call('scanner.search', {
        query: params.query ?? '',
        language: params.language,
        limit: params.limit ?? 30,
      }) as AnyResult[];

      if (!repos || repos.length === 0) {
        return textResult('No matching repos found.');
      }

      const lines = [`Search Results (${repos.length}):\n`];
      for (const r of repos) {
        lines.push(`★${r.current_stars} ${r.full_name} — ${r.signal_score.toFixed(1)}pts [${r.signal_level}] [${r.language ?? 'unknown'}]`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_get_crypto',
    'Get crypto token signals from CoinGecko. Shows AI/DeFi watchlist tokens with price changes and signal scores.',
    {
      trending: z.boolean().optional().describe('Show only trending tokens (default: false)'),
      limit: z.number().optional().describe('Max results (default: 30)'),
    },
    async (params) => {
      const method = params.trending ? 'scanner.crypto.trending' : 'scanner.crypto';
      const tokens: AnyResult[] = await call(method, {
        limit: params.limit ?? 30,
      }) as AnyResult[];

      if (!tokens || tokens.length === 0) {
        return textResult('No crypto data yet. Run brain_scan_now first.');
      }

      const lines = [`Crypto Signals (${tokens.length}):\n`];
      for (const t of tokens) {
        const change24h = t.price_change_24h !== null ? `${t.price_change_24h > 0 ? '+' : ''}${t.price_change_24h.toFixed(1)}%` : 'n/a';
        lines.push(`${t.symbol.toUpperCase()} ${t.name} — $${t.current_price ?? 'n/a'} (${change24h}) [${t.signal_level}]`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_get_hn_mentions',
    'Get top HackerNews mentions of GitHub repos. Shows cross-platform buzz for tracked repos.',
    {
      limit: z.number().optional().describe('Max results (default: 30)'),
    },
    async (params) => {
      const mentions: AnyResult[] = await call('scanner.hn', {
        limit: params.limit ?? 30,
      }) as AnyResult[];

      if (!mentions || mentions.length === 0) {
        return textResult('No HN mentions yet. Run brain_scan_now first.');
      }

      const lines = [`HN Mentions (${mentions.length}):\n`];
      for (const m of mentions) {
        lines.push(`↑${m.score} | 💬${m.comment_count} | ${m.title}`);
        if (m.url) lines.push(`  ${m.url}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_import_reposignal_api',
    'Import all repos from the reposignal.dev API into the local scanner database. Fetches up to 50k repos with full metadata (github_id, stars, forks, signal scores, topics). Use this to bootstrap the scanner with the complete reposignal dataset.',
    {
      limit: z.number().optional().describe('Max repos to import (default: 50000)'),
      level: z.string().optional().describe('Filter by signal level (breakout/signal/watch)'),
      adminKey: z.string().optional().describe('Admin key for protected endpoints'),
    },
    async (params) => {
      const result: AnyResult = await call('scanner.import.api', {
        limit: params.limit ?? 50000,
        level: params.level,
        adminKey: params.adminKey,
      });
      return textResult([
        'Reposignal API Import Complete:',
        `  Repos imported: ${result.repos}`,
        `  Skipped: ${result.skipped}`,
        `  Duration: ${result.duration_ms}ms`,
      ].join('\n'));
    },
  );

  server.tool(
    'brain_scanner_stats',
    'Get aggregated scanner statistics: total repos, breakdown by language, by signal level, average score.',
    {},
    async () => {
      const stats: AnyResult = await call('scanner.stats', {});
      const lines = [
        'Scanner Statistics:',
        `  Total repos: ${stats.total_repos}`,
        `  Active repos: ${stats.active_repos}`,
        `  Avg score: ${stats.avg_score}`,
        `  HN mentions: ${stats.hn_mentions}`,
        `  Crypto tokens: ${stats.crypto_tokens}`,
        '',
        'By Signal Level:',
      ];
      for (const l of (stats.by_level ?? [])) {
        lines.push(`  ${l.signal_level}: ${l.count}`);
      }
      lines.push('', 'By Language (top 10):');
      for (const l of (stats.by_language ?? []).slice(0, 10)) {
        lines.push(`  ${l.language}: ${l.count}`);
      }
      return textResult(lines.join('\n'));
    },
  );
}
