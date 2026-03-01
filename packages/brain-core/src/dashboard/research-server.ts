import fs from 'node:fs';
import path from 'node:path';
import { DashboardServer } from './server.js';
import type { ResearchOrchestrator } from '../research/research-orchestrator.js';
import type { AutonomousResearchScheduler } from '../research/autonomous-scheduler.js';

export interface ResearchDashboardOptions {
  port: number;
  brainName: string;
  version: string;
  orchestrator: ResearchOrchestrator;
  scheduler: AutonomousResearchScheduler;
}

export function createResearchDashboard(options: ResearchDashboardOptions): DashboardServer {
  const { port, brainName, version, orchestrator, scheduler } = options;

  const htmlPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
    '../../research-dashboard.html',
  );

  return new DashboardServer({
    port,
    getDashboardHtml: () => {
      let template: string;
      try {
        template = fs.readFileSync(htmlPath, 'utf-8');
      } catch {
        return '<html><body><h1>Research Dashboard HTML not found</h1></body></html>';
      }

      const status = scheduler.getStatus();
      const summary = orchestrator.getSummary();

      const hypotheses = status.hypothesisSummary;
      const hypothesesData = {
        pending: (hypotheses as Record<string, unknown>).pending ?? [],
        confirmed: (hypotheses as Record<string, unknown>).confirmed ?? [],
        rejected: (hypotheses as Record<string, unknown>).rejected ?? [],
      };

      return template
        .replace(/\{\{BRAIN_NAME\}\}/g, brainName)
        .replace(/\{\{VERSION\}\}/g, version)
        .replace(/\{\{CYCLES\}\}/g, String(status.cyclesCompleted))
        .replace(/\{\{DISCOVERIES\}\}/g, String(status.totalDiscoveries))
        .replace(/\{\{CONFIRMATION_RATE\}\}/g,
          status.hypothesisSummary.total > 0
            ? `${Math.round((status.hypothesisSummary.confirmed / status.hypothesisSummary.total) * 100)}%`
            : 'N/A')
        .replace(/\{\{ANOMALIES\}\}/g, String((summary.anomalies as unknown[]).length))
        .replace(/\{\{HYPOTHESES_JSON\}\}/g, JSON.stringify(hypothesesData))
        .replace(/\{\{EXPERIMENTS_JSON\}\}/g, JSON.stringify(summary.experiments))
        .replace(/\{\{ANOMALIES_JSON\}\}/g, JSON.stringify(summary.anomalies))
        .replace(/\{\{PRINCIPLES_JSON\}\}/g, JSON.stringify((summary.knowledge as Record<string, unknown>).topPrinciples ?? []))
        .replace(/\{\{ANTI_PATTERNS_JSON\}\}/g, JSON.stringify([]))
        .replace(/\{\{JOURNAL_JSON\}\}/g, JSON.stringify((summary.journal as Record<string, unknown>).recent_highlights ?? []))
        .replace(/\{\{INSIGHTS_JSON\}\}/g, JSON.stringify(summary.selfInsights))
        .replace(/\{\{CORRELATIONS_JSON\}\}/g, JSON.stringify(summary.correlations))
        .replace(/\{\{AGENDA_JSON\}\}/g, JSON.stringify(summary.agenda));
    },
    getStats: () => orchestrator.getSummary(),
  });
}
