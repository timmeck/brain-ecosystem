import { DashboardServer } from '@timmeck/brain-core';
import { getEventBus } from '../utils/events.js';

export { DashboardServer };
export type { DashboardServerOptions } from '@timmeck/brain-core';

export const TRADING_EVENT_NAMES = [
  'trade:recorded', 'synapse:updated',
  'rule:learned', 'chain:detected',
  'insight:created', 'calibration:updated',
] as const;

export function createTradingDashboardServer(options: {
  port: number;
  getDashboardHtml: () => string;
  getStats: () => unknown;
}): DashboardServer {
  return new DashboardServer({
    ...options,
    eventNames: TRADING_EVENT_NAMES,
    getEventBus: () => getEventBus() as { on(event: string, handler: (data: unknown) => void): void },
  });
}
