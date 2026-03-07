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

export function registerLLMTools(server: McpServer, ipc: IpcClient): void {
  registerLLMToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerLLMToolsDirect(server: McpServer, router: IpcRouter): void {
  registerLLMToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerLLMToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'brain_llm_status',
    'Get LLM service status: token usage, cache stats, rate limits, budget remaining, active providers',
    {},
    async () => {
      const stats: AnyResult = await call('llm.status', {});
      const lines = [
        '# LLM Service Status',
        `**Model:** ${stats.model}`,
        '',
        '## Providers',
      ];

      if (stats.providers?.length > 0) {
        lines.push('| Provider | Status | Cost Tier | Chat | Embed |');
        lines.push('|----------|--------|-----------|------|-------|');
        for (const p of stats.providers) {
          lines.push(`| ${p.name} | ${p.available ? 'Online' : 'Offline'} | ${p.costTier} | ${p.capabilities.chat ? 'Yes' : 'No'} | ${p.capabilities.embed ? 'Yes' : 'No'} |`);
        }
      } else {
        lines.push('*No providers registered*');
      }

      lines.push(
        '',
        '## Usage',
        `- **Total Calls:** ${stats.totalCalls} | **Total Tokens:** ${stats.totalTokens.toLocaleString()}`,
        `- **This Hour:** ${stats.callsThisHour} calls, ${stats.tokensThisHour.toLocaleString()} tokens`,
        `- **Today:** ${stats.tokensToday.toLocaleString()} tokens`,
        `- **Avg Latency:** ${Math.round(stats.averageLatencyMs)}ms`,
        '',
        '## Budget',
        `- **Hourly Remaining:** ${stats.budgetRemainingHour.toLocaleString()} tokens`,
        `- **Daily Remaining:** ${stats.budgetRemainingDay.toLocaleString()} tokens`,
        '',
        '## Cache',
        `- **Hits:** ${stats.cacheHits} | **Misses:** ${stats.cacheMisses}`,
        `- **Hit Rate:** ${(stats.cacheHitRate * 100).toFixed(1)}%`,
        '',
        '## Issues',
        `- **Rate Limit Hits:** ${stats.rateLimitHits} | **Errors:** ${stats.errors}`,
        stats.lastCallAt ? `- **Last Call:** ${new Date(stats.lastCallAt).toISOString()}` : '- *No calls yet*',
      );
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_llm_providers',
    'List all registered LLM providers with availability status, capabilities, and cost tiers',
    {},
    async () => {
      const providers: AnyResult[] = await call('llm.providers', {}) as AnyResult[];
      const lines = ['# LLM Providers', ''];

      if (!providers || providers.length === 0) {
        lines.push('*No providers registered*');
        return textResult(lines.join('\n'));
      }

      lines.push('| Provider | Status | Cost | Chat | Generate | Embed | Reasoning |');
      lines.push('|----------|--------|------|------|----------|-------|-----------|');
      for (const p of providers) {
        lines.push(`| ${p.name} | ${p.available ? 'Online' : 'Offline'} | ${p.costTier} | ${p.capabilities.chat ? 'Yes' : '-'} | ${p.capabilities.generate ? 'Yes' : '-'} | ${p.capabilities.embed ? 'Yes' : '-'} | ${p.capabilities.reasoning ? 'Yes' : '-'} |`);
      }

      lines.push('', '## Setup Guide', '');
      lines.push('**Ollama (local, free):** Install from https://ollama.com, then `ollama pull qwen3:14b`');
      lines.push('**Anthropic (cloud):** Set `ANTHROPIC_API_KEY` in .env');

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_llm_route',
    'Show which provider handles which template type (explain, summarize, debate, etc.)',
    {
      template: z.enum([
        'explain', 'ask', 'synthesize_debate', 'creative_hypothesis',
        'research_question', 'summarize', 'analyze_contradiction', 'custom',
      ]).optional().describe('Specific template to check routing for'),
    },
    async (params) => {
      const routing: AnyResult = await call('llm.routing', { template: params.template });
      const lines = ['# LLM Task Routing', ''];

      if (params.template) {
        lines.push(`**Template:** ${params.template}`);
        lines.push(`**Preferred Tier:** ${routing.tier}`);
        lines.push(`**Provider Chain:** ${routing.chain?.join(' → ') ?? 'none'}`);
      } else {
        lines.push('| Template | Tier | Providers |');
        lines.push('|----------|------|-----------|');
        for (const r of routing.routes ?? []) {
          lines.push(`| ${r.template} | ${r.tier} | ${r.chain?.join(' → ') ?? '-'} |`);
        }
      }

      lines.push('', '*Tier: local = free/local provider first, cloud = quality provider first, any = cheapest available*');

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_llm_usage',
    'Get LLM token usage breakdown by template (explain, ask, debate, hypothesis, etc.)',
    {},
    async () => {
      const [history, byTemplate] = await Promise.all([
        call('llm.history', { hours: 24 }),
        call('llm.byTemplate', {}),
      ]) as [AnyResult[], AnyResult[]];

      const lines = ['# LLM Usage Report', ''];

      if (byTemplate?.length > 0) {
        lines.push('## By Template');
        lines.push('| Template | Calls | Tokens | Avg Tokens |');
        lines.push('|----------|-------|--------|------------|');
        for (const t of byTemplate) {
          lines.push(`| ${t.template} | ${t.calls} | ${t.tokens.toLocaleString()} | ${Math.round(t.avg_tokens)} |`);
        }
        lines.push('');
      }

      if (history?.length > 0) {
        lines.push('## Last 24h (by hour)');
        lines.push('| Hour | Calls | Tokens | Cached |');
        lines.push('|------|-------|--------|--------|');
        for (const h of history.slice(0, 12)) {
          lines.push(`| ${h.hour} | ${h.calls} | ${h.tokens.toLocaleString()} | ${h.cached} |`);
        }
      }

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_ollama_status',
    'Get Ollama server status: installed models, running models, VRAM usage (requires Ollama)',
    {},
    async () => {
      const status: AnyResult = await call('llm.ollamaStatus', {});
      const lines = ['# Ollama Status', ''];

      if (!status.available) {
        lines.push('**Status:** Offline');
        lines.push(`**Host:** ${status.host}`);
        lines.push('', 'Ollama is not running or not reachable.');
        lines.push('Install from: https://ollama.com');
        lines.push('Start with: `ollama serve`');
        return textResult(lines.join('\n'));
      }

      lines.push(`**Status:** Online | **Host:** ${status.host}`);
      lines.push(`**Chat Model:** ${status.chatModel} | **Embed Model:** ${status.embedModel}`);

      if (status.runningModels?.length > 0) {
        lines.push('', '## Running Models');
        lines.push('| Model | Size | VRAM |');
        lines.push('|-------|------|------|');
        for (const m of status.runningModels) {
          const sizeMB = Math.round(m.size / 1024 / 1024);
          const vramMB = Math.round(m.size_vram / 1024 / 1024);
          lines.push(`| ${m.name} | ${sizeMB} MB | ${vramMB} MB |`);
        }
      }

      if (status.installedModels?.length > 0) {
        lines.push('', '## Installed Models');
        lines.push('| Model | Size |');
        lines.push('|-------|------|');
        for (const m of status.installedModels) {
          const sizeMB = Math.round(m.size / 1024 / 1024);
          lines.push(`| ${m.name} | ${sizeMB} MB |`);
        }
      }

      return textResult(lines.join('\n'));
    },
  );
}
