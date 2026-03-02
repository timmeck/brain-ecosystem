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

export function registerGoalTools(server: McpServer, ipc: IpcClient): void {
  registerGoalToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerGoalToolsDirect(server: McpServer, router: IpcRouter): void {
  registerGoalToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerGoalToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'marketing_goal_status',
    'Get Marketing Brain goal tracking status: active/achieved/failed goals.',
    {},
    async () => {
      const status: AnyResult = await call('goals.status', {});
      const lines = [
        '# Marketing Goal Status',
        '',
        `**Total:** ${status.totalGoals} | **Active:** ${status.activeGoals} | **Achieved:** ${status.achievedGoals} | **Failed:** ${status.failedGoals}`,
      ];
      if (status.topActive?.length > 0) {
        lines.push('', '## Active Goals');
        for (const g of status.topActive) {
          const pct = g.targetValue > 0 ? ((g.currentValue / g.targetValue) * 100).toFixed(0) : '0';
          lines.push(`- **${g.title}** — ${g.metricName}: ${g.currentValue}/${g.targetValue} (${pct}%)`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_goal_create',
    'Create a new goal for Marketing Brain to track autonomously.',
    {
      title: z.string(), metricName: z.string(), targetValue: z.number(), deadlineCycles: z.number(),
      type: z.enum(['metric_target', 'discovery', 'quality', 'custom']).optional(),
      priority: z.number().optional(),
    },
    async (params) => {
      const goal: AnyResult = await call('goals.create', params);
      return textResult(`# Goal Created: ${goal.title}\nMetric: ${goal.metricName}, Target: ${goal.targetValue}, Deadline: ${goal.deadlineCycles} cycles, ID: ${goal.id}`);
    },
  );

  server.tool(
    'marketing_goal_progress',
    'Get detailed progress for a Marketing Brain goal with forecast.',
    { goalId: z.number() },
    async (params) => {
      const report: AnyResult = await call('goals.progress', params);
      if (!report) return textResult('Goal not found.');
      return textResult(`# ${report.goal.title}\nProgress: ${report.progressPercent.toFixed(1)}% | Trend: ${report.trend} | Data points: ${report.dataPoints}${report.estimatedCycles !== null ? `\nEstimated completion: cycle ${report.estimatedCycles}` : ''}`);
    },
  );
}
