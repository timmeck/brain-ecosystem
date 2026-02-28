import { DashboardServer } from '@timmeck/brain-core';
import { getEventBus } from '../utils/events.js';

export { DashboardServer };
export type { DashboardServerOptions } from '@timmeck/brain-core';

export const BRAIN_EVENT_NAMES = [
  'error:reported', 'error:resolved', 'solution:applied',
  'solution:created', 'module:registered', 'module:updated',
  'synapse:created', 'synapse:strengthened',
  'insight:created', 'rule:learned',
] as const;

export function createBrainDashboardServer(options: {
  port: number;
  getDashboardHtml: () => string;
  getStats: () => unknown;
}): DashboardServer {
  return new DashboardServer({
    ...options,
    eventNames: BRAIN_EVENT_NAMES,
    getEventBus: () => getEventBus() as { on(event: string, handler: (data: unknown) => void): void },
  });
}
