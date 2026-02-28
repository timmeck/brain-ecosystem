import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { IpcClient } from '../ipc/client.js';
import type { IpcRouter } from '../ipc/router.js';

type BrainCall = (method: string, params: unknown) => unknown | Promise<unknown>;

export function registerTools(server: McpServer, ipc: IpcClient): void {
  registerToolsWithCaller(server, (method, params) => ipc.request(method, params));
}

/** Register tools using router directly (for HTTP MCP transport inside daemon) */
export function registerToolsDirect(server: McpServer, router: IpcRouter): void {
  registerToolsWithCaller(server, (method, params) => router.handle(method, params));
}

function registerToolsWithCaller(server: McpServer, call: BrainCall): void {

  // 1. post.draft — Check a post draft against rules
  server.tool(
    'marketing_post_draft',
    'Check a post draft against learned marketing rules before publishing. Returns violations and recommendations.',
    {
      content: z.string().describe('The post content/text to check'),
      platform: z.string().describe('Target platform (x, reddit, linkedin, bluesky)'),
    },
    async ({ content, platform }) => {
      const result = await call('rule.check', { content, platform });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 2. post.report — Report a published post
  server.tool(
    'marketing_post_report',
    'Report a published post to track in the marketing brain. Stores content, platform, format, and creates synapse connections.',
    {
      platform: z.string().describe('Platform (x, reddit, linkedin, bluesky)'),
      content: z.string().describe('Post content/text'),
      format: z.string().optional().describe('Post format (text, image, video, thread, article)'),
      url: z.string().optional().describe('Post URL'),
      hashtags: z.string().optional().describe('Hashtags (comma-separated)'),
      campaign: z.string().optional().describe('Campaign name (creates if not exists)'),
    },
    async ({ platform, content, format, url, hashtags, campaign }) => {
      let campaignId: number | null = null;
      if (campaign) {
        const camp = await call('campaign.create', { name: campaign }) as { id: number };
        campaignId = camp.id;
      }
      const result = await call('post.report', {
        platform, content, format: format ?? 'text',
        url, hashtags, campaign_id: campaignId,
        status: 'published', published_at: new Date().toISOString(),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 3. post.engagement — Update engagement metrics
  server.tool(
    'marketing_post_engagement',
    'Update engagement metrics for a tracked post. Provide post ID and current metrics.',
    {
      post_id: z.number().describe('Post ID'),
      likes: z.number().optional().describe('Current likes count'),
      comments: z.number().optional().describe('Current comments count'),
      shares: z.number().optional().describe('Current shares/retweets count'),
      impressions: z.number().optional().describe('Current impressions count'),
      clicks: z.number().optional().describe('Current clicks count'),
      saves: z.number().optional().describe('Current saves/bookmarks count'),
      reach: z.number().optional().describe('Current reach count'),
    },
    async (params) => {
      const result = await call('post.engagement', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 4. post.similar — Find similar posts
  server.tool(
    'marketing_post_similar',
    'Find posts similar to a given post using synapse network spreading activation.',
    {
      post_id: z.number().describe('Post ID to find similar posts for'),
    },
    async ({ post_id }) => {
      const result = await call('post.similar', { id: post_id });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 5. campaign.create — Create a new campaign
  server.tool(
    'marketing_campaign_create',
    'Create a new marketing campaign to group and track related posts.',
    {
      name: z.string().describe('Campaign name'),
      brand: z.string().optional().describe('Brand name (e.g., REPOSIGNAL, Brain)'),
      goal: z.string().optional().describe('Campaign goal'),
      platform: z.string().optional().describe('Primary platform'),
    },
    async (params) => {
      const result = await call('campaign.create', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 6. campaign.stats — Campaign performance
  server.tool(
    'marketing_campaign_stats',
    'Get performance statistics for a campaign including total engagement and post count.',
    {
      campaign_id: z.number().describe('Campaign ID'),
    },
    async ({ campaign_id }) => {
      const result = await call('campaign.stats', { id: campaign_id });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 7. strategy.report — Report a successful strategy
  server.tool(
    'marketing_strategy_report',
    'Report a marketing strategy that worked. The brain will learn from it and suggest similar strategies later.',
    {
      description: z.string().describe('Strategy description'),
      approach: z.string().optional().describe('Approach taken'),
      outcome: z.string().optional().describe('Outcome/result'),
      post_id: z.number().optional().describe('Related post ID'),
    },
    async (params) => {
      const result = await call('strategy.report', params);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 8. strategy.suggest — Get strategy suggestions
  server.tool(
    'marketing_strategy_suggest',
    'Get strategy suggestions based on a topic or context. Searches past successful strategies.',
    {
      query: z.string().describe('Topic or context to search for'),
      limit: z.number().optional().describe('Max results (default: 5)'),
    },
    async ({ query, limit }) => {
      const result = await call('strategy.suggest', { query, limit: limit ?? 5 });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 9. template.find — Find content templates
  server.tool(
    'marketing_template_find',
    'Find reusable content templates that match a query or platform.',
    {
      query: z.string().optional().describe('Search query'),
      platform: z.string().optional().describe('Filter by platform'),
      limit: z.number().optional().describe('Max results'),
    },
    async ({ query, platform, limit }) => {
      let result;
      if (platform) {
        result = await call('template.byPlatform', { platform, limit: limit ?? 10 });
      } else {
        result = await call('template.find', { query: query ?? '', limit: limit ?? 10 });
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 10. rule.check — Check draft against rules
  server.tool(
    'marketing_rule_check',
    'Check a post draft against all learned marketing rules. Returns violations and recommendations.',
    {
      content: z.string().describe('Post content to check'),
      platform: z.string().describe('Target platform'),
    },
    async ({ content, platform }) => {
      const result = await call('rule.check', { content, platform });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 11. insight.list — List current insights
  server.tool(
    'marketing_insight_list',
    'Get current active marketing insights (trends, gaps, synergies, optimizations).',
    {
      type: z.string().optional().describe('Filter by type: trend, gap, synergy, template, optimization'),
      limit: z.number().optional().describe('Max results'),
    },
    async ({ type, limit }) => {
      let result;
      if (type) {
        result = await call('insight.byType', { type, limit: limit ?? 20 });
      } else {
        result = await call('insight.list', { limit: limit ?? 20 });
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 12. analytics.summary — Overall analytics
  server.tool(
    'marketing_analytics_summary',
    'Get a complete analytics summary: posts, campaigns, strategies, rules, insights, and network stats.',
    {},
    async () => {
      const result = await call('analytics.summary', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // 13. analytics.bestOf — Top performing content
  server.tool(
    'marketing_analytics_best',
    'Get top performing posts, best strategies, and platform-level engagement stats.',
    {
      limit: z.number().optional().describe('Max results per category'),
    },
    async ({ limit }) => {
      const result = await call('analytics.top', { limit: limit ?? 10 });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // === Memory & Session Tools ===

  // 14. marketing_remember
  server.tool(
    'marketing_remember',
    'Store a memory — preferences, decisions, context, facts, goals, or lessons learned from marketing.',
    {
      content: z.string().describe('The memory content to store'),
      category: z.enum(['preference', 'decision', 'context', 'fact', 'goal', 'lesson']).describe('Memory category'),
      key: z.string().optional().describe('Unique key for upsert (updates existing memory with same key)'),
      importance: z.number().min(1).max(10).optional().describe('Importance 1-10 (default 5)'),
      tags: z.array(z.string()).optional().describe('Tags for organization'),
    },
    async ({ content, category, key, importance, tags }) => {
      const result = await call('memory.remember', { content, category, key, importance, tags }) as { memoryId: number; superseded?: number };
      const msg = result.superseded
        ? `Memory #${result.memoryId} stored (${category}), superseding #${result.superseded}`
        : `Memory #${result.memoryId} stored (${category})`;
      return { content: [{ type: 'text' as const, text: msg }] };
    },
  );

  // 15. marketing_recall
  server.tool(
    'marketing_recall',
    'Search marketing memories by natural language query. Returns matching memories sorted by relevance.',
    {
      query: z.string().describe('Natural language search query'),
      category: z.enum(['preference', 'decision', 'context', 'fact', 'goal', 'lesson']).optional().describe('Filter by category'),
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async ({ query, category, limit }) => {
      const results = await call('memory.recall', { query, category, limit }) as Array<{ id: number; category: string; content: string; key?: string }>;
      if (!Array.isArray(results) || results.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No memories found.' }] };
      }
      const lines = results.map(m =>
        `#${m.id} [${m.category}] ${m.content.slice(0, 200)}${m.key ? ` (key: ${m.key})` : ''}`
      );
      return { content: [{ type: 'text' as const, text: `Found ${results.length} memory/memories:\n${lines.join('\n')}` }] };
    },
  );

  // 16. marketing_session_start
  server.tool(
    'marketing_session_start',
    'Start a new marketing session. Track goals and context for the conversation.',
    {
      goals: z.array(z.string()).optional().describe('Session goals'),
    },
    async ({ goals }) => {
      const result = await call('session.start', { goals }) as { sessionId: number; dbSessionId: string };
      return { content: [{ type: 'text' as const, text: `Session #${result.sessionId} started (${result.dbSessionId})` }] };
    },
  );

  // 17. marketing_session_end
  server.tool(
    'marketing_session_end',
    'End a marketing session with a summary of what was accomplished.',
    {
      session_id: z.number().describe('Session ID to end'),
      summary: z.string().describe('Summary of what was accomplished'),
      outcome: z.enum(['completed', 'paused', 'abandoned']).optional().describe('Session outcome (default: completed)'),
    },
    async ({ session_id, summary, outcome }) => {
      await call('session.end', { sessionId: session_id, summary, outcome });
      return { content: [{ type: 'text' as const, text: `Session #${session_id} ended (${outcome ?? 'completed'})` }] };
    },
  );

  // 18. marketing_session_history
  server.tool(
    'marketing_session_history',
    'List past marketing sessions with summaries and outcomes.',
    {
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async ({ limit }) => {
      const sessions = await call('session.history', { limit: limit ?? 10 }) as Array<{ id: number; outcome?: string; summary?: string; started_at: string }>;
      if (!Array.isArray(sessions) || sessions.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No sessions found.' }] };
      }
      const lines = sessions.map(s =>
        `#${s.id} [${s.outcome ?? 'active'}] ${s.summary ?? '(no summary)'} — ${s.started_at}`
      );
      return { content: [{ type: 'text' as const, text: `${sessions.length} session(s):\n${lines.join('\n')}` }] };
    },
  );

  // === Cross-Brain Ecosystem Tools ===

  server.tool(
    'marketing_ecosystem_status',
    'Get status of all brains in the ecosystem (brain, trading-brain, marketing-brain).',
    {},
    async () => {
      const result = await call('ecosystem.status', {});
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'marketing_query_peer',
    'Query another brain in the ecosystem. Call any method on brain or trading-brain.',
    {
      peer: z.string().describe('Peer brain name: brain or trading-brain'),
      method: z.string().describe('IPC method to call (e.g. analytics.summary, trade.recent)'),
      args: z.record(z.string(), z.unknown()).optional().describe('Method arguments as key-value pairs'),
    },
    async ({ peer, method, args }) => {
      const result = await call('ecosystem.queryPeer', { peer, method, args: args ?? {} });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'marketing_cross_promote',
    'Get insights from Brain as content ideas. Fetches active research insights that could become marketing content.',
    {},
    async () => {
      const result = await call('ecosystem.queryPeer', {
        peer: 'brain',
        method: 'research.insights',
        args: { activeOnly: true, limit: 10 },
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'marketing_trading_performance',
    'Get trading performance stats for performance-related content posts.',
    {},
    async () => {
      const result = await call('ecosystem.queryPeer', {
        peer: 'trading-brain',
        method: 'analytics.summary',
        args: {},
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );
}
