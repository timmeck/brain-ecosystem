import type { AnalyticsService } from '../services/analytics.service.js';
import type { InsightService } from '../services/insight.service.js';
import type { RuleService } from '../services/rule.service.js';
import type { SynapseService } from '../services/synapse.service.js';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface DashboardServices {
  analytics: AnalyticsService;
  insight: InsightService;
  rule: RuleService;
  synapse: SynapseService;
}

export function renderDashboard(template: string, services: DashboardServices): string {
  let html = template;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary: any = services.analytics.getSummary();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dashData: any = services.analytics.getDashboardData();
  const insights = services.insight.listActive(200);
  const rules = services.rule.listRules();
  const strongest = services.synapse.getStrongest(50);

  const s = summary;

  // Stats
  html = html.replace('{{POSTS}}', String(s.posts?.total ?? 0));
  html = html.replace('{{CAMPAIGNS}}', String(s.campaigns?.total ?? 0));
  html = html.replace('{{STRATEGIES}}', String(s.strategies?.total ?? 0));
  html = html.replace('{{RULES}}', String(s.rules?.total ?? 0));
  html = html.replace('{{TEMPLATES}}', String(s.templates?.total ?? 0));
  html = html.replace('{{SYNAPSES}}', String(s.network?.synapses ?? 0));

  // Activity score
  const activity = Math.min(100, Math.round(
    ((s.posts?.total ?? 0) * 5 +
     (s.campaigns?.total ?? 0) * 10 +
     (s.strategies?.total ?? 0) * 3 +
     (s.rules?.active ?? 0) * 15 +
     (s.insights?.active ?? 0) * 5) / 2
  ));
  html = html.replace(/\{\{ACTIVITY\}\}/g, String(activity));

  // Version
  html = html.replace('{{VERSION}}', '0.1.0');

  // Platform chart
  const platforms = s.posts?.byPlatform ?? {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const maxCount = Math.max(1, ...Object.values(platforms as Record<string, number>));
  let platformHtml = '';
  for (const [platform, count] of Object.entries(platforms as Record<string, number>)) {
    const width = Math.round((count / maxCount) * 100);
    const barClass = `${platform}-bar`;
    platformHtml += `<div class="platform-row"><span class="platform-name">${escapeHtml(platform)}</span><div class="platform-bar-bg"><div class="platform-bar ${barClass}" data-width="${width}"></div></div><span class="platform-count">${count}</span></div>\n`;
  }
  if (!platformHtml) platformHtml = '<p class="empty">No posts tracked yet.</p>';
  html = html.replace('{{PLATFORM_CHART}}', platformHtml);

  // Top posts
  const topPosts = dashData.topPerformers?.topPosts ?? [];
  let postsHtml = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const post of topPosts.slice(0, 10) as any[]) {
    const score = (post.likes ?? 0) + (post.comments ?? 0) * 3 + (post.shares ?? 0) * 5 + (post.clicks ?? 0) * 2;
    const preview = escapeHtml((post.content ?? '').slice(0, 140));
    postsHtml += `<div class="post-card ${post.platform}"><div class="post-meta"><span class="post-platform ${post.platform}">${escapeHtml(post.platform)}</span><strong>${escapeHtml(post.format ?? 'text')}</strong></div><p>${preview}</p><div class="post-engagement"><span>&#10084; ${post.likes ?? 0}</span><span>&#128172; ${post.comments ?? 0}</span><span>&#128257; ${post.shares ?? 0}</span><span>Score: ${score}</span></div></div>\n`;
  }
  if (!postsHtml) postsHtml = '<p class="empty">No posts with engagement data yet.</p>';
  html = html.replace('{{TOP_POSTS}}', postsHtml);

  // Rules
  const rulesList = Array.isArray(rules) ? rules : [];
  let rulesHtml = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const rule of rulesList as any[]) {
    const conf = Math.round((rule.confidence ?? 0) * 100);
    rulesHtml += `<div class="rule-card"><div class="rule-pattern">${escapeHtml(rule.pattern ?? '')}</div><div class="rule-recommendation">${escapeHtml(rule.recommendation ?? '')}</div><div class="rule-confidence"><span>Confidence:</span><div class="confidence-bar"><div class="confidence-fill" data-width="${conf}"></div></div><span>${conf}%</span></div></div>\n`;
  }
  if (!rulesHtml) rulesHtml = '<p class="empty">No rules learned yet. Post more content to discover patterns.</p>';
  html = html.replace('{{RULES_LIST}}', rulesHtml);

  // Insights by type
  const allInsights = Array.isArray(insights) ? insights : [];
  const insightsByType: Record<string, unknown[]> = {
    trend: [], gap: [], synergy: [], template: [], optimization: [],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ins of allInsights as any[]) {
    const type = ins.type ?? 'optimization';
    if (insightsByType[type]) insightsByType[type]!.push(ins);
    else insightsByType.optimization!.push(ins);
  }

  const typeColors: Record<string, string> = {
    trend: 'cyan', gap: 'orange', synergy: 'green', template: 'purple', optimization: 'blue',
  };

  const pluralMap: Record<string, string> = {
    trend: 'TRENDS', gap: 'GAPS', synergy: 'SYNERGIES',
    template: 'TEMPLATES', optimization: 'OPTIMIZATIONS',
  };

  for (const [type, items] of Object.entries(insightsByType)) {
    const plural = pluralMap[type] ?? `${type.toUpperCase()}S`;
    html = html.replace(`{{${plural}_COUNT}}`, String(items.length));

    let insHtml = '';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const ins of items as any[]) {
      const prio = ins.priority >= 70 ? 'high' : ins.priority >= 40 ? 'medium' : 'low';
      insHtml += `<div class="insight-card ${typeColors[type] ?? 'blue'}"><div class="insight-header"><span class="prio prio-${prio}">${ins.priority ?? 0}</span><strong>${escapeHtml(ins.title ?? '')}</strong></div><p>${escapeHtml(ins.description ?? '')}</p></div>\n`;
    }
    if (!insHtml) insHtml = '<p class="empty">No insights in this category yet.</p>';

    const placeholder = type === 'template' ? '{{TEMPLATES_INSIGHTS}}' : `{{${plural}}}`;
    html = html.replace(placeholder, insHtml);
  }

  // Graph edges
  const edges = Array.isArray(strongest) ? strongest : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphEdges = edges.map((e: any) => ({
    s: `${e.source_type}:${e.source_id}`,
    t: `${e.target_type}:${e.target_id}`,
    type: e.synapse_type ?? 'related',
    w: e.weight ?? 0.5,
  }));
  html = html.replace('{{GRAPH_EDGES}}', JSON.stringify(graphEdges));

  return html;
}
