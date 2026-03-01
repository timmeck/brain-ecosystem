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
  // Self-Observer
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_self_observe',
    'Get self-observation statistics: how Brain monitors its own behavior, performance metrics, and operational patterns.',
    {},
    async () => {
      const stats: AnyResult = await call('observer.stats', {});
      const lines = [
        'Self-Observation Statistics:',
        `  Total observations: ${stats.totalObservations ?? 0}`,
        `  Observation types: ${stats.observationTypes ?? 0}`,
        `  Active monitors: ${stats.activeMonitors ?? 0}`,
        `  Insights generated: ${stats.insightsGenerated ?? 0}`,
        `  Last observation: ${stats.lastObservation ? new Date(stats.lastObservation).toLocaleString() : 'never'}`,
      ];
      if (stats.breakdown) {
        lines.push('', '  Breakdown by type:');
        for (const [type, count] of Object.entries(stats.breakdown)) {
          lines.push(`    ${type}: ${count}`);
        }
      }
      if (stats.healthScore !== undefined) {
        lines.push(`  Health score: ${stats.healthScore}/100`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_self_insights',
    'Get self-observation insights: patterns Brain has detected about its own behavior and performance. Filter by type and limit results.',
    {
      type: z.string().optional().describe('Filter by insight type (e.g., "performance", "pattern", "anomaly")'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const insights: AnyResult[] = await call('observer.insights', {
        type: params.type,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!insights?.length) return textResult('No self-observation insights yet. Brain needs more observation cycles.');
      const lines = [`Self-Observation Insights (${insights.length}):\n`];
      for (const i of insights) {
        lines.push(`  [${i.type ?? 'insight'}] ${i.title ?? i.description ?? 'Untitled'}`);
        if (i.description && i.title) lines.push(`    ${i.description.slice(0, 200)}`);
        if (i.confidence !== undefined) lines.push(`    Confidence: ${(i.confidence * 100).toFixed(0)}%`);
        if (i.created_at) lines.push(`    Observed: ${new Date(i.created_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_self_improvement_plan',
    'Get self-improvement plan: actionable suggestions Brain has generated based on observing its own performance patterns.',
    {},
    async () => {
      const plan: AnyResult = await call('observer.plan', {});
      if (!plan) return textResult('No improvement plan available yet. Brain needs more observation data.');
      const lines = ['Self-Improvement Plan:'];
      if (plan.summary) lines.push(`  Summary: ${plan.summary}`);
      if (plan.score !== undefined) lines.push(`  Current performance score: ${plan.score}/100`);
      if (plan.suggestions?.length) {
        lines.push('', '  Suggestions:');
        for (let idx = 0; idx < plan.suggestions.length; idx++) {
          const s = plan.suggestions[idx];
          lines.push(`    ${idx + 1}. ${s.title ?? s.description ?? s}`);
          if (s.impact) lines.push(`       Impact: ${s.impact}`);
          if (s.effort) lines.push(`       Effort: ${s.effort}`);
          if (s.priority !== undefined) lines.push(`       Priority: ${s.priority}`);
        }
      }
      if (plan.strengths?.length) {
        lines.push('', '  Strengths:');
        for (const s of plan.strengths) {
          lines.push(`    + ${s}`);
        }
      }
      if (plan.weaknesses?.length) {
        lines.push('', '  Weaknesses:');
        for (const w of plan.weaknesses) {
          lines.push(`    - ${w}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Adaptive Strategy
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_strategy_status',
    'Get adaptive strategy status: all strategies with their current parameters, performance metrics, and revert rates.',
    {},
    async () => {
      const status: AnyResult = await call('strategy.status', {});
      if (!status) return textResult('No adaptive strategies configured.');
      const lines = ['Adaptive Strategy Status:'];
      if (status.totalStrategies !== undefined) lines.push(`  Total strategies: ${status.totalStrategies}`);
      if (status.activeAdaptations !== undefined) lines.push(`  Active adaptations: ${status.activeAdaptations}`);
      if (status.revertRate !== undefined) lines.push(`  Revert rate: ${(status.revertRate * 100).toFixed(1)}%`);
      if (status.strategies?.length) {
        lines.push('', '  Strategies:');
        for (const s of status.strategies) {
          lines.push(`    ${s.name ?? s.id}: ${s.status ?? 'active'}`);
          if (s.parameters) {
            for (const [key, val] of Object.entries(s.parameters)) {
              lines.push(`      ${key}: ${typeof val === 'number' ? (val as number).toFixed(4) : val}`);
            }
          }
          if (s.performance !== undefined) lines.push(`      Performance: ${(s.performance * 100).toFixed(1)}%`);
          if (s.adaptations !== undefined) lines.push(`      Adaptations: ${s.adaptations}`);
          if (s.reverts !== undefined) lines.push(`      Reverts: ${s.reverts}`);
          lines.push('');
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_strategy_adaptations',
    'View adaptation history: past parameter changes made by the adaptive strategy engine. Filter by strategy name.',
    {
      strategy: z.string().optional().describe('Filter by strategy name'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const adaptations: AnyResult[] = await call('strategy.adaptations', {
        strategy: params.strategy,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!adaptations?.length) return textResult('No adaptations recorded yet.');
      const lines = [`Adaptation History (${adaptations.length}):\n`];
      for (const a of adaptations) {
        lines.push(`  #${a.id} [${a.strategy ?? 'unknown'}] ${a.parameter ?? 'param'}: ${a.oldValue ?? '?'} -> ${a.newValue ?? '?'}`);
        if (a.reason) lines.push(`    Reason: ${a.reason}`);
        if (a.reverted) lines.push(`    REVERTED`);
        if (a.created_at) lines.push(`    When: ${new Date(a.created_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_strategy_revert',
    'Revert a specific strategy adaptation. Rolls back a parameter change and records the reason.',
    {
      id: z.number().describe('Adaptation ID to revert'),
      reason: z.string().optional().describe('Reason for reverting'),
    },
    async (params) => {
      const result: AnyResult = await call('strategy.revert', {
        id: params.id,
        reason: params.reason,
      });
      if (!result) return textResult(`Adaptation #${params.id} not found or already reverted.`);
      return textResult(`Adaptation #${params.id} reverted.${params.reason ? ` Reason: ${params.reason}` : ''}`);
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Experiment Engine
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_experiment_list',
    'List all experiments. Filter by status to see running, completed, or aborted experiments.',
    {
      status: z.enum(['proposed', 'running', 'completed', 'aborted']).optional().describe('Filter by experiment status'),
    },
    async (params) => {
      const experiments: AnyResult[] = await call('experiment.list', {
        status: params.status,
      }) as AnyResult[];
      if (!experiments?.length) return textResult('No experiments found. Use brain_experiment_propose to create one.');
      const lines = [`Experiments (${experiments.length}):\n`];
      for (const e of experiments) {
        lines.push(`  #${e.id} [${(e.status ?? 'unknown').toUpperCase()}] ${e.name}`);
        if (e.hypothesis) lines.push(`    Hypothesis: ${e.hypothesis.slice(0, 150)}`);
        if (e.progress !== undefined) lines.push(`    Progress: ${e.progress}%`);
        if (e.created_at) lines.push(`    Created: ${new Date(e.created_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_experiment_propose',
    'Propose a new experiment with a hypothesis, independent/dependent variables, and control/treatment values. Brain will run it and collect statistical evidence.',
    {
      name: z.string().describe('Experiment name'),
      hypothesis: z.string().describe('The hypothesis to test (e.g., "Increasing learning rate improves convergence speed")'),
      independent_variable: z.string().describe('The variable being manipulated (e.g., "learning_rate")'),
      dependent_variable: z.string().describe('The variable being measured (e.g., "convergence_cycles")'),
      control_value: z.string().describe('Control group value (e.g., "0.01")'),
      treatment_value: z.string().describe('Treatment group value (e.g., "0.05")'),
      duration_cycles: z.number().optional().describe('How many cycles to run the experiment (default: determined by engine)'),
    },
    async (params) => {
      const result: AnyResult = await call('experiment.propose', {
        name: params.name,
        hypothesis: params.hypothesis,
        independent_variable: params.independent_variable,
        dependent_variable: params.dependent_variable,
        control_value: params.control_value,
        treatment_value: params.treatment_value,
        duration_cycles: params.duration_cycles,
      });
      const lines = [
        `Experiment #${result.id} proposed: "${params.name}"`,
        `  Hypothesis: ${params.hypothesis}`,
        `  IV: ${params.independent_variable} (control: ${params.control_value}, treatment: ${params.treatment_value})`,
        `  DV: ${params.dependent_variable}`,
      ];
      if (result.status) lines.push(`  Status: ${result.status}`);
      if (params.duration_cycles) lines.push(`  Duration: ${params.duration_cycles} cycles`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_experiment_status',
    'Get detailed status of a specific experiment: progress, collected data points, preliminary results.',
    {
      id: z.number().describe('Experiment ID'),
    },
    async (params) => {
      const exp: AnyResult = await call('experiment.get', { id: params.id });
      if (!exp) return textResult(`Experiment #${params.id} not found.`);
      const lines = [
        `Experiment #${exp.id}: ${exp.name}`,
        `  Status: ${(exp.status ?? 'unknown').toUpperCase()}`,
        `  Hypothesis: ${exp.hypothesis ?? 'N/A'}`,
        `  Independent variable: ${exp.independent_variable ?? 'N/A'}`,
        `  Dependent variable: ${exp.dependent_variable ?? 'N/A'}`,
        `  Control value: ${exp.control_value ?? 'N/A'}`,
        `  Treatment value: ${exp.treatment_value ?? 'N/A'}`,
      ];
      if (exp.progress !== undefined) lines.push(`  Progress: ${exp.progress}%`);
      if (exp.data_points !== undefined) lines.push(`  Data points: ${exp.data_points}`);
      if (exp.duration_cycles !== undefined) lines.push(`  Duration: ${exp.duration_cycles} cycles`);
      if (exp.current_cycle !== undefined) lines.push(`  Current cycle: ${exp.current_cycle}`);
      if (exp.preliminary_result) {
        lines.push('', '  Preliminary Result:');
        if (exp.preliminary_result.p_value !== undefined) lines.push(`    P-value: ${exp.preliminary_result.p_value.toFixed(4)}`);
        if (exp.preliminary_result.effect_size !== undefined) lines.push(`    Effect size: ${exp.preliminary_result.effect_size.toFixed(4)}`);
        if (exp.preliminary_result.significant !== undefined) lines.push(`    Significant: ${exp.preliminary_result.significant ? 'YES' : 'NO'}`);
      }
      if (exp.created_at) lines.push(`  Created: ${new Date(exp.created_at).toLocaleString()}`);
      if (exp.completed_at) lines.push(`  Completed: ${new Date(exp.completed_at).toLocaleString()}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_experiment_results',
    'Get results of completed experiments with full statistical analysis: p-values, effect sizes, confidence intervals.',
    {
      limit: z.number().optional().describe('Max results (default: 10)'),
    },
    async (params) => {
      const results: AnyResult[] = await call('experiment.results', {
        limit: params.limit ?? 10,
      }) as AnyResult[];
      if (!results?.length) return textResult('No completed experiment results yet.');
      const lines = [`Experiment Results (${results.length}):\n`];
      for (const r of results) {
        lines.push(`  #${r.id} ${r.name ?? 'Unnamed'} [${(r.status ?? 'completed').toUpperCase()}]`);
        if (r.hypothesis) lines.push(`    Hypothesis: ${r.hypothesis.slice(0, 150)}`);
        if (r.p_value !== undefined) lines.push(`    P-value: ${r.p_value.toFixed(4)}`);
        if (r.effect_size !== undefined) lines.push(`    Effect size: ${r.effect_size.toFixed(4)}`);
        if (r.significant !== undefined) lines.push(`    Significant: ${r.significant ? 'YES' : 'NO'}`);
        if (r.confidence_interval) lines.push(`    CI: [${r.confidence_interval[0]?.toFixed(4)}, ${r.confidence_interval[1]?.toFixed(4)}]`);
        if (r.conclusion) lines.push(`    Conclusion: ${r.conclusion}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_experiment_abort',
    'Abort a running experiment. Preserves any data collected so far.',
    {
      id: z.number().describe('Experiment ID to abort'),
    },
    async (params) => {
      const result: AnyResult = await call('experiment.abort', { id: params.id });
      if (!result) return textResult(`Experiment #${params.id} not found or not running.`);
      return textResult(`Experiment #${params.id} aborted. Data collected so far is preserved.`);
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Cross-Domain
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_cross_domain_correlations',
    'Find correlations across different domains (errors, trades, posts, etc.). Reveals hidden connections between seemingly unrelated events.',
    {
      limit: z.number().optional().describe('Max correlations to return (default: 20)'),
    },
    async (params) => {
      const correlations: AnyResult[] = await call('crossdomain.correlations', {
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!correlations?.length) return textResult('No cross-domain correlations found yet. Need more multi-domain data.');
      const lines = [`Cross-Domain Correlations (${correlations.length}):\n`];
      for (const c of correlations) {
        lines.push(`  ${c.domainA ?? c.domain_a ?? '?'} <-> ${c.domainB ?? c.domain_b ?? '?'}`);
        if (c.description) lines.push(`    ${c.description.slice(0, 200)}`);
        if (c.strength !== undefined) lines.push(`    Strength: ${(c.strength * 100).toFixed(1)}%`);
        if (c.confidence !== undefined) lines.push(`    Confidence: ${(c.confidence * 100).toFixed(0)}%`);
        if (c.sample_size !== undefined) lines.push(`    Sample size: ${c.sample_size}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_cross_domain_analyze',
    'Run a fresh cross-domain analysis. Scans recent events across all domains to discover new correlations and patterns.',
    {},
    async () => {
      const result: AnyResult = await call('crossdomain.analyze', {});
      if (!result) return textResult('Cross-domain analysis complete. No new findings.');
      const lines = ['Cross-Domain Analysis Complete:'];
      if (result.correlationsFound !== undefined) lines.push(`  New correlations found: ${result.correlationsFound}`);
      if (result.patternsDetected !== undefined) lines.push(`  Patterns detected: ${result.patternsDetected}`);
      if (result.domainsAnalyzed !== undefined) lines.push(`  Domains analyzed: ${result.domainsAnalyzed}`);
      if (result.eventsProcessed !== undefined) lines.push(`  Events processed: ${result.eventsProcessed}`);
      if (result.duration !== undefined) lines.push(`  Duration: ${result.duration}ms`);
      if (result.highlights?.length) {
        lines.push('', '  Highlights:');
        for (const h of result.highlights) {
          lines.push(`    - ${h}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_cross_domain_narrative',
    'Generate a human-readable narrative explaining cross-domain relationships. Tells the story of how different domains interact.',
    {},
    async () => {
      const result: AnyResult = await call('crossdomain.narrative', {});
      if (!result) return textResult('No cross-domain narrative available yet. Run an analysis first.');
      if (typeof result === 'string') return textResult(result);
      const lines = ['Cross-Domain Narrative:'];
      if (result.narrative) lines.push('', result.narrative);
      if (result.summary) lines.push('', `Summary: ${result.summary}`);
      if (result.keyFindings?.length) {
        lines.push('', 'Key Findings:');
        for (const f of result.keyFindings) {
          lines.push(`  - ${f}`);
        }
      }
      if (result.recommendations?.length) {
        lines.push('', 'Recommendations:');
        for (const r of result.recommendations) {
          lines.push(`  - ${r}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Counterfactual
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_what_if',
    'Ask a "what if" question: what would have happened if a variable had a different value? Uses counterfactual reasoning based on historical data.',
    {
      intervention: z.object({
        variable: z.string().describe('The variable to change (e.g., "learning_rate", "retry_count")'),
        actual_value: z.string().describe('The actual value that was used'),
        counterfactual_value: z.string().describe('The hypothetical alternative value'),
      }).describe('The counterfactual intervention'),
      outcome_variable: z.string().describe('The outcome variable to predict (e.g., "error_rate", "success_count")'),
    },
    async (params) => {
      const result: AnyResult = await call('counterfactual.whatif', {
        intervention: params.intervention,
        outcome_variable: params.outcome_variable,
      });
      if (!result) return textResult('Could not compute counterfactual. Need more historical data.');
      const lines = [
        'What-If Analysis:',
        `  Variable: ${params.intervention.variable}`,
        `  Actual value: ${params.intervention.actual_value}`,
        `  Counterfactual value: ${params.intervention.counterfactual_value}`,
        `  Outcome variable: ${params.outcome_variable}`,
      ];
      if (result.actual_outcome !== undefined) lines.push(`  Actual outcome: ${result.actual_outcome}`);
      if (result.predicted_outcome !== undefined) lines.push(`  Predicted outcome: ${result.predicted_outcome}`);
      if (result.difference !== undefined) lines.push(`  Difference: ${result.difference}`);
      if (result.confidence !== undefined) lines.push(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      if (result.explanation) lines.push(`  Explanation: ${result.explanation}`);
      if (result.caveats?.length) {
        lines.push('', '  Caveats:');
        for (const c of result.caveats) {
          lines.push(`    - ${c}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_counterfactual_history',
    'View past counterfactual analyses and their predictions vs actual outcomes.',
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
        lines.push(`  #${h.id} ${h.variable ?? '?'}: ${h.actual_value ?? '?'} -> ${h.counterfactual_value ?? '?'}`);
        if (h.outcome_variable) lines.push(`    Outcome: ${h.outcome_variable}`);
        if (h.predicted_outcome !== undefined) lines.push(`    Predicted: ${h.predicted_outcome}`);
        if (h.confidence !== undefined) lines.push(`    Confidence: ${(h.confidence * 100).toFixed(0)}%`);
        if (h.created_at) lines.push(`    When: ${new Date(h.created_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_intervention_impact',
    'Predict the impact of changing a variable to a new value. Estimates the effect on outcomes based on historical counterfactual data.',
    {
      variable: z.string().describe('The variable to change'),
      proposed_value: z.string().describe('The proposed new value'),
      current_value: z.string().describe('The current value'),
    },
    async (params) => {
      const result: AnyResult = await call('counterfactual.impact', {
        variable: params.variable,
        proposed_value: params.proposed_value,
        current_value: params.current_value,
      });
      if (!result) return textResult('Could not estimate intervention impact. Need more data.');
      const lines = [
        'Intervention Impact Analysis:',
        `  Variable: ${params.variable}`,
        `  Current: ${params.current_value} -> Proposed: ${params.proposed_value}`,
      ];
      if (result.estimated_impact !== undefined) lines.push(`  Estimated impact: ${result.estimated_impact}`);
      if (result.risk_level) lines.push(`  Risk level: ${result.risk_level}`);
      if (result.confidence !== undefined) lines.push(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      if (result.affected_outcomes?.length) {
        lines.push('', '  Affected outcomes:');
        for (const o of result.affected_outcomes) {
          lines.push(`    ${o.variable}: ${o.current ?? '?'} -> ${o.predicted ?? '?'} (${o.direction ?? '?'})`);
        }
      }
      if (result.recommendation) lines.push(`\n  Recommendation: ${result.recommendation}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Knowledge Distillation
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_knowledge_summary',
    'Get a summary of all distilled knowledge: principles, anti-patterns, and domain expertise that Brain has extracted from experience.',
    {},
    async () => {
      const summary: AnyResult = await call('knowledge.summary', {});
      if (!summary) return textResult('No distilled knowledge yet. Brain needs more experience.');
      const lines = ['Knowledge Summary:'];
      if (summary.totalPrinciples !== undefined) lines.push(`  Principles: ${summary.totalPrinciples}`);
      if (summary.totalAntiPatterns !== undefined) lines.push(`  Anti-patterns: ${summary.totalAntiPatterns}`);
      if (summary.domains?.length) lines.push(`  Domains: ${summary.domains.join(', ')}`);
      if (summary.totalExperience !== undefined) lines.push(`  Total experience entries: ${summary.totalExperience}`);
      if (summary.lastUpdated) lines.push(`  Last updated: ${new Date(summary.lastUpdated).toLocaleString()}`);
      if (summary.topPrinciples?.length) {
        lines.push('', '  Top Principles:');
        for (const p of summary.topPrinciples) {
          lines.push(`    - ${p.title ?? p.description ?? p}`);
          if (p.confidence !== undefined) lines.push(`      Confidence: ${(p.confidence * 100).toFixed(0)}%`);
        }
      }
      if (summary.topAntiPatterns?.length) {
        lines.push('', '  Top Anti-Patterns:');
        for (const a of summary.topAntiPatterns) {
          lines.push(`    - ${a.title ?? a.description ?? a}`);
          if (a.severity) lines.push(`      Severity: ${a.severity}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_knowledge_principles',
    'Get distilled principles: proven best practices and strategies that Brain has learned from data. Filter by domain.',
    {
      domain: z.string().optional().describe('Filter by domain (e.g., "error-handling", "trading", "deployment")'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const principles: AnyResult[] = await call('knowledge.principles', {
        domain: params.domain,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!principles?.length) return textResult('No principles distilled yet.');
      const lines = [`Distilled Principles (${principles.length}):\n`];
      for (const p of principles) {
        lines.push(`  #${p.id ?? '?'} ${p.title ?? p.name ?? 'Untitled'}`);
        if (p.description) lines.push(`    ${p.description.slice(0, 200)}`);
        if (p.domain) lines.push(`    Domain: ${p.domain}`);
        if (p.confidence !== undefined) lines.push(`    Confidence: ${(p.confidence * 100).toFixed(0)}%`);
        if (p.evidence_count !== undefined) lines.push(`    Evidence: ${p.evidence_count} observations`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_knowledge_anti_patterns',
    'Get distilled anti-patterns: known pitfalls, bad practices, and patterns to avoid. Learned from failures and negative outcomes.',
    {
      domain: z.string().optional().describe('Filter by domain'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const antiPatterns: AnyResult[] = await call('knowledge.antipatterns', {
        domain: params.domain,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!antiPatterns?.length) return textResult('No anti-patterns identified yet.');
      const lines = [`Anti-Patterns (${antiPatterns.length}):\n`];
      for (const a of antiPatterns) {
        lines.push(`  #${a.id ?? '?'} ${a.title ?? a.name ?? 'Untitled'}`);
        if (a.description) lines.push(`    ${a.description.slice(0, 200)}`);
        if (a.domain) lines.push(`    Domain: ${a.domain}`);
        if (a.severity) lines.push(`    Severity: ${a.severity}`);
        if (a.occurrences !== undefined) lines.push(`    Occurrences: ${a.occurrences}`);
        if (a.mitigation) lines.push(`    Mitigation: ${a.mitigation.slice(0, 150)}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_knowledge_package',
    'Package distilled knowledge for a domain into a transferable format. Useful for sharing learnings between projects or brains.',
    {
      domain: z.string().describe('Domain to package knowledge for'),
    },
    async (params) => {
      const pkg: AnyResult = await call('knowledge.package', {
        domain: params.domain,
      });
      if (!pkg) return textResult(`No knowledge available for domain "${params.domain}".`);
      const lines = [`Knowledge Package: ${params.domain}`];
      if (pkg.principles?.length) {
        lines.push(`\n  Principles (${pkg.principles.length}):`);
        for (const p of pkg.principles) {
          lines.push(`    - ${p.title ?? p.description ?? p}`);
        }
      }
      if (pkg.antiPatterns?.length) {
        lines.push(`\n  Anti-Patterns (${pkg.antiPatterns.length}):`);
        for (const a of pkg.antiPatterns) {
          lines.push(`    - ${a.title ?? a.description ?? a}`);
        }
      }
      if (pkg.rules?.length) {
        lines.push(`\n  Rules (${pkg.rules.length}):`);
        for (const r of pkg.rules) {
          lines.push(`    - ${r.pattern ?? r.description ?? r} -> ${r.action ?? ''}`);
        }
      }
      if (pkg.metadata) {
        lines.push('', '  Metadata:');
        if (pkg.metadata.version) lines.push(`    Version: ${pkg.metadata.version}`);
        if (pkg.metadata.created) lines.push(`    Created: ${new Date(pkg.metadata.created).toLocaleString()}`);
        if (pkg.metadata.experience_count) lines.push(`    Experience entries: ${pkg.metadata.experience_count}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_knowledge_evolution',
    'View how knowledge has evolved over time. Shows how principles and anti-patterns have changed across periods.',
    {
      domain: z.string().optional().describe('Filter by domain'),
      periods: z.number().optional().describe('Number of time periods to show (default: 5)'),
    },
    async (params) => {
      const evolution: AnyResult = await call('knowledge.evolution', {
        domain: params.domain,
        periods: params.periods ?? 5,
      });
      if (!evolution) return textResult('No knowledge evolution data available yet.');
      const lines = ['Knowledge Evolution:'];
      if (params.domain) lines.push(`  Domain: ${params.domain}`);
      if (evolution.periods?.length) {
        for (const p of evolution.periods) {
          lines.push(`\n  Period: ${p.label ?? p.start ?? '?'}`);
          if (p.principlesAdded !== undefined) lines.push(`    Principles added: ${p.principlesAdded}`);
          if (p.principlesRevised !== undefined) lines.push(`    Principles revised: ${p.principlesRevised}`);
          if (p.antiPatternsAdded !== undefined) lines.push(`    Anti-patterns added: ${p.antiPatternsAdded}`);
          if (p.knowledgeScore !== undefined) lines.push(`    Knowledge score: ${p.knowledgeScore}`);
        }
      }
      if (evolution.trend) lines.push(`\n  Overall trend: ${evolution.trend}`);
      if (evolution.summary) lines.push(`  Summary: ${evolution.summary}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Research Agenda
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_research_agenda',
    'View the current research agenda: prioritized list of open research questions and investigations Brain wants to pursue.',
    {
      limit: z.number().optional().describe('Max items (default: 20)'),
    },
    async (params) => {
      const items: AnyResult[] = await call('agenda.list', {
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!items?.length) return textResult('Research agenda is empty. Use brain_research_ask to add questions.');
      const lines = [`Research Agenda (${items.length}):\n`];
      for (const item of items) {
        const priority = item.priority !== undefined ? ` (priority: ${(item.priority * 100).toFixed(0)}%)` : '';
        lines.push(`  #${item.id} ${item.question ?? item.title ?? 'Untitled'}${priority}`);
        if (item.type) lines.push(`    Type: ${item.type}`);
        if (item.status) lines.push(`    Status: ${item.status}`);
        if (item.rationale) lines.push(`    Rationale: ${item.rationale.slice(0, 150)}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_research_next',
    'Get the next highest-priority research question to investigate. Use this to decide what Brain should focus on next.',
    {},
    async () => {
      const next: AnyResult = await call('agenda.next', {});
      if (!next) return textResult('No pending research questions. The agenda is clear.');
      const lines = [
        'Next Research Priority:',
        `  #${next.id}: ${next.question ?? next.title ?? 'Untitled'}`,
      ];
      if (next.type) lines.push(`  Type: ${next.type}`);
      if (next.priority !== undefined) lines.push(`  Priority: ${(next.priority * 100).toFixed(0)}%`);
      if (next.rationale) lines.push(`  Rationale: ${next.rationale}`);
      if (next.suggested_approach) lines.push(`  Suggested approach: ${next.suggested_approach}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_research_prioritize',
    'Change the priority of a research question. Higher priority means it will be investigated sooner.',
    {
      id: z.number().describe('Research question ID'),
      priority: z.number().min(0).max(1).describe('New priority (0.0 = lowest, 1.0 = highest)'),
    },
    async (params) => {
      const result: AnyResult = await call('agenda.prioritize', {
        id: params.id,
        priority: params.priority,
      });
      if (!result) return textResult(`Research question #${params.id} not found.`);
      return textResult(`Research question #${params.id} priority set to ${(params.priority * 100).toFixed(0)}%.`);
    },
  );

  server.tool(
    'brain_research_ask',
    'Add a new research question to the agenda. Brain will investigate it during research cycles.',
    {
      question: z.string().describe('The research question to investigate'),
      type: z.string().optional().describe('Question type (e.g., "causal", "optimization", "exploration", "validation")'),
    },
    async (params) => {
      const result: AnyResult = await call('agenda.ask', {
        question: params.question,
        type: params.type,
      });
      const lines = [
        `Research question #${result.id} added to agenda.`,
        `  Question: ${params.question}`,
      ];
      if (params.type) lines.push(`  Type: ${params.type}`);
      if (result.priority !== undefined) lines.push(`  Initial priority: ${(result.priority * 100).toFixed(0)}%`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Anomaly Detective
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_anomalies',
    'List detected anomalies: unusual patterns, outliers, and unexpected behaviors that Brain has found. Filter by type.',
    {
      type: z.string().optional().describe('Filter by anomaly type (e.g., "spike", "drift", "outlier", "pattern_break")'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const anomalies: AnyResult[] = await call('anomaly.list', {
        type: params.type,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!anomalies?.length) return textResult('No anomalies detected. Brain is monitoring for unusual patterns.');
      const lines = [`Detected Anomalies (${anomalies.length}):\n`];
      for (const a of anomalies) {
        lines.push(`  #${a.id} [${(a.type ?? 'unknown').toUpperCase()}] ${a.title ?? a.description ?? 'Untitled'}`);
        if (a.description && a.title) lines.push(`    ${a.description.slice(0, 200)}`);
        if (a.severity) lines.push(`    Severity: ${a.severity}`);
        if (a.confidence !== undefined) lines.push(`    Confidence: ${(a.confidence * 100).toFixed(0)}%`);
        if (a.metric) lines.push(`    Metric: ${a.metric}`);
        if (a.expected_value !== undefined && a.actual_value !== undefined) {
          lines.push(`    Expected: ${a.expected_value} | Actual: ${a.actual_value}`);
        }
        if (a.detected_at) lines.push(`    Detected: ${new Date(a.detected_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_anomaly_investigate',
    'Deep-dive into a specific anomaly: root cause analysis, related events, potential explanations, and recommended actions.',
    {
      id: z.number().describe('Anomaly ID to investigate'),
    },
    async (params) => {
      const result: AnyResult = await call('anomaly.investigate', { id: params.id });
      if (!result) return textResult(`Anomaly #${params.id} not found.`);
      const lines = [
        `Anomaly Investigation #${result.id ?? params.id}:`,
        `  Type: ${result.type ?? 'unknown'}`,
        `  Title: ${result.title ?? 'Untitled'}`,
      ];
      if (result.description) lines.push(`  Description: ${result.description}`);
      if (result.root_cause) lines.push(`  Root cause: ${result.root_cause}`);
      if (result.severity) lines.push(`  Severity: ${result.severity}`);
      if (result.confidence !== undefined) lines.push(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
      if (result.related_events?.length) {
        lines.push('', '  Related events:');
        for (const e of result.related_events) {
          lines.push(`    - ${e.type ?? e.event ?? e}: ${e.description ?? ''}`);
        }
      }
      if (result.explanations?.length) {
        lines.push('', '  Possible explanations:');
        for (const e of result.explanations) {
          lines.push(`    - ${e}`);
        }
      }
      if (result.recommendations?.length) {
        lines.push('', '  Recommended actions:');
        for (const r of result.recommendations) {
          lines.push(`    - ${r}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_anomaly_history',
    'View anomaly detection history: past anomalies with their resolution status and outcomes.',
    {
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const history: AnyResult[] = await call('anomaly.history', {
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!history?.length) return textResult('No anomaly history yet.');
      const lines = [`Anomaly History (${history.length}):\n`];
      for (const h of history) {
        const status = h.resolved ? 'RESOLVED' : 'OPEN';
        lines.push(`  #${h.id} [${status}] [${h.type ?? '?'}] ${h.title ?? h.description ?? 'Untitled'}`);
        if (h.severity) lines.push(`    Severity: ${h.severity}`);
        if (h.resolution) lines.push(`    Resolution: ${h.resolution.slice(0, 150)}`);
        if (h.detected_at) lines.push(`    Detected: ${new Date(h.detected_at).toLocaleString()}`);
        if (h.resolved_at) lines.push(`    Resolved: ${new Date(h.resolved_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_drift_report',
    'Get a drift report: detect gradual changes in metrics, behavior patterns, or data distributions over time.',
    {},
    async () => {
      const report: AnyResult = await call('anomaly.drift', {});
      if (!report) return textResult('No drift detected. All metrics are stable.');
      const lines = ['Drift Report:'];
      if (report.status) lines.push(`  Status: ${report.status}`);
      if (report.totalMetrics !== undefined) lines.push(`  Metrics monitored: ${report.totalMetrics}`);
      if (report.driftingMetrics !== undefined) lines.push(`  Drifting metrics: ${report.driftingMetrics}`);
      if (report.stableMetrics !== undefined) lines.push(`  Stable metrics: ${report.stableMetrics}`);
      if (report.drifts?.length) {
        lines.push('', '  Detected Drifts:');
        for (const d of report.drifts) {
          lines.push(`    ${d.metric ?? d.name ?? '?'}: ${d.direction ?? '?'}`);
          if (d.magnitude !== undefined) lines.push(`      Magnitude: ${d.magnitude}`);
          if (d.baseline !== undefined && d.current !== undefined) lines.push(`      Baseline: ${d.baseline} -> Current: ${d.current}`);
          if (d.significance !== undefined) lines.push(`      Significance: ${(d.significance * 100).toFixed(1)}%`);
          if (d.since) lines.push(`      Since: ${new Date(d.since).toLocaleString()}`);
          lines.push('');
        }
      }
      if (report.recommendation) lines.push(`  Recommendation: ${report.recommendation}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Research Journal
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'brain_journal',
    'Read research journal entries: observations, discoveries, hypotheses, experiments, and reflections. Filter by type.',
    {
      type: z.string().optional().describe('Filter by entry type (e.g., "observation", "discovery", "hypothesis", "experiment", "reflection")'),
      limit: z.number().optional().describe('Max entries (default: 20)'),
    },
    async (params) => {
      const entries: AnyResult[] = await call('journal.entries', {
        type: params.type,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!entries?.length) return textResult('No journal entries yet. Use brain_journal_write to add one.');
      const lines = [`Research Journal (${entries.length} entries):\n`];
      for (const e of entries) {
        const date = e.created_at ? new Date(e.created_at).toLocaleDateString() : '?';
        const sig = e.significance !== undefined ? ` [significance: ${e.significance}]` : '';
        lines.push(`  #${e.id} [${(e.type ?? 'entry').toUpperCase()}] ${date} — ${e.title ?? 'Untitled'}${sig}`);
        if (e.content) lines.push(`    ${e.content.slice(0, 200)}`);
        if (e.tags?.length) lines.push(`    Tags: ${Array.isArray(e.tags) ? e.tags.join(', ') : e.tags}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_journal_summary',
    'Get a summary of recent research journal activity: key themes, important discoveries, and active investigations.',
    {
      limit: z.number().optional().describe('Number of recent entries to summarize (default: 50)'),
    },
    async (params) => {
      const summary: AnyResult = await call('journal.summary', {
        limit: params.limit ?? 50,
      });
      if (!summary) return textResult('No journal data to summarize.');
      if (typeof summary === 'string') return textResult(summary);
      const lines = ['Research Journal Summary:'];
      if (summary.totalEntries !== undefined) lines.push(`  Total entries: ${summary.totalEntries}`);
      if (summary.recentEntries !== undefined) lines.push(`  Recent entries: ${summary.recentEntries}`);
      if (summary.byType) {
        lines.push('', '  Entries by type:');
        for (const [type, count] of Object.entries(summary.byType)) {
          lines.push(`    ${type}: ${count}`);
        }
      }
      if (summary.keyThemes?.length) {
        lines.push('', '  Key themes:');
        for (const t of summary.keyThemes) {
          lines.push(`    - ${t}`);
        }
      }
      if (summary.highlights?.length) {
        lines.push('', '  Highlights:');
        for (const h of summary.highlights) {
          lines.push(`    - ${h.title ?? h}`);
        }
      }
      if (summary.narrative) lines.push(`\n  ${summary.narrative}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_journal_milestones',
    'View research milestones: significant achievements, breakthroughs, and key findings from the journal.',
    {
      limit: z.number().optional().describe('Max milestones (default: 10)'),
    },
    async (params) => {
      const milestones: AnyResult[] = await call('journal.milestones', {
        limit: params.limit ?? 10,
      }) as AnyResult[];
      if (!milestones?.length) return textResult('No milestones recorded yet.');
      const lines = [`Research Milestones (${milestones.length}):\n`];
      for (const m of milestones) {
        const date = m.created_at ? new Date(m.created_at).toLocaleDateString() : '?';
        lines.push(`  #${m.id} [${date}] ${m.title ?? 'Untitled'}`);
        if (m.content ?? m.description) lines.push(`    ${(m.content ?? m.description).slice(0, 200)}`);
        if (m.significance !== undefined) lines.push(`    Significance: ${m.significance}`);
        if (m.impact) lines.push(`    Impact: ${m.impact}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'brain_journal_write',
    'Write a new research journal entry. Document observations, discoveries, reflections, or experiment notes.',
    {
      type: z.enum(['observation', 'discovery', 'hypothesis', 'experiment', 'reflection', 'milestone', 'note']).describe('Entry type'),
      title: z.string().describe('Entry title'),
      content: z.string().describe('Entry content — the full observation, discovery, or reflection'),
      tags: z.array(z.string()).describe('Tags for categorization'),
      significance: z.number().min(1).max(10).describe('Significance level (1 = minor note, 10 = major breakthrough)'),
    },
    async (params) => {
      const result: AnyResult = await call('journal.write', {
        type: params.type,
        title: params.title,
        content: params.content,
        tags: params.tags,
        significance: params.significance,
      });
      return textResult(`Journal entry #${result.id} written: [${params.type.toUpperCase()}] "${params.title}" (significance: ${params.significance}/10)`);
    },
  );

  server.tool(
    'brain_journal_search',
    'Search the research journal by keyword. Finds entries matching the query across titles, content, and tags.',
    {
      query: z.string().describe('Search query'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const results: AnyResult[] = await call('journal.search', {
        query: params.query,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!results?.length) return textResult(`No journal entries matching "${params.query}".`);
      const lines = [`Journal Search: "${params.query}" (${results.length} results):\n`];
      for (const r of results) {
        const date = r.created_at ? new Date(r.created_at).toLocaleDateString() : '?';
        lines.push(`  #${r.id} [${(r.type ?? 'entry').toUpperCase()}] ${date} — ${r.title ?? 'Untitled'}`);
        if (r.content) lines.push(`    ${r.content.slice(0, 150)}`);
        if (r.tags?.length) lines.push(`    Tags: ${Array.isArray(r.tags) ? r.tags.join(', ') : r.tags}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );
}
