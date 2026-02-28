import { CrossBrainClient } from './client.js';
import { getLogger } from '../utils/logger.js';

export interface CrossBrainEvent {
  source: string;
  event: string;
  data: unknown;
  timestamp: string;
}

/**
 * Cross-Brain Notifier — sends event notifications to peer brains.
 * Built on top of CrossBrainClient's query/broadcast infrastructure.
 */
export class CrossBrainNotifier {
  private logger = getLogger();

  constructor(private client: CrossBrainClient, private selfName: string) {}

  /**
   * Notify all peers about an event.
   */
  async notify(event: string, data: unknown): Promise<void> {
    const payload: CrossBrainEvent = {
      source: this.selfName,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.client.broadcast('cross-brain.notify', payload);
      this.logger.debug(`Cross-brain notification sent: ${event}`);
    } catch {
      this.logger.debug(`Cross-brain notification failed (peers may be offline): ${event}`);
    }
  }

  /**
   * Notify a specific peer about an event.
   */
  async notifyPeer(peerName: string, event: string, data: unknown): Promise<void> {
    const payload: CrossBrainEvent = {
      source: this.selfName,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.client.query(peerName, 'cross-brain.notify', payload);
      this.logger.debug(`Cross-brain notification sent to ${peerName}: ${event}`);
    } catch {
      this.logger.debug(`Cross-brain notification to ${peerName} failed: ${event}`);
    }
  }
}
