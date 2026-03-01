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

/** Register tools using IPC client (for stdio MCP transport) */
export function registerTools(server: McpServer, ipc: IpcClient): void {
  registerToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register tools using router directly (for HTTP MCP transport inside daemon) */
export function registerToolsDirect(server: McpServer, router: IpcRouter): void {
  registerToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerToolsWithCaller(server: McpServer, call: BrainCall): void {

  // 1. trading_record_outcome
  server.tool(
    'trading_record_outcome',
    'Record a trade outcome. Main entry point for the learning loop — updates synapses, graph, chains, and triggers pattern extraction.',
    {
      pair: z.string().describe('Trading pair (e.g. BTC/USDT)'),
      bot_type: z.string().describe('Bot type (e.g. DCA, Grid, SmartTrader)'),
      profit_pct: z.number().describe('Profit percentage of the trade'),
      win: z.boolean().describe('Whether the trade was profitable'),
      rsi14: z.number().optional().describe('RSI-14 value at entry'),
      macd: z.number().optional().describe('MACD value at entry'),
      trend_score: z.number().optional().describe('Trend score at entry'),
      volatility: z.number().optional().describe('Volatility at entry'),
      regime: z.string().optional().describe('Market regime (e.g. bullish_trend, ranging)'),
    },
    async (params) => {
      const result: AnyResult = await call('trade.recordOutcome', {
        signals: { rsi14: params.rsi14, macd: params.macd, trendScore: params.trend_score, volatility: params.volatility },
        regime: params.regime,
        profitPct: params.profit_pct,
        win: params.win,
        botType: params.bot_type,
        pair: params.pair,
      });
      return textResult(`Trade #${result.tradeId} recorded (${params.win ? 'WIN' : 'LOSS'}, ${params.profit_pct.toFixed(2)}%). Fingerprint: ${result.fingerprint}. Synapse weight: ${result.synapseWeight.toFixed(3)}`);
    },
  );

  // 2. trading_signal_weights
  server.tool(
    'trading_signal_weights',
    'Get brain-weighted signal strengths based on learned experience. Returns adjusted weights for each signal type.',
    {
      rsi14: z.number().optional().describe('RSI-14 value'),
      macd: z.number().optional().describe('MACD value'),
      trend_score: z.number().optional().describe('Trend score'),
      volatility: z.number().optional().describe('Volatility'),
      regime: z.string().optional().describe('Market regime'),
    },
    async (params) => {
      const result = await call('signal.weights', {
        signals: { rsi14: params.rsi14, macd: params.macd, trendScore: params.trend_score, volatility: params.volatility },
        regime: params.regime,
      });
      return textResult(result);
    },
  );

  // 3. trading_signal_confidence
  server.tool(
    'trading_signal_confidence',
    'Get Wilson Score confidence for a signal pattern. Returns 0-1 confidence based on historical win rate.',
    {
      rsi14: z.number().optional().describe('RSI-14 value'),
      macd: z.number().optional().describe('MACD value'),
      trend_score: z.number().optional().describe('Trend score'),
      volatility: z.number().optional().describe('Volatility'),
      regime: z.string().optional().describe('Market regime'),
    },
    async (params) => {
      const confidence = await call('signal.confidence', {
        signals: { rsi14: params.rsi14, macd: params.macd, trendScore: params.trend_score, volatility: params.volatility },
        regime: params.regime,
      });
      return textResult(`Confidence: ${((confidence as number) * 100).toFixed(1)}%`);
    },
  );

  // 4. trading_dca_multiplier
  server.tool(
    'trading_dca_multiplier',
    'Get brain-recommended DCA position size multiplier based on regime success history.',
    {
      regime: z.string().describe('Market regime'),
      rsi: z.number().describe('Current RSI value'),
      volatility: z.number().describe('Current volatility'),
    },
    async (params) => {
      const result = await call('strategy.dcaMultiplier', params);
      return textResult(result);
    },
  );

  // 5. trading_grid_params
  server.tool(
    'trading_grid_params',
    'Get brain-recommended grid spacing parameters based on volatility history.',
    {
      regime: z.string().describe('Market regime'),
      volatility: z.number().describe('Current volatility'),
      pair: z.string().describe('Trading pair'),
    },
    async (params) => {
      const result = await call('strategy.gridParams', params);
      return textResult(result);
    },
  );

  // 6. trading_explore
  server.tool(
    'trading_explore',
    'Explore the brain network using spreading activation. Find related nodes from a starting concept.',
    {
      query: z.string().describe('Node ID, label, or partial match to start exploration from'),
    },
    async (params) => {
      const result = await call('synapse.explore', params);
      return textResult(result);
    },
  );

  // 7. trading_connections
  server.tool(
    'trading_connections',
    'Find the shortest path between two nodes in the brain network.',
    {
      from: z.string().describe('Source node ID'),
      to: z.string().describe('Target node ID'),
    },
    async (params) => {
      const path = await call('synapse.findPath', params);
      if (!path) return textResult('No path found between these nodes.');
      return textResult(`Path: ${(path as string[]).join(' → ')}`);
    },
  );

  // 8. trading_rules
  server.tool(
    'trading_rules',
    'Get all learned trading rules with confidence scores and win rates.',
    {},
    async () => {
      const rules = await call('rule.list', {});
      return textResult(rules);
    },
  );

  // 9. trading_insights
  server.tool(
    'trading_insights',
    'Get research insights (trends, gaps, synergies, performance, regime shifts).',
    {
      type: z.string().optional().describe('Filter by type: trend, gap, synergy, performance, regime_shift'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async (params) => {
      const result = params.type
        ? await call('insight.byType', params)
        : await call('insight.list', params);
      return textResult(result);
    },
  );

  // 10. trading_chains
  server.tool(
    'trading_chains',
    'Get detected trade chains (winning/losing streaks).',
    {
      pair: z.string().optional().describe('Filter by trading pair'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async (params) => {
      const result = params.pair
        ? await call('chain.byPair', params)
        : await call('chain.list', params);
      return textResult(result);
    },
  );

  // 11. trading_query
  server.tool(
    'trading_query',
    'Search trades and signals by fingerprint, pair, or bot type.',
    {
      search: z.string().describe('Search query'),
      limit: z.number().optional().describe('Max results (default 50)'),
    },
    async (params) => {
      const result = await call('trade.query', params);
      return textResult(result);
    },
  );

  // 12. trading_status
  server.tool(
    'trading_status',
    'Get brain stats: trades, synapses, graph size, rules, insights, calibration.',
    {},
    async () => {
      const result = await call('analytics.summary', {});
      return textResult(result);
    },
  );

  // 13. trading_calibration
  server.tool(
    'trading_calibration',
    'Get current adaptive calibration parameters (learning rate, Wilson Z, decay half-life, etc.).',
    {},
    async () => {
      const result = await call('calibration.get', {});
      return textResult(result);
    },
  );

  // 13b. trading_explain_signal
  server.tool(
    'trading_explain_signal',
    'Explain the confidence assessment for a specific trading signal — Wilson Score breakdown, sample size, historical accuracy, and synapse connections to similar signals.',
    {
      fingerprint: z.string().describe('The signal fingerprint to explain'),
    },
    async (params) => {
      const result: AnyResult = await call('signal.explain', { fingerprint: params.fingerprint });
      const lines: string[] = [
        `Signal: ${result.fingerprint}`,
        '',
        '── Wilson Score ──',
        `  Successes:   ${result.wilson.successes}`,
        `  Total:       ${result.wilson.total}`,
        `  Lower bound: ${(result.wilson.lowerBound * 100).toFixed(1)}%`,
        `  Z-score:     ${result.wilson.z} (${result.wilson.z >= 2.33 ? '99%' : result.wilson.z >= 1.96 ? '95%' : '90%'} CI)`,
        '',
        '── Sample Size ──',
        `  ${result.sampleSize} observation(s)`,
        '',
        '── Historical Accuracy ──',
        `  Wins:     ${result.accuracy.wins}`,
        `  Losses:   ${result.accuracy.losses}`,
        `  Win rate: ${(result.accuracy.winRate * 100).toFixed(1)}%`,
      ];

      if (result.synapse) {
        lines.push(
          '',
          '── Synapse ──',
          `  Weight:       ${result.synapse.weight.toFixed(3)}`,
          `  Activations:  ${result.synapse.activations}`,
          `  Total profit: ${result.synapse.totalProfit.toFixed(2)}%`,
        );
      } else {
        lines.push('', '── Synapse ──', '  No synapse found for this fingerprint.');
      }

      if (result.similarSignals.length > 0) {
        lines.push('', '── Similar Signals ──');
        for (const s of result.similarSignals) {
          lines.push(`  ${s.fingerprint} (${(s.similarity * 100).toFixed(0)}% similar, weight: ${s.weight.toFixed(3)}, activations: ${s.activations})`);
        }
      }

      if (result.relatedPatterns.length > 0) {
        lines.push('', '── Related Learned Patterns ──');
        for (const p of result.relatedPatterns) {
          lines.push(`  ${p.pattern} — confidence: ${(p.confidence * 100).toFixed(1)}%, win rate: ${(p.winRate * 100).toFixed(1)}%, samples: ${p.sampleCount}, avg profit: ${p.avgProfit.toFixed(2)}%`);
        }
      }

      return textResult(lines.join('\n'));
    },
  );

  // 13c. trading_calibration_history
  server.tool(
    'trading_calibration_history',
    'Show current calibration parameters and how they have changed over time — confidence thresholds, position sizing multipliers, and learning adjustments.',
    {},
    async () => {
      const result: AnyResult = await call('calibration.history', {});
      const lines: string[] = [];

      if (result.current) {
        const c = result.current;
        lines.push(
          '── Current Calibration ──',
          `  Learning rate:       ${c.learningRate}`,
          `  Weaken penalty:      ${c.weakenPenalty}`,
          `  Decay half-life:     ${c.decayHalfLifeDays} days`,
          `  Pattern extraction:  every ${c.patternExtractionInterval} trades`,
          `  Pattern min samples: ${c.patternMinSamples}`,
          `  Wilson threshold:    ${c.patternWilsonThreshold}`,
          `  Wilson Z:            ${c.wilsonZ} (${c.wilsonZ >= 2.33 ? '99%' : c.wilsonZ >= 1.96 ? '95%' : '90%'} CI)`,
          `  Spreading decay:     ${c.spreadingActivationDecay}`,
          `  Spreading threshold: ${c.spreadingActivationThreshold}`,
          `  Min activations:     ${c.minActivationsForWeight}`,
          `  Min outcomes:        ${c.minOutcomesForWeights}`,
        );
      } else {
        lines.push('No current calibration data.');
      }

      if (Array.isArray(result.history) && result.history.length > 0) {
        lines.push('', '── Calibration History ──');
        for (const h of result.history) {
          lines.push(
            `  [${h.created_at}] trades: ${h.trade_count}, synapses: ${h.synapse_count} — ` +
            `lr: ${h.learning_rate}, z: ${h.wilson_z}, halfLife: ${h.decay_half_life_days}d, ` +
            `minSamples: ${h.pattern_min_samples}, threshold: ${h.pattern_wilson_threshold}`
          );
        }
      } else {
        lines.push('', 'No calibration history yet (snapshots are saved on each recalibration).');
      }

      return textResult(lines.join('\n'));
    },
  );

  // === Backtesting Tools ===

  server.tool(
    'trading_backtest',
    'Run a backtest on historical trades. Computes win rate, profit factor, Sharpe ratio, max drawdown, equity curve, and per-pair/regime breakdowns.',
    {
      pair: z.string().optional().describe('Filter by trading pair'),
      regime: z.string().optional().describe('Filter by market regime'),
      timeframe: z.string().optional().describe('Filter by timeframe'),
      bot_type: z.string().optional().describe('Filter by bot type'),
      from_date: z.string().optional().describe('Start date (ISO format)'),
      to_date: z.string().optional().describe('End date (ISO format)'),
      signal_filter: z.string().optional().describe('Filter by signal fingerprint similarity'),
    },
    async (params) => {
      const result: AnyResult = await call('backtest.run', {
        pair: params.pair,
        regime: params.regime,
        timeframe: params.timeframe,
        botType: params.bot_type,
        fromDate: params.from_date,
        toDate: params.to_date,
        signalFilter: params.signal_filter,
      });

      if (result.totalTrades === 0) return textResult('No trades match the given filters.');

      const lines: string[] = [
        '── Backtest Results ──',
        `  Total trades:    ${result.totalTrades}`,
        `  Win rate:        ${(result.winRate * 100).toFixed(1)}% (${result.wins}W / ${result.losses}L)`,
        `  Total profit:    ${result.totalProfitPct.toFixed(2)}%`,
        `  Avg profit:      ${result.avgProfitPct.toFixed(2)}%`,
        `  Avg win:         ${result.avgWinPct.toFixed(2)}%`,
        `  Avg loss:        ${result.avgLossPct.toFixed(2)}%`,
        `  Best trade:      ${result.bestTrade.toFixed(2)}%`,
        `  Worst trade:     ${result.worstTrade.toFixed(2)}%`,
        `  Max drawdown:    ${result.maxDrawdownPct.toFixed(2)}%`,
        `  Profit factor:   ${result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)}`,
        `  Sharpe ratio:    ${result.sharpeRatio.toFixed(2)}`,
      ];

      if (result.tradesByPair && Object.keys(result.tradesByPair).length > 0) {
        lines.push('', '── By Pair ──');
        for (const [pair, stats] of Object.entries(result.tradesByPair)) {
          const s = stats as AnyResult;
          lines.push(`  ${pair}: ${s.wins}W/${s.losses}L, profit: ${s.profitPct.toFixed(2)}%`);
        }
      }

      if (result.tradesByRegime && Object.keys(result.tradesByRegime).length > 0) {
        lines.push('', '── By Regime ──');
        for (const [regime, stats] of Object.entries(result.tradesByRegime)) {
          const s = stats as AnyResult;
          lines.push(`  ${regime}: ${s.wins}W/${s.losses}L, profit: ${s.profitPct.toFixed(2)}%`);
        }
      }

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_compare_signals',
    'Compare two signal fingerprint patterns head-to-head. Shows win rate, avg profit, sample size, and similarity.',
    {
      fingerprint1: z.string().describe('First signal fingerprint'),
      fingerprint2: z.string().describe('Second signal fingerprint'),
    },
    async (params) => {
      const result: AnyResult = await call('backtest.compare', params);

      const lines: string[] = [
        '── Signal Comparison ──',
        '',
        `Signal 1: ${result.fingerprint1}`,
        `  Win rate:    ${(result.stats1.winRate * 100).toFixed(1)}% (${result.stats1.wins}W / ${result.stats1.losses}L)`,
        `  Avg profit:  ${result.stats1.avgProfitPct.toFixed(2)}%`,
        `  Sample size: ${result.stats1.sampleSize}`,
        '',
        `Signal 2: ${result.fingerprint2}`,
        `  Win rate:    ${(result.stats2.winRate * 100).toFixed(1)}% (${result.stats2.wins}W / ${result.stats2.losses}L)`,
        `  Avg profit:  ${result.stats2.avgProfitPct.toFixed(2)}%`,
        `  Sample size: ${result.stats2.sampleSize}`,
        '',
        `Similarity: ${(result.similarity * 100).toFixed(0)}%`,
        `Verdict:    ${result.verdict}`,
      ];

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_best_signals',
    'Find the top-performing signal patterns ranked by win rate. Requires a minimum sample size for statistical validity.',
    {
      min_sample_size: z.number().optional().describe('Minimum trades per signal (default 5)'),
      top_n: z.number().optional().describe('Number of top signals to return (default 20)'),
      pair: z.string().optional().describe('Filter by trading pair'),
      regime: z.string().optional().describe('Filter by market regime'),
    },
    async (params) => {
      const result: AnyResult = await call('backtest.bestSignals', {
        minSampleSize: params.min_sample_size,
        topN: params.top_n,
        pair: params.pair,
        regime: params.regime,
      });

      if (!Array.isArray(result) || result.length === 0) {
        return textResult('No signals found with enough data. Try lowering min_sample_size.');
      }

      const lines: string[] = ['── Top Signals ──'];
      for (let i = 0; i < result.length; i++) {
        const s = result[i] as AnyResult;
        lines.push(
          `  ${i + 1}. ${s.fingerprint}`,
          `     WR: ${(s.winRate * 100).toFixed(1)}% | Avg: ${s.avgProfitPct.toFixed(2)}% | ` +
          `${s.wins}W/${s.losses}L (n=${s.sampleSize}) | ` +
          `synapse: ${s.synapseWeight !== null ? s.synapseWeight.toFixed(3) : 'none'}`,
        );
      }

      return textResult(lines.join('\n'));
    },
  );

  // === Risk Management Tools ===

  server.tool(
    'trading_kelly',
    'Calculate Kelly Criterion fraction for position sizing. Returns raw Kelly, half-Kelly, and brain-adjusted values.',
    {
      pair: z.string().optional().describe('Filter by trading pair'),
      regime: z.string().optional().describe('Filter by market regime'),
    },
    async (params) => {
      const result: AnyResult = await call('risk.kelly', params);

      const lines: string[] = [
        '── Kelly Criterion ──',
        `  Kelly fraction:  ${result.kellyFraction.toFixed(3)} (${(result.kellyFraction * 100).toFixed(1)}%)`,
        `  Half-Kelly:      ${result.halfKelly.toFixed(3)} (${(result.halfKelly * 100).toFixed(1)}%)`,
        `  Brain-adjusted:  ${result.brainAdjusted.toFixed(3)} (${(result.brainAdjusted * 100).toFixed(1)}%)`,
        '',
        `  Win rate:        ${(result.winRate * 100).toFixed(1)}%`,
        `  Avg win:         ${result.avgWin.toFixed(2)}%`,
        `  Avg loss:        ${result.avgLoss.toFixed(2)}%`,
        `  Sample size:     ${result.sampleSize}`,
        '',
        `  Recommendation:  ${result.recommendation}`,
      ];

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_position_size',
    'Get a recommended position size based on Kelly Criterion and signal confidence. Capped at 25% of capital.',
    {
      capital_pct: z.number().describe('Fraction of total capital available (0-1)'),
      fingerprint: z.string().describe('Signal fingerprint for confidence lookup'),
      confidence: z.number().optional().describe('Override confidence (0-1)'),
      regime: z.string().optional().describe('Market regime'),
    },
    async (params) => {
      const result: AnyResult = await call('risk.positionSize', {
        capitalPct: params.capital_pct,
        signals: { fingerprint: params.fingerprint, confidence: params.confidence },
        regime: params.regime,
      });

      const lines: string[] = [
        '── Position Size ──',
        `  Size:       ${result.sizePct.toFixed(1)}%`,
        `  Kelly raw:  ${result.kellyRaw.toFixed(3)}`,
        `  Confidence: ${(result.confidence * 100).toFixed(1)}%`,
        `  Reason:     ${result.reason}`,
      ];

      return textResult(lines.join('\n'));
    },
  );

  server.tool(
    'trading_risk_metrics',
    'Get risk metrics: max/current drawdown, consecutive losses, risk-reward ratio, and expectancy.',
    {
      pair: z.string().optional().describe('Filter by trading pair'),
    },
    async (params) => {
      const result: AnyResult = await call('risk.metrics', params);

      const lines: string[] = [
        '── Risk Metrics ──',
        `  Max drawdown:       ${result.maxDrawdownPct.toFixed(2)}%`,
        `  Current drawdown:   ${result.currentDrawdownPct.toFixed(2)}%`,
        `  Consecutive losses: ${result.consecutiveLosses} (max ever: ${result.maxConsecutiveLosses})`,
        `  Risk/Reward ratio:  ${result.riskRewardRatio === Infinity ? '∞' : result.riskRewardRatio.toFixed(2)}`,
        `  Expectancy:         ${result.expectancy.toFixed(3)}%`,
      ];

      return textResult(lines.join('\n'));
    },
  );

  // === Alert Tools ===

  server.tool(
    'trading_alert_create',
    'Create a trading alert. Triggers when conditions are met (confidence thresholds, win/loss streaks, drawdown).',
    {
      name: z.string().describe('Alert name'),
      condition_type: z.enum(['confidence_above', 'confidence_below', 'win_streak', 'loss_streak', 'drawdown']).describe('Condition type'),
      condition: z.record(z.string(), z.unknown()).describe('Condition parameters (e.g. { threshold: 0.8 } or { minStreak: 3 })'),
      webhook_url: z.string().optional().describe('Webhook URL to POST when triggered'),
      cooldown_minutes: z.number().optional().describe('Cooldown between triggers in minutes (default 60)'),
    },
    async (params) => {
      const result = await call('alert.create', {
        name: params.name,
        conditionType: params.condition_type,
        conditionJson: params.condition,
        webhookUrl: params.webhook_url,
        cooldownMinutes: params.cooldown_minutes,
      });
      return textResult(`Alert #${result} created: "${params.name}" (${params.condition_type})`);
    },
  );

  server.tool(
    'trading_alert_list',
    'List all active trading alerts.',
    {},
    async () => {
      const alerts: AnyResult = await call('alert.list', {});
      if (!Array.isArray(alerts) || alerts.length === 0) return textResult('No active alerts.');
      const lines = alerts.map((a: AnyResult) =>
        `#${a.id} "${a.name}" (${a.condition_type}) — triggered ${a.trigger_count}x${a.webhook_url ? ' [webhook]' : ''}`
      );
      return textResult(`Active alerts:\n${lines.join('\n')}`);
    },
  );

  server.tool(
    'trading_alert_delete',
    'Delete a trading alert by ID.',
    {
      id: z.number().describe('Alert ID to delete'),
    },
    async (params) => {
      await call('alert.delete', { id: params.id });
      return textResult(`Alert #${params.id} deleted.`);
    },
  );

  server.tool(
    'trading_alert_history',
    'Get trigger history for an alert.',
    {
      alert_id: z.number().describe('Alert ID'),
      limit: z.number().optional().describe('Max results (default 50)'),
    },
    async (params) => {
      const history: AnyResult = await call('alert.history', { alertId: params.alert_id, limit: params.limit });
      if (!Array.isArray(history) || history.length === 0) return textResult('No trigger history for this alert.');
      const lines = history.map((h: AnyResult) =>
        `[${h.created_at}] ${h.message}`
      );
      return textResult(`Alert #${params.alert_id} history:\n${lines.join('\n')}`);
    },
  );

  // === Import Tools ===

  server.tool(
    'trading_import',
    'Import trades from a JSON array. Each trade needs: pair, botType, profitPct, win, signals (with rsi14/macd/trendScore/volatility).',
    {
      trades_json: z.string().describe('JSON array of trade objects'),
    },
    async (params) => {
      const result: AnyResult = await call('import.json', { json: params.trades_json });

      const lines: string[] = [
        `Import complete: ${result.imported} imported, ${result.failed} failed`,
      ];
      if (result.errors.length > 0) {
        lines.push('Errors:');
        for (const e of result.errors.slice(0, 10)) {
          lines.push(`  - ${e}`);
        }
        if (result.errors.length > 10) lines.push(`  ... and ${result.errors.length - 10} more`);
      }

      return textResult(lines.join('\n'));
    },
  );

  // 14. trading_learn
  server.tool(
    'trading_learn',
    'Manually trigger a learning cycle (pattern extraction, calibration, decay).',
    {},
    async () => {
      const result = await call('learning.run', {});
      return textResult(result);
    },
  );

  // 15. trading_reset
  server.tool(
    'trading_reset',
    'Reset all trading brain data (trades, synapses, graph, rules, insights, chains, calibration).',
    {
      confirm: z.boolean().describe('Must be true to confirm reset'),
    },
    async (params) => {
      if (!params.confirm) return textResult('Reset cancelled. Pass confirm: true to proceed.');
      const result = await call('reset', {});
      return textResult(result);
    },
  );

  // === Memory & Session Tools ===

  // 16. trading_remember
  server.tool(
    'trading_remember',
    'Store a memory — preferences, decisions, context, facts, goals, or lessons learned from trading.',
    {
      content: z.string().describe('The memory content to store'),
      category: z.enum(['preference', 'decision', 'context', 'fact', 'goal', 'lesson']).describe('Memory category'),
      key: z.string().optional().describe('Unique key for upsert (updates existing memory with same key)'),
      importance: z.number().min(1).max(10).optional().describe('Importance 1-10 (default 5)'),
      tags: z.array(z.string()).optional().describe('Tags for organization'),
    },
    async (params) => {
      const result: AnyResult = await call('memory.remember', {
        content: params.content,
        category: params.category,
        key: params.key,
        importance: params.importance,
        tags: params.tags,
      });
      const msg = result.superseded
        ? `Memory #${result.memoryId} stored (${params.category}), superseding #${result.superseded}`
        : `Memory #${result.memoryId} stored (${params.category})`;
      return textResult(msg);
    },
  );

  // 17. trading_recall
  server.tool(
    'trading_recall',
    'Search trading memories by natural language query. Returns matching memories sorted by relevance.',
    {
      query: z.string().describe('Natural language search query'),
      category: z.enum(['preference', 'decision', 'context', 'fact', 'goal', 'lesson']).optional().describe('Filter by category'),
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async (params) => {
      const results: AnyResult = await call('memory.recall', {
        query: params.query,
        category: params.category,
        limit: params.limit,
      });
      if (!Array.isArray(results) || results.length === 0) return textResult('No memories found.');
      const lines = results.map((m: AnyResult) =>
        `#${m.id} [${m.category}] ${m.content.slice(0, 200)}${m.key ? ` (key: ${m.key})` : ''}`
      );
      return textResult(`Found ${results.length} memory/memories:\n${lines.join('\n')}`);
    },
  );

  // 18. trading_session_start
  server.tool(
    'trading_session_start',
    'Start a new trading session. Track goals and context for the conversation.',
    {
      goals: z.array(z.string()).optional().describe('Session goals'),
    },
    async (params) => {
      const result: AnyResult = await call('session.start', {
        goals: params.goals,
      });
      return textResult(`Session #${result.sessionId} started (${result.dbSessionId})`);
    },
  );

  // 19. trading_session_end
  server.tool(
    'trading_session_end',
    'End a trading session with a summary of what was accomplished.',
    {
      session_id: z.number().describe('Session ID to end'),
      summary: z.string().describe('Summary of what was accomplished'),
      outcome: z.enum(['completed', 'paused', 'abandoned']).optional().describe('Session outcome (default: completed)'),
    },
    async (params) => {
      await call('session.end', {
        sessionId: params.session_id,
        summary: params.summary,
        outcome: params.outcome,
      });
      return textResult(`Session #${params.session_id} ended (${params.outcome ?? 'completed'})`);
    },
  );

  // 20. trading_session_history
  server.tool(
    'trading_session_history',
    'List past trading sessions with summaries and outcomes.',
    {
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async (params) => {
      const sessions: AnyResult = await call('session.history', { limit: params.limit ?? 10 });
      if (!Array.isArray(sessions) || sessions.length === 0) return textResult('No sessions found.');
      const lines = sessions.map((s: AnyResult) =>
        `#${s.id} [${s.outcome ?? 'active'}] ${s.summary ?? '(no summary)'} — ${s.started_at}`
      );
      return textResult(`${sessions.length} session(s):\n${lines.join('\n')}`);
    },
  );

  // === Cross-Brain Ecosystem Tools ===

  server.tool(
    'trading_ecosystem_status',
    'Get status of all brains in the ecosystem (brain, trading-brain, marketing-brain).',
    {},
    async () => {
      const result: AnyResult = await call('ecosystem.status', {});
      if (!result?.peers?.length) return textResult('No peer brains are currently running.');
      const lines = result.peers.map((p: AnyResult) =>
        `${p.name}: v${p.result?.version ?? '?'} (PID ${p.result?.pid ?? '?'}, uptime ${p.result?.uptime ?? '?'}s, ${p.result?.methods ?? '?'} methods)`
      );
      return textResult(`Ecosystem status:\n- trading-brain (self): running\n${lines.map((l: string) => `- ${l}`).join('\n')}`);
    },
  );

  server.tool(
    'trading_query_peer',
    'Query another brain in the ecosystem. Call any method on brain or marketing-brain.',
    {
      peer: z.string().describe('Peer brain name: brain or marketing-brain'),
      method: z.string().describe('IPC method to call (e.g. analytics.summary, error.query)'),
      args: z.record(z.string(), z.unknown()).optional().describe('Method arguments as key-value pairs'),
    },
    async (params) => {
      const result = await call('ecosystem.queryPeer', {
        peer: params.peer,
        method: params.method,
        args: params.args ?? {},
      });
      return textResult(result);
    },
  );

  server.tool(
    'trading_error_context',
    'Ask the Brain for errors that might correlate with trade failures. Useful for understanding why a trade went wrong.',
    {
      pair: z.string().describe('Trading pair (e.g. BTC/USDT)'),
      search: z.string().optional().describe('Error search query (e.g. "timeout", "API error")'),
    },
    async (params) => {
      const errors: AnyResult = await call('ecosystem.queryPeer', {
        peer: 'brain',
        method: 'error.query',
        args: { search: params.search ?? params.pair },
      });
      if (!errors) return textResult('Brain not available.');
      if (!Array.isArray(errors) || !errors.length) return textResult('No matching errors found in Brain.');
      const lines = errors.slice(0, 10).map((e: AnyResult) =>
        `#${e.id} [${e.errorType}] ${e.message?.slice(0, 100)}${e.resolved ? ' (resolved)' : ''}`
      );
      return textResult(`Errors from Brain matching "${params.search ?? params.pair}":\n${lines.join('\n')}`);
    },
  );
}
