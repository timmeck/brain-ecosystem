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

/** Register advanced research tools using IPC client (for stdio MCP transport) */
export function registerAdvancedResearchTools(server: McpServer, ipc: IpcClient): void {
  registerAdvancedResearchToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register advanced research tools using router directly (for HTTP MCP transport inside daemon) */
export function registerAdvancedResearchToolsDirect(server: McpServer, router: IpcRouter): void {
  registerAdvancedResearchToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerAdvancedResearchToolsWithCaller(server: McpServer, call: BrainCall): void {

  // ═══════════════════════════════════════════════════════════════════
  // Self-Observer (3 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'marketing_self_observe',
    'Get self-observation statistics for Marketing Brain: internal metrics, decision quality, response patterns, and operational health.',
    {},
    async () => {
      const stats: AnyResult = await call('observer.stats', {});
      const lines = [
        'Marketing Brain Self-Observation Stats:',
        `  Observations recorded: ${stats.totalObservations ?? 0}`,
        `  Decision quality score: ${stats.decisionQuality?.toFixed(2) ?? 'N/A'}`,
        `  Average response time: ${stats.avgResponseTime ?? 'N/A'}ms`,
        `  Uptime: ${stats.uptime ?? 'N/A'}`,
      ];
      if (stats.breakdown) {
        lines.push('  Breakdown:');
        for (const [key, value] of Object.entries(stats.breakdown)) {
          lines.push(`    ${key}: ${value}`);
        }
      }
      if (stats.lastObservation) {
        lines.push(`  Last observation: ${new Date(stats.lastObservation).toLocaleString()}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_self_insights',
    'Get self-generated insights about Marketing Brain behavior: performance bottlenecks, recurring patterns, decision biases.',
    {
      type: z.string().optional().describe('Filter by insight type (e.g., "performance", "bias", "pattern")'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const insights: AnyResult[] = await call('observer.insights', {
        type: params.type,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!insights?.length) return textResult('No self-observation insights yet. The brain needs more operational data.');
      const lines = [`Marketing Brain Self-Insights (${insights.length}):\n`];
      for (const i of insights) {
        lines.push(`  [${i.type ?? 'general'}] ${i.title ?? i.description}`);
        if (i.description && i.title) lines.push(`    ${i.description}`);
        if (i.severity) lines.push(`    Severity: ${i.severity}`);
        if (i.actionable !== undefined) lines.push(`    Actionable: ${i.actionable ? 'yes' : 'no'}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_self_improvement_plan',
    'Generate a self-improvement plan for Marketing Brain based on observed weaknesses, missed opportunities, and performance trends.',
    {},
    async () => {
      const plan: AnyResult = await call('observer.plan', {});
      const lines = [
        'Marketing Brain Self-Improvement Plan:',
        `  Generated: ${plan.generatedAt ? new Date(plan.generatedAt).toLocaleString() : 'now'}`,
        `  Overall health: ${plan.overallHealth ?? 'N/A'}`,
      ];
      if (plan.strengths?.length) {
        lines.push('\n  Strengths:');
        for (const s of plan.strengths) {
          lines.push(`    + ${s}`);
        }
      }
      if (plan.weaknesses?.length) {
        lines.push('\n  Weaknesses:');
        for (const w of plan.weaknesses) {
          lines.push(`    - ${w}`);
        }
      }
      if (plan.actions?.length) {
        lines.push('\n  Recommended Actions:');
        for (const a of plan.actions) {
          const priority = a.priority ? ` [${a.priority}]` : '';
          lines.push(`    ${priority} ${a.description ?? a}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Adaptive Strategy (3 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'marketing_strategy_status',
    'Get current adaptive strategy status: active strategies, adaptation frequency, performance trends across platforms.',
    {},
    async () => {
      const status: AnyResult = await call('strategy.status', {});
      const lines = [
        'Marketing Adaptive Strategy Status:',
        `  Active strategies: ${status.activeStrategies ?? 0}`,
        `  Total adaptations: ${status.totalAdaptations ?? 0}`,
        `  Current effectiveness: ${status.effectiveness?.toFixed(2) ?? 'N/A'}`,
        `  Last adaptation: ${status.lastAdaptation ? new Date(status.lastAdaptation).toLocaleString() : 'never'}`,
      ];
      if (status.strategies?.length) {
        lines.push('\n  Strategies:');
        for (const s of status.strategies) {
          lines.push(`    ${s.name}: ${s.status} (score: ${s.score?.toFixed(2) ?? 'N/A'})`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_strategy_adaptations',
    'List recent strategy adaptations: what changed, why, and the measured impact on engagement and reach.',
    {
      strategy: z.string().optional().describe('Filter by strategy name'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const adaptations: AnyResult[] = await call('strategy.adaptations', {
        strategy: params.strategy,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!adaptations?.length) return textResult('No strategy adaptations recorded yet.');
      const lines = [`Strategy Adaptations (${adaptations.length}):\n`];
      for (const a of adaptations) {
        lines.push(`  [${a.strategy ?? 'unknown'}] ${a.description ?? a.change}`);
        if (a.reason) lines.push(`    Reason: ${a.reason}`);
        if (a.impact !== undefined) lines.push(`    Impact: ${a.impact > 0 ? '+' : ''}${(a.impact * 100).toFixed(1)}%`);
        if (a.timestamp) lines.push(`    When: ${new Date(a.timestamp).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_strategy_revert',
    'Revert a specific strategy adaptation. Rolls back a change that negatively impacted marketing performance.',
    {
      id: z.number().describe('Adaptation ID to revert'),
      reason: z.string().describe('Reason for reverting this adaptation'),
    },
    async (params) => {
      const result: AnyResult = await call('strategy.revert', {
        id: params.id,
        reason: params.reason,
      });
      return textResult(`Strategy adaptation #${params.id} reverted. ${result.message ?? `Reason: ${params.reason}`}`);
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Experiment Engine (5 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'marketing_experiment_list',
    'List all marketing experiments: A/B tests on content formats, posting times, hashtag strategies, platform targeting.',
    {},
    async () => {
      const experiments: AnyResult[] = await call('experiment.list', {}) as AnyResult[];
      if (!experiments?.length) return textResult('No marketing experiments yet. Propose one to get started.');
      const lines = [`Marketing Experiments (${experiments.length}):\n`];
      for (const e of experiments) {
        const status = e.status?.toUpperCase() ?? 'UNKNOWN';
        lines.push(`  #${e.id} [${status}] ${e.name ?? e.title}`);
        if (e.hypothesis) lines.push(`    Hypothesis: ${e.hypothesis}`);
        if (e.startedAt) lines.push(`    Started: ${new Date(e.startedAt).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_experiment_propose',
    'Propose a new marketing experiment. Define hypothesis, control/treatment groups, success metric, and duration.',
    {
      name: z.string().describe('Experiment name'),
      hypothesis: z.string().describe('What you expect to happen (e.g., "Video posts get 2x more engagement than text")'),
      control: z.string().describe('Control group description (baseline behavior)'),
      treatment: z.string().describe('Treatment group description (the change being tested)'),
      metric: z.string().describe('Primary success metric (e.g., "engagement_rate", "click_through", "follower_growth")'),
      duration_days: z.number().optional().describe('Experiment duration in days (default: 14)'),
      platform: z.string().optional().describe('Target platform for the experiment'),
    },
    async (params) => {
      const result: AnyResult = await call('experiment.propose', {
        name: params.name,
        hypothesis: params.hypothesis,
        control: params.control,
        treatment: params.treatment,
        metric: params.metric,
        durationDays: params.duration_days ?? 14,
        platform: params.platform,
      });
      return textResult(`Experiment #${result.id} proposed: "${params.name}" [${result.status ?? 'proposed'}]\n  Hypothesis: ${params.hypothesis}\n  Metric: ${params.metric}\n  Duration: ${params.duration_days ?? 14} days`);
    },
  );

  server.tool(
    'marketing_experiment_status',
    'Get detailed status of a specific marketing experiment including progress, current metrics, and statistical significance.',
    {
      id: z.number().describe('Experiment ID'),
    },
    async (params) => {
      const experiment: AnyResult = await call('experiment.get', { id: params.id });
      if (!experiment) return textResult(`Experiment #${params.id} not found.`);
      const lines = [
        `Experiment #${experiment.id}: ${experiment.name ?? experiment.title}`,
        `  Status: ${experiment.status?.toUpperCase() ?? 'UNKNOWN'}`,
        `  Hypothesis: ${experiment.hypothesis ?? 'N/A'}`,
        `  Metric: ${experiment.metric ?? 'N/A'}`,
        `  Control: ${experiment.control ?? 'N/A'}`,
        `  Treatment: ${experiment.treatment ?? 'N/A'}`,
      ];
      if (experiment.controlValue !== undefined) lines.push(`  Control value: ${experiment.controlValue}`);
      if (experiment.treatmentValue !== undefined) lines.push(`  Treatment value: ${experiment.treatmentValue}`);
      if (experiment.pValue !== undefined) lines.push(`  P-value: ${experiment.pValue.toFixed(4)}`);
      if (experiment.significant !== undefined) lines.push(`  Statistically significant: ${experiment.significant ? 'YES' : 'NO'}`);
      if (experiment.progress !== undefined) lines.push(`  Progress: ${(experiment.progress * 100).toFixed(0)}%`);
      if (experiment.startedAt) lines.push(`  Started: ${new Date(experiment.startedAt).toLocaleString()}`);
      if (experiment.endsAt) lines.push(`  Ends: ${new Date(experiment.endsAt).toLocaleString()}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_experiment_results',
    'Get final results and conclusions from a completed marketing experiment.',
    {
      id: z.number().describe('Experiment ID'),
    },
    async (params) => {
      const results: AnyResult = await call('experiment.results', { id: params.id });
      if (!results) return textResult(`No results for experiment #${params.id}. It may not be completed yet.`);
      const lines = [
        `Experiment #${params.id} Results:`,
        `  Outcome: ${results.outcome ?? 'N/A'}`,
        `  Winner: ${results.winner ?? 'N/A'}`,
      ];
      if (results.controlMetric !== undefined) lines.push(`  Control metric: ${results.controlMetric}`);
      if (results.treatmentMetric !== undefined) lines.push(`  Treatment metric: ${results.treatmentMetric}`);
      if (results.lift !== undefined) lines.push(`  Lift: ${results.lift > 0 ? '+' : ''}${(results.lift * 100).toFixed(1)}%`);
      if (results.pValue !== undefined) lines.push(`  P-value: ${results.pValue.toFixed(4)}`);
      if (results.confidence !== undefined) lines.push(`  Confidence: ${(results.confidence * 100).toFixed(0)}%`);
      if (results.conclusion) lines.push(`\n  Conclusion: ${results.conclusion}`);
      if (results.recommendation) lines.push(`  Recommendation: ${results.recommendation}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_experiment_abort',
    'Abort a running marketing experiment. Provides a reason and preserves partial data for analysis.',
    {
      id: z.number().describe('Experiment ID to abort'),
      reason: z.string().describe('Reason for aborting the experiment'),
    },
    async (params) => {
      const result: AnyResult = await call('experiment.abort', {
        id: params.id,
        reason: params.reason,
      });
      return textResult(`Experiment #${params.id} aborted. ${result.message ?? `Reason: ${params.reason}`}`);
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Cross-Domain (3 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'marketing_cross_domain_correlations',
    'Find cross-domain correlations between marketing events and external factors: trading signals, error patterns, market sentiment, time-of-day effects.',
    {},
    async () => {
      const correlations: AnyResult[] = await call('crossdomain.correlations', {}) as AnyResult[];
      if (!correlations?.length) return textResult('No cross-domain correlations found yet. Need more data from multiple brains.');
      const lines = [`Cross-Domain Correlations (${correlations.length}):\n`];
      for (const c of correlations) {
        const strength = c.strength !== undefined ? ` (strength: ${(c.strength * 100).toFixed(0)}%)` : '';
        lines.push(`  ${c.domainA ?? c.source} <-> ${c.domainB ?? c.target}${strength}`);
        if (c.description) lines.push(`    ${c.description}`);
        if (c.confidence !== undefined) lines.push(`    Confidence: ${(c.confidence * 100).toFixed(0)}%`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_cross_domain_analyze',
    'Analyze a specific cross-domain relationship between marketing and another domain (trading, errors, external events).',
    {
      domain_a: z.string().describe('First domain (e.g., "marketing", "content")'),
      domain_b: z.string().describe('Second domain (e.g., "trading", "errors", "market")'),
      event_type: z.string().optional().describe('Specific event type to analyze'),
    },
    async (params) => {
      const analysis: AnyResult = await call('crossdomain.analyze', {
        domainA: params.domain_a,
        domainB: params.domain_b,
        eventType: params.event_type,
      });
      if (!analysis) return textResult(`No cross-domain data between "${params.domain_a}" and "${params.domain_b}".`);
      const lines = [
        `Cross-Domain Analysis: ${params.domain_a} <-> ${params.domain_b}`,
        `  Data points: ${analysis.dataPoints ?? 0}`,
        `  Correlation: ${analysis.correlation?.toFixed(3) ?? 'N/A'}`,
        `  Direction: ${analysis.direction ?? 'N/A'}`,
      ];
      if (analysis.insights?.length) {
        lines.push('\n  Insights:');
        for (const ins of analysis.insights) {
          lines.push(`    - ${ins}`);
        }
      }
      if (analysis.lag !== undefined) lines.push(`  Typical lag: ${analysis.lag}ms`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_cross_domain_narrative',
    'Generate a narrative summary of cross-domain patterns: how marketing performance relates to trading outcomes, system health, and external factors.',
    {},
    async () => {
      const narrative: AnyResult = await call('crossdomain.narrative', {});
      if (!narrative) return textResult('No cross-domain narrative available yet. Need more correlated data.');
      if (typeof narrative === 'string') return textResult(narrative);
      const lines = ['Cross-Domain Narrative:\n'];
      if (narrative.summary) lines.push(`  ${narrative.summary}\n`);
      if (narrative.keyFindings?.length) {
        lines.push('  Key Findings:');
        for (const f of narrative.keyFindings) {
          lines.push(`    - ${f}`);
        }
      }
      if (narrative.recommendations?.length) {
        lines.push('\n  Recommendations:');
        for (const r of narrative.recommendations) {
          lines.push(`    - ${r}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Counterfactual (3 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'marketing_what_if',
    'Run a what-if analysis on marketing decisions. Simulate alternative scenarios: different posting times, platforms, content formats, or hashtag strategies.',
    {
      scenario: z.string().describe('Description of the alternative scenario (e.g., "What if we posted on LinkedIn instead of X?")'),
      variables: z.record(z.string(), z.unknown()).optional().describe('Variables to change (e.g., { "platform": "linkedin", "format": "article" })'),
      baseline: z.string().optional().describe('Baseline to compare against (e.g., a post ID or strategy name)'),
    },
    async (params) => {
      const result: AnyResult = await call('counterfactual.whatif', {
        scenario: params.scenario,
        variables: params.variables,
        baseline: params.baseline,
      });
      if (!result) return textResult('Could not generate what-if analysis. Need more historical data.');
      const lines = [
        `What-If Analysis: ${params.scenario}`,
        `  Predicted outcome: ${result.predictedOutcome ?? 'N/A'}`,
      ];
      if (result.baselineOutcome !== undefined) lines.push(`  Baseline outcome: ${result.baselineOutcome}`);
      if (result.difference !== undefined) lines.push(`  Difference: ${result.difference > 0 ? '+' : ''}${(result.difference * 100).toFixed(1)}%`);
      if (result.confidence !== undefined) lines.push(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      if (result.assumptions?.length) {
        lines.push('\n  Assumptions:');
        for (const a of result.assumptions) {
          lines.push(`    - ${a}`);
        }
      }
      if (result.caveats?.length) {
        lines.push('\n  Caveats:');
        for (const c of result.caveats) {
          lines.push(`    - ${c}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_counterfactual_history',
    'View past what-if analyses and their accuracy when actual outcomes became available.',
    {
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const history: AnyResult[] = await call('counterfactual.history', {
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!history?.length) return textResult('No counterfactual analyses recorded yet.');
      const lines = [`Counterfactual History (${history.length}):\n`];
      for (const h of history) {
        lines.push(`  #${h.id} "${h.scenario}"`);
        lines.push(`    Predicted: ${h.predictedOutcome ?? 'N/A'} | Actual: ${h.actualOutcome ?? 'pending'}`);
        if (h.accuracy !== undefined) lines.push(`    Accuracy: ${(h.accuracy * 100).toFixed(0)}%`);
        if (h.createdAt) lines.push(`    Date: ${new Date(h.createdAt).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_intervention_impact',
    'Measure the causal impact of a specific marketing intervention: did a strategy change actually cause the observed outcome?',
    {
      intervention: z.string().describe('Description of the intervention (e.g., "Switched to video-first content on X")'),
      start_date: z.string().optional().describe('ISO date when the intervention started'),
      end_date: z.string().optional().describe('ISO date when the intervention ended (or now if ongoing)'),
      metric: z.string().optional().describe('Metric to measure impact on (e.g., "engagement_rate", "follower_growth")'),
    },
    async (params) => {
      const result: AnyResult = await call('counterfactual.impact', {
        intervention: params.intervention,
        startDate: params.start_date,
        endDate: params.end_date,
        metric: params.metric,
      });
      if (!result) return textResult('Could not measure intervention impact. Need sufficient pre/post data.');
      const lines = [
        `Intervention Impact Analysis:`,
        `  Intervention: ${params.intervention}`,
        `  Metric: ${params.metric ?? result.metric ?? 'engagement'}`,
        `  Before: ${result.beforeValue ?? 'N/A'}`,
        `  After: ${result.afterValue ?? 'N/A'}`,
      ];
      if (result.causalImpact !== undefined) lines.push(`  Causal impact: ${result.causalImpact > 0 ? '+' : ''}${(result.causalImpact * 100).toFixed(1)}%`);
      if (result.significant !== undefined) lines.push(`  Statistically significant: ${result.significant ? 'YES' : 'NO'}`);
      if (result.pValue !== undefined) lines.push(`  P-value: ${result.pValue.toFixed(4)}`);
      if (result.conclusion) lines.push(`\n  Conclusion: ${result.conclusion}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Knowledge Distillation (5 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'marketing_knowledge_summary',
    'Get a distilled summary of everything Marketing Brain has learned: top-performing strategies, platform insights, audience behavior, and timing patterns.',
    {},
    async () => {
      const summary: AnyResult = await call('knowledge.summary', {});
      if (!summary) return textResult('No distilled knowledge available yet. The brain needs more data.');
      const lines = ['Marketing Knowledge Summary:\n'];
      if (summary.totalLearnings !== undefined) lines.push(`  Total learnings: ${summary.totalLearnings}`);
      if (summary.domains?.length) {
        lines.push('  Knowledge domains:');
        for (const d of summary.domains) {
          lines.push(`    ${d.name}: ${d.count} insight(s) (maturity: ${d.maturity ?? 'N/A'})`);
        }
      }
      if (summary.topInsights?.length) {
        lines.push('\n  Top Insights:');
        for (const i of summary.topInsights) {
          lines.push(`    - ${i}`);
        }
      }
      if (summary.lastUpdated) lines.push(`\n  Last updated: ${new Date(summary.lastUpdated).toLocaleString()}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_knowledge_principles',
    'Extract core marketing principles learned from data: proven rules about content, timing, platform behavior, and audience engagement.',
    {
      domain: z.string().optional().describe('Filter by knowledge domain (e.g., "content", "timing", "platform", "audience")'),
      min_confidence: z.number().optional().describe('Minimum confidence threshold (0-1, default: 0.7)'),
    },
    async (params) => {
      const principles: AnyResult[] = await call('knowledge.principles', {
        domain: params.domain,
        minConfidence: params.min_confidence ?? 0.7,
      }) as AnyResult[];
      if (!principles?.length) return textResult('No marketing principles distilled yet. Need more confirmed hypotheses and patterns.');
      const lines = [`Marketing Principles (${principles.length}):\n`];
      for (const p of principles) {
        const conf = p.confidence !== undefined ? ` (confidence: ${(p.confidence * 100).toFixed(0)}%)` : '';
        lines.push(`  [${p.domain ?? 'general'}] ${p.principle ?? p.description}${conf}`);
        if (p.evidence) lines.push(`    Evidence: ${p.evidence}`);
        if (p.exceptions) lines.push(`    Exceptions: ${p.exceptions}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_knowledge_anti_patterns',
    'List discovered anti-patterns: strategies, formats, timings, or approaches that consistently underperform or harm engagement.',
    {
      domain: z.string().optional().describe('Filter by domain (e.g., "content", "timing", "hashtags")'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const antiPatterns: AnyResult[] = await call('knowledge.antipatterns', {
        domain: params.domain,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!antiPatterns?.length) return textResult('No marketing anti-patterns identified yet.');
      const lines = [`Marketing Anti-Patterns (${antiPatterns.length}):\n`];
      for (const ap of antiPatterns) {
        lines.push(`  [${ap.domain ?? 'general'}] ${ap.pattern ?? ap.description}`);
        if (ap.impact) lines.push(`    Impact: ${ap.impact}`);
        if (ap.frequency !== undefined) lines.push(`    Frequency: ${ap.frequency} occurrence(s)`);
        if (ap.avoidance) lines.push(`    How to avoid: ${ap.avoidance}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_knowledge_package',
    'Package marketing knowledge into a transferable format: exportable rules, strategies, and insights that can be shared or applied to new contexts.',
    {
      format: z.enum(['summary', 'detailed', 'actionable']).optional().describe('Package format (default: summary)'),
      domains: z.array(z.string()).optional().describe('Domains to include (default: all)'),
    },
    async (params) => {
      const pkg: AnyResult = await call('knowledge.package', {
        format: params.format ?? 'summary',
        domains: params.domains,
      });
      if (!pkg) return textResult('No marketing knowledge available to package.');
      const lines = ['Marketing Knowledge Package:\n'];
      if (pkg.format) lines.push(`  Format: ${pkg.format}`);
      if (pkg.totalItems !== undefined) lines.push(`  Total items: ${pkg.totalItems}`);
      if (pkg.generatedAt) lines.push(`  Generated: ${new Date(pkg.generatedAt).toLocaleString()}`);
      if (pkg.principles?.length) {
        lines.push('\n  Principles:');
        for (const p of pkg.principles) {
          lines.push(`    - ${typeof p === 'string' ? p : p.description ?? p.principle}`);
        }
      }
      if (pkg.rules?.length) {
        lines.push('\n  Rules:');
        for (const r of pkg.rules) {
          lines.push(`    - ${typeof r === 'string' ? r : r.description ?? r.rule}`);
        }
      }
      if (pkg.strategies?.length) {
        lines.push('\n  Strategies:');
        for (const s of pkg.strategies) {
          lines.push(`    - ${typeof s === 'string' ? s : s.description ?? s.name}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_knowledge_evolution',
    'Track how marketing knowledge has evolved over time: new learnings, revised beliefs, deprecated strategies, and confidence shifts.',
    {
      period: z.enum(['day', 'week', 'month', 'all']).optional().describe('Time period to analyze (default: week)'),
    },
    async (params) => {
      const evolution: AnyResult = await call('knowledge.evolution', {
        period: params.period ?? 'week',
      });
      if (!evolution) return textResult('No knowledge evolution data available yet.');
      const lines = [
        `Knowledge Evolution (${params.period ?? 'week'}):`,
        `  New learnings: ${evolution.newLearnings ?? 0}`,
        `  Revised beliefs: ${evolution.revisedBeliefs ?? 0}`,
        `  Deprecated: ${evolution.deprecated ?? 0}`,
        `  Strengthened: ${evolution.strengthened ?? 0}`,
      ];
      if (evolution.timeline?.length) {
        lines.push('\n  Timeline:');
        for (const t of evolution.timeline) {
          lines.push(`    ${t.date ?? t.timestamp}: ${t.event ?? t.description}`);
        }
      }
      if (evolution.trend) lines.push(`\n  Overall trend: ${evolution.trend}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Research Agenda (4 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'marketing_research_agenda',
    'List the current marketing research agenda: open questions, planned investigations, and priority research topics.',
    {},
    async () => {
      const items: AnyResult[] = await call('agenda.list', {}) as AnyResult[];
      if (!items?.length) return textResult('Research agenda is empty. Use marketing_research_ask to add questions.');
      const lines = [`Marketing Research Agenda (${items.length}):\n`];
      for (const item of items) {
        const priority = item.priority ? ` [P${item.priority}]` : '';
        const status = item.status ? ` (${item.status})` : '';
        lines.push(`  #${item.id}${priority}${status} ${item.question ?? item.topic}`);
        if (item.rationale) lines.push(`    Rationale: ${item.rationale}`);
        if (item.estimatedCycles !== undefined) lines.push(`    Estimated cycles: ${item.estimatedCycles}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_research_next',
    'Get the next highest-priority research question to investigate. Returns the most impactful open question with suggested approach.',
    {},
    async () => {
      const next: AnyResult = await call('agenda.next', {});
      if (!next) return textResult('No pending research questions. The agenda is clear or empty.');
      const lines = [
        'Next Research Priority:',
        `  Question: ${next.question ?? next.topic}`,
        `  Priority: ${next.priority ?? 'N/A'}`,
        `  Status: ${next.status ?? 'pending'}`,
      ];
      if (next.rationale) lines.push(`  Rationale: ${next.rationale}`);
      if (next.suggestedApproach) lines.push(`  Suggested approach: ${next.suggestedApproach}`);
      if (next.dataRequired?.length) {
        lines.push('  Data required:');
        for (const d of next.dataRequired) {
          lines.push(`    - ${d}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_research_prioritize',
    'Re-prioritize the research agenda. Adjust priority of a specific research question based on new information or changing goals.',
    {
      id: z.number().describe('Research question ID'),
      priority: z.number().describe('New priority (1 = highest)'),
      reason: z.string().optional().describe('Reason for priority change'),
    },
    async (params) => {
      const result: AnyResult = await call('agenda.prioritize', {
        id: params.id,
        priority: params.priority,
        reason: params.reason,
      });
      return textResult(`Research question #${params.id} priority set to P${params.priority}.${params.reason ? ` Reason: ${params.reason}` : ''} ${result.message ?? ''}`);
    },
  );

  server.tool(
    'marketing_research_ask',
    'Add a new question to the marketing research agenda. The brain will investigate it during future research cycles.',
    {
      question: z.string().describe('The research question (e.g., "Do thread posts outperform single posts on X?")'),
      priority: z.number().optional().describe('Priority (1 = highest, default: 3)'),
      rationale: z.string().optional().describe('Why this question matters'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
    },
    async (params) => {
      const result: AnyResult = await call('agenda.ask', {
        question: params.question,
        priority: params.priority ?? 3,
        rationale: params.rationale,
        tags: params.tags,
      });
      return textResult(`Research question #${result.id} added to agenda: "${params.question}" [P${params.priority ?? 3}]`);
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Anomaly Detective (4 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'marketing_anomalies',
    'List detected marketing anomalies: unexpected engagement spikes/drops, unusual audience behavior, platform algorithm changes, viral events.',
    {
      severity: z.enum(['low', 'medium', 'high', 'critical']).optional().describe('Filter by severity'),
      status: z.enum(['new', 'investigating', 'explained', 'dismissed']).optional().describe('Filter by status'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const anomalies: AnyResult[] = await call('anomaly.list', {
        severity: params.severity,
        status: params.status,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!anomalies?.length) return textResult('No marketing anomalies detected.');
      const lines = [`Marketing Anomalies (${anomalies.length}):\n`];
      for (const a of anomalies) {
        const sev = a.severity ? ` [${a.severity.toUpperCase()}]` : '';
        const st = a.status ? ` (${a.status})` : '';
        lines.push(`  #${a.id}${sev}${st} ${a.title ?? a.description}`);
        if (a.metric) lines.push(`    Metric: ${a.metric} — Expected: ${a.expected ?? 'N/A'}, Actual: ${a.actual ?? 'N/A'}`);
        if (a.detectedAt) lines.push(`    Detected: ${new Date(a.detectedAt).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_anomaly_investigate',
    'Deep investigation of a specific marketing anomaly. Analyzes context, correlations, and potential causes.',
    {
      id: z.number().describe('Anomaly ID to investigate'),
    },
    async (params) => {
      const investigation: AnyResult = await call('anomaly.investigate', { id: params.id });
      if (!investigation) return textResult(`Anomaly #${params.id} not found.`);
      const lines = [
        `Anomaly Investigation #${params.id}:`,
        `  Title: ${investigation.title ?? 'N/A'}`,
        `  Severity: ${investigation.severity ?? 'N/A'}`,
        `  Status: ${investigation.status ?? 'N/A'}`,
      ];
      if (investigation.context) lines.push(`  Context: ${investigation.context}`);
      if (investigation.possibleCauses?.length) {
        lines.push('\n  Possible Causes:');
        for (const c of investigation.possibleCauses) {
          const likelihood = c.likelihood !== undefined ? ` (likelihood: ${(c.likelihood * 100).toFixed(0)}%)` : '';
          lines.push(`    - ${typeof c === 'string' ? c : c.description ?? c.cause}${likelihood}`);
        }
      }
      if (investigation.correlatedEvents?.length) {
        lines.push('\n  Correlated Events:');
        for (const e of investigation.correlatedEvents) {
          lines.push(`    - ${typeof e === 'string' ? e : e.description ?? e.event}`);
        }
      }
      if (investigation.recommendation) lines.push(`\n  Recommendation: ${investigation.recommendation}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_anomaly_history',
    'View historical anomaly data: past anomalies, their resolutions, and patterns in anomaly occurrence.',
    {
      days: z.number().optional().describe('Look back period in days (default: 30)'),
      limit: z.number().optional().describe('Max results (default: 50)'),
    },
    async (params) => {
      const history: AnyResult[] = await call('anomaly.history', {
        days: params.days ?? 30,
        limit: params.limit ?? 50,
      }) as AnyResult[];
      if (!history?.length) return textResult('No anomaly history available for the specified period.');
      const lines = [`Anomaly History — last ${params.days ?? 30} days (${history.length} anomalies):\n`];
      for (const h of history) {
        const resolution = h.resolution ? ` → ${h.resolution}` : '';
        lines.push(`  #${h.id} [${h.severity ?? 'N/A'}] ${h.title ?? h.description}${resolution}`);
        if (h.detectedAt) lines.push(`    Detected: ${new Date(h.detectedAt).toLocaleString()}`);
        if (h.resolvedAt) lines.push(`    Resolved: ${new Date(h.resolvedAt).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_drift_report',
    'Generate a drift report: detect gradual shifts in engagement patterns, audience behavior, platform algorithms, or content effectiveness over time.',
    {
      metric: z.string().optional().describe('Specific metric to check for drift (e.g., "engagement_rate", "reach")'),
      period: z.enum(['week', 'month', 'quarter']).optional().describe('Analysis period (default: month)'),
    },
    async (params) => {
      const report: AnyResult = await call('anomaly.drift', {
        metric: params.metric,
        period: params.period ?? 'month',
      });
      if (!report) return textResult('No drift data available. Need more historical data for drift detection.');
      const lines = [
        `Marketing Drift Report (${params.period ?? 'month'}):`,
        `  Overall drift detected: ${report.driftDetected ? 'YES' : 'NO'}`,
        `  Metrics analyzed: ${report.metricsAnalyzed ?? 0}`,
      ];
      if (report.drifts?.length) {
        lines.push('\n  Detected Drifts:');
        for (const d of report.drifts) {
          const dir = d.direction === 'up' ? '\u2191' : d.direction === 'down' ? '\u2193' : '\u2194';
          lines.push(`    ${dir} ${d.metric}: ${d.description ?? `shifted ${d.magnitude?.toFixed(2) ?? 'N/A'}`}`);
          if (d.startedAt) lines.push(`      Started: ${new Date(d.startedAt).toLocaleString()}`);
          if (d.significance !== undefined) lines.push(`      Significance: ${(d.significance * 100).toFixed(0)}%`);
        }
      }
      if (report.stableMetrics?.length) {
        lines.push('\n  Stable Metrics:');
        for (const m of report.stableMetrics) {
          lines.push(`    = ${typeof m === 'string' ? m : m.metric}`);
        }
      }
      if (report.summary) lines.push(`\n  Summary: ${report.summary}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Research Journal (5 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'marketing_journal',
    'List recent research journal entries: observations, experiment notes, insights, and learnings documented over time.',
    {
      type: z.enum(['observation', 'experiment', 'insight', 'learning', 'decision', 'question']).optional().describe('Filter by entry type'),
      limit: z.number().optional().describe('Max entries (default: 20)'),
    },
    async (params) => {
      const entries: AnyResult[] = await call('journal.entries', {
        type: params.type,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!entries?.length) return textResult('Research journal is empty. Use marketing_journal_write to add entries.');
      const lines = [`Research Journal (${entries.length} entries):\n`];
      for (const e of entries) {
        const tag = e.type ? `[${e.type}]` : '';
        const date = e.createdAt ? new Date(e.createdAt).toLocaleString() : '';
        lines.push(`  #${e.id} ${tag} ${e.title ?? '(untitled)'} ${date ? `— ${date}` : ''}`);
        if (e.content) lines.push(`    ${e.content.slice(0, 200)}${e.content.length > 200 ? '...' : ''}`);
        if (e.tags?.length) lines.push(`    Tags: ${e.tags.join(', ')}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_journal_summary',
    'Get a summary of the research journal: entry counts by type, recent themes, and key takeaways from documented research.',
    {
      period: z.enum(['day', 'week', 'month', 'all']).optional().describe('Time period for summary (default: week)'),
    },
    async (params) => {
      const summary: AnyResult = await call('journal.summary', {
        period: params.period ?? 'week',
      });
      if (!summary) return textResult('No journal data for the specified period.');
      const lines = [
        `Research Journal Summary (${params.period ?? 'week'}):`,
        `  Total entries: ${summary.totalEntries ?? 0}`,
      ];
      if (summary.byType) {
        lines.push('  By type:');
        for (const [type, count] of Object.entries(summary.byType)) {
          lines.push(`    ${type}: ${count}`);
        }
      }
      if (summary.themes?.length) {
        lines.push('\n  Recurring themes:');
        for (const t of summary.themes) {
          lines.push(`    - ${typeof t === 'string' ? t : t.name ?? t.theme}`);
        }
      }
      if (summary.keyTakeaways?.length) {
        lines.push('\n  Key takeaways:');
        for (const k of summary.keyTakeaways) {
          lines.push(`    - ${k}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_journal_milestones',
    'List research milestones: significant breakthroughs, confirmed hypotheses, strategy changes, and major discoveries.',
    {
      limit: z.number().optional().describe('Max milestones (default: 20)'),
    },
    async (params) => {
      const milestones: AnyResult[] = await call('journal.milestones', {
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!milestones?.length) return textResult('No research milestones recorded yet.');
      const lines = [`Research Milestones (${milestones.length}):\n`];
      for (const m of milestones) {
        const date = m.date ? new Date(m.date).toLocaleString() : m.createdAt ? new Date(m.createdAt).toLocaleString() : '';
        lines.push(`  ${m.title ?? m.description} ${date ? `(${date})` : ''}`);
        if (m.impact) lines.push(`    Impact: ${m.impact}`);
        if (m.details) lines.push(`    Details: ${m.details}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'marketing_journal_write',
    'Write a new research journal entry. Document observations, experiment notes, insights, learnings, decisions, or open questions.',
    {
      title: z.string().describe('Entry title'),
      content: z.string().describe('Entry content (observations, notes, analysis)'),
      type: z.enum(['observation', 'experiment', 'insight', 'learning', 'decision', 'question']).describe('Entry type'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
      references: z.array(z.number()).optional().describe('IDs of related journal entries, experiments, or discoveries'),
    },
    async (params) => {
      const result: AnyResult = await call('journal.write', {
        title: params.title,
        content: params.content,
        type: params.type,
        tags: params.tags,
        references: params.references,
      });
      return textResult(`Journal entry #${result.id} written: "${params.title}" [${params.type}]`);
    },
  );

  server.tool(
    'marketing_journal_search',
    'Search the research journal by keyword, tag, or topic. Find past observations, notes, and insights relevant to current research.',
    {
      query: z.string().describe('Search query (keyword, topic, or phrase)'),
      type: z.enum(['observation', 'experiment', 'insight', 'learning', 'decision', 'question']).optional().describe('Filter by entry type'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const results: AnyResult[] = await call('journal.search', {
        query: params.query,
        type: params.type,
        tags: params.tags,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!results?.length) return textResult(`No journal entries found for "${params.query}".`);
      const lines = [`Journal Search Results for "${params.query}" (${results.length}):\n`];
      for (const r of results) {
        const tag = r.type ? `[${r.type}]` : '';
        const date = r.createdAt ? new Date(r.createdAt).toLocaleString() : '';
        lines.push(`  #${r.id} ${tag} ${r.title ?? '(untitled)'} ${date ? `— ${date}` : ''}`);
        if (r.content) lines.push(`    ${r.content.slice(0, 200)}${r.content.length > 200 ? '...' : ''}`);
        if (r.relevance !== undefined) lines.push(`    Relevance: ${(r.relevance * 100).toFixed(0)}%`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );
}
