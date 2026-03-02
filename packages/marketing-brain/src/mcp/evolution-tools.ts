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

export function registerEvolutionTools(server: McpServer, ipc: IpcClient): void {
  registerEvolutionToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerEvolutionToolsDirect(server: McpServer, router: IpcRouter): void {
  registerEvolutionToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerEvolutionToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'marketing_evolution_status',
    'Get Marketing Brain evolution engine status: generation, population, best fitness, champion.',
    {},
    async () => {
      const status: AnyResult = await call('evolution.status', {});
      const lines = [
        '# Marketing Evolution Status',
        '',
        `**Generation:** ${status.currentGeneration} | **Population:** ${status.populationSize} | **Initialized:** ${status.isInitialized}`,
        `**Best Fitness:** ${status.bestFitness?.toFixed(3) ?? 'N/A'} | **Avg Fitness:** ${status.avgFitness?.toFixed(3) ?? 'N/A'}`,
      ];
      if (status.champion) {
        lines.push('', `**Champion:** fitness=${status.champion.fitness?.toFixed(3)}, gen=${status.champion.generation}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_evolution_history',
    'Get Marketing Brain evolution generation history.',
    { limit: z.number().optional() },
    async (params) => {
      const history: AnyResult = await call('evolution.history', params);
      if (!history?.length) return textResult('No evolution history yet.');
      const lines = ['# Marketing Evolution History', '', '| Gen | Best | Avg | Diversity |', '|-----|------|-----|-----------|'];
      for (const g of history) {
        lines.push(`| ${g.generation} | ${g.bestFitness.toFixed(3)} | ${g.avgFitness.toFixed(3)} | ${g.diversity.toFixed(3)} |`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_evolution_best',
    'Get the best-performing individual from Marketing Brain evolution.',
    {},
    async () => {
      const best: AnyResult = await call('evolution.best', {});
      if (!best) return textResult('No individuals yet.');
      const lines = [`# Marketing Champion (Gen ${best.generation})`, '', `**Fitness:** ${best.fitness.toFixed(3)} | **Mutations:** ${best.mutationCount}`];
      for (const [key, val] of Object.entries(best.genome as Record<string, number>)) {
        lines.push(`- \`${key}\`: ${val.toFixed(4)}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_evolution_run',
    'Manually trigger a Marketing Brain evolution generation.',
    {},
    async () => {
      const gen: AnyResult = await call('evolution.run', {});
      return textResult(`# Marketing Gen #${gen.generation}\nBest: ${gen.bestFitness.toFixed(3)} | Avg: ${gen.avgFitness.toFixed(3)} | Diversity: ${gen.diversity.toFixed(3)}`);
    },
  );
}
