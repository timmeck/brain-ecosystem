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

  constructor(
    private selfName: string,
    peers?: BrainPeer[],
  ) {
    this.peers = (peers ?? DEFAULT_PEERS).filter(p => p.name !== selfName);
  }

  /**
   * Query a specific peer brain by name.
   * Returns null if the peer is not available.
   */
  async query(peerName: string, method: string, params?: unknown): Promise<unknown | null> {
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
   * Returns results from all peers that responded.
   */
  async broadcast(method: string, params?: unknown): Promise<{ name: string; result: unknown }[]> {
    const results: { name: string; result: unknown }[] = [];

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
}
