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
    'trading_research_status',
    'Get current autonomous research status for Trading Brain: cycles completed, discoveries found, research pipeline health.',
    {},
    async () => {
      const status: AnyResult = await call('research.status', {});
      const lines = [
        'Trading Research Status:',
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
    'trading_research_discoveries',
    'Get trading research discoveries: causal chains between market events, confirmed trading hypotheses, optimized signal parameters.',
    {
      type: z.enum(['causal_chain', 'confirmed_hypothesis', 'parameter_optimization', 'anomaly', 'root_cause']).optional().describe('Filter by discovery type'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const discoveries: AnyResult[] = await call('research.discoveries', {
        type: params.type,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!discoveries?.length) return textResult('No trading discoveries yet. Run a research cycle first.');
      const lines = [`Trading Discoveries (${discoveries.length}):\n`];
      for (const d of discoveries) {
        lines.push(`[${d.type}] ${d.title} (confidence: ${(d.confidence * 100).toFixed(0)}%, impact: ${d.impact ?? 'unknown'})`);
        if (d.description) lines.push(`  ${d.description}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_research_run',
    'Manually trigger a full trading research cycle. Analyzes trade causality, tests signal hypotheses, optimizes parameters.',
    {},
    async () => {
      const report: AnyResult = await call('research.run', {});
      const lines = [
        `Trading Research Cycle #${report.cycle} Complete:`,
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
    'trading_research_reports',
    'Get detailed reports of past trading research cycles.',
    {
      limit: z.number().optional().describe('Max reports to return (default: 10)'),
    },
    async (params) => {
      const reports: AnyResult[] = await call('research.reports', {
        limit: params.limit ?? 10,
      }) as AnyResult[];
      if (!reports?.length) return textResult('No trading research cycles completed yet.');
      const lines = [`Trading Research Reports (${reports.length}):\n`];
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
    'trading_causal_analyze',
    'Run causal analysis on trading events. Detects cause→effect relationships between market signals, trade outcomes, and timing.',
    {},
    async () => {
      const edges: AnyResult[] = await call('causal.analyze', {}) as AnyResult[];
      if (!edges?.length) return textResult('No causal relationships found in trading data.');
      const lines = [`Trading Causal Analysis — ${edges.length} relationship(s):\n`];
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
    'trading_causal_chains',
    'Find causal chains in trading: e.g., signal_detected → trade_entered → stop_hit → loss_recorded. Reveals multi-step patterns.',
    {
      max_depth: z.number().optional().describe('Maximum chain length (default: 4)'),
    },
    async (params) => {
      const chains: AnyResult[] = await call('causal.chains', {
        maxDepth: params.max_depth ?? 4,
      }) as AnyResult[];
      if (!chains?.length) return textResult('No causal chains found in trading data.');
      const lines = [`Trading Causal Chains (${chains.length}):\n`];
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
    'trading_causal_root_causes',
    'Find root causes of a trading event. E.g., what causes "trade:loss"? Traces backwards through the causal graph.',
    {
      event_type: z.string().describe('The trading event type to find causes for (e.g., "trade:loss", "signal:false_positive")'),
    },
    async (params) => {
      const causes: AnyResult[] = await call('causal.causes', {
        type: params.event_type,
      }) as AnyResult[];
      if (!causes?.length) return textResult(`No known causes for "${params.event_type}" in trading data.`);
      const lines = [`Root Causes for "${params.event_type}" (${causes.length}):\n`];
      for (const c of causes) {
        lines.push(`  ${c.cause} → ${params.event_type} (strength: ${(c.strength * 100).toFixed(0)}%, confidence: ${(c.confidence * 100).toFixed(0)}%, lag: ${(c.lag_ms / 1000).toFixed(1)}s)`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_causal_effects',
    'Forward analysis: what happens after a trading event? E.g., effects of "signal:bullish" on trade outcomes.',
    {
      event_type: z.string().describe('The trading event type to analyze effects for'),
    },
    async (params) => {
      const effects: AnyResult[] = await call('causal.effects', {
        type: params.event_type,
      }) as AnyResult[];
      if (!effects?.length) return textResult(`No known effects of "${params.event_type}" in trading data.`);
      const lines = [`Effects of "${params.event_type}" (${effects.length}):\n`];
      for (const e of effects) {
        lines.push(`  ${params.event_type} → ${e.effect} (strength: ${(e.strength * 100).toFixed(0)}%, confidence: ${(e.confidence * 100).toFixed(0)}%, lag: ${(e.lag_ms / 1000).toFixed(1)}s)`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_causal_record',
    'Record a trading event for causal analysis. Use for market events, signal detections, trade actions.',
    {
      source: z.string().describe('Event source (e.g., "trading-brain", "market", "user")'),
      event_type: z.string().describe('Event type (e.g., "signal:bullish", "trade:entered", "market:volatile")'),
      data: z.record(z.string(), z.unknown()).optional().describe('Optional event data'),
    },
    async (params) => {
      await call('causal.record', {
        source: params.source,
        type: params.event_type,
        data: params.data,
      });
      return textResult(`Trading event recorded: [${params.source}] ${params.event_type}`);
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Hypothesis Engine
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'trading_hypothesis_list',
    'List all trading hypotheses: proposed, testing, confirmed, rejected. E.g., "Bullish signals after 2pm have higher win rate".',
    {
      status: z.enum(['proposed', 'testing', 'confirmed', 'rejected', 'inconclusive']).optional().describe('Filter by status'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const hypotheses: AnyResult[] = await call('hypothesis.list', {
        status: params.status,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!hypotheses?.length) return textResult('No trading hypotheses yet.');
      const lines = [`Trading Hypotheses (${hypotheses.length}):\n`];
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
    'trading_hypothesis_propose',
    'Propose a trading hypothesis for testing. E.g., "Trades after 3 consecutive losses have lower win rate".',
    {
      statement: z.string().describe('The hypothesis statement'),
      type: z.enum(['temporal', 'correlation', 'threshold', 'frequency']).describe('Hypothesis type'),
      variables: z.array(z.string()).describe('Event types involved'),
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
      return textResult(`Trading hypothesis #${result.id} proposed: "${params.statement}" [${result.status}]`);
    },
  );

  server.tool(
    'trading_hypothesis_test',
    'Test a specific trading hypothesis using statistical methods.',
    {
      id: z.number().describe('Hypothesis ID to test'),
    },
    async (params) => {
      const result: AnyResult = await call('hypothesis.test', { id: params.id });
      if (!result) return textResult(`Trading hypothesis #${params.id} not found.`);
      const lines = [
        `Trading Hypothesis #${result.hypothesisId} Test Result:`,
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
    'trading_hypothesis_generate',
    'Auto-generate trading hypotheses from current data: temporal patterns in trades, signal correlations, threshold effects.',
    {},
    async () => {
      const hypotheses: AnyResult[] = await call('hypothesis.generate', {}) as AnyResult[];
      if (!hypotheses?.length) return textResult('No trading hypotheses generated. Need more observation data.');
      const lines = [`Generated ${hypotheses.length} trading hypothesis(es):\n`];
      for (const h of hypotheses) {
        lines.push(`  #${h.id} [${h.type}] ${h.statement}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_hypothesis_summary',
    'Summary of trading hypothesis activity: counts by status, confirmation rate, top confirmed trading insights.',
    {},
    async () => {
      const summary: AnyResult = await call('hypothesis.summary', {});
      const lines = [
        'Trading Hypothesis Summary:',
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
        lines.push('\n  Top Confirmed Trading Insights:');
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
    'trading_meta_status',
    'Trading meta-learning status: current signal parameters, optimization history, learning effectiveness trend.',
    {},
    async () => {
      const status: AnyResult = await call('meta.status', {});
      const lines = [
        'Trading Meta-Learning Status:',
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
    'trading_meta_optimize',
    'Run one meta-learning optimization step for trading parameters: signal thresholds, risk limits, timing.',
    {},
    async () => {
      const recommendations: AnyResult[] = await call('meta.optimize', {}) as AnyResult[];
      if (!recommendations?.length) return textResult('No trading optimizations recommended. Need more learning snapshots.');
      const lines = [`Trading Meta-Learning Optimization — ${recommendations.length} change(s):\n`];
      for (const r of recommendations) {
        lines.push(`  ${r.name}: ${r.currentValue?.toFixed(3) ?? r.old_value?.toFixed(3)} → ${r.recommendedValue?.toFixed(3) ?? r.new_value?.toFixed(3)}`);
        if (r.reason) lines.push(`    Reason: ${r.reason}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_meta_history',
    'History of trading parameter changes made by meta-learning.',
    {
      limit: z.number().optional().describe('Max entries (default: 20)'),
    },
    async (params) => {
      const history: AnyResult[] = await call('meta.history', {
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!history?.length) return textResult('No trading meta-learning history yet.');
      const lines = [`Trading Meta-Learning History (${history.length}):\n`];
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
    'trading_meta_params',
    'View current trading hyperparameters: signal thresholds, risk parameters, timing settings.',
    {},
    async () => {
      const params: AnyResult = await call('meta.params', {});
      const lines = ['Current Trading Hyperparameters:\n'];
      if (typeof params === 'object' && params !== null) {
        for (const [name, value] of Object.entries(params)) {
          lines.push(`  ${name}: ${typeof value === 'number' ? (value as number).toFixed(4) : value}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );
}
