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
    'brain_evolution_status',
    'Get Brain evolution engine status: current generation, population size, best fitness, champion genome, config.',
    {},
    async () => {
      const status: AnyResult = await call('evolution.status', {});
      const lines = [
        '# Evolution Engine Status',
        '',
        `**Generation:** ${status.currentGeneration} | **Population:** ${status.populationSize} | **Initialized:** ${status.isInitialized}`,
        `**Best Fitness:** ${status.bestFitness?.toFixed(3) ?? 'N/A'} | **Avg Fitness:** ${status.avgFitness?.toFixed(3) ?? 'N/A'}`,
        `**Total Individuals:** ${status.totalIndividuals}`,
        '',
        '## Config',
        `- Population Size: ${status.config.populationSize}`,
        `- Mutation Rate: ${status.config.mutationRate}`,
        `- Elite Count: ${status.config.eliteCount}`,
        `- Tournament Size: ${status.config.tournamentSize}`,
        `- Generation Every: ${status.config.generationEvery} cycles`,
      ];

      if (status.champion) {
        lines.push('', '## Champion', `- Fitness: ${status.champion.fitness?.toFixed(3)}`, `- Generation: ${status.champion.generation}`, `- Mutations: ${status.champion.mutationCount}`);
      }

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_evolution_history',
    'Get Brain evolution generation history — fitness trends across generations.',
    { limit: z.number().optional().describe('Max generations to return (default: 20)') },
    async (params) => {
      const history: AnyResult = await call('evolution.history', params);
      if (!history?.length) return textResult('No evolution history yet.');

      const lines = ['# Evolution History', '', '| Gen | Best | Avg | Worst | Diversity | Pop |', '|-----|------|-----|-------|-----------|-----|'];
      for (const g of history) {
        lines.push(`| ${g.generation} | ${g.bestFitness.toFixed(3)} | ${g.avgFitness.toFixed(3)} | ${g.worstFitness.toFixed(3)} | ${g.diversity.toFixed(3)} | ${g.populationSize} |`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_evolution_best',
    'Get the best-performing individual (champion) from Brain evolution — genome, fitness, lineage.',
    {},
    async () => {
      const best: AnyResult = await call('evolution.best', {});
      if (!best) return textResult('No individuals yet. Run a generation first.');

      const lines = [
        `# Champion (Gen ${best.generation})`,
        '',
        `**Fitness:** ${best.fitness.toFixed(3)} | **Rank:** ${best.rank} | **Active:** ${best.isActive}`,
        `**Mutations:** ${best.mutationCount}`,
        '',
        '## Genome',
      ];
      for (const [key, val] of Object.entries(best.genome as Record<string, number>)) {
        lines.push(`- \`${key}\`: ${val.toFixed(4)}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_evolution_run',
    'Manually trigger a Brain evolution generation — tournament selection, crossover, mutation, fitness evaluation.',
    {},
    async () => {
      const gen: AnyResult = await call('evolution.run', {});
      return textResult(`# Generation #${gen.generation} Complete\n\n**Best:** ${gen.bestFitness.toFixed(3)} | **Avg:** ${gen.avgFitness.toFixed(3)} | **Worst:** ${gen.worstFitness.toFixed(3)}\n**Diversity:** ${gen.diversity.toFixed(3)} | **Population:** ${gen.populationSize}`);
    },
  );
}
