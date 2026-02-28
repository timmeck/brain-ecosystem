import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { IpcClient } from '../ipc/client.js';
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
