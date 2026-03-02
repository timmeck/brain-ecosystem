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

export function registerMemoryPalaceTools(server: McpServer, ipc: IpcClient): void {
  registerMemoryPalaceToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerMemoryPalaceToolsDirect(server: McpServer, router: IpcRouter): void {
  registerMemoryPalaceToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerMemoryPalaceToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'marketing_palace_status',
    'Get Marketing Brain MemoryPalace status: knowledge graph stats, recent connections, top connected nodes.',
    {},
    async () => {
      const status: AnyResult = await call('palace.status', {});
      const lines = [
        '# Marketing Memory Palace Status',
        '',
        `**Nodes:** ${status.stats?.totalNodes ?? 0} | **Edges:** ${status.stats?.totalEdges ?? 0} | **Density:** ${((status.stats?.density ?? 0) * 100).toFixed(1)}%`,
        `**Avg Strength:** ${(status.stats?.avgStrength ?? 0).toFixed(2)}`,
      ];
      if (status.topConnectedNodes?.length > 0) {
        lines.push('', '## Top Connected');
        for (const n of status.topConnectedNodes) lines.push(`- **${n.type}:${n.id}** — ${n.connections} connections`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_palace_map',
    'Get Marketing Brain knowledge map: connected knowledge nodes and relationships.',
    { topic: z.string().optional(), limit: z.number().optional() },
    async (params) => {
      const map: AnyResult = await call('palace.map', { topic: params.topic, limit: params.limit });
      if (!map?.nodes?.length) return textResult('Knowledge map is empty. Run palace_build first.');
      const lines = [`# Marketing Knowledge Map — ${map.nodes.length} nodes, ${map.edges.length} edges`];
      for (const n of map.nodes.slice(0, 20)) lines.push(`- ${n.type}:${n.id} (${n.connections})`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_palace_path',
    'Find shortest path between two knowledge nodes in Marketing Brain memory.',
    { fromType: z.string(), fromId: z.string(), toType: z.string(), toId: z.string() },
    async (params) => {
      const path: AnyResult = await call('palace.path', params);
      if (!path) return textResult('No path found.');
      const lines = [`# Path (${path.length} steps)`];
      lines.push(`Start: ${params.fromType}:${params.fromId}`);
      for (const step of path) lines.push(`  → [${step.relation}] → ${step.type}:${step.id}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_palace_build',
    'Trigger Marketing Brain MemoryPalace to auto-detect knowledge connections.',
    {},
    async () => {
      const result: AnyResult = await call('palace.build', {});
      return textResult(`# Build: +${result.newConnections} new (${result.totalConnections} total)\nScanned: ${result.scannedSources?.join(', ')}`);
    },
  );
}
