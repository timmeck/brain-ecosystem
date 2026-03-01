import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { WebhookService } from '../../../src/webhooks/service.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('WebhookService', () => {
  let db: Database.Database;
  let service: WebhookService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    service = new WebhookService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('add', () => {
    it('registers a webhook', () => {
      const wh = service.add({
        url: 'https://example.com/hook',
        events: ['error:reported'],
        name: 'Test Hook',
      });

      expect(wh.id).toBe(1);
      expect(wh.url).toBe('https://example.com/hook');
      expect(JSON.parse(wh.events)).toEqual(['error:reported']);
      expect(wh.name).toBe('Test Hook');
      expect(wh.active).toBe(1);
    });

    it('supports HMAC secret', () => {
      const wh = service.add({
        url: 'https://example.com/hook',
        events: ['*'],
        secret: 'my-secret-key',
      });

      expect(wh.secret).toBe('my-secret-key');
    });

    it('defaults to active', () => {
      const wh = service.add({
        url: 'https://example.com/hook',
        events: ['test'],
      });
      expect(wh.active).toBe(1);
    });

    it('can be created inactive', () => {
      const wh = service.add({
        url: 'https://example.com/hook',
        events: ['test'],
        active: false,
      });
      expect(wh.active).toBe(0);
    });
  });

  describe('remove', () => {
    it('deletes a webhook', () => {
      const wh = service.add({ url: 'https://example.com/hook', events: ['test'] });
      expect(service.remove(wh.id)).toBe(true);
      expect(service.get(wh.id)).toBeFalsy();
    });

    it('returns false for non-existent id', () => {
      expect(service.remove(999)).toBe(false);
    });
  });

  describe('list', () => {
    it('returns all webhooks', () => {
      service.add({ url: 'https://a.com', events: ['e1'] });
      service.add({ url: 'https://b.com', events: ['e2'] });

      const list = service.list();
      expect(list).toHaveLength(2);
    });

    it('returns empty array when none exist', () => {
      expect(service.list()).toEqual([]);
    });
  });

  describe('toggle', () => {
    it('deactivates a webhook', () => {
      const wh = service.add({ url: 'https://a.com', events: ['test'] });
      service.toggle(wh.id, false);

      const updated = service.get(wh.id);
      expect(updated?.active).toBe(0);
    });

    it('reactivates a webhook', () => {
      const wh = service.add({ url: 'https://a.com', events: ['test'], active: false });
      service.toggle(wh.id, true);

      const updated = service.get(wh.id);
      expect(updated?.active).toBe(1);
    });
  });

  describe('fire', () => {
    it('skips inactive webhooks', async () => {
      service.add({ url: 'https://a.com', events: ['test'], active: false });
      const results = await service.fire('test', { message: 'hello' });
      expect(results).toEqual([]);
    });

    it('skips webhooks not matching the event', async () => {
      service.add({ url: 'https://a.com', events: ['other:event'] });
      const results = await service.fire('test', { message: 'hello' });
      expect(results).toEqual([]);
    });

    it('matches wildcard * event', async () => {
      // Mock fetch to succeed
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      });
      vi.stubGlobal('fetch', fetchMock);

      service.add({ url: 'https://a.com', events: ['*'] });
      const results = await service.fire('anything', { data: 1 });

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('sends correct payload with HMAC signature', async () => {
      let capturedHeaders: Record<string, string> = {};
      const fetchMock = vi.fn().mockImplementation((_url: string, opts: { headers: Record<string, string> }) => {
        capturedHeaders = opts.headers;
        return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('OK') });
      });
      vi.stubGlobal('fetch', fetchMock);

      service.add({ url: 'https://a.com', events: ['test'], secret: 'secret123' });
      await service.fire('test', { data: 1 });

      expect(capturedHeaders['X-Webhook-Event']).toBe('test');
      expect(capturedHeaders['X-Webhook-Signature']).toMatch(/^sha256=/);
      expect(capturedHeaders['Content-Type']).toBe('application/json');

      vi.unstubAllGlobals();
    });

    it('records delivery in history', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true, status: 200, text: () => Promise.resolve('OK'),
      });
      vi.stubGlobal('fetch', fetchMock);

      const wh = service.add({ url: 'https://a.com', events: ['test'] });
      await service.fire('test', { data: 1 });

      const hist = service.history(wh.id);
      expect(hist).toHaveLength(1);
      expect(hist[0]!.status).toBe(200);
      expect(hist[0]!.event).toBe('test');

      vi.unstubAllGlobals();
    });
  });

  describe('history', () => {
    it('returns all deliveries when no webhookId specified', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true, status: 200, text: () => Promise.resolve('OK'),
      });
      vi.stubGlobal('fetch', fetchMock);

      service.add({ url: 'https://a.com', events: ['*'] });
      service.add({ url: 'https://b.com', events: ['*'] });
      await service.fire('test', {});

      const hist = service.history();
      expect(hist).toHaveLength(2);

      vi.unstubAllGlobals();
    });
  });

  describe('cleanup', () => {
    it('removes old delivery records', () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true, status: 200, text: () => Promise.resolve('OK'),
      });
      vi.stubGlobal('fetch', fetchMock);

      // Insert a delivery with old date manually
      const wh = service.add({ url: 'https://a.com', events: ['test'] });
      db.prepare(`
        INSERT INTO webhook_deliveries (webhook_id, event, payload, status, attempts, created_at)
        VALUES (?, 'test', '{}', 200, 1, datetime('now', '-60 days'))
      `).run(wh.id);

      const deleted = service.cleanup(30);
      expect(deleted).toBe(1);

      vi.unstubAllGlobals();
    });
  });
});
