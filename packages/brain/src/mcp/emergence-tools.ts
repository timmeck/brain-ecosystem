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

export function registerEmergenceTools(server: McpServer, ipc: IpcClient): void {
  registerEmergenceToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerEmergenceToolsDirect(server: McpServer, router: IpcRouter): void {
  registerEmergenceToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerEmergenceToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'brain_emergence_status',
    'Get Brain emergence tracking status: emergent events, complexity metrics (Kolmogorov, Shannon entropy, Phi integration), surprise scores, metric trends.',
    {},
    async () => {
      const status: AnyResult = await call('emergence.status', {});
      const lines = [
        '# Emergence Status',
        '',
        `**Events:** ${status.totalEvents} total (${status.unpredictedCount} unpredicted)`,
        `**Avg Surprise:** ${(status.avgSurpriseScore * 100).toFixed(0)}%`,
      ];
      if (status.latestMetrics) {
        const m = status.latestMetrics;
        lines.push('', '## Complexity Metrics');
        lines.push(`- **Kolmogorov (compression):** ${m.compressionComplexity.toFixed(3)}`);
        lines.push(`- **Shannon Entropy:** ${m.knowledgeEntropy.toFixed(2)} bits`);
        lines.push(`- **Integration (Phi):** ${m.integrationPhi.toFixed(3)}`);
        lines.push(`- **Network:** ${m.nodeCount} nodes, ${m.synapseCount} synapses, density=${m.networkDensity.toFixed(4)}`);
        lines.push(`- **Knowledge Diversity:** ${(m.knowledgeDiversity * 100).toFixed(0)}%`);
      }
      if (status.eventsByType && Object.keys(status.eventsByType).length > 0) {
        lines.push('', '## Events by Type');
        for (const [type, count] of Object.entries(status.eventsByType)) {
          lines.push(`- ${type.replace(/_/g, ' ')}: ${count}`);
        }
      }
      if (status.topEvents?.length > 0) {
        lines.push('', '## Top Emergent Events');
        for (const e of status.topEvents) {
          lines.push(`- **[${e.type}]** ${e.title} (surprise: ${(e.surpriseScore * 100).toFixed(0)}%)`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_emergence_detect',
    'Scan for emergent patterns NOW: unpredicted hypotheses, recurring anomalies without rules, cross-domain bridges, phase transitions, novel experiment effects.',
    {},
    async () => {
      const events: AnyResult[] = await call('emergence.detect', {}) as AnyResult[];
      if (!events?.length) return textResult('No emergent patterns detected this cycle.');
      const lines = [`# Emergent Patterns: ${events.length}\n`];
      for (const e of events) {
        lines.push(`## [${e.type}] ${e.title}`);
        lines.push(`Surprise: ${(e.surpriseScore * 100).toFixed(0)}% | Source: ${e.sourceEngine} | Predicted: ${e.wasPredicted ? 'yes' : 'NO'}`);
        lines.push(e.description);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_complexity_metrics',
    'Compute and return current complexity metrics: Kolmogorov complexity (compression ratio), Shannon entropy, network density, knowledge diversity, integration Phi.',
    {},
    async () => {
      const m: AnyResult = await call('emergence.metrics', {});
      const lines = [
        '# Complexity Metrics',
        '',
        `**Kolmogorov Complexity:** ${m.compressionComplexity.toFixed(4)} (compression ratio, 0=repetitive, 1=unique)`,
        `**Shannon Entropy:** ${m.knowledgeEntropy.toFixed(3)} bits (knowledge category diversity)`,
        `**Network Density:** ${m.networkDensity.toFixed(5)} (synapses / possible connections)`,
        `**Nodes:** ${m.nodeCount} | **Synapses:** ${m.synapseCount} | **Avg Weight:** ${m.avgWeight.toFixed(3)}`,
        `**Knowledge Diversity:** ${(m.knowledgeDiversity * 100).toFixed(1)}%`,
        `**Integration (Phi):** ${m.integrationPhi.toFixed(4)} (cross-reference density)`,
        `**Cycle:** ${m.cycle}`,
      ];
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_emergence_journal',
    'View the emergence journal: all emergent events sorted by surprise score, with evidence and source engines.',
    { limit: z.number().optional().describe('Max events (default: 20)') },
    async (params) => {
      const events: AnyResult[] = await call('emergence.events', { limit: params.limit ?? 20 }) as AnyResult[];
      if (!events?.length) return textResult('No emergence events recorded yet.');
      const lines = [`# Emergence Journal: ${events.length} events\n`];
      for (const e of events) {
        lines.push(`## ${e.title}`);
        lines.push(`Type: ${e.type} | Surprise: ${(e.surpriseScore * 100).toFixed(0)}% | Source: ${e.sourceEngine} | ${e.timestamp}`);
        lines.push(e.description.substring(0, 200));
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );
}
