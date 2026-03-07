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

export function registerMissionTools(server: McpServer, ipc: IpcClient): void {
  registerMissionToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerMissionToolsDirect(server: McpServer, router: IpcRouter): void {
  registerMissionToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerMissionToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'brain_mission_create',
    'Create a research mission: autonomously research a topic through web search, knowledge synthesis, and hypothesis generation. Returns a structured report.',
    {
      topic: z.string().describe('The research topic to investigate'),
      depth: z.enum(['quick', 'standard', 'deep']).optional().describe('Research depth: quick (5 sources), standard (10), deep (20). Default: standard'),
    },
    async (params) => {
      const result: AnyResult = await call('mission.create', { topic: params.topic, depth: params.depth ?? 'standard' });
      return textResult(`# Mission Created\n\n**ID:** ${result.id}\n**Topic:** ${result.topic}\n**Depth:** ${result.depth}\n**Status:** ${result.status}\n\nThe mission is running in background. Use \`brain_mission_report\` with ID ${result.id} to check progress and read the final report.`);
    },
  );

  server.tool(
    'brain_mission_list',
    'List all research missions with their status',
    {
      status: z.string().optional().describe('Filter by status: pending, decomposing, gathering, hypothesizing, analyzing, synthesizing, complete, failed'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const missions: AnyResult[] = await call('mission.list', { status: params.status, limit: params.limit }) as AnyResult[];
      if (!missions?.length) return textResult('No missions found.');

      const lines = ['# Research Missions', '', '| ID | Topic | Status | Sources | Created |', '|-----|-------|--------|---------|---------|'];
      for (const m of missions) {
        lines.push(`| ${m.id} | ${m.topic.substring(0, 50)} | ${m.status} | ${m.source_count ?? 0} | ${m.created_at?.substring(0, 10) ?? '-'} |`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_mission_report',
    'Get the full report of a research mission including phases, sources, and synthesized findings',
    {
      id: z.number().describe('Mission ID'),
    },
    async (params) => {
      const report: AnyResult = await call('mission.report', { id: params.id });
      if (!report) return textResult('Mission not found.');

      const m = report.mission;
      const lines = [
        `# Mission #${m.id}: ${m.topic}`,
        `**Status:** ${m.status} | **Depth:** ${m.depth} | **Sources:** ${m.source_count}`,
        `**Created:** ${m.created_at}${m.completed_at ? ` | **Completed:** ${m.completed_at}` : ''}`,
        '',
      ];

      if (report.phases?.length) {
        lines.push('## Phases');
        for (const p of report.phases) {
          const icon = p.status === 'complete' ? '✅' : p.status === 'failed' ? '❌' : '⏳';
          lines.push(`- ${icon} **${p.phase}**: ${p.status}`);
        }
        lines.push('');
      }

      if (m.report) {
        lines.push('## Report', '', m.report);
      } else if (m.error) {
        lines.push(`## Error\n\n${m.error}`);
      } else {
        lines.push('*Report not yet available — mission still running.*');
      }

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_mission_cancel',
    'Cancel a running research mission',
    {
      id: z.number().describe('Mission ID to cancel'),
    },
    async (params) => {
      await call('mission.cancel', { id: params.id });
      return textResult(`Mission #${params.id} cancelled.`);
    },
  );
}
