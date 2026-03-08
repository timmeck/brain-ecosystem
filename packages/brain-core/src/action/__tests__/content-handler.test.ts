import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { createContentHandler } from '../handlers/content-handler.js';
import { ActionBridgeEngine } from '../action-bridge.js';

describe('ContentHandler', () => {
  describe('createContentHandler', () => {
    it('creates a handler function', () => {
      const handler = createContentHandler({
        publishNow: vi.fn(),
        getPiece: vi.fn(),
      });
      expect(typeof handler).toBe('function');
    });

    it('publishes content successfully', async () => {
      const handler = createContentHandler({
        publishNow: vi.fn().mockResolvedValue({ success: true, postId: 'abc123' }),
        getPiece: vi.fn().mockReturnValue({ id: 1, title: 'Test', platform: 'bluesky', status: 'scheduled' }),
      });

      const result = await handler({ pieceId: 1 });
      expect(result.published).toBe(true);
      expect(result.postId).toBe('abc123');
      expect(result.platform).toBe('bluesky');
    });

    it('throws when piece not found', async () => {
      const handler = createContentHandler({
        publishNow: vi.fn(),
        getPiece: vi.fn().mockReturnValue(null),
      });

      await expect(handler({ pieceId: 999 })).rejects.toThrow('not found');
    });

    it('skips already published pieces', async () => {
      const publishNow = vi.fn();
      const handler = createContentHandler({
        publishNow,
        getPiece: vi.fn().mockReturnValue({ id: 1, title: 'Test', platform: 'bluesky', status: 'published' }),
      });

      const result = await handler({ pieceId: 1 });
      expect(result.published).toBe(false);
      expect(publishNow).not.toHaveBeenCalled();
    });

    it('handles publish failure', async () => {
      const handler = createContentHandler({
        publishNow: vi.fn().mockResolvedValue({ success: false }),
        getPiece: vi.fn().mockReturnValue({ id: 1, title: 'Test', platform: 'bluesky', status: 'scheduled' }),
      });

      const result = await handler({ pieceId: 1 });
      expect(result.published).toBe(false);
    });

    it('defaults pieceId to 0 when missing', async () => {
      const handler = createContentHandler({
        publishNow: vi.fn(),
        getPiece: vi.fn().mockReturnValue(null),
      });

      await expect(handler({})).rejects.toThrow('not found');
    });
  });

  describe('Integration with ActionBridgeEngine', () => {
    let db: Database.Database;

    beforeEach(() => { db = new Database(':memory:'); });
    afterEach(() => { db.close(); });

    it('registers and executes content handler through ActionBridge', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      const publishNow = vi.fn().mockResolvedValue({ success: true, postId: 'xyz' });

      engine.registerHandler('publish_content', createContentHandler({
        publishNow,
        getPiece: vi.fn().mockReturnValue({ id: 1, title: 'Test', platform: 'bluesky', status: 'scheduled' }),
      }));

      const id = engine.propose({
        source: 'creative',
        type: 'publish_content',
        title: 'Publish test',
        confidence: 0.9,
        payload: { pieceId: 1 },
      });

      const result = await engine.executeAction(id);
      expect(result.success).toBe(true);
      expect(publishNow).toHaveBeenCalledWith(1);
    });

    it('auto-executes publish_content when confidence >= 0.8', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      engine.registerHandler('publish_content', createContentHandler({
        publishNow: vi.fn().mockResolvedValue({ success: true, postId: 'auto' }),
        getPiece: vi.fn().mockReturnValue({ id: 1, title: 'Test', platform: 'bluesky', status: 'draft' }),
      }));

      engine.propose({
        source: 'creative',
        type: 'publish_content',
        title: 'Auto publish',
        confidence: 0.85,
        payload: { pieceId: 1 },
      });

      const executed = await engine.processQueue();
      expect(executed).toBe(1);
    });
  });
});
