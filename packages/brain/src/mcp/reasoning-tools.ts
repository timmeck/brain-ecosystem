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
    'brain_reasoning_status',
    'Get Brain reasoning engine status: inference rule count, chain count, avg confidence, domains, recent chains.',
    {},
    async () => {
      const status: AnyResult = await call('reasoning.status', {});
      const lines = [
        '# Reasoning Engine Status',
        '',
        `**Rules:** ${status.ruleCount} | **Chains:** ${status.chainCount} | **Recent (24h):** ${status.recentChains}`,
        `**Avg Confidence:** ${status.avgConfidence?.toFixed(3) ?? 'N/A'}`,
        `**Domains:** ${status.domains?.join(', ') || 'none'}`,
        `**Uptime:** ${Math.round((status.uptime ?? 0) / 1000)}s`,
      ];
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_reason',
    'Forward-chaining inference: given a query, find logical chains A→B→C from Brain knowledge. Returns proof tree with confidence scores.',
    { query: z.string().describe('Topic or question to reason about (e.g., "error patterns", "deployment failures")') },
    async (params) => {
      const chain: AnyResult = await call('reasoning.infer', params);
      if (!chain) return textResult('No inference chain found for this query. Try building rules first with a feedback cycle.');

      const lines = [
        `# Inference Chain (${chain.steps?.length ?? 0} steps)`,
        '',
        `**Query:** ${chain.query}`,
        `**Conclusion:** ${chain.conclusion}`,
        `**Confidence:** ${chain.final_confidence?.toFixed(3)}`,
        '',
        '## Proof Steps',
      ];
      for (const step of (chain.steps ?? [])) {
        lines.push(`${step.ruleId}. **${step.antecedent}** → ${step.consequent} (conf=${step.confidence?.toFixed(3)}, cumulative=${step.cumulativeConfidence?.toFixed(3)}, src=${step.source})`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_explain_why',
    'Abductive reasoning: given an observation, find possible explanations from Brain knowledge base (backwards reasoning).',
    { observation: z.string().describe('Observation to explain (e.g., "error rate spike", "sudden performance drop")') },
    async (params) => {
      const explanations: AnyResult = await call('reasoning.abduce', params);
      if (!explanations?.length) return textResult('No explanations found for this observation.');

      const lines = [
        `# Abductive Explanations (${explanations.length})`,
        '',
        `**Observation:** ${params.observation}`,
        '',
      ];
      for (const e of explanations) {
        lines.push(`- **${e.antecedent}** → ${e.consequent} (score=${e.score?.toFixed(3)}, coverage=${(e.coverage * 100)?.toFixed(0)}%, conf=${e.confidence?.toFixed(3)}, src=${e.source})`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_what_if',
    'Counterfactual analysis: "What if event X never happened?" — shows all downstream effects that would be lost.',
    { event: z.string().describe('Event type to analyze (e.g., "error:reported", "deploy")') },
    async (params) => {
      const result: AnyResult = await call('reasoning.counterfactual', params);
      const lines = [
        '# Counterfactual Analysis',
        '',
        `**Event:** ${result.event}`,
        `**Affected Effects:** ${result.affected_effects?.length ?? 0}`,
        `**Depth:** ${result.depth}`,
        '',
        result.narrative,
      ];
      if (result.affected_effects?.length > 0) {
        lines.push('', '## Affected Effects');
        for (const e of result.affected_effects) {
          lines.push(`- ${e}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );
}
