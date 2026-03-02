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
    'brain_goal_status',
    'Get Brain goal tracking status: active/achieved/failed goals, recent achievements, top active goals.',
    {},
    async () => {
      const status: AnyResult = await call('goals.status', {});
      const lines = [
        '# Goal Engine Status',
        '',
        `**Total:** ${status.totalGoals} | **Active:** ${status.activeGoals} | **Achieved:** ${status.achievedGoals} | **Failed:** ${status.failedGoals} | **Paused:** ${status.pausedGoals}`,
        '',
      ];

      if (status.topActive?.length > 0) {
        lines.push('## Active Goals');
        for (const g of status.topActive) {
          const progress = g.targetValue > 0 ? ((g.currentValue / g.targetValue) * 100).toFixed(0) : '0';
          lines.push(`- **${g.title}** — ${g.metricName}: ${g.currentValue}/${g.targetValue} (${progress}%) [deadline: ${g.deadlineCycles} cycles]`);
        }
        lines.push('');
      }

      if (status.recentAchievements?.length > 0) {
        lines.push('## Recent Achievements');
        for (const g of status.recentAchievements) {
          lines.push(`- **${g.title}** — achieved ${g.achievedAt ?? ''}`);
        }
      }

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_goal_create',
    'Create a new goal for Brain to track and pursue autonomously. Brain will monitor the metric and report progress.',
    {
      title: z.string().describe('Goal title (e.g., "Improve prediction accuracy to 80%")'),
      metricName: z.string().describe('Metric to track (e.g., predictionAccuracy, principleCount, activeGaps)'),
      targetValue: z.number().describe('Target value to reach'),
      deadlineCycles: z.number().describe('Number of cycles to achieve the goal'),
      type: z.enum(['metric_target', 'discovery', 'quality', 'custom']).optional().describe('Goal type'),
      priority: z.number().optional().describe('Priority 0-1 (default: 0.5)'),
    },
    async (params) => {
      const goal: AnyResult = await call('goals.create', params);
      const lines = [
        '# Goal Created',
        '',
        `**${goal.title}**`,
        `- Metric: ${goal.metricName}`,
        `- Target: ${goal.targetValue}`,
        `- Deadline: ${goal.deadlineCycles} cycles`,
        `- Status: ${goal.status}`,
        `- ID: ${goal.id}`,
      ];
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_goal_progress',
    'Get detailed progress report for a specific Brain goal, including trend analysis and completion forecast.',
    {
      goalId: z.number().describe('Goal ID to check progress for'),
    },
    async (params) => {
      const report: AnyResult = await call('goals.progress', params);
      if (!report) return textResult('Goal not found.');

      const g = report.goal;
      const lines = [
        `# Goal Progress: ${g.title}`,
        '',
        `**Status:** ${g.status} | **Progress:** ${report.progressPercent.toFixed(1)}% | **Trend:** ${report.trend}`,
        `**Metric:** ${g.metricName} = ${g.currentValue} / ${g.targetValue}`,
        `**Data Points:** ${report.dataPoints}`,
      ];

      if (report.estimatedCycles !== null) {
        lines.push(`**Estimated Completion:** cycle ${report.estimatedCycles}`);
      }

      return textResult(lines.join('\n'));
    },
  );
}
