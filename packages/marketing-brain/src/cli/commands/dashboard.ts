import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withIpc } from '../ipc-helper.js';
import { c, icons, header, divider } from '../colors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_HTML = path.resolve(__dirname, '../../../dashboard.html');

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function dashboardCommand(): Command {
  return new Command('dashboard')
    .description('Open the marketing dashboard in browser')
    .option('-o, --output <path>', 'Output HTML file path')
    .option('--no-open', 'Generate HTML but do not open in browser')
    .option('-l, --live', 'Enable live mode (SSE updates from daemon)')
    .option('-p, --port <n>', 'Dashboard server port for live mode', '7783')
    .action(async (opts) => {
      await withIpc(async (client) => {
        console.log(`${icons.chart}  ${c.info('Generating dashboard...')}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = await client.request('analytics.dashboard', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insights: any = await client.request('insight.list', { limit: 200 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rules: any = await client.request('rule.list', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const strongest: any = await client.request('synapse.strongest', { limit: 50 });

        const s = data.summary;

        // Read template
        let html = fs.readFileSync(DASHBOARD_HTML, 'utf-8');

        // Stats
        html = html.replace('{{POSTS}}', String(s.posts?.total ?? 0));
        html = html.replace('{{CAMPAIGNS}}', String(s.campaigns?.total ?? 0));
        html = html.replace('{{STRATEGIES}}', String(s.strategies?.total ?? 0));
        html = html.replace('{{RULES}}', String(s.rules?.total ?? 0));
        html = html.replace('{{TEMPLATES}}', String(s.templates?.total ?? 0));
        html = html.replace('{{SYNAPSES}}', String(s.network?.synapses ?? 0));

        // Activity score (based on data richness)
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
        const topPosts = data.topPerformers?.topPosts ?? [];
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

        // Plural mapping for irregular types
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

          // Map type to template placeholder
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

        // Ecosystem peers
        let peersHtml = '';
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eco: any = await client.request('ecosystem.status', {});
          const peers = Array.isArray(eco?.peers) ? eco.peers : [];
          for (const peer of peers) {
            const r = peer.result ?? {};
            peersHtml += `<div class="stat-card green"><div class="stat-number">${escapeHtml(r.version ?? '?')}</div><div class="stat-label">${escapeHtml(peer.name ?? '?')} (${r.methods ?? '?'} methods)</div></div>\n`;
          }
        } catch { /* peers not available */ }
        if (!peersHtml) peersHtml = '<div class="stat-card"><div class="stat-number">0</div><div class="stat-label">No peers online</div></div>';
        html = html.replace('{{ECOSYSTEM_PEERS}}', peersHtml);

        // Write output
        const outputPath = opts.output ?? path.join(process.env['TEMP'] ?? '/tmp', 'marketing-brain-dashboard.html');
        fs.writeFileSync(outputPath, html, 'utf-8');

        console.log(`${icons.ok}  ${c.success('Dashboard generated:')} ${c.dim(outputPath)}`);

        // CLI summary
        console.log(header('Marketing Brain Dashboard', icons.megaphone));
        console.log(`     Posts: ${c.value(s.posts?.total ?? 0)} | Campaigns: ${c.value(s.campaigns?.total ?? 0)} | Strategies: ${c.value(s.strategies?.total ?? 0)}`);
        console.log(`     Rules: ${c.green(s.rules?.active ?? 0)} active | Insights: ${c.value(s.insights?.active ?? 0)} | Synapses: ${c.value(s.network?.synapses ?? 0)}`);
        console.log(divider());

        if (opts.open !== false) {
          const { exec } = await import('node:child_process');
          const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
          exec(`${cmd} "${outputPath}"`);
        }
      });
    });
}
