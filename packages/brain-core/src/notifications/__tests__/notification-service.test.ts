import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { NotificationService } from '../notification-service.js';
import type { NotificationProvider, Notification, NotificationResult } from '../notification-provider.js';

function createMockProvider(overrides: Partial<NotificationProvider> = {}): NotificationProvider {
  return {
    name: overrides.name ?? 'mock',
    isAvailable: overrides.isAvailable ?? (async () => true),
    send: overrides.send ?? (async (n: Notification) => ({
      provider: overrides.name ?? 'mock',
      success: true,
    })),
    shutdown: overrides.shutdown,
  };
}

function createTestNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    event: overrides.event ?? 'test.event',
    title: overrides.title ?? 'Test Notification',
    message: overrides.message ?? 'This is a test',
    priority: overrides.priority ?? 'medium',
    ...overrides,
  };
}

describe('NotificationService', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('registerProvider', () => {
    it('registers a provider', () => {
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider());
      expect(svc.getProviders()).toHaveLength(1);
    });

    it('prevents duplicates', () => {
      const svc = new NotificationService(db);
      const mock = createMockProvider();
      svc.registerProvider(mock);
      svc.registerProvider(mock);
      expect(svc.getProviders()).toHaveLength(1);
    });

    it('removeProvider works', () => {
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider());
      svc.removeProvider('mock');
      expect(svc.getProviders()).toHaveLength(0);
    });
  });

  describe('notify', () => {
    it('sends to all providers', async () => {
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider({ name: 'discord' }));
      svc.registerProvider(createMockProvider({ name: 'telegram' }));

      const results = await svc.notify(createTestNotification());
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('skips unavailable providers', async () => {
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider({ name: 'available' }));
      svc.registerProvider(createMockProvider({
        name: 'down',
        isAvailable: async () => false,
      }));

      const results = await svc.notify(createTestNotification());
      expect(results).toHaveLength(2);
      expect(results.find(r => r.provider === 'available')?.success).toBe(true);
      expect(results.find(r => r.provider === 'down')?.success).toBe(false);
    });

    it('handles provider errors gracefully', async () => {
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider({
        name: 'broken',
        send: async () => { throw new Error('Send failed'); },
      }));

      const results = await svc.notify(createTestNotification());
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Send failed');
    });

    it('logs notifications to SQLite', async () => {
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider());

      await svc.notify(createTestNotification({ title: 'Logged' }));

      const history = svc.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].title).toBe('Logged');
      expect(history[0].success).toBe(true);
    });
  });

  describe('event routing', () => {
    it('routes events to specific providers', async () => {
      const svc = new NotificationService(db);
      const discordSend = vi.fn(async () => ({ provider: 'discord', success: true }));
      const telegramSend = vi.fn(async () => ({ provider: 'telegram', success: true }));

      svc.registerProvider(createMockProvider({ name: 'discord', send: discordSend }));
      svc.registerProvider(createMockProvider({ name: 'telegram', send: telegramSend }));

      svc.setEventRouting('trade.signal', ['discord']);

      await svc.notify(createTestNotification({ event: 'trade.signal' }));
      expect(discordSend).toHaveBeenCalled();
      expect(telegramSend).not.toHaveBeenCalled();
    });

    it('sends to all when no routing configured', async () => {
      const svc = new NotificationService(db);
      const discordSend = vi.fn(async () => ({ provider: 'discord', success: true }));
      const telegramSend = vi.fn(async () => ({ provider: 'telegram', success: true }));

      svc.registerProvider(createMockProvider({ name: 'discord', send: discordSend }));
      svc.registerProvider(createMockProvider({ name: 'telegram', send: telegramSend }));

      await svc.notify(createTestNotification({ event: 'unrouted.event' }));
      expect(discordSend).toHaveBeenCalled();
      expect(telegramSend).toHaveBeenCalled();
    });

    it('getEventRouting returns current routing', () => {
      const svc = new NotificationService(db);
      svc.setEventRouting('system.error', ['discord', 'email']);
      svc.setEventRouting('techradar.digest', ['telegram']);

      const routing = svc.getEventRouting();
      expect(routing['system.error']).toEqual(['discord', 'email']);
      expect(routing['techradar.digest']).toEqual(['telegram']);
    });
  });

  describe('getHistory', () => {
    it('filters by event', async () => {
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider());

      await svc.notify(createTestNotification({ event: 'trade.signal', title: 'Trade' }));
      await svc.notify(createTestNotification({ event: 'system.error', title: 'Error' }));

      const tradeHistory = svc.getHistory({ event: 'trade.signal' });
      expect(tradeHistory).toHaveLength(1);
      expect(tradeHistory[0].title).toBe('Trade');

      const allHistory = svc.getHistory();
      expect(allHistory).toHaveLength(2);
    });

    it('limits results', async () => {
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider());

      for (let i = 0; i < 5; i++) {
        await svc.notify(createTestNotification({ title: `Notification ${i}` }));
      }

      const limited = svc.getHistory({ limit: 3 });
      expect(limited).toHaveLength(3);
    });
  });

  describe('getProviderStatus', () => {
    it('returns status of all providers', async () => {
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider({ name: 'discord' }));
      svc.registerProvider(createMockProvider({
        name: 'telegram',
        isAvailable: async () => false,
      }));

      const status = await svc.getProviderStatus();
      expect(status).toHaveLength(2);
      expect(status.find(s => s.name === 'discord')?.available).toBe(true);
      expect(status.find(s => s.name === 'telegram')?.available).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('calls shutdown on all providers', async () => {
      const shutdownFn = vi.fn();
      const svc = new NotificationService(db);
      svc.registerProvider(createMockProvider({ shutdown: shutdownFn }));

      await svc.shutdown();
      expect(shutdownFn).toHaveBeenCalled();
    });
  });
});
