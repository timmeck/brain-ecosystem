import { describe, it, expect } from 'vitest';
import { CrossBrainClient } from '../client.js';

describe('CrossBrainClient', () => {
  it('filters self from peers', () => {
    const client = new CrossBrainClient('brain');
    const names = client.getPeerNames();
    expect(names).not.toContain('brain');
    expect(names).toContain('trading-brain');
    expect(names).toContain('marketing-brain');
  });

  it('returns empty for unavailable peers', async () => {
    const client = new CrossBrainClient('brain');
    const result = await client.query('nonexistent', 'status');
    expect(result).toBeNull();
  });

  it('broadcast returns empty when no peers available', async () => {
    const client = new CrossBrainClient('test', [
      { name: 'fake', pipeName: '\\\\.\\pipe\\nonexistent-test-pipe' },
    ]);
    const results = await client.broadcast('status');
    expect(results).toEqual([]);
  });

  it('getAvailablePeers returns empty when none running', async () => {
    const client = new CrossBrainClient('test', [
      { name: 'fake', pipeName: '\\\\.\\pipe\\nonexistent-test-pipe' },
    ]);
    const available = await client.getAvailablePeers();
    expect(available).toEqual([]);
  });
});
