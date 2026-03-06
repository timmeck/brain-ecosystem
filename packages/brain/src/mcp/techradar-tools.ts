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

/** Register TechRadar tools using IPC client (for stdio MCP transport) */
export function registerTechRadarTools(server: McpServer, ipc: IpcClient): void {
  registerTechRadarToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register TechRadar tools using router directly (for HTTP MCP transport inside daemon) */
export function registerTechRadarToolsDirect(server: McpServer, router: IpcRouter): void {
  registerTechRadarToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerTechRadarToolsWithCaller(server: McpServer, call: BrainCall): void {

  // ═══════════════════════════════════════════════════════════════════
  // TechRadar — Daily tech trend scanning + relevance analysis
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_techradar_scan',
    'Trigger a TechRadar scan. Checks watched repos for new releases, imports high-scoring repos from SignalScanner, and generates a daily digest.',
    {},
    async () => {
      const result: AnyResult = await call('techradar.scan', {});
      const lines = [
        'TechRadar Scan Complete:',
        `  Duration: ${result.duration_ms}ms`,
        `  New entries: ${result.new_entries}`,
        `  Updated entries: ${result.updated_entries}`,
        `  Releases found: ${result.releases_found}`,
        `  Digest generated: ${result.digest_generated}`,
      ];
      if (result.errors?.length > 0) {
        lines.push(`  Errors: ${result.errors.join(', ')}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_techradar_digest',
    'Get the daily TechRadar digest. Shows summary, top entries, opportunities, and action items.',
    { date: z.string().optional().describe('Date (YYYY-MM-DD), defaults to today') },
    async ({ date }) => {
      const result: AnyResult = await call('techradar.digest', { date });
      if (!result) return textResult('No digest available for this date. Run brain_techradar_scan first.');

      const lines = [
        `TechRadar Digest — ${result.date}`,
        '═'.repeat(50),
        '',
        result.summary,
        '',
      ];

      if (result.entries?.length > 0) {
        lines.push('Top Entries:');
        for (const e of result.entries.slice(0, 10)) {
          lines.push(`  [${e.relevance_score}] ${e.name} (${e.source}) — ${e.summary}`);
        }
        lines.push('');
      }

      if (result.action_items?.length > 0) {
        lines.push('Action Items:');
        for (const a of result.action_items) {
          lines.push(`  [${a.priority}] ${a.action}`);
        }
        lines.push('');
      }

      if (result.opportunities?.length > 0) {
        lines.push('Opportunities:');
        for (const o of result.opportunities) {
          lines.push(`  ${o.title} (effort: ${o.effort}, impact: ${o.impact})`);
          lines.push(`    ${o.description}`);
        }
      }

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_techradar_entries',
    'Browse TechRadar entries. Filter by minimum relevance score, source, or ring.',
    {
      minScore: z.number().optional().describe('Minimum relevance score (0-100)'),
      source: z.string().optional().describe('Filter by source: github_release, github_trending, hackernews, web'),
      ring: z.string().optional().describe('Filter by ring: adopt, trial, assess, hold'),
      limit: z.number().optional().describe('Max entries to return'),
    },
    async ({ minScore, source, ring, limit }) => {
      const result: AnyResult = await call('techradar.entries', { minScore, source, ring, limit });
      if (!result || result.length === 0) return textResult('No entries found.');

      const lines = [`TechRadar Entries (${result.length})`, ''];
      for (const e of result) {
        lines.push(`[${e.relevance_score}] ${e.name}`);
        lines.push(`  Ring: ${e.ring} | Source: ${e.source} | Category: ${e.category}`);
        lines.push(`  ${e.description?.substring(0, 120)}`);
        if (e.action_type !== 'none') lines.push(`  → ${e.action_type}: ${e.action_detail}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_techradar_stats',
    'Get TechRadar statistics: total entries, distribution by source/ring, watched repos count.',
    {},
    async () => {
      const result: AnyResult = await call('techradar.stats', {});
      const lines = [
        'TechRadar Stats:',
        `  Total entries: ${result.totalEntries}`,
        `  Watched repos: ${result.watchedRepos}`,
        `  Last digest: ${result.lastDigest ?? 'never'}`,
        '',
        'By Source:',
        ...Object.entries(result.bySource ?? {}).map(([k, v]) => `  ${k}: ${v}`),
        '',
        'By Ring:',
        ...Object.entries(result.byRing ?? {}).map(([k, v]) => `  ${k}: ${v}`),
      ];
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_techradar_repos',
    'Manage watched repositories. List, add, or remove repos from the TechRadar watchlist.',
    {
      action: z.enum(['list', 'add', 'remove']).describe('Action to perform'),
      repo: z.string().optional().describe('Repository (owner/name) for add/remove'),
      reason: z.string().optional().describe('Why watching this repo (for add)'),
    },
    async ({ action, repo, reason }) => {
      switch (action) {
        case 'list': {
          const repos: AnyResult = await call('techradar.repos.list', {});
          if (!repos || repos.length === 0) return textResult('No watched repos.');
          const lines = ['Watched Repos:', ''];
          for (const r of repos) {
            lines.push(`  ${r.full_name}`);
            if (r.last_release_tag) lines.push(`    Last release: ${r.last_release_tag} (${r.last_release_at})`);
            if (r.reason) lines.push(`    Reason: ${r.reason}`);
          }
          return textResult(lines.join('\n'));
        }
        case 'add': {
          if (!repo) return textResult('Error: repo is required for add');
          await call('techradar.repos.add', { repo, reason });
          return textResult(`Added ${repo} to watchlist.`);
        }
        case 'remove': {
          if (!repo) return textResult('Error: repo is required for remove');
          await call('techradar.repos.remove', { repo });
          return textResult(`Removed ${repo} from watchlist.`);
        }
      }
    },
  );
}
