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
    .description('Open the trading dashboard in browser')
    .option('-o, --output <path>', 'Output HTML file path')
    .option('--no-open', 'Generate HTML but do not open in browser')
    .action(async (opts) => {
      await withIpc(async (client) => {
        console.log(`${icons.chart}  ${c.info('Generating dashboard...')}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const summary: any = await client.request('analytics.summary', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recentTrades: any = await client.request('trade.recent', { limit: 10 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rules: any = await client.request('rule.list', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chains: any = await client.request('chain.list', { limit: 20 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const insights: any = await client.request('insight.list', { limit: 200 });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const synapseStats: any = await client.request('synapse.stats', {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const calibration: any = await client.request('calibration.get', {});

        const s = summary;

        // Read template
        let html = fs.readFileSync(DASHBOARD_HTML, 'utf-8');

        // Stats
        html = html.replace('{{TRADES}}', String(s.trades?.total ?? 0));
        html = html.replace('{{RULES}}', String(s.rules?.total ?? 0));
        html = html.replace('{{CHAINS}}', String(s.chains?.total ?? 0));
        html = html.replace('{{INSIGHTS}}', String(s.insights?.total ?? 0));
        html = html.replace('{{SYNAPSES}}', String(s.network?.synapses ?? 0));
        html = html.replace('{{GRAPH_NODES}}', String(s.network?.graphNodes ?? 0));

        // Win rate
        const winRate = Math.round(s.trades?.recentWinRate ?? 0);
        html = html.replace('{{WIN_RATE}}', String(winRate));
        const gaugeOffset = ((1 - winRate / 100) * 251.2).toFixed(1);
        html = html.replace('{{GAUGE_OFFSET}}', gaugeOffset);

        // Activity
        const activity = Math.min(100, Math.round(
          ((s.trades?.total ?? 0) * 3 +
           (s.rules?.total ?? 0) * 15 +
           (s.chains?.total ?? 0) * 5 +
           (s.insights?.total ?? 0) * 5 +
           (s.network?.synapses ?? 0) * 2) / 2
        ));
        html = html.replace(/\{\{ACTIVITY\}\}/g, String(activity));
        html = html.replace('{{VERSION}}', '1.0.0');

        // Recent trades
        const trades = Array.isArray(recentTrades) ? recentTrades : [];
        let tradesHtml = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const trade of trades as any[]) {
          const win = trade.win ? 'win' : 'loss';
          const resultLabel = trade.win ? 'WIN' : 'LOSS';
          tradesHtml += `<div class="trade-card ${win}"><div class="trade-meta"><span class="trade-result ${win}">${resultLabel}</span><strong>${escapeHtml(trade.pair ?? '')}</strong></div><p>${escapeHtml(trade.fingerprint ?? '')}</p><div class="trade-details"><span>${escapeHtml(trade.bot_type ?? '')}</span><span>${escapeHtml(trade.created_at?.slice(0, 10) ?? '')}</span></div></div>\n`;
        }
        if (!tradesHtml) tradesHtml = '<p class="empty">No trades recorded yet.</p>';
        html = html.replace('{{RECENT_TRADES}}', tradesHtml);

        // Chains
        const chainsList = Array.isArray(chains) ? chains : (s.chains?.recent ?? []);
        let chainsHtml = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const chain of chainsList as any[]) {
          const type = chain.type === 'win' ? 'win' : 'loss';
          const icon = chain.type === 'win' ? '&#128293;' : '&#10060;';
          chainsHtml += `<div class="chain-card"><div class="chain-icon">${icon}</div><div class="chain-info"><div class="chain-pair">${escapeHtml(chain.pair ?? '')}</div><div class="chain-type">${type} streak</div></div><div class="chain-length ${type}">${chain.length}x</div></div>\n`;
        }
        if (!chainsHtml) chainsHtml = '<p class="empty">No chains detected yet.</p>';
        html = html.replace('{{CHAINS_LIST}}', chainsHtml);

        // Rules
        const rulesList = Array.isArray(rules) ? rules : [];
        let rulesHtml = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const rule of rulesList as any[]) {
          const conf = Math.round((rule.confidence ?? 0) * 100);
          const wr = Math.round((rule.win_rate ?? 0) * 100);
          rulesHtml += `<div class="rule-card"><div class="rule-pattern">${escapeHtml(rule.pattern ?? '')}</div><div class="rule-recommendation">Win rate: ${wr}% (${rule.sample_count ?? 0} trades)</div><div class="rule-confidence"><span>Confidence:</span><div class="confidence-bar"><div class="confidence-fill" data-width="${conf}"></div></div><span>${conf}%</span></div></div>\n`;
        }
        if (!rulesHtml) rulesHtml = '<p class="empty">No rules learned yet.</p>';
        html = html.replace('{{RULES_LIST}}', rulesHtml);

        // Calibration
        const cal = calibration ?? {};
        const stage = (cal.outcomeCount ?? 0) < 20 ? '1' : (cal.outcomeCount ?? 0) < 100 ? '2' : (cal.outcomeCount ?? 0) < 500 ? '3' : '4';
        html = html.replace('{{CAL_STAGE}}', stage);
        html = html.replace('{{CAL_LEARNING_RATE}}', String(cal.learningRate ?? '0.3'));
        html = html.replace('{{CAL_WILSON_Z}}', String(cal.wilsonZ ?? '1.0'));
        html = html.replace('{{CAL_DECAY}}', String((cal.decayHalfLifeDays ?? 60) + 'd'));

        // Insights
        const allInsights = Array.isArray(insights) ? insights : [];
        const insightsByType: Record<string, unknown[]> = {
          trend: [], gap: [], synergy: [], performance: [], regime_shift: [],
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const ins of allInsights as any[]) {
          const type = ins.type ?? 'performance';
          if (insightsByType[type]) insightsByType[type]!.push(ins);
          else insightsByType.performance!.push(ins);
        }
        const typeColors: Record<string, string> = {
          trend: 'cyan', gap: 'orange', synergy: 'green', performance: 'blue', regime_shift: 'red',
        };
        const pluralMap: Record<string, string> = {
          trend: 'TRENDS', gap: 'GAPS', synergy: 'SYNERGIES',
          performance: 'PERFORMANCE', regime_shift: 'REGIMES',
        };
        for (const [type, items] of Object.entries(insightsByType)) {
          const plural = pluralMap[type] ?? `${type.toUpperCase()}S`;
          html = html.replace(`{{${plural}_COUNT}}`, String(items.length));
          let insHtml = '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          for (const ins of items as any[]) {
            const sev = ins.severity === 'high' ? 'high' : ins.severity === 'medium' ? 'medium' : 'low';
            insHtml += `<div class="insight-card ${typeColors[type] ?? 'blue'}"><div class="insight-header"><span class="prio prio-${sev}">${escapeHtml(ins.severity ?? 'low')}</span><strong>${escapeHtml(ins.title ?? '')}</strong></div><p>${escapeHtml(ins.description ?? '')}</p></div>\n`;
          }
          if (!insHtml) insHtml = '<p class="empty">No insights in this category yet.</p>';
          html = html.replace(`{{${plural}}}`, insHtml);
        }

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

        // Graph edges (from synapse stats)
        const strongest = synapseStats?.strongest ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const graphEdges = strongest.map((e: any) => ({
          s: `${e.source_type ?? 'node'}:${e.source_id ?? ''}`,
          t: `${e.target_type ?? 'node'}:${e.target_id ?? ''}`,
          type: e.synapse_type ?? 'related',
          w: e.weight ?? 0.5,
        }));
        html = html.replace('{{GRAPH_EDGES}}', JSON.stringify(graphEdges));

        // Write output
        const outputPath = opts.output ?? path.join(process.env['TEMP'] ?? '/tmp', 'trading-brain-dashboard.html');
        fs.writeFileSync(outputPath, html, 'utf-8');

        console.log(`${icons.ok}  ${c.success('Dashboard generated:')} ${c.dim(outputPath)}`);

        console.log(header('Trading Brain Dashboard', icons.trade));
        console.log(`     Trades: ${c.value(s.trades?.total ?? 0)} | Win Rate: ${c.green(winRate + '%')} | Rules: ${c.value(s.rules?.total ?? 0)}`);
        console.log(`     Chains: ${c.value(s.chains?.total ?? 0)} | Insights: ${c.value(s.insights?.total ?? 0)} | Synapses: ${c.value(s.network?.synapses ?? 0)}`);
        console.log(divider());

        if (opts.open !== false) {
          const { exec } = await import('node:child_process');
          const cmd = process.platform === 'win32' ? 'start' : process.platform === 'darwin' ? 'open' : 'xdg-open';
          exec(`${cmd} "${outputPath}"`);
        }
      });
    });
}
