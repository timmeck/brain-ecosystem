import { DashboardServer } from '@timmeck/brain-core';
import { getEventBus } from '../utils/events.js';

export { DashboardServer };
export type { DashboardServerOptions } from '@timmeck/brain-core';

export const MARKETING_EVENT_NAMES = [
  'post:created', 'post:published', 'engagement:updated',
  'strategy:reported', 'rule:learned', 'rule:triggered',
  'template:created', 'campaign:created',
  'insight:created', 'synapse:created', 'synapse:strengthened',
] as const;

export function createMarketingDashboardServer(options: {
  port: number;
  getDashboardHtml: () => string;
  getStats: () => unknown;
}): DashboardServer {
  return new DashboardServer({
    ...options,
    eventNames: MARKETING_EVENT_NAMES,
    getEventBus: () => getEventBus() as { on(event: string, handler: (data: unknown) => void): void },
  });
}
