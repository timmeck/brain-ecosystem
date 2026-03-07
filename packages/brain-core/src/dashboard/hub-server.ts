import fs from 'node:fs';
import path from 'node:path';
import { DashboardServer } from './server.js';
import type { EcosystemService } from '../ecosystem/service.js';
import type { CrossBrainCorrelator } from '../cross-brain/correlator.js';

export interface HubDashboardOptions {
  port: number;
  ecosystemService: EcosystemService;
  correlator: CrossBrainCorrelator;
}

export function createHubDashboard(options: HubDashboardOptions): DashboardServer {
  const { port, correlator } = options;

  const htmlPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
    '../../hub-dashboard.html',
  );

  return new DashboardServer({
    port,
    getDashboardHtml: () => {
      try {
        const template = fs.readFileSync(htmlPath, 'utf-8');
        const health = correlator.getHealth();
        const correlations = correlator.getCorrelations();
        const timeline = correlator.getTimeline(20);
        const activeBrains = correlator.getActiveBrains();

        return template
          .replace(/\{\{HEALTH_SCORE\}\}/g, String(health.score))
          .replace(/\{\{HEALTH_STATUS\}\}/g, health.status)
          .replace(/\{\{ACTIVE_BRAINS\}\}/g, String(health.activeBrains))
          .replace(/\{\{TOTAL_EVENTS\}\}/g, String(health.totalEvents))
          .replace(/\{\{TOTAL_CORRELATIONS\}\}/g, String(health.correlations))
          .replace('{{CORRELATIONS_JSON}}', JSON.stringify(correlations))
          .replace('{{TIMELINE_JSON}}', JSON.stringify(timeline))
          .replace('{{ACTIVE_BRAINS_JSON}}', JSON.stringify(activeBrains))
          .replace('{{ALERTS_JSON}}', JSON.stringify(health.alerts));
      } catch {
        return '<html><body><h1>Hub Dashboard HTML not found</h1></body></html>';
      }
    },
    getStats: () => {
      const health = correlator.getHealth();
      return {
        ...health,
        activeBrainNames: correlator.getActiveBrains(),
        correlations: correlator.getCorrelations(),
        timeline: correlator.getTimeline(20),
      };
    },
  });
}
