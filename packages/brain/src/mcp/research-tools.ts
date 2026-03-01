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

/** Register research tools using IPC client (for stdio MCP transport) */
export function registerResearchTools(server: McpServer, ipc: IpcClient): void {
  registerResearchToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register research tools using router directly (for HTTP MCP transport inside daemon) */
export function registerResearchToolsDirect(server: McpServer, router: IpcRouter): void {
  registerResearchToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerResearchToolsWithCaller(server: McpServer, call: BrainCall): void {

  // ═══════════════════════════════════════════════════════════════════
  // Autonomous Research
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_research_status',
    'Get current autonomous research status: cycles completed, discoveries found, health of the research pipeline. Shows what Brain is researching right now.',
    {},
    async () => {
      const status: AnyResult = await call('research.status', {});
      const lines = [
        'Autonomous Research Status:',
        `  Cycles completed: ${status.cyclesCompleted}`,
        `  Total discoveries: ${status.totalDiscoveries}`,
      ];
      if (status.discoveryBreakdown) {
        lines.push('  Discovery breakdown:');
        for (const [type, count] of Object.entries(status.discoveryBreakdown)) {
          lines.push(`    ${type}: ${count}`);
        }
      }
      if (status.lastCycleAt) {
        lines.push(`  Last cycle: ${new Date(status.lastCycleAt).toLocaleString()}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_research_discoveries',
    'Get all research discoveries: causal chains, confirmed hypotheses, parameter optimizations, anomalies, root causes. Filter by type and limit results.',
    {
      type: z.enum(['causal_chain', 'confirmed_hypothesis', 'parameter_optimization', 'anomaly', 'root_cause']).optional().describe('Filter by discovery type'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const discoveries: AnyResult[] = await call('research.discoveries', {
        type: params.type,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!discoveries?.length) return textResult('No discoveries yet. Run a research cycle first.');
      const lines = [`Research Discoveries (${discoveries.length}):\n`];
      for (const d of discoveries) {
        lines.push(`[${d.type}] ${d.title} (confidence: ${(d.confidence * 100).toFixed(0)}%, impact: ${d.impact ?? 'unknown'})`);
        if (d.description) lines.push(`  ${d.description}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_research_run',
    'Manually trigger a full research cycle. Runs causal analysis, hypothesis generation/testing, meta-learning optimization, and produces discoveries. Takes a few seconds.',
    {},
    async () => {
      const report: AnyResult = await call('research.run', {});
      const lines = [
        `Research Cycle #${report.cycle} Complete:`,
        `  Causal edges found: ${report.causalEdgesFound ?? 0}`,
        `  Causal chains found: ${report.causalChainsFound ?? 0}`,
        `  Hypotheses generated: ${report.hypothesesGenerated ?? 0}`,
        `  Hypotheses tested: ${report.hypothesesTested ?? 0}`,
        `  Hypotheses confirmed: ${report.hypothesesConfirmed ?? 0}`,
        `  Parameters optimized: ${report.parametersOptimized ?? 0}`,
        `  Discoveries produced: ${report.discoveriesProduced ?? 0}`,
        `  Duration: ${report.duration ?? 0}ms`,
      ];
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_research_reports',
    'Get detailed reports of past research cycles, showing what was analyzed, tested, and discovered in each cycle.',
    {
      limit: z.number().optional().describe('Max reports to return (default: 10)'),
    },
    async (params) => {
      const reports: AnyResult[] = await call('research.reports', {
        limit: params.limit ?? 10,
      }) as AnyResult[];
      if (!reports?.length) return textResult('No research cycles completed yet.');
      const lines = [`Research Reports (${reports.length}):\n`];
      for (const r of reports) {
        lines.push(`Cycle #${r.cycle} (${new Date(r.timestamp).toLocaleString()}):`);
        lines.push(`  Edges: ${r.causalEdgesFound ?? 0} | Chains: ${r.causalChainsFound ?? 0} | Hypotheses: ${r.hypothesesTested ?? 0} tested, ${r.hypothesesConfirmed ?? 0} confirmed | Discoveries: ${r.discoveriesProduced ?? 0}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Causal Analysis
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_causal_analyze',
    'Run causal analysis on collected events. Detects cause→effect relationships using Granger Causality. Returns newly found causal edges.',
    {},
    async () => {
      const edges: AnyResult[] = await call('causal.analyze', {}) as AnyResult[];
      if (!edges?.length) return textResult('No causal relationships found. Record more events first.');
      const lines = [`Causal Analysis — ${edges.length} relationship(s) found:\n`];
      for (const e of edges) {
        const strength = (e.strength * 100).toFixed(0);
        const confidence = (e.confidence * 100).toFixed(0);
        const lag = e.lag_ms ? `${(e.lag_ms / 1000).toFixed(1)}s lag` : 'unknown lag';
        lines.push(`  ${e.cause} → ${e.effect} (strength: ${strength}%, confidence: ${confidence}%, ${lag}, n=${e.sample_size})`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_causal_chains',
    'Find causal chains: sequences like A → B → C where each step has a causal relationship. Reveals multi-step cause-effect patterns.',
    {
      max_depth: z.number().optional().describe('Maximum chain length (default: 4)'),
    },
    async (params) => {
      const chains: AnyResult[] = await call('causal.chains', {
        maxDepth: params.max_depth ?? 4,
      }) as AnyResult[];
      if (!chains?.length) return textResult('No causal chains found. Need more causal edges first.');
      const lines = [`Causal Chains (${chains.length}):\n`];
      for (const c of chains) {
        const chainStr = c.chain.join(' → ');
        lines.push(`  ${chainStr}`);
        lines.push(`    Total strength: ${(c.totalStrength * 100).toFixed(0)}% | Total lag: ${(c.totalLag / 1000).toFixed(1)}s`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_causal_root_causes',
    'Root-cause analysis: find what causes a specific event type. Traces backwards through the causal graph to find origins.',
    {
      event_type: z.string().describe('The event type to find causes for (e.g., "error:timeout", "solution:failed")'),
    },
    async (params) => {
      const causes: AnyResult[] = await call('causal.causes', {
        type: params.event_type,
      }) as AnyResult[];
      if (!causes?.length) return textResult(`No known causes for "${params.event_type}". Need more causal data.`);
      const lines = [`Root Causes for "${params.event_type}" (${causes.length}):\n`];
      for (const c of causes) {
        lines.push(`  ${c.cause} → ${params.event_type} (strength: ${(c.strength * 100).toFixed(0)}%, confidence: ${(c.confidence * 100).toFixed(0)}%, lag: ${(c.lag_ms / 1000).toFixed(1)}s)`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_causal_effects',
    'Forward analysis: what happens when a specific event occurs? Shows all downstream effects with their strength and time lag.',
    {
      event_type: z.string().describe('The event type to analyze effects for'),
    },
    async (params) => {
      const effects: AnyResult[] = await call('causal.effects', {
        type: params.event_type,
      }) as AnyResult[];
      if (!effects?.length) return textResult(`No known effects of "${params.event_type}".`);
      const lines = [`Effects of "${params.event_type}" (${effects.length}):\n`];
      for (const e of effects) {
        lines.push(`  ${params.event_type} → ${e.effect} (strength: ${(e.strength * 100).toFixed(0)}%, confidence: ${(e.confidence * 100).toFixed(0)}%, lag: ${(e.lag_ms / 1000).toFixed(1)}s)`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_causal_record',
    'Record a new event for causal analysis. Events are used to detect cause→effect relationships over time.',
    {
      source: z.string().describe('Event source (e.g., "brain", "user", "system")'),
      event_type: z.string().describe('Event type (e.g., "error:reported", "solution:applied", "deploy:started")'),
      data: z.record(z.string(), z.unknown()).optional().describe('Optional event data/metadata'),
    },
    async (params) => {
      await call('causal.record', {
        source: params.source,
        type: params.event_type,
        data: params.data,
      });
      return textResult(`Event recorded: [${params.source}] ${params.event_type}`);
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Hypothesis Engine
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_hypothesis_list',
    'List all hypotheses with their current status: proposed, testing, confirmed, rejected, or inconclusive.',
    {
      status: z.enum(['proposed', 'testing', 'confirmed', 'rejected', 'inconclusive']).optional().describe('Filter by status'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const hypotheses: AnyResult[] = await call('hypothesis.list', {
        status: params.status,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!hypotheses?.length) return textResult('No hypotheses yet. Use brain_hypothesis_generate to create some.');
      const lines = [`Hypotheses (${hypotheses.length}):\n`];
      for (const h of hypotheses) {
        const pVal = h.p_value !== null && h.p_value !== undefined ? ` p=${h.p_value.toFixed(3)}` : '';
        lines.push(`  #${h.id} [${h.status.toUpperCase()}] ${h.statement}`);
        lines.push(`    Type: ${h.type} | Confidence: ${(h.confidence * 100).toFixed(0)}%${pVal} | Evidence: +${h.evidence_for}/-${h.evidence_against}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_hypothesis_propose',
    'Manually propose a hypothesis for Brain to test. You define the statement and conditions — Brain will evaluate it statistically.',
    {
      statement: z.string().describe('The hypothesis statement (e.g., "TypeScript errors are more frequent after 6pm")'),
      type: z.enum(['temporal', 'correlation', 'threshold', 'frequency']).describe('Hypothesis type'),
      variables: z.array(z.string()).describe('Event types involved in this hypothesis'),
      condition: z.object({
        type: z.enum(['temporal', 'correlation', 'threshold', 'frequency']),
        params: z.record(z.string(), z.unknown()),
      }).describe('Test condition parameters'),
    },
    async (params) => {
      const result: AnyResult = await call('hypothesis.propose', {
        statement: params.statement,
        type: params.type,
        source: 'user',
        variables: params.variables,
        condition: params.condition,
      });
      return textResult(`Hypothesis #${result.id} proposed: "${params.statement}" [${result.status}]`);
    },
  );

  server.tool(
    'brain_hypothesis_test',
    'Test a specific hypothesis immediately using statistical methods (Chi², Z-test). Returns p-value, confidence, and updated status.',
    {
      id: z.number().describe('Hypothesis ID to test'),
    },
    async (params) => {
      const result: AnyResult = await call('hypothesis.test', { id: params.id });
      if (!result) return textResult(`Hypothesis #${params.id} not found.`);
      const lines = [
        `Hypothesis #${result.hypothesisId} Test Result:`,
        `  Passed: ${result.passed ? 'YES' : 'NO'}`,
        `  P-value: ${result.pValue.toFixed(4)}`,
        `  Confidence: ${(result.confidence * 100).toFixed(0)}%`,
        `  Evidence: +${result.evidenceFor}/-${result.evidenceAgainst}`,
        `  New status: ${result.newStatus.toUpperCase()}`,
      ];
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_hypothesis_generate',
    'Automatically generate new hypotheses from current data patterns. Brain looks for temporal patterns, correlations, and thresholds.',
    {},
    async () => {
      const hypotheses: AnyResult[] = await call('hypothesis.generate', {}) as AnyResult[];
      if (!hypotheses?.length) return textResult('No hypotheses generated. Need more observation data.');
      const lines = [`Generated ${hypotheses.length} hypothesis(es):\n`];
      for (const h of hypotheses) {
        lines.push(`  #${h.id} [${h.type}] ${h.statement}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_hypothesis_summary',
    'Summary of all hypothesis activity: total counts by status, confirmation rate, and top confirmed hypotheses.',
    {},
    async () => {
      const summary: AnyResult = await call('hypothesis.summary', {});
      const lines = [
        'Hypothesis Summary:',
        `  Total: ${summary.total}`,
        `  Proposed: ${summary.proposed} | Testing: ${summary.testing}`,
        `  Confirmed: ${summary.confirmed} | Rejected: ${summary.rejected} | Inconclusive: ${summary.inconclusive ?? 0}`,
        `  Observations: ${summary.totalObservations}`,
      ];
      if (summary.total > 0) {
        const rate = summary.confirmed / Math.max(summary.confirmed + summary.rejected, 1);
        lines.push(`  Confirmation rate: ${(rate * 100).toFixed(0)}%`);
      }
      if (summary.topConfirmed?.length > 0) {
        lines.push('\n  Top Confirmed:');
        for (const h of summary.topConfirmed) {
          lines.push(`    #${h.id}: ${h.statement} (confidence: ${(h.confidence * 100).toFixed(0)}%)`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Meta-Learning
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_meta_status',
    'Get meta-learning status: current hyperparameters, optimization history, learning effectiveness trend (improving/stable/declining).',
    {},
    async () => {
      const status: AnyResult = await call('meta.status', {});
      const lines = [
        'Meta-Learning Status:',
        `  Snapshots: ${status.totalSnapshots}`,
        `  Optimizations: ${status.totalOptimizations}`,
        `  Best score: ${status.bestScore?.toFixed(3) ?? 'N/A'}`,
        `  Current score: ${status.currentScore?.toFixed(3) ?? 'N/A'}`,
        `  Trend: ${status.trend}`,
      ];
      if (status.recommendations?.length > 0) {
        lines.push('\n  Recommendations:');
        for (const r of status.recommendations) {
          lines.push(`    ${r.name}: ${r.currentValue.toFixed(3)} → ${r.recommendedValue.toFixed(3)} (expected +${(r.expectedImprovement * 100).toFixed(1)}%, confidence: ${(r.confidence * 100).toFixed(0)}%)`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_meta_optimize',
    'Run one meta-learning optimization step. Analyzes past performance snapshots and adjusts hyperparameters using Bayesian optimization.',
    {},
    async () => {
      const recommendations: AnyResult[] = await call('meta.optimize', {}) as AnyResult[];
      if (!recommendations?.length) return textResult('No optimizations recommended. Need more learning snapshots.');
      const lines = [`Meta-Learning Optimization — ${recommendations.length} change(s):\n`];
      for (const r of recommendations) {
        lines.push(`  ${r.name}: ${r.currentValue?.toFixed(3) ?? r.old_value?.toFixed(3)} → ${r.recommendedValue?.toFixed(3) ?? r.new_value?.toFixed(3)}`);
        if (r.reason) lines.push(`    Reason: ${r.reason}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_meta_history',
    'View the history of all parameter changes made by meta-learning, with reasons and improvement estimates.',
    {
      limit: z.number().optional().describe('Max entries (default: 20)'),
    },
    async (params) => {
      const history: AnyResult[] = await call('meta.history', {
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!history?.length) return textResult('No meta-learning history yet.');
      const lines = [`Meta-Learning History (${history.length}):\n`];
      for (const h of history) {
        lines.push(`  ${h.param_name}: ${h.old_value?.toFixed(3)} → ${h.new_value?.toFixed(3)}`);
        if (h.reason) lines.push(`    Reason: ${h.reason}`);
        if (h.created_at) lines.push(`    When: ${new Date(h.created_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_meta_params',
    'View current hyperparameter values and their allowed ranges. These are the parameters that meta-learning optimizes.',
    {},
    async () => {
      const params: AnyResult = await call('meta.params', {});
      const lines = ['Current Hyperparameters:\n'];
      if (typeof params === 'object' && params !== null) {
        for (const [name, value] of Object.entries(params)) {
          lines.push(`  ${name}: ${typeof value === 'number' ? (value as number).toFixed(4) : value}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );
}
