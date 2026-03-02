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

/** Register attention tools using IPC client (for stdio MCP transport) */
export function registerAttentionTools(server: McpServer, ipc: IpcClient): void {
  registerAttentionToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register attention tools using router directly (for HTTP MCP transport inside daemon) */
export function registerAttentionToolsDirect(server: McpServer, router: IpcRouter): void {
  registerAttentionToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerAttentionToolsWithCaller(server: McpServer, call: BrainCall): void {

  // ═══════════════════════════════════════════════════════════════════
  // Attention Engine — Dynamic Focus & Resource Allocation
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_focus_status',
    'Get Brain attention status: current work context, top topics by attention score, urgent topics, engine weights, and context switch history. Shows what Brain is paying attention to right now.',
    {},
    async () => {
      const status: AnyResult = await call('attention.status', {});
      const lines = [
        `Attention Status:`,
        `  Current context: ${status.currentContext}`,
        `  Total events processed: ${status.totalEvents}`,
        `  Uptime: ${Math.floor((status.uptime || 0) / 1000)}s`,
        '',
      ];

      if (status.urgentTopics?.length > 0) {
        lines.push(`URGENT Topics: ${status.urgentTopics.join(', ')}`, '');
      }

      if (status.topTopics?.length > 0) {
        lines.push('Top Attention Topics:');
        for (const t of status.topTopics) {
          lines.push(`  ${t.topic} — score: ${t.score.toFixed(2)} (recency: ${t.recency.toFixed(2)}, freq: ${t.frequency}, impact: ${t.impact}, urgency: ${t.urgency.toFixed(1)})`);
        }
        lines.push('');
      }

      lines.push('Engine Weights:');
      const sorted = Object.entries(status.engineWeights || {}).sort((a, b) => (b[1] as number) - (a[1] as number));
      for (const [engine, weight] of sorted) {
        const bar = '█'.repeat(Math.round(weight as number * 2));
        lines.push(`  ${engine}: ${(weight as number).toFixed(1)} ${bar}`);
      }

      if (status.contextHistory?.length > 0) {
        lines.push('', 'Recent Context Switches:');
        for (const sw of status.contextHistory.slice(0, 5)) {
          const time = new Date(sw.timestamp).toLocaleTimeString();
          lines.push(`  [${time}] ${sw.from} → ${sw.to} — ${sw.trigger}`);
        }
      }

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_focus_set',
    'Manually direct Brain attention to a specific topic. Increases its attention score and urgency, making related research engines work harder on it.',
    {
      topic: z.string().describe('Topic to focus on (e.g., "error_tracking", "trade_signals", "anomaly_detection")'),
      intensity: z.number().optional().describe('Focus intensity 0-3 (default: 2). Higher = more attention'),
    },
    async (params) => {
      await call('attention.focus', { topic: params.topic, intensity: params.intensity ?? 2.0 });
      return textResult(`Focus set on "${params.topic}" with intensity ${params.intensity ?? 2.0}. Related research engines will receive higher priority.`);
    },
  );

  server.tool(
    'brain_focus_history',
    'Get the focus timeline — what topics Brain has been paying attention to over time, and what context switches happened.',
    {
      limit: z.number().optional().describe('Max entries (default: 30)'),
    },
    async (params) => {
      const timeline: AnyResult[] = await call('attention.timeline', { limit: params.limit ?? 30 }) as AnyResult[];
      const context: AnyResult = await call('attention.context', {});

      const lines = [`Current Context: ${context.context}`, ''];

      if (context.history?.length > 0) {
        lines.push('Context Switches:');
        for (const sw of context.history) {
          const time = new Date(sw.timestamp).toLocaleTimeString();
          lines.push(`  [${time}] ${sw.from} → ${sw.to} — ${sw.trigger}`);
        }
        lines.push('');
      }

      if (timeline?.length > 0) {
        lines.push('Focus Timeline:');
        for (const entry of timeline) {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          lines.push(`  [${time}] ${entry.topic} (score: ${entry.score?.toFixed?.(2) ?? entry.score}) [${entry.context}]`);
        }
      } else {
        lines.push('No focus entries yet.');
      }

      return textResult(lines.join('\n'));
    },
  );
}
