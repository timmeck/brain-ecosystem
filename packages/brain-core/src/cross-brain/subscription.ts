import { IpcClient } from '../ipc/client.js';
import { getLogger } from '../utils/logger.js';
import { getPipeName } from '../utils/paths.js';

export interface EventSubscription {
  peer: string;
  events: string[];
  callback: (event: string, data: unknown) => void;
}

export class CrossBrainSubscriptionManager {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private connections: Map<string, IpcClient> = new Map();
  private logger = getLogger();
  private selfName: string;

  constructor(selfName: string) {
    this.selfName = selfName;
  }

  /**
   * Subscribe to events from a peer brain.
   * Maintains a persistent IPC connection for receiving events.
   */
  async subscribe(peer: string, events: string[], callback: (event: string, data: unknown) => void): Promise<void> {
    const key = peer;

    // Store subscription
    this.subscriptions.set(key, { peer, events, callback });

    // Connect to peer
    try {
      const client = new IpcClient(getPipeName(peer), 5000);
      await client.connect();

      // Send subscription request
      await client.request('cross-brain.subscribe', {
        subscriber: this.selfName,
        events,
      });

      this.connections.set(peer, client);
      this.logger.info(`Subscribed to ${peer} events: ${events.join(', ')}`);
    } catch (err) {
      this.logger.warn(`Failed to subscribe to ${peer}: ${err}`);
    }
  }

  /**
   * Unsubscribe from a peer's events.
   */
  async unsubscribe(peer: string): Promise<void> {
    const client = this.connections.get(peer);
    if (client) {
      try {
        await client.request('cross-brain.unsubscribe', {
          subscriber: this.selfName,
        });
      } catch { /* peer may be offline */ }
      client.disconnect();
      this.connections.delete(peer);
    }
    this.subscriptions.delete(peer);
  }

  /**
   * Handle incoming event from a peer (called by IPC server).
   */
  handleIncomingEvent(peer: string, event: string, data: unknown): void {
    const sub = this.subscriptions.get(peer);
    if (sub && sub.events.includes(event)) {
      sub.callback(event, data);
    }
  }

  /**
   * Get all active subscriptions.
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Disconnect all persistent connections.
   */
  async disconnectAll(): Promise<void> {
    for (const [peer, client] of this.connections) {
      try { client.disconnect(); } catch { /* ignore */ }
      this.logger.debug(`Disconnected from ${peer}`);
    }
    this.connections.clear();
    this.subscriptions.clear();
  }
}
