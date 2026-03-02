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
    'brain_metacognition_status',
    'Get Brain meta-cognition status: engine report cards (A-F grades), frequency adjustments, performance metrics.',
    {},
    async () => {
      const status: AnyResult = await call('metacognition.status', {});
      const lines = [
        '# Meta-Cognition Status',
        '',
        `**Engines Tracked:** ${status.totalEngines}`,
        `**Cycle Metrics Recorded:** ${status.cycleMetrics}`,
        '',
      ];
      if (status.reportCards?.length > 0) {
        lines.push('## Engine Report Cards');
        for (const card of status.reportCards) {
          lines.push(`- **${card.engine}**: Grade **${card.grade}** (health: ${(card.health_score * 100).toFixed(0)}%, value: ${(card.value_score * 100).toFixed(0)}%, S/N: ${(card.signal_to_noise * 100).toFixed(0)}%)`);
        }
        lines.push('');
      }
      if (status.recentAdjustments?.length > 0) {
        lines.push('## Recent Frequency Adjustments');
        for (const adj of status.recentAdjustments) {
          lines.push(`- ${adj.engine}: freq ${adj.old_frequency} → ${adj.new_frequency} (${adj.reason})`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_engine_report',
    'Get detailed report card and performance trend for a specific engine.',
    { engine: z.string().describe('Engine name (e.g. "self_observer", "anomaly_detective")') },
    async (params) => {
      const card: AnyResult = await call('metacognition.report', { engine: params.engine });
      const trend: AnyResult[] = await call('metacognition.trend', { engine: params.engine, limit: 10 }) as AnyResult[];
      const lines = [
        `# Engine Report: ${params.engine}`,
        '',
      ];
      if (card) {
        lines.push(`**Grade:** ${card.grade} | **Score:** ${(card.combined_score * 100).toFixed(0)}%`);
        lines.push(`- Health: ${(card.health_score * 100).toFixed(0)}%`);
        lines.push(`- Value: ${(card.value_score * 100).toFixed(0)}%`);
        lines.push(`- Signal/Noise: ${(card.signal_to_noise * 100).toFixed(0)}%`);
        lines.push('');
      } else {
        lines.push('*No report card yet. Engine needs to run through evaluation cycles.*');
      }
      if (trend?.length > 0) {
        lines.push('## Trend (recent evaluations)');
        for (const t of trend) {
          lines.push(`- ${t.evaluated_at}: Grade ${t.grade} (${(t.combined_score * 100).toFixed(0)}%)`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_auto_experiment_status',
    'Get status of Brain\'s autonomous parameter experiments: running, completed, candidates for next experiment.',
    {},
    async () => {
      const status: AnyResult = await call('autoexperiment.status', {});
      const lines = [
        '# Auto-Experiment Status',
        '',
        `**Total:** ${status.totalExperiments} | **Running:** ${status.running} | **Adopted:** ${status.adopted} | **Rolled Back:** ${status.rolledBack}`,
        `**Cooldown Until Cycle:** ${status.cooldownUntilCycle}`,
        '',
      ];
      if (status.candidates?.length > 0) {
        lines.push('## Next Candidates');
        for (const c of status.candidates) {
          lines.push(`- **${c.engine}.${c.name}**: ${c.currentValue.toFixed(3)} → ${c.proposedValue.toFixed(3)} (priority: ${c.priority})`);
          lines.push(`  ${c.hypothesis}`);
        }
      } else {
        lines.push('*No candidates — either in cooldown or all parameters recently tested.*');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_parameter_registry',
    'View all tunable parameters in Brain\'s parameter registry with current values, bounds, and recent changes.',
    { engine: z.string().optional().describe('Filter by engine name (optional)') },
    async (params) => {
      const allParams: AnyResult[] = await call('parameter.list', { engine: params.engine }) as AnyResult[];
      const changes: AnyResult[] = await call('parameter.history', { limit: 15 }) as AnyResult[];
      const lines = [
        '# Parameter Registry',
        '',
        `**Total Parameters:** ${allParams?.length ?? 0}`,
        '',
      ];
      if (allParams?.length > 0) {
        let lastEngine = '';
        for (const p of allParams) {
          if (p.engine !== lastEngine) {
            lines.push(`## ${p.engine}`);
            lastEngine = p.engine;
          }
          lines.push(`- **${p.name}**: ${p.value} [${p.min} – ${p.max}] ${p.description ? `— ${p.description}` : ''}`);
        }
        lines.push('');
      }
      if (changes?.length > 0) {
        lines.push('## Recent Changes');
        for (const c of changes) {
          lines.push(`- ${c.created_at}: ${c.engine}.${c.name} ${c.old_value} → ${c.new_value} (by ${c.changed_by}: ${c.reason?.substring(0, 80)})`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );
}
