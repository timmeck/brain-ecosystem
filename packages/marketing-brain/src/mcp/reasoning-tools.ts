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

export function registerReasoningTools(server: McpServer, ipc: IpcClient): void {
  registerReasoningToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

export function registerReasoningToolsDirect(server: McpServer, router: IpcRouter): void {
  registerReasoningToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerReasoningToolsWithCaller(server: McpServer, call: BrainCall): void {

  server.tool(
    'marketing_reasoning_status',
    'Get Marketing Brain reasoning engine status: rules, chains, confidence, domains.',
    {},
    async () => {
      const status: AnyResult = await call('reasoning.status', {});
      const lines = [
        '# Marketing Reasoning Status',
        '',
        `**Rules:** ${status.ruleCount} | **Chains:** ${status.chainCount} | **Recent (24h):** ${status.recentChains}`,
        `**Avg Confidence:** ${status.avgConfidence?.toFixed(3) ?? 'N/A'}`,
        `**Domains:** ${status.domains?.join(', ') || 'none'}`,
      ];
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_reason',
    'Forward-chaining inference on Marketing Brain knowledge: find logical chains from content patterns.',
    { query: z.string().describe('Topic to reason about (e.g., "engagement patterns", "content strategy")') },
    async (params) => {
      const chain: AnyResult = await call('reasoning.infer', params);
      if (!chain) return textResult('No inference chain found.');
      const lines = [
        `# Marketing Inference (${chain.steps?.length ?? 0} steps)`,
        '',
        `**Conclusion:** ${chain.conclusion}`,
        `**Confidence:** ${chain.final_confidence?.toFixed(3)}`,
      ];
      for (const step of (chain.steps ?? [])) {
        lines.push(`- ${step.antecedent} → ${step.consequent} (conf=${step.confidence?.toFixed(3)})`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_explain_why',
    'Abductive reasoning on Marketing Brain: explain why a marketing observation occurred.',
    { observation: z.string().describe('Observation to explain (e.g., "engagement drop", "viral post")') },
    async (params) => {
      const explanations: AnyResult = await call('reasoning.abduce', params);
      if (!explanations?.length) return textResult('No explanations found.');
      const lines = [`# Marketing Explanations (${explanations.length})`, ''];
      for (const e of explanations) {
        lines.push(`- **${e.antecedent}** → ${e.consequent} (score=${e.score?.toFixed(3)})`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_what_if',
    'Counterfactual: what if a marketing event never happened — show downstream effects.',
    { event: z.string().describe('Event type (e.g., "post:published", "engagement:spike")') },
    async (params) => {
      const result: AnyResult = await call('reasoning.counterfactual', params);
      return textResult(`# Marketing What-If\n\n${result.narrative}\n\n**Affected:** ${result.affected_effects?.length ?? 0} effects`);
    },
  );
}
