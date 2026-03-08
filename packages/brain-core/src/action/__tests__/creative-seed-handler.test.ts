import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { createCreativeSeedHandler } from '../handlers/creative-seed-handler.js';
import { ActionBridgeEngine } from '../action-bridge.js';

describe('CreativeSeedHandler', () => {
  describe('createCreativeSeedHandler', () => {
    it('creates a handler function', () => {
      const handler = createCreativeSeedHandler({
        pollinate: vi.fn().mockReturnValue({ ideas: [] }),
      });
      expect(typeof handler).toBe('function');
    });

    it('calls pollinate with topic and domains', async () => {
      const pollinate = vi.fn().mockReturnValue({ ideas: [{ title: 'Idea 1', score: 0.8 }] });
      const handler = createCreativeSeedHandler({ pollinate });

      const result = await handler({
        topic: 'crypto-marketing',
        domains: ['trading', 'content'],
        source: 'feedback-router',
        confidence: 0.7,
      });

      expect(pollinate).toHaveBeenCalledWith('crypto-marketing', ['trading', 'content']);
      expect(result.seeded).toBe(true);
      expect(result.topic).toBe('crypto-marketing');
      expect(result.ideasGenerated).toBe(1);
    });

    it('returns seeded=false when no ideas generated', async () => {
      const handler = createCreativeSeedHandler({
        pollinate: vi.fn().mockReturnValue({ ideas: [] }),
      });

      const result = await handler({ topic: 'empty-topic' });
      expect(result.seeded).toBe(false);
      expect(result.ideasGenerated).toBe(0);
    });

    it('defaults topic to "general" when missing', async () => {
      const pollinate = vi.fn().mockReturnValue({ ideas: [] });
      const handler = createCreativeSeedHandler({ pollinate });

      const result = await handler({});
      expect(result.topic).toBe('general');
      expect(pollinate).toHaveBeenCalledWith('general', undefined);
    });

    it('handles pollinate errors gracefully', async () => {
      const handler = createCreativeSeedHandler({
        pollinate: vi.fn().mockImplementation(() => { throw new Error('LLM unavailable'); }),
      });

      const result = await handler({ topic: 'test' });
      expect(result.seeded).toBe(false);
      expect(result.ideasGenerated).toBe(0);
    });

    it('passes empty domains as undefined', async () => {
      const pollinate = vi.fn().mockReturnValue({ ideas: [{ title: 'X', score: 0.5 }] });
      const handler = createCreativeSeedHandler({ pollinate });

      await handler({ topic: 'test', domains: [] });
      expect(pollinate).toHaveBeenCalledWith('test', undefined);
    });
  });

  describe('Integration with ActionBridgeEngine', () => {
    let db: Database.Database;

    beforeEach(() => { db = new Database(':memory:'); });
    afterEach(() => { db.close(); });

    it('registers and executes creative_seed through ActionBridge', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      const pollinate = vi.fn().mockReturnValue({ ideas: [{ title: 'Idea', score: 0.9 }] });

      engine.registerHandler('creative_seed', createCreativeSeedHandler({ pollinate }));

      const id = engine.propose({
        source: 'feedback-router',
        type: 'creative_seed',
        title: 'Seed creativity for crypto',
        confidence: 0.85,
        payload: { topic: 'crypto', domains: ['trading'] },
      });

      const result = await engine.executeAction(id);
      expect(result.success).toBe(true);
      expect(pollinate).toHaveBeenCalledOnce();
    });

    it('auto-executes when confidence >= 0.8', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      engine.registerHandler('creative_seed', createCreativeSeedHandler({
        pollinate: vi.fn().mockReturnValue({ ideas: [{ title: 'X', score: 0.5 }] }),
      }));

      engine.propose({
        source: 'feedback-router',
        type: 'creative_seed',
        title: 'Auto-seed',
        confidence: 0.9,
        payload: { topic: 'auto' },
      });

      const executed = await engine.processQueue();
      expect(executed).toBe(1);
    });
  });
});
