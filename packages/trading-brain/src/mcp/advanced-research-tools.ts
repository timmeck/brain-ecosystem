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
    'trading_self_observe',
    'Get self-observation statistics for Trading Brain: decision quality scores, bias detection, confidence calibration, and behavioral metrics.',
    {},
    async () => {
      const stats: AnyResult = await call('observer.stats', {});
      if (!stats) return textResult('No self-observation data available yet.');
      const lines = [
        'Trading Self-Observation Stats:',
        `  Total observations: ${stats.totalObservations ?? 0}`,
        `  Decision quality score: ${stats.decisionQuality?.toFixed(2) ?? 'N/A'}`,
        `  Confidence calibration: ${stats.confidenceCalibration?.toFixed(2) ?? 'N/A'}`,
        `  Bias score: ${stats.biasScore?.toFixed(2) ?? 'N/A'}`,
      ];
      if (stats.biases && Object.keys(stats.biases).length > 0) {
        lines.push('  Detected biases:');
        for (const [bias, severity] of Object.entries(stats.biases)) {
          lines.push(`    ${bias}: ${(severity as number).toFixed(2)}`);
        }
      }
      if (stats.streaks) {
        lines.push(`  Current streak: ${stats.streaks.current ?? 'none'}`);
        lines.push(`  Best streak: ${stats.streaks.best ?? 0}`);
        lines.push(`  Worst streak: ${stats.streaks.worst ?? 0}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_self_insights',
    'Get self-observer insights about Trading Brain behavior: patterns in decision-making, recurring mistakes, improvement opportunities.',
    {
      type: z.string().optional().describe('Filter by insight type (e.g., "bias", "improvement", "pattern", "warning")'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const insights: AnyResult[] = await call('observer.insights', {
        type: params.type,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!insights?.length) return textResult('No self-observer insights available yet. The brain needs more trading activity to generate insights.');
      const lines = [`Trading Self-Observer Insights (${insights.length}):\n`];
      for (const insight of insights) {
        lines.push(`[${(insight.type ?? 'general').toUpperCase()}] ${insight.title ?? insight.description}`);
        if (insight.description && insight.title) lines.push(`  ${insight.description}`);
        if (insight.severity) lines.push(`  Severity: ${insight.severity}`);
        if (insight.actionable) lines.push(`  Action: ${insight.actionable}`);
        if (insight.created_at) lines.push(`  Detected: ${new Date(insight.created_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_self_improvement_plan',
    'Generate a self-improvement plan for Trading Brain based on observed weaknesses, biases, and performance gaps.',
    {},
    async () => {
      const plan: AnyResult = await call('observer.plan', {});
      if (!plan) return textResult('No improvement plan available. Need more self-observation data.');
      const lines = [
        'Trading Brain Self-Improvement Plan:',
        `  Overall health: ${plan.overallHealth ?? 'unknown'}`,
        `  Priority areas: ${plan.priorityAreas?.length ?? 0}`,
      ];
      if (plan.priorityAreas?.length > 0) {
        lines.push('\n  Priority Areas:');
        for (const area of plan.priorityAreas) {
          lines.push(`    ${area.name}: ${area.description ?? ''}`);
          if (area.currentScore !== undefined) lines.push(`      Current: ${area.currentScore.toFixed(2)} | Target: ${area.targetScore?.toFixed(2) ?? 'N/A'}`);
          if (area.actions?.length > 0) {
            for (const action of area.actions) {
              lines.push(`      - ${action}`);
            }
          }
        }
      }
      if (plan.timeline) {
        lines.push(`\n  Estimated improvement timeline: ${plan.timeline}`);
      }
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Adaptive Strategy (3 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'trading_strategy_status',
    'Get current adaptive strategy status for Trading Brain: active strategies, adaptation state, regime detection, and performance under current conditions.',
    {},
    async () => {
      const status: AnyResult = await call('strategy.status', {});
      if (!status) return textResult('No adaptive strategy data available.');
      const lines = [
        'Trading Adaptive Strategy Status:',
        `  Active strategy: ${status.activeStrategy ?? 'default'}`,
        `  Current regime: ${status.currentRegime ?? 'unknown'}`,
        `  Adaptation count: ${status.adaptationCount ?? 0}`,
        `  Strategy confidence: ${status.confidence?.toFixed(2) ?? 'N/A'}`,
      ];
      if (status.performance) {
        lines.push('  Current performance:');
        lines.push(`    Win rate: ${(status.performance.winRate * 100).toFixed(1)}%`);
        lines.push(`    Avg profit: ${status.performance.avgProfit?.toFixed(2) ?? 'N/A'}%`);
        lines.push(`    Sharpe: ${status.performance.sharpe?.toFixed(2) ?? 'N/A'}`);
      }
      if (status.regimeHistory?.length > 0) {
        lines.push('  Recent regime changes:');
        for (const r of status.regimeHistory.slice(0, 5)) {
          lines.push(`    ${r.from} → ${r.to} (${new Date(r.timestamp).toLocaleString()})`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_strategy_adaptations',
    'List past strategy adaptations: parameter changes, regime switches, rule modifications made by the adaptive strategy engine.',
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
      const lines = [`Trading Strategy Adaptations (${adaptations.length}):\n`];
      for (const a of adaptations) {
        lines.push(`#${a.id} [${a.type ?? 'adaptation'}] ${a.description ?? a.summary ?? 'Strategy adapted'}`);
        if (a.strategy) lines.push(`  Strategy: ${a.strategy}`);
        if (a.trigger) lines.push(`  Trigger: ${a.trigger}`);
        if (a.changes && Object.keys(a.changes).length > 0) {
          lines.push('  Changes:');
          for (const [param, change] of Object.entries(a.changes as Record<string, AnyResult>)) {
            lines.push(`    ${param}: ${change.from ?? '?'} → ${change.to ?? '?'}`);
          }
        }
        if (a.created_at) lines.push(`  When: ${new Date(a.created_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_strategy_revert',
    'Revert a specific strategy adaptation. Undoes a parameter change or rule modification if it degraded trading performance.',
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
      const lines = [
        `Strategy Adaptation #${params.id} Reverted:`,
        `  Status: ${result.status ?? 'reverted'}`,
      ];
      if (result.revertedChanges && Object.keys(result.revertedChanges).length > 0) {
        lines.push('  Reverted changes:');
        for (const [param, val] of Object.entries(result.revertedChanges)) {
          lines.push(`    ${param}: restored to ${val}`);
        }
      }
      if (params.reason) lines.push(`  Reason: ${params.reason}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Experiment Engine (5 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'trading_experiment_list',
    'List trading experiments: A/B tests on signal parameters, strategy variants, risk settings. Shows active, completed, and proposed experiments.',
    {
      status: z.enum(['proposed', 'running', 'completed', 'aborted']).optional().describe('Filter by experiment status'),
      limit: z.number().optional().describe('Max results (default: 20)'),
    },
    async (params) => {
      const experiments: AnyResult[] = await call('experiment.list', {
        status: params.status,
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!experiments?.length) return textResult('No trading experiments found.');
      const lines = [`Trading Experiments (${experiments.length}):\n`];
      for (const e of experiments) {
        lines.push(`#${e.id} [${(e.status ?? 'unknown').toUpperCase()}] ${e.name}`);
        if (e.hypothesis) lines.push(`  Hypothesis: ${e.hypothesis}`);
        lines.push(`  Variable: ${e.independent_variable ?? e.independentVariable ?? 'N/A'}`);
        lines.push(`  Control: ${e.control_value ?? e.controlValue ?? 'N/A'} | Treatment: ${e.treatment_value ?? e.treatmentValue ?? 'N/A'}`);
        if (e.cycles_completed !== undefined || e.cyclesCompleted !== undefined) {
          lines.push(`  Progress: ${e.cycles_completed ?? e.cyclesCompleted ?? 0}/${e.duration_cycles ?? e.durationCycles ?? '?'} cycles`);
        }
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_experiment_propose',
    'Propose a new trading experiment: define a hypothesis, independent/dependent variables, control and treatment values to A/B test.',
    {
      name: z.string().describe('Experiment name (e.g., "RSI threshold optimization")'),
      hypothesis: z.string().describe('What you expect to happen (e.g., "Lower RSI threshold increases win rate")'),
      independent_variable: z.string().describe('The variable being changed (e.g., "rsi_threshold")'),
      dependent_variable: z.string().describe('The measured outcome (e.g., "win_rate")'),
      control_value: z.string().describe('Control group value (e.g., "30")'),
      treatment_value: z.string().describe('Treatment group value (e.g., "25")'),
      duration_cycles: z.number().optional().describe('Number of cycles to run (default: engine decides)'),
    },
    async (params) => {
      const result: AnyResult = await call('experiment.propose', {
        name: params.name,
        hypothesis: params.hypothesis,
        independentVariable: params.independent_variable,
        dependentVariable: params.dependent_variable,
        controlValue: params.control_value,
        treatmentValue: params.treatment_value,
        durationCycles: params.duration_cycles,
      });
      if (!result) return textResult('Failed to propose experiment.');
      return textResult(`Trading experiment #${result.id} proposed: "${params.name}"\n  Hypothesis: ${params.hypothesis}\n  Testing: ${params.independent_variable} = ${params.control_value} vs ${params.treatment_value}\n  Measuring: ${params.dependent_variable}\n  Status: ${result.status ?? 'proposed'}`);
    },
  );

  server.tool(
    'trading_experiment_status',
    'Get detailed status and progress of a specific trading experiment including interim results.',
    {
      id: z.number().describe('Experiment ID'),
    },
    async (params) => {
      const exp: AnyResult = await call('experiment.get', { id: params.id });
      if (!exp) return textResult(`Trading experiment #${params.id} not found.`);
      const lines = [
        `Trading Experiment #${exp.id}: ${exp.name}`,
        `  Status: ${(exp.status ?? 'unknown').toUpperCase()}`,
        `  Hypothesis: ${exp.hypothesis ?? 'N/A'}`,
        `  Variable: ${exp.independent_variable ?? exp.independentVariable ?? 'N/A'}`,
        `  Control: ${exp.control_value ?? exp.controlValue ?? 'N/A'}`,
        `  Treatment: ${exp.treatment_value ?? exp.treatmentValue ?? 'N/A'}`,
        `  Measuring: ${exp.dependent_variable ?? exp.dependentVariable ?? 'N/A'}`,
      ];
      if (exp.cycles_completed !== undefined || exp.cyclesCompleted !== undefined) {
        lines.push(`  Progress: ${exp.cycles_completed ?? exp.cyclesCompleted ?? 0}/${exp.duration_cycles ?? exp.durationCycles ?? '?'} cycles`);
      }
      if (exp.controlResult !== undefined || exp.control_result !== undefined) {
        lines.push(`  Control result: ${exp.controlResult ?? exp.control_result}`);
        lines.push(`  Treatment result: ${exp.treatmentResult ?? exp.treatment_result}`);
      }
      if (exp.pValue !== undefined || exp.p_value !== undefined) {
        lines.push(`  P-value: ${(exp.pValue ?? exp.p_value)?.toFixed(4) ?? 'N/A'}`);
        lines.push(`  Significant: ${exp.significant ? 'YES' : 'NO'}`);
      }
      if (exp.conclusion) lines.push(`  Conclusion: ${exp.conclusion}`);
      if (exp.created_at) lines.push(`  Created: ${new Date(exp.created_at).toLocaleString()}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_experiment_results',
    'Get results of completed trading experiments: which variant won, statistical significance, and recommendations.',
    {
      limit: z.number().optional().describe('Max results (default: 10)'),
    },
    async (params) => {
      const results: AnyResult[] = await call('experiment.results', {
        limit: params.limit ?? 10,
      }) as AnyResult[];
      if (!results?.length) return textResult('No completed trading experiment results yet.');
      const lines = [`Trading Experiment Results (${results.length}):\n`];
      for (const r of results) {
        lines.push(`#${r.id} ${r.name}`);
        lines.push(`  Winner: ${r.winner ?? 'inconclusive'}`);
        if (r.controlResult !== undefined || r.control_result !== undefined) {
          lines.push(`  Control: ${r.controlResult ?? r.control_result} | Treatment: ${r.treatmentResult ?? r.treatment_result}`);
        }
        if (r.pValue !== undefined || r.p_value !== undefined) {
          lines.push(`  P-value: ${(r.pValue ?? r.p_value)?.toFixed(4)} | Significant: ${r.significant ? 'YES' : 'NO'}`);
        }
        if (r.recommendation) lines.push(`  Recommendation: ${r.recommendation}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_experiment_abort',
    'Abort a running trading experiment. Use when an experiment is clearly harmful or no longer relevant.',
    {
      id: z.number().describe('Experiment ID to abort'),
    },
    async (params) => {
      const result: AnyResult = await call('experiment.abort', { id: params.id });
      if (!result) return textResult(`Trading experiment #${params.id} not found or not running.`);
      return textResult(`Trading experiment #${params.id} aborted.\n  Name: ${result.name ?? 'N/A'}\n  Cycles completed: ${result.cycles_completed ?? result.cyclesCompleted ?? 0}\n  Status: ${result.status ?? 'aborted'}`);
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Cross-Domain (3 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'trading_cross_domain_correlations',
    'Find cross-domain correlations between trading and other brain domains (errors, marketing activity). Reveals hidden connections.',
    {
      limit: z.number().optional().describe('Max correlations to return (default: 20)'),
    },
    async (params) => {
      const correlations: AnyResult[] = await call('crossdomain.correlations', {
        limit: params.limit ?? 20,
      }) as AnyResult[];
      if (!correlations?.length) return textResult('No cross-domain correlations found. Need activity across multiple brain domains.');
      const lines = [`Cross-Domain Correlations (${correlations.length}):\n`];
      for (const c of correlations) {
        const strength = typeof c.strength === 'number' ? ` (strength: ${(c.strength * 100).toFixed(0)}%)` : '';
        const confidence = typeof c.confidence === 'number' ? ` confidence: ${(c.confidence * 100).toFixed(0)}%` : '';
        lines.push(`${c.domain_a ?? c.domainA} <-> ${c.domain_b ?? c.domainB}${strength}${confidence}`);
        if (c.description) lines.push(`  ${c.description}`);
        if (c.pattern) lines.push(`  Pattern: ${c.pattern}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_cross_domain_analyze',
    'Run a cross-domain analysis: detect how trading performance correlates with error patterns, deployment events, and marketing activity.',
    {},
    async () => {
      const analysis: AnyResult = await call('crossdomain.analyze', {});
      if (!analysis) return textResult('Cross-domain analysis produced no results. Need more data across domains.');
      const lines = ['Cross-Domain Analysis for Trading:\n'];
      if (analysis.correlationsFound !== undefined) {
        lines.push(`  Correlations found: ${analysis.correlationsFound}`);
      }
      if (analysis.insights?.length > 0) {
        lines.push('  Insights:');
        for (const insight of analysis.insights) {
          lines.push(`    - ${insight.description ?? insight}`);
          if (insight.impact) lines.push(`      Impact: ${insight.impact}`);
        }
      }
      if (analysis.domains?.length > 0) {
        lines.push(`  Domains analyzed: ${analysis.domains.join(', ')}`);
      }
      if (analysis.recommendations?.length > 0) {
        lines.push('\n  Recommendations:');
        for (const rec of analysis.recommendations) {
          lines.push(`    - ${rec}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_cross_domain_narrative',
    'Generate a narrative summary of cross-domain interactions: how trading, errors, and marketing events are connected over time.',
    {},
    async () => {
      const narrative: AnyResult = await call('crossdomain.narrative', {});
      if (!narrative) return textResult('No cross-domain narrative available. Need activity across multiple brain domains.');
      if (typeof narrative === 'string') return textResult(narrative);
      const lines = ['Cross-Domain Narrative:\n'];
      if (narrative.title) lines.push(`  ${narrative.title}\n`);
      if (narrative.summary) lines.push(`  ${narrative.summary}\n`);
      if (narrative.chapters?.length > 0) {
        for (const chapter of narrative.chapters) {
          lines.push(`  --- ${chapter.title ?? 'Chapter'} ---`);
          lines.push(`  ${chapter.content ?? chapter.description ?? ''}`);
          lines.push('');
        }
      }
      if (narrative.conclusion) lines.push(`  Conclusion: ${narrative.conclusion}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Counterfactual (3 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'trading_what_if',
    'Run a what-if counterfactual analysis on trading decisions: "What if I had used a different stop-loss?" or "What if I entered earlier?".',
    {},
    async () => {
      const scenarios: AnyResult = await call('counterfactual.whatif', {});
      if (!scenarios) return textResult('No what-if scenarios available. Need completed trades for counterfactual analysis.');
      if (Array.isArray(scenarios)) {
        if (!scenarios.length) return textResult('No what-if scenarios generated.');
        const lines = [`What-If Scenarios (${scenarios.length}):\n`];
        for (const s of scenarios) {
          lines.push(`[${s.type ?? 'scenario'}] ${s.description ?? s.title ?? 'Scenario'}`);
          if (s.actualOutcome !== undefined) lines.push(`  Actual outcome: ${s.actualOutcome}`);
          if (s.counterfactualOutcome !== undefined) lines.push(`  Counterfactual outcome: ${s.counterfactualOutcome}`);
          if (s.difference !== undefined) lines.push(`  Difference: ${s.difference}`);
          if (s.insight) lines.push(`  Insight: ${s.insight}`);
          lines.push('');
        }
        return textResult(lines.join('\n'));
      }
      const lines = ['What-If Analysis:\n'];
      if (scenarios.totalScenarios !== undefined) lines.push(`  Total scenarios: ${scenarios.totalScenarios}`);
      if (scenarios.bestAlternative) lines.push(`  Best alternative: ${scenarios.bestAlternative}`);
      if (scenarios.potentialImprovement) lines.push(`  Potential improvement: ${scenarios.potentialImprovement}`);
      if (scenarios.summary) lines.push(`\n  ${scenarios.summary}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_counterfactual_history',
    'View history of counterfactual analyses: past what-if explorations and their conclusions about alternative trading decisions.',
    {},
    async () => {
      const history: AnyResult[] = await call('counterfactual.history', {}) as AnyResult[];
      if (!history?.length) return textResult('No counterfactual analysis history. Run what-if analyses first.');
      const lines = [`Counterfactual History (${history.length}):\n`];
      for (const h of history) {
        lines.push(`#${h.id ?? ''} ${h.description ?? h.title ?? 'Analysis'}`);
        if (h.scenario) lines.push(`  Scenario: ${h.scenario}`);
        if (h.actualOutcome !== undefined) lines.push(`  Actual: ${h.actualOutcome}`);
        if (h.counterfactualOutcome !== undefined) lines.push(`  Alternative: ${h.counterfactualOutcome}`);
        if (h.lesson) lines.push(`  Lesson: ${h.lesson}`);
        if (h.created_at) lines.push(`  Date: ${new Date(h.created_at).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_intervention_impact',
    'Analyze the impact of past trading interventions: parameter changes, strategy switches, rule additions. Did they actually help?',
    {},
    async () => {
      const impact: AnyResult = await call('counterfactual.impact', {});
      if (!impact) return textResult('No intervention impact data available.');
      if (Array.isArray(impact)) {
        if (!impact.length) return textResult('No interventions recorded yet.');
        const lines = [`Intervention Impact Analysis (${impact.length}):\n`];
        for (const i of impact) {
          lines.push(`${i.intervention ?? i.name ?? 'Intervention'}`);
          if (i.beforePerformance !== undefined) lines.push(`  Before: ${i.beforePerformance}`);
          if (i.afterPerformance !== undefined) lines.push(`  After: ${i.afterPerformance}`);
          if (i.impact !== undefined) lines.push(`  Impact: ${i.impact}`);
          if (i.significant !== undefined) lines.push(`  Significant: ${i.significant ? 'YES' : 'NO'}`);
          if (i.verdict) lines.push(`  Verdict: ${i.verdict}`);
          lines.push('');
        }
        return textResult(lines.join('\n'));
      }
      const lines = ['Intervention Impact Summary:\n'];
      if (impact.totalInterventions !== undefined) lines.push(`  Total interventions: ${impact.totalInterventions}`);
      if (impact.positiveImpact !== undefined) lines.push(`  Positive impact: ${impact.positiveImpact}`);
      if (impact.negativeImpact !== undefined) lines.push(`  Negative impact: ${impact.negativeImpact}`);
      if (impact.neutral !== undefined) lines.push(`  Neutral: ${impact.neutral}`);
      if (impact.summary) lines.push(`\n  ${impact.summary}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Knowledge Distillation (5 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'trading_knowledge_summary',
    'Get a distilled knowledge summary of everything Trading Brain has learned: key patterns, reliable signals, market regime behavior.',
    {},
    async () => {
      const summary: AnyResult = await call('knowledge.summary', {});
      if (!summary) return textResult('No distilled knowledge available yet. The brain needs more trading experience.');
      if (typeof summary === 'string') return textResult(summary);
      const lines = ['Trading Knowledge Summary:\n'];
      if (summary.totalPatterns !== undefined) lines.push(`  Patterns learned: ${summary.totalPatterns}`);
      if (summary.totalPrinciples !== undefined) lines.push(`  Principles extracted: ${summary.totalPrinciples}`);
      if (summary.totalAntiPatterns !== undefined) lines.push(`  Anti-patterns identified: ${summary.totalAntiPatterns}`);
      if (summary.confidenceLevel !== undefined) lines.push(`  Overall confidence: ${(summary.confidenceLevel * 100).toFixed(0)}%`);
      if (summary.topInsights?.length > 0) {
        lines.push('\n  Top Insights:');
        for (const insight of summary.topInsights) {
          lines.push(`    - ${insight.description ?? insight}`);
        }
      }
      if (summary.maturityLevel) lines.push(`\n  Knowledge maturity: ${summary.maturityLevel}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_knowledge_principles',
    'Get distilled trading principles: high-confidence rules extracted from patterns, e.g., "Never trade against strong RSI divergence".',
    {},
    async () => {
      const principles: AnyResult[] = await call('knowledge.principles', {}) as AnyResult[];
      if (!principles?.length) return textResult('No trading principles distilled yet. Need more confirmed patterns.');
      const lines = [`Trading Principles (${principles.length}):\n`];
      for (let i = 0; i < principles.length; i++) {
        const p = principles[i];
        lines.push(`${i + 1}. ${p.statement ?? p.description ?? p}`);
        if (p.confidence !== undefined) lines.push(`   Confidence: ${(p.confidence * 100).toFixed(0)}%`);
        if (p.evidence) lines.push(`   Evidence: ${p.evidence}`);
        if (p.source) lines.push(`   Source: ${p.source}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_knowledge_anti_patterns',
    'Get identified trading anti-patterns: things that consistently lead to losses or poor outcomes. Learn from past mistakes.',
    {},
    async () => {
      const antiPatterns: AnyResult[] = await call('knowledge.antipatterns', {}) as AnyResult[];
      if (!antiPatterns?.length) return textResult('No anti-patterns identified yet. Need more trade data to detect recurring mistakes.');
      const lines = [`Trading Anti-Patterns (${antiPatterns.length}):\n`];
      for (let i = 0; i < antiPatterns.length; i++) {
        const ap = antiPatterns[i];
        lines.push(`${i + 1}. ${ap.name ?? ap.description ?? ap}`);
        if (ap.description && ap.name) lines.push(`   ${ap.description}`);
        if (ap.occurrences !== undefined) lines.push(`   Occurrences: ${ap.occurrences}`);
        if (ap.avgLoss !== undefined) lines.push(`   Avg loss when triggered: ${ap.avgLoss.toFixed(2)}%`);
        if (ap.avoidance) lines.push(`   How to avoid: ${ap.avoidance}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_knowledge_package',
    'Package all distilled trading knowledge into a transferable format: principles, anti-patterns, parameters, and learned rules.',
    {},
    async () => {
      const pkg: AnyResult = await call('knowledge.package', {});
      if (!pkg) return textResult('No knowledge available to package.');
      if (typeof pkg === 'string') return textResult(pkg);
      const lines = ['Trading Knowledge Package:\n'];
      if (pkg.version) lines.push(`  Version: ${pkg.version}`);
      if (pkg.created_at) lines.push(`  Created: ${new Date(pkg.created_at).toLocaleString()}`);
      if (pkg.principles?.length > 0) {
        lines.push(`\n  Principles (${pkg.principles.length}):`);
        for (const p of pkg.principles) {
          lines.push(`    - ${p.statement ?? p}`);
        }
      }
      if (pkg.antiPatterns?.length > 0) {
        lines.push(`\n  Anti-Patterns (${pkg.antiPatterns.length}):`);
        for (const ap of pkg.antiPatterns) {
          lines.push(`    - ${ap.name ?? ap}`);
        }
      }
      if (pkg.parameters && Object.keys(pkg.parameters).length > 0) {
        lines.push('\n  Optimized Parameters:');
        for (const [name, value] of Object.entries(pkg.parameters)) {
          lines.push(`    ${name}: ${value}`);
        }
      }
      if (pkg.rules?.length > 0) {
        lines.push(`\n  Learned Rules (${pkg.rules.length}):`);
        for (const r of pkg.rules) {
          lines.push(`    - ${r.description ?? r}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_knowledge_evolution',
    'View how Trading Brain knowledge has evolved over time: when key insights were discovered, confidence changes, paradigm shifts.',
    {},
    async () => {
      const evolution: AnyResult = await call('knowledge.evolution', {});
      if (!evolution) return textResult('No knowledge evolution data available.');
      if (Array.isArray(evolution)) {
        if (!evolution.length) return textResult('No knowledge evolution events recorded.');
        const lines = [`Knowledge Evolution (${evolution.length} events):\n`];
        for (const e of evolution) {
          const date = e.timestamp ? new Date(e.timestamp).toLocaleString() : 'unknown date';
          lines.push(`[${date}] ${e.type ?? 'event'}: ${e.description ?? e.title ?? ''}`);
          if (e.impact) lines.push(`  Impact: ${e.impact}`);
          lines.push('');
        }
        return textResult(lines.join('\n'));
      }
      const lines = ['Knowledge Evolution:\n'];
      if (evolution.phases?.length > 0) {
        for (const phase of evolution.phases) {
          lines.push(`  Phase: ${phase.name}`);
          if (phase.duration) lines.push(`    Duration: ${phase.duration}`);
          if (phase.keyInsights?.length > 0) {
            for (const insight of phase.keyInsights) {
              lines.push(`    - ${insight}`);
            }
          }
          lines.push('');
        }
      }
      if (evolution.currentPhase) lines.push(`  Current phase: ${evolution.currentPhase}`);
      if (evolution.maturity) lines.push(`  Maturity: ${evolution.maturity}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Research Agenda (4 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'trading_research_agenda',
    'View the current trading research agenda: prioritized list of open questions, investigation topics, and research directions.',
    {},
    async () => {
      const agenda: AnyResult[] = await call('agenda.list', {}) as AnyResult[];
      if (!agenda?.length) return textResult('No research agenda items. The brain will generate topics as it learns.');
      const lines = [`Trading Research Agenda (${agenda.length} items):\n`];
      for (const item of agenda) {
        const priority = item.priority !== undefined ? ` [P${item.priority}]` : '';
        const status = item.status ? ` (${item.status})` : '';
        lines.push(`#${item.id ?? ''}${priority} ${item.question ?? item.title ?? item.topic ?? 'Research topic'}${status}`);
        if (item.description) lines.push(`  ${item.description}`);
        if (item.expectedValue) lines.push(`  Expected value: ${item.expectedValue}`);
        if (item.estimatedEffort) lines.push(`  Estimated effort: ${item.estimatedEffort}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_research_next',
    'Get the next highest-priority research question for Trading Brain to investigate.',
    {},
    async () => {
      const next: AnyResult = await call('agenda.next', {});
      if (!next) return textResult('No pending research questions on the agenda.');
      const lines = [
        'Next Trading Research Question:',
        `  ${next.question ?? next.title ?? next.topic ?? 'Research topic'}`,
      ];
      if (next.priority !== undefined) lines.push(`  Priority: P${next.priority}`);
      if (next.description) lines.push(`  Description: ${next.description}`);
      if (next.rationale) lines.push(`  Rationale: ${next.rationale}`);
      if (next.suggestedApproach) lines.push(`  Suggested approach: ${next.suggestedApproach}`);
      if (next.expectedValue) lines.push(`  Expected value: ${next.expectedValue}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_research_prioritize',
    'Re-prioritize the trading research agenda based on current performance gaps, recent discoveries, and potential impact.',
    {},
    async () => {
      const result: AnyResult = await call('agenda.prioritize', {});
      if (!result) return textResult('Could not prioritize research agenda.');
      if (Array.isArray(result)) {
        if (!result.length) return textResult('Research agenda is empty, nothing to prioritize.');
        const lines = [`Research Agenda Re-prioritized (${result.length} items):\n`];
        for (const item of result) {
          const priority = item.priority !== undefined ? ` [P${item.priority}]` : '';
          lines.push(`#${item.id ?? ''}${priority} ${item.question ?? item.title ?? item.topic ?? 'Topic'}`);
          if (item.reason) lines.push(`  Reason: ${item.reason}`);
        }
        return textResult(lines.join('\n'));
      }
      const lines = ['Research Agenda Re-prioritized:'];
      if (result.itemsReordered !== undefined) lines.push(`  Items reordered: ${result.itemsReordered}`);
      if (result.newTopPriority) lines.push(`  New top priority: ${result.newTopPriority}`);
      if (result.summary) lines.push(`  ${result.summary}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_research_ask',
    'Add a new research question to the trading research agenda for future investigation.',
    {},
    async () => {
      const result: AnyResult = await call('agenda.ask', {});
      if (!result) return textResult('Could not generate a new research question.');
      if (typeof result === 'string') return textResult(`New research question added: ${result}`);
      const lines = ['New Research Question Added:'];
      if (result.question ?? result.title) lines.push(`  ${result.question ?? result.title}`);
      if (result.priority !== undefined) lines.push(`  Priority: P${result.priority}`);
      if (result.rationale) lines.push(`  Rationale: ${result.rationale}`);
      if (result.id) lines.push(`  ID: #${result.id}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Anomaly Detective (4 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'trading_anomalies',
    'List detected anomalies in trading behavior: unusual patterns, outlier trades, unexpected regime shifts, performance deviations.',
    {},
    async () => {
      const anomalies: AnyResult[] = await call('anomaly.list', {}) as AnyResult[];
      if (!anomalies?.length) return textResult('No trading anomalies detected. Performance is within expected bounds.');
      const lines = [`Trading Anomalies (${anomalies.length}):\n`];
      for (const a of anomalies) {
        const severity = a.severity ? ` [${a.severity.toUpperCase()}]` : '';
        lines.push(`#${a.id ?? ''}${severity} ${a.title ?? a.description ?? a.type ?? 'Anomaly'}`);
        if (a.description && a.title) lines.push(`  ${a.description}`);
        if (a.metric) lines.push(`  Metric: ${a.metric}`);
        if (a.expectedValue !== undefined && a.actualValue !== undefined) {
          lines.push(`  Expected: ${a.expectedValue} | Actual: ${a.actualValue} | Deviation: ${a.deviation ?? 'N/A'}`);
        }
        if (a.detected_at ?? a.detectedAt) lines.push(`  Detected: ${new Date(a.detected_at ?? a.detectedAt).toLocaleString()}`);
        if (a.status) lines.push(`  Status: ${a.status}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_anomaly_investigate',
    'Deep investigation of a trading anomaly: root cause analysis, related events, potential explanations, and recommended actions.',
    {},
    async () => {
      const investigation: AnyResult = await call('anomaly.investigate', {});
      if (!investigation) return textResult('No anomaly investigation available.');
      if (typeof investigation === 'string') return textResult(investigation);
      const lines = ['Anomaly Investigation:\n'];
      if (investigation.anomaly) lines.push(`  Anomaly: ${investigation.anomaly}`);
      if (investigation.rootCause) lines.push(`  Root cause: ${investigation.rootCause}`);
      if (investigation.relatedEvents?.length > 0) {
        lines.push('  Related events:');
        for (const e of investigation.relatedEvents) {
          lines.push(`    - ${e.description ?? e}`);
        }
      }
      if (investigation.explanations?.length > 0) {
        lines.push('  Possible explanations:');
        for (const exp of investigation.explanations) {
          const prob = exp.probability !== undefined ? ` (${(exp.probability * 100).toFixed(0)}%)` : '';
          lines.push(`    - ${exp.description ?? exp}${prob}`);
        }
      }
      if (investigation.recommendations?.length > 0) {
        lines.push('  Recommendations:');
        for (const rec of investigation.recommendations) {
          lines.push(`    - ${rec}`);
        }
      }
      if (investigation.severity) lines.push(`\n  Severity: ${investigation.severity}`);
      if (investigation.resolved !== undefined) lines.push(`  Resolved: ${investigation.resolved ? 'YES' : 'NO'}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_anomaly_history',
    'View history of past trading anomalies: detected issues, resolutions, and patterns in anomaly occurrence.',
    {},
    async () => {
      const history: AnyResult[] = await call('anomaly.history', {}) as AnyResult[];
      if (!history?.length) return textResult('No anomaly history recorded.');
      const lines = [`Anomaly History (${history.length}):\n`];
      for (const h of history) {
        const status = h.resolved ? 'RESOLVED' : h.status ?? 'OPEN';
        lines.push(`#${h.id ?? ''} [${status}] ${h.title ?? h.description ?? h.type ?? 'Anomaly'}`);
        if (h.description && h.title) lines.push(`  ${h.description}`);
        if (h.resolution) lines.push(`  Resolution: ${h.resolution}`);
        if (h.detected_at ?? h.detectedAt) lines.push(`  Detected: ${new Date(h.detected_at ?? h.detectedAt).toLocaleString()}`);
        if (h.resolved_at ?? h.resolvedAt) lines.push(`  Resolved: ${new Date(h.resolved_at ?? h.resolvedAt).toLocaleString()}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_drift_report',
    'Get a performance drift report: detect if trading behavior is drifting from historical norms — signal accuracy decay, win rate shifts, risk profile changes.',
    {},
    async () => {
      const drift: AnyResult = await call('anomaly.drift', {});
      if (!drift) return textResult('No drift data available. Need sufficient trading history for drift detection.');
      if (typeof drift === 'string') return textResult(drift);
      const lines = ['Trading Drift Report:\n'];
      if (drift.overallDrift !== undefined) lines.push(`  Overall drift: ${drift.overallDrift}`);
      if (drift.driftDetected !== undefined) lines.push(`  Drift detected: ${drift.driftDetected ? 'YES' : 'NO'}`);
      if (drift.metrics?.length > 0) {
        lines.push('  Metric Drift:');
        for (const m of drift.metrics) {
          const status = m.drifting ? 'DRIFTING' : 'STABLE';
          lines.push(`    ${m.name}: ${m.baseline?.toFixed(3) ?? '?'} → ${m.current?.toFixed(3) ?? '?'} [${status}]`);
          if (m.deviation !== undefined) lines.push(`      Deviation: ${m.deviation.toFixed(3)} (threshold: ${m.threshold?.toFixed(3) ?? 'N/A'})`);
        }
      }
      if (drift.recommendations?.length > 0) {
        lines.push('\n  Recommendations:');
        for (const rec of drift.recommendations) {
          lines.push(`    - ${rec}`);
        }
      }
      if (drift.since) lines.push(`\n  Analysis period since: ${new Date(drift.since).toLocaleString()}`);
      return textResult(lines.join('\n'));
    },
  );

  // ═══════════════════════════════════════════════════════════════════
  // Research Journal (5 tools)
  // ═══════════════════════════════════════════════════════════════════

  server.tool(
    'trading_journal',
    'View trading research journal entries: observations, insights, experiment notes, and decision logs.',
    {},
    async () => {
      const entries: AnyResult[] = await call('journal.entries', {}) as AnyResult[];
      if (!entries?.length) return textResult('Research journal is empty. Entries are created as the brain learns.');
      const lines = [`Trading Research Journal (${entries.length} entries):\n`];
      for (const entry of entries) {
        const date = entry.created_at ? new Date(entry.created_at).toLocaleString() : 'unknown date';
        const tag = entry.type ? `[${entry.type.toUpperCase()}] ` : '';
        lines.push(`${date} — ${tag}${entry.title ?? 'Entry'}`);
        if (entry.content) lines.push(`  ${entry.content}`);
        if (entry.tags?.length > 0) lines.push(`  Tags: ${entry.tags.join(', ')}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_journal_summary',
    'Get a summary of the trading research journal: key themes, most active periods, important breakthroughs.',
    {},
    async () => {
      const summary: AnyResult = await call('journal.summary', {});
      if (!summary) return textResult('No journal summary available. Need journal entries first.');
      if (typeof summary === 'string') return textResult(summary);
      const lines = ['Trading Research Journal Summary:\n'];
      if (summary.totalEntries !== undefined) lines.push(`  Total entries: ${summary.totalEntries}`);
      if (summary.dateRange) lines.push(`  Date range: ${summary.dateRange}`);
      if (summary.themes?.length > 0) {
        lines.push('  Key themes:');
        for (const theme of summary.themes) {
          lines.push(`    - ${theme.name ?? theme}: ${theme.count ?? ''} entries`);
        }
      }
      if (summary.breakthroughs?.length > 0) {
        lines.push('  Breakthroughs:');
        for (const b of summary.breakthroughs) {
          lines.push(`    - ${b.description ?? b}`);
        }
      }
      if (summary.openQuestions?.length > 0) {
        lines.push('  Open questions:');
        for (const q of summary.openQuestions) {
          lines.push(`    - ${q}`);
        }
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_journal_milestones',
    'View research milestones in the trading journal: major discoveries, confirmed hypotheses, significant parameter changes.',
    {},
    async () => {
      const milestones: AnyResult[] = await call('journal.milestones', {}) as AnyResult[];
      if (!milestones?.length) return textResult('No research milestones recorded yet.');
      const lines = [`Trading Research Milestones (${milestones.length}):\n`];
      for (const m of milestones) {
        const date = m.date ?? m.created_at ? new Date(m.date ?? m.created_at).toLocaleString() : 'unknown date';
        lines.push(`[${date}] ${m.title ?? m.description ?? 'Milestone'}`);
        if (m.description && m.title) lines.push(`  ${m.description}`);
        if (m.impact) lines.push(`  Impact: ${m.impact}`);
        if (m.significance) lines.push(`  Significance: ${m.significance}`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_journal_write',
    'Write a manual entry to the trading research journal: record an observation, insight, decision rationale, or experiment note.',
    {},
    async () => {
      const result: AnyResult = await call('journal.write', {});
      if (!result) return textResult('Failed to write journal entry.');
      if (typeof result === 'string') return textResult(result);
      const lines = ['Journal Entry Written:'];
      if (result.id) lines.push(`  ID: #${result.id}`);
      if (result.title) lines.push(`  Title: ${result.title}`);
      if (result.type) lines.push(`  Type: ${result.type}`);
      if (result.created_at) lines.push(`  Date: ${new Date(result.created_at).toLocaleString()}`);
      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_journal_search',
    'Search the trading research journal by keyword, date range, or tag. Find past observations and insights related to a topic.',
    {},
    async () => {
      const results: AnyResult[] = await call('journal.search', {}) as AnyResult[];
      if (!results?.length) return textResult('No matching journal entries found.');
      const lines = [`Journal Search Results (${results.length}):\n`];
      for (const entry of results) {
        const date = entry.created_at ? new Date(entry.created_at).toLocaleString() : 'unknown date';
        const tag = entry.type ? `[${entry.type.toUpperCase()}] ` : '';
        lines.push(`${date} — ${tag}${entry.title ?? 'Entry'}`);
        if (entry.content) lines.push(`  ${entry.content}`);
        if (entry.relevance !== undefined) lines.push(`  Relevance: ${(entry.relevance * 100).toFixed(0)}%`);
        lines.push('');
      }
      return textResult(lines.join('\n'));
    },
  );
}
