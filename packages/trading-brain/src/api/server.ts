import { BaseApiServer, type ApiServerOptions } from '@timmeck/brain-core';
import { getEventBus } from '../utils/events.js';

export type { ApiServerOptions };

export class ApiServer extends BaseApiServer {
  private statsTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    super.start();
    this.setupSSE();
  }

  stop(): void {
    if (this.statsTimer) {
      clearInterval(this.statsTimer);
      this.statsTimer = null;
    }
    super.stop();
  }

  private setupSSE(): void {
    const bus = getEventBus();
    const eventNames = [
      'trade:recorded', 'synapse:updated', 'rule:learned',
      'chain:detected', 'insight:created', 'calibration:updated',
    ] as const;

    for (const eventName of eventNames) {
      bus.on(eventName, (data: unknown) => {
        this.broadcastSSE({ type: 'event', event: eventName, data });
      });
    }

    this.statsTimer = setInterval(() => {
      if (this.sseClients.size > 0) {
        try {
          const summary = this.options.router.handle('analytics.summary', {});
          this.broadcastSSE({ type: 'stats_update', stats: summary });
        } catch { /* ignore */ }
      }
    }, 30_000);
  }
}
