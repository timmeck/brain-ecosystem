import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { CrossBrainNotifier } from '../notifications.js';
import { CrossBrainClient } from '../client.js';

describe('CrossBrainNotifier', () => {
  let client: CrossBrainClient;
  let notifier: CrossBrainNotifier;

  beforeEach(() => {
    client = new CrossBrainClient('brain');
    vi.spyOn(client, 'broadcast').mockResolvedValue([]);
    vi.spyOn(client, 'query').mockResolvedValue(null);
    notifier = new CrossBrainNotifier(client, 'brain');
  });

  it('broadcasts notifications to all peers', async () => {
    await notifier.notify('error:reported', { errorId: 1 });
    expect(client.broadcast).toHaveBeenCalledWith(
      'cross-brain.notify',
      expect.objectContaining({
        source: 'brain',
        event: 'error:reported',
        data: { errorId: 1 },
      }),
    );
  });

  it('sends targeted notification to specific peer', async () => {
    await notifier.notifyPeer('trading-brain', 'insight:created', { insightId: 5 });
    expect(client.query).toHaveBeenCalledWith(
      'trading-brain',
      'cross-brain.notify',
      expect.objectContaining({
        source: 'brain',
        event: 'insight:created',
        data: { insightId: 5 },
      }),
    );
  });

  it('includes timestamp in payload', async () => {
    await notifier.notify('test', {});
    const payload = (client.broadcast as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.timestamp).toBeDefined();
    expect(new Date(payload.timestamp).getTime()).toBeGreaterThan(0);
  });

  it('does not throw when broadcast fails', async () => {
    vi.spyOn(client, 'broadcast').mockRejectedValue(new Error('offline'));
    await expect(notifier.notify('test', {})).resolves.toBeUndefined();
  });

  it('does not throw when peer query fails', async () => {
    vi.spyOn(client, 'query').mockRejectedValue(new Error('offline'));
    await expect(notifier.notifyPeer('trading-brain', 'test', {})).resolves.toBeUndefined();
  });
});
