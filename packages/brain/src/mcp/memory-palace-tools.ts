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
    'brain_palace_status',
    'Get Brain MemoryPalace status: knowledge graph stats, recent connections, top connected nodes, density.',
    {},
    async () => {
      const status: AnyResult = await call('palace.status', {});
      const lines = [
        '# Memory Palace Status',
        '',
        `**Nodes:** ${status.stats?.totalNodes ?? 0} | **Edges:** ${status.stats?.totalEdges ?? 0} | **Density:** ${((status.stats?.density ?? 0) * 100).toFixed(1)}%`,
        `**Avg Strength:** ${(status.stats?.avgStrength ?? 0).toFixed(2)}`,
        '',
      ];

      if (status.topConnectedNodes?.length > 0) {
        lines.push('## Top Connected Nodes');
        for (const n of status.topConnectedNodes) {
          lines.push(`- **${n.type}:${n.id}** — ${n.connections} connections`);
        }
        lines.push('');
      }

      if (status.recentConnections?.length > 0) {
        lines.push('## Recent Connections');
        for (const c of status.recentConnections.slice(0, 5)) {
          lines.push(`- ${c.sourceType}:${c.sourceId} → ${c.targetType}:${c.targetId} [${c.relation}] (strength: ${c.strength.toFixed(2)})`);
        }
      }

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_palace_map',
    'Get Brain knowledge map: a subgraph of connected knowledge nodes and their relationships. Optionally filter by topic.',
    {
      topic: z.string().optional().describe('Topic to filter by (optional)'),
      limit: z.number().optional().describe('Max edges to return (default: 100)'),
    },
    async (params) => {
      const map: AnyResult = await call('palace.map', { topic: params.topic, limit: params.limit });
      if (!map?.nodes?.length) return textResult('Knowledge map is empty. Run palace_build first to auto-detect connections.');

      const lines = [
        `# Knowledge Map${params.topic ? ` — "${params.topic}"` : ''}`,
        '',
        `**Nodes:** ${map.nodes.length} | **Edges:** ${map.edges.length}`,
        '',
        '## Nodes',
      ];
      for (const n of map.nodes.slice(0, 20)) {
        lines.push(`- **${n.type}:${n.id}** (${n.connections} connections)`);
      }
      lines.push('', '## Edges');
      for (const e of map.edges.slice(0, 20)) {
        lines.push(`- ${e.source} → ${e.target} [${e.relation}] (${e.strength.toFixed(2)})`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_palace_path',
    'Find the shortest path between two knowledge nodes in Brain memory. Uses BFS to traverse the knowledge graph.',
    {
      fromType: z.string().describe('Source node type (e.g., principle, hypothesis, experiment)'),
      fromId: z.string().describe('Source node ID'),
      toType: z.string().describe('Target node type'),
      toId: z.string().describe('Target node ID'),
    },
    async (params) => {
      const path: AnyResult = await call('palace.path', params);
      if (!path) return textResult(`No path found from ${params.fromType}:${params.fromId} to ${params.toType}:${params.toId}.`);
      if (path.length === 0) return textResult('Same node — distance 0.');

      const lines = [
        `# Path: ${params.fromType}:${params.fromId} → ${params.toType}:${params.toId}`,
        `**Length:** ${path.length} steps`,
        '',
      ];
      lines.push(`Start: ${params.fromType}:${params.fromId}`);
      for (const step of path) {
        lines.push(`  → [${step.relation}] → ${step.type}:${step.id}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_palace_build',
    'Trigger Brain MemoryPalace to scan all knowledge sources and auto-detect connections between hypotheses, principles, experiments, journal entries, etc.',
    {},
    async () => {
      const result: AnyResult = await call('palace.build', {});
      const lines = [
        '# Memory Palace Build',
        '',
        `**New Connections:** ${result.newConnections}`,
        `**Total Connections:** ${result.totalConnections}`,
        `**Scanned:** ${result.scannedSources?.join(', ') || 'none'}`,
      ];
      return textResult(lines.join('\n'));
    },
  );
}
