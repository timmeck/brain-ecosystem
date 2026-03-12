import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { createMissionHandler } from '../handlers/mission-handler.js';
import { ActionBridgeEngine } from '../action-bridge.js';

describe('MissionHandler', () => {
  describe('createMissionHandler', () => {
    it('creates a handler function', () => {
      const handler = createMissionHandler({
        createMission: vi.fn().mockReturnValue({ id: 1, topic: 'test', status: 'running' }),
      });
      expect(typeof handler).toBe('function');
    });

    it('prefers description over desireKey when description is long enough', async () => {
      const createMission = vi.fn().mockReturnValue({ id: 1, topic: 'Some contradiction', status: 'running' });
      const handler = createMissionHandler({ createMission });

      const result = await handler({
        desireKey: 'contradiction_hypothesis_vs_a',
        description: 'Some contradiction',
      });

      expect(createMission).toHaveBeenCalledWith('Some contradiction', 'quick');
      expect(result.started).toBe(true);
      expect(result.topic).toBe('Some contradiction');
      expect(result.missionId).toBe(1);
    });

    it('extracts topic from description "X" vs "Y" pattern', async () => {
      const createMission = vi.fn().mockReturnValue({ id: 2, topic: 'X vs Y', status: 'running' });
      const handler = createMissionHandler({ createMission });

      const result = await handler({
        desireKey: 'ab',
        description: 'Contradiction between "caching" vs "no-cache"',
      });

      expect(result.topic).toBe('Contradiction: "caching" vs "no-cache"');
      expect(result.started).toBe(true);
    });

    it('falls back to desireKey when description is short', async () => {
      const createMission = vi.fn().mockReturnValue({ id: 5, topic: 'hypothesis vs actual', status: 'running' });
      const handler = createMissionHandler({ createMission });

      const result = await handler({
        desireKey: 'contradiction_hypothesis_vs_actual',
        description: 'short',
      });

      expect(result.topic).toBe('hypothesis vs actual');
      expect(result.started).toBe(true);
    });

    it('falls back to description substring when no pattern match', async () => {
      const createMission = vi.fn().mockReturnValue({ id: 3, topic: 'topic', status: 'running' });
      const handler = createMissionHandler({ createMission });

      const result = await handler({
        desireKey: 'x',
        description: 'Investigate this contradiction thoroughly',
      });

      expect(result.topic).toBe('Investigate this contradiction thoroughly');
    });

    it('handles createMission errors gracefully', async () => {
      const handler = createMissionHandler({
        createMission: vi.fn().mockImplementation(() => { throw new Error('DB locked'); }),
      });

      const result = await handler({ desireKey: 'contradiction_test', description: 'test' });
      expect(result.started).toBe(false);
      expect(result.missionId).toBeNull();
    });

    it('defaults to "general research" when no topic info available', async () => {
      const createMission = vi.fn().mockReturnValue({ id: 4, topic: 'general research', status: 'running' });
      const handler = createMissionHandler({ createMission });

      const result = await handler({});
      expect(result.topic).toBe('general research');
    });
  });

  describe('Integration with ActionBridgeEngine', () => {
    let db: Database.Database;

    beforeEach(() => { db = new Database(':memory:'); });
    afterEach(() => { db.close(); });

    it('registers and executes start_mission through ActionBridge', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      const createMission = vi.fn().mockReturnValue({ id: 10, topic: 'test topic', status: 'running' });

      engine.registerHandler('start_mission', createMissionHandler({ createMission }));

      const id = engine.propose({
        source: 'desire',
        type: 'start_mission',
        title: 'Research contradiction',
        confidence: 0.85,
        payload: { desireKey: 'contradiction_test_vs_prod', description: 'test vs prod' },
      });

      const result = await engine.executeAction(id);
      expect(result.success).toBe(true);
      expect(createMission).toHaveBeenCalledOnce();
    });
  });
});
