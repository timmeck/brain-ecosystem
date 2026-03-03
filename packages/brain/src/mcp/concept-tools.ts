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

export function registerConceptTools(server: McpServer, ipc: IpcClient): void {
  registerConceptToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerConceptToolsDirect(server: McpServer, router: IpcRouter): void {
  registerConceptToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerConceptToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'brain_concept_status',
    'Get Brain concept abstraction status: total concepts, levels, transferability, top concepts.',
    {},
    async () => {
      const status: AnyResult = await call('concept.status', {});
      const lines = [
        '# Concept Abstraction Status',
        '',
        `**Total Concepts:** ${status.totalConcepts}`,
        `**Avg Transferability:** ${((status.avgTransferability ?? 0) * 100).toFixed(0)}%`,
        `**Cycles:** ${status.cycleCount}`,
      ];
      if (status.conceptsByLevel && Object.keys(status.conceptsByLevel).length > 0) {
        lines.push('', '## Concepts by Level');
        for (const [level, count] of Object.entries(status.conceptsByLevel)) {
          const label = level === '0' ? 'Concrete' : level === '1' ? 'Abstract' : 'Meta-Abstract';
          lines.push(`- **Level ${level}** (${label}): ${count}`);
        }
      }
      if (status.topConcepts?.length > 0) {
        lines.push('', '## Top Concepts');
        for (const c of status.topConcepts) {
          lines.push(`- **${c.title}** (L${c.level}, ${c.memberCount} members, transfer: ${(c.transferability * 100).toFixed(0)}%)`);
          if (c.keywords?.length > 0) lines.push(`  Keywords: ${c.keywords.join(', ')}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_concept_hierarchy',
    'View concept hierarchy tree for a specific concept, showing children and members.',
    { conceptId: z.number().describe('Concept ID to get hierarchy for') },
    async (params) => {
      const h: AnyResult = await call('concept.hierarchy', { conceptId: params.conceptId });
      if (!h) return textResult('Concept not found.');
      const lines = [`# ${h.concept.title} (Level ${h.concept.level})\n`];
      lines.push(`Domain: ${h.concept.domain} | Members: ${h.concept.memberCount} | Transfer: ${(h.concept.transferability * 100).toFixed(0)}%`);
      lines.push(h.concept.description);
      if (h.members?.length > 0) {
        lines.push('', '## Members');
        for (const m of h.members) lines.push(`- [${m.memberType}:${m.memberId}] sim: ${(m.similarityToCentroid * 100).toFixed(0)}%`);
      }
      if (h.children?.length > 0) {
        lines.push('', '## Children');
        for (const child of h.children) {
          lines.push(`\n### ${child.concept.title} (L${child.concept.level}, ${child.concept.memberCount} members)`);
          if (child.members?.length > 0) {
            for (const m of child.members) lines.push(`  - [${m.memberType}:${m.memberId}] sim: ${(m.similarityToCentroid * 100).toFixed(0)}%`);
          }
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_concept_form',
    'Trigger concept formation NOW: clusters knowledge into abstract concepts with 3-level hierarchy.',
    {},
    async () => {
      const result: AnyResult = await call('concept.form', {});
      const lines = [
        '# Concept Formation Result',
        '',
        `**New Concepts:** ${result.newConcepts}`,
        `**Total Concepts:** ${result.totalConcepts}`,
      ];
      if (result.levels && Object.keys(result.levels).length > 0) {
        lines.push('', '## Levels');
        for (const [level, count] of Object.entries(result.levels)) {
          const label = level === '0' ? 'Concrete' : level === '1' ? 'Abstract' : 'Meta-Abstract';
          lines.push(`- Level ${level} (${label}): ${count}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_concept_transferable',
    'List concepts with high cross-domain transferability — useful for knowledge transfer between brains.',
    { minTransferability: z.number().optional().describe('Minimum transferability (0-1, default: 0.3)') },
    async (params) => {
      const concepts: AnyResult[] = await call('concept.transferable', { min: params.minTransferability ?? 0.3 }) as AnyResult[];
      if (!concepts?.length) return textResult('No transferable concepts found.');
      const lines = [`# Transferable Concepts: ${concepts.length}\n`];
      for (const c of concepts) {
        lines.push(`## ${c.title} (L${c.level})`);
        lines.push(`Domain: ${c.domain} | Members: ${c.memberCount} | Transfer: ${(c.transferability * 100).toFixed(0)}%`);
        if (c.keywords?.length > 0) lines.push(`Keywords: ${c.keywords.join(', ')}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );
}
