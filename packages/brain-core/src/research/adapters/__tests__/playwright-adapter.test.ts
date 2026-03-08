import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { PlaywrightAdapter } from '../playwright-adapter.js';

describe('PlaywrightAdapter', () => {
  let adapter: PlaywrightAdapter;

  beforeEach(() => {
    adapter = new PlaywrightAdapter();
  });

  describe('getBrowser health check', () => {
    it('returns fresh instance after simulated disconnect', async () => {
      // Simulate a cached browser that reports disconnected
      const mockDisconnectedBrowser = {
        isConnected: () => false,
        close: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (adapter as any).browser = mockDisconnectedBrowser;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (adapter as any).available = true;

      // Access private getBrowser
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getBrowser = (adapter as any).getBrowser.bind(adapter);

      // After health check, browser should be null (disconnected detected)
      // The actual re-launch would fail without playwright installed,
      // but we verify the disconnect detection works
      try {
        await getBrowser();
      } catch {
        // Expected — playwright not installed in test env
      }

      // The disconnected browser should have been cleared
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((adapter as any).browser).toBeNull();
    });

    it('reuses connected browser', async () => {
      const mockConnectedBrowser = {
        isConnected: () => true,
        newContext: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (adapter as any).browser = mockConnectedBrowser;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (adapter as any).getBrowser();
      expect(result).toBe(mockConnectedBrowser);
    });
  });

  describe('shutdown', () => {
    it('closes browser and nulls reference', async () => {
      const mockBrowser = { close: vi.fn().mockResolvedValue(undefined) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (adapter as any).browser = mockBrowser;

      await adapter.shutdown();

      expect(mockBrowser.close).toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((adapter as any).browser).toBeNull();
    });
  });
});
