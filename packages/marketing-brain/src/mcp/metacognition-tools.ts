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

export function registerMetacognitionTools(server: McpServer, ipc: IpcClient): void {
  registerMetacognitionToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerMetacognitionToolsDirect(server: McpServer, router: IpcRouter): void {
  registerMetacognitionToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerMetacognitionToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'marketing_metacognition_status',
    'Get Marketing Brain meta-cognition status: engine report cards (A-F grades), frequency adjustments.',
    {},
    async () => {
      const status: AnyResult = await call('metacognition.status', {});
      const lines = ['# Marketing Meta-Cognition Status', '', `**Engines:** ${status.totalEngines} | **Metrics:** ${status.cycleMetrics}`, ''];
      if (status.reportCards?.length > 0) {
        lines.push('## Report Cards');
        for (const card of status.reportCards) {
          lines.push(`- **${card.engine}**: Grade **${card.grade}** (${(card.combined_score * 100).toFixed(0)}%)`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_engine_report',
    'Get detailed report card for a Marketing Brain engine.',
    { engine: z.string().describe('Engine name') },
    async (params) => {
      const card: AnyResult = await call('metacognition.report', { engine: params.engine });
      if (!card) return textResult('No report card yet for this engine.');
      return textResult(`# ${params.engine}: Grade ${card.grade}\nHealth: ${(card.health_score * 100).toFixed(0)}% | Value: ${(card.value_score * 100).toFixed(0)}% | S/N: ${(card.signal_to_noise * 100).toFixed(0)}%`);
    },
  );

  server.tool(
    'marketing_auto_experiment_status',
    'Get Marketing Brain auto-experiment status: running experiments, candidates, results.',
    {},
    async () => {
      const status: AnyResult = await call('autoexperiment.status', {});
      const lines = ['# Marketing Auto-Experiments', '', `Total: ${status.totalExperiments} | Running: ${status.running} | Adopted: ${status.adopted} | Rolled Back: ${status.rolledBack}`, ''];
      if (status.candidates?.length > 0) {
        lines.push('## Candidates');
        for (const c of status.candidates) lines.push(`- ${c.engine}.${c.name}: ${c.currentValue.toFixed(3)} → ${c.proposedValue.toFixed(3)}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_parameter_registry',
    'View Marketing Brain tunable parameters with values and bounds.',
    { engine: z.string().optional().describe('Filter by engine') },
    async (params) => {
      const allParams: AnyResult[] = await call('parameter.list', { engine: params.engine }) as AnyResult[];
      const lines = ['# Marketing Parameter Registry', '', `**Parameters:** ${allParams?.length ?? 0}`, ''];
      if (allParams?.length > 0) {
        let lastEngine = '';
        for (const p of allParams) {
          if (p.engine !== lastEngine) { lines.push(`## ${p.engine}`); lastEngine = p.engine; }
          lines.push(`- **${p.name}**: ${p.value} [${p.min} – ${p.max}]`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );
}
