import type { AnalyticsService } from '../services/analytics.service.js';
import type { InsightService } from '../services/insight.service.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { ChainRepository } from '../db/repositories/chain.repository.js';
import type { CalibrationRepository } from '../db/repositories/calibration.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { TradeRepository } from '../db/repositories/trade.repository.js';
import type { PaperService } from '../paper/paper.service.js';
import { getCurrentVersion } from '../cli/update-check.js';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface DashboardServices {
  analytics: AnalyticsService;
  insight: InsightService;
  ruleRepo: RuleRepository;
  chainRepo: ChainRepository;
  calRepo: CalibrationRepository;
  synapseManager: SynapseManager;
  tradeRepo: TradeRepository;
  paper?: PaperService;
}

export function renderDashboard(template: string, services: DashboardServices): string {
  let html = template;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary: any = services.analytics.getSummary();
  const s = summary;

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
  // Gauge: arc length = 251.2 (half circle), offset = (1 - winRate/100) * 251.2
  const gaugeOffset = ((1 - winRate / 100) * 251.2).toFixed(1);
  html = html.replace('{{GAUGE_OFFSET}}', gaugeOffset);

  // Activity score
  const activity = Math.min(100, Math.round(
    ((s.trades?.total ?? 0) * 3 +
     (s.rules?.total ?? 0) * 15 +
     (s.chains?.total ?? 0) * 5 +
     (s.insights?.total ?? 0) * 5 +
     (s.network?.synapses ?? 0) * 2) / 2
  ));
  html = html.replace(/\{\{ACTIVITY\}\}/g, String(activity));

  // Version
  html = html.replace('{{VERSION}}', getCurrentVersion());

  // Recent trades
  const recent = services.tradeRepo.getRecent(10);
  let tradesHtml = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const trade of recent as any[]) {
    const win = trade.win ? 'win' : 'loss';
    const resultLabel = trade.win ? 'WIN' : 'LOSS';
    tradesHtml += `<div class="trade-card ${win}"><div class="trade-meta"><span class="trade-result ${win}">${resultLabel}</span><strong>${escapeHtml(trade.pair ?? '')}</strong></div><p>${escapeHtml(trade.fingerprint ?? '')}</p><div class="trade-details"><span>${escapeHtml(trade.bot_type ?? '')}</span><span>${escapeHtml(trade.created_at?.slice(0, 10) ?? '')}</span></div></div>\n`;
  }
  if (!tradesHtml) tradesHtml = '<p class="empty">No trades recorded yet. Start trading to see results here.</p>';
  html = html.replace('{{RECENT_TRADES}}', tradesHtml);

  // Chains
  const chains = s.chains?.recent ?? [];
  let chainsHtml = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const chain of chains as any[]) {
    const type = chain.type === 'win' ? 'win' : 'loss';
    const icon = chain.type === 'win' ? '&#128293;' : '&#10060;';
    chainsHtml += `<div class="chain-card"><div class="chain-icon">${icon}</div><div class="chain-info"><div class="chain-pair">${escapeHtml(chain.pair ?? '')}</div><div class="chain-type">${type} streak</div></div><div class="chain-length ${type}">${chain.length}x</div></div>\n`;
  }
  if (!chainsHtml) chainsHtml = '<p class="empty">No chains detected yet. Chains appear after 3+ consecutive wins or losses on the same pair.</p>';
  html = html.replace('{{CHAINS_LIST}}', chainsHtml);

  // Rules
  const rules = services.ruleRepo.getAll();
  let rulesHtml = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const rule of rules as any[]) {
    const conf = Math.round((rule.confidence ?? 0) * 100);
    const wr = Math.round((rule.win_rate ?? 0) * 100);
    rulesHtml += `<div class="rule-card"><div class="rule-pattern">${escapeHtml(rule.pattern ?? '')}</div><div class="rule-recommendation">Win rate: ${wr}% (${rule.sample_count ?? 0} trades)</div><div class="rule-confidence"><span>Confidence:</span><div class="confidence-bar"><div class="confidence-fill" data-width="${conf}"></div></div><span>${conf}%</span></div></div>\n`;
  }
  if (!rulesHtml) rulesHtml = '<p class="empty">No rules learned yet. Record more trades to discover patterns.</p>';
  html = html.replace('{{RULES_LIST}}', rulesHtml);

  // Calibration
  const cal = services.calRepo.get();
  if (cal) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = cal as any;
    const stage = (c.outcomeCount ?? 0) < 20 ? '1' : (c.outcomeCount ?? 0) < 100 ? '2' : (c.outcomeCount ?? 0) < 500 ? '3' : '4';
    html = html.replace('{{CAL_STAGE}}', stage);
    html = html.replace('{{CAL_LEARNING_RATE}}', String(c.learningRate ?? '0.3'));
    html = html.replace('{{CAL_WILSON_Z}}', String(c.wilsonZ ?? '1.0'));
    html = html.replace('{{CAL_DECAY}}', String((c.decayHalfLifeDays ?? 60) + 'd'));
  } else {
    html = html.replace('{{CAL_STAGE}}', '1');
    html = html.replace('{{CAL_LEARNING_RATE}}', '0.3');
    html = html.replace('{{CAL_WILSON_Z}}', '1.0');
    html = html.replace('{{CAL_DECAY}}', '60d');
  }

  // Insights by type
  const allInsights = services.insight.getRecent(200);
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

  // Paper Trading
  if (services.paper) {
    const ps = services.paper.getStatus();
    html = html.replace('{{PAPER_STATUS}}', ps.running ? (ps.paused ? 'PAUSED' : 'RUNNING') : 'STOPPED');
    html = html.replace('{{PAPER_BALANCE}}', `$${ps.balance.toFixed(2)}`);
    html = html.replace('{{PAPER_EQUITY}}', `$${ps.equity.toFixed(2)}`);
    const portfolioPnl = ps.equity - (ps.startingBalance ?? 10000);
    const pnlSign = portfolioPnl >= 0 ? '+' : '';
    html = html.replace('{{PAPER_PNL}}', `${pnlSign}$${portfolioPnl.toFixed(2)}`);
    html = html.replace('{{PAPER_WIN_RATE}}', `${ps.winRate}%`);
    html = html.replace('{{PAPER_TRADES}}', String(ps.totalTrades));
    html = html.replace('{{PAPER_POSITIONS}}', String(ps.openPositions));
    html = html.replace('{{PAPER_CYCLES}}', String(ps.cycleCount));
  } else {
    html = html.replace('{{PAPER_STATUS}}', 'N/A');
    html = html.replace('{{PAPER_BALANCE}}', '$0');
    html = html.replace('{{PAPER_EQUITY}}', '$0');
    html = html.replace('{{PAPER_PNL}}', '$0');
    html = html.replace('{{PAPER_WIN_RATE}}', '0%');
    html = html.replace('{{PAPER_TRADES}}', '0');
    html = html.replace('{{PAPER_POSITIONS}}', '0');
    html = html.replace('{{PAPER_CYCLES}}', '0');
  }

  // Graph edges
  const strongest = services.synapseManager.getStrongest(50);
  const edges = Array.isArray(strongest) ? strongest : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphEdges = edges.map((e: any) => ({
    s: `${e.source_type ?? 'node'}:${e.source_id ?? ''}`,
    t: `${e.target_type ?? 'node'}:${e.target_id ?? ''}`,
    type: e.synapse_type ?? 'related',
    w: e.weight ?? 0.5,
  }));
  html = html.replace('{{GRAPH_EDGES}}', JSON.stringify(graphEdges));

  return html;
}
