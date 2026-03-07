import { IpcClient } from '../ipc/client.js';
import { getPipeName } from '../utils/paths.js';

export interface BrainPeer {
  name: string;
  pipeName: string;
}

const DEFAULT_PEERS: BrainPeer[] = [
  { name: 'brain', pipeName: getPipeName('brain') },
  { name: 'trading-brain', pipeName: getPipeName('trading-brain') },
  { name: 'marketing-brain', pipeName: getPipeName('marketing-brain') },
];

export class CrossBrainClient {
  private peers: BrainPeer[];
  private localHandler: ((method: string, params?: unknown) => unknown | Promise<unknown>) | null = null;

  constructor(
    private selfName: string,
    peers?: BrainPeer[],
  ) {
    this.peers = (peers ?? DEFAULT_PEERS).filter(p => p.name !== selfName);
  }

  /** Set a local handler so queries to self are routed locally instead of over IPC. */
  setLocalHandler(handler: (method: string, params?: unknown) => unknown | Promise<unknown>): void {
    this.localHandler = handler;
  }

  /**
   * Query a specific peer brain by name.
   * Returns null if the peer is not available.
   */
  async query(peerName: string, method: string, params?: unknown): Promise<unknown | null> {
    // Self-query → use local handler if available
    if (peerName === this.selfName && this.localHandler) {
      try { return await this.localHandler(method, params); } catch { return null; }
    }

    const peer = this.peers.find(p => p.name === peerName);
    if (!peer) return null;

    const client = new IpcClient(peer.pipeName, 3000);
    try {
      await client.connect();
      const result = await client.request(method, params);
      return result;
    } catch {
      return null;
    } finally {
      client.disconnect();
    }
  }

  /**
   * Broadcast a query to all available peer brains.
   * Returns results from all peers that responded (+ self if local handler set).
   */
  async broadcast(method: string, params?: unknown): Promise<{ name: string; result: unknown }[]> {
    const results: { name: string; result: unknown }[] = [];

    // Include self via local handler
    if (this.localHandler) {
      try {
        const result = await this.localHandler(method, params);
        results.push({ name: this.selfName, result });
      } catch { /* skip */ }
    }

    const promises = this.peers.map(async (peer) => {
      const client = new IpcClient(peer.pipeName, 3000);
      try {
        await client.connect();
        const result = await client.request(method, params);
        results.push({ name: peer.name, result });
      } catch {
        // Peer not available — skip
      } finally {
        client.disconnect();
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Check which peer brains are currently running.
   */
  async getAvailablePeers(): Promise<string[]> {
    const available: string[] = [];

    const checks = this.peers.map(async (peer) => {
      const client = new IpcClient(peer.pipeName, 1000);
      try {
        await client.connect();
        available.push(peer.name);
      } catch {
        // Not available
      } finally {
        client.disconnect();
      }
    });

    await Promise.all(checks);
    return available;
  }

  getPeerNames(): string[] {
    return this.peers.map(p => p.name);
  }

  /** Dynamically add a peer (no duplicates). */
  addPeer(peer: BrainPeer): void {
    if (peer.name === this.selfName) return;
    if (this.peers.some(p => p.name === peer.name)) return;
    this.peers.push(peer);
  }

  /** Dynamically remove a peer by name. */
  removePeer(name: string): void {
    const idx = this.peers.findIndex(p => p.name === name);
    if (idx !== -1) this.peers.splice(idx, 1);
  }
}
