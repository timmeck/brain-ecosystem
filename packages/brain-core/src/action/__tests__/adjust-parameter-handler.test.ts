import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { createAdjustParameterHandler } from '../handlers/adjust-parameter-handler.js';
import { ActionBridgeEngine } from '../action-bridge.js';

describe('AdjustParameterHandler', () => {
  describe('createAdjustParameterHandler', () => {
    it('creates a handler function', () => {
      const handler = createAdjustParameterHandler({
        getParameter: vi.fn(),
        setParameter: vi.fn(),
      });
      expect(typeof handler).toBe('function');
    });

    it('adjusts parameter within bounds', async () => {
      const setParameter = vi.fn();
      const handler = createAdjustParameterHandler({
        getParameter: vi.fn().mockReturnValue({ value: 0.5, min: 0.1, max: 0.9 }),
        setParameter,
      });

      const result = await handler({
        engine: 'dream',
        parameter: 'prune_threshold',
        suggestedValue: 0.7,
        reason: 'improve consolidation',
      });

      expect(result.adjusted).toBe(true);
      expect(result.oldValue).toBe(0.5);
      expect(result.newValue).toBe(0.7);
      expect(setParameter).toHaveBeenCalledWith('dream', 'prune_threshold', 0.7);
    });

    it('clamps value to max bound', async () => {
      const setParameter = vi.fn();
      const handler = createAdjustParameterHandler({
        getParameter: vi.fn().mockReturnValue({ value: 0.5, min: 0.1, max: 0.9 }),
        setParameter,
      });

      const result = await handler({
        engine: 'dream',
        parameter: 'prune_threshold',
        suggestedValue: 1.5,
        reason: 'too high',
      });

      expect(result.adjusted).toBe(true);
      expect(result.newValue).toBe(0.9);
    });

    it('clamps value to min bound', async () => {
      const setParameter = vi.fn();
      const handler = createAdjustParameterHandler({
        getParameter: vi.fn().mockReturnValue({ value: 0.5, min: 0.1, max: 0.9 }),
        setParameter,
      });

      const result = await handler({
        engine: 'dream',
        parameter: 'prune_threshold',
        suggestedValue: -0.5,
        reason: 'too low',
      });

      expect(result.adjusted).toBe(true);
      expect(result.newValue).toBe(0.1);
    });

    it('returns adjusted=false when parameter not found', async () => {
      const handler = createAdjustParameterHandler({
        getParameter: vi.fn().mockReturnValue(undefined),
        setParameter: vi.fn(),
      });

      const result = await handler({
        engine: 'unknown',
        parameter: 'missing',
        suggestedValue: 0.5,
      });

      expect(result.adjusted).toBe(false);
    });

    it('returns adjusted=false when engine/parameter name missing', async () => {
      const handler = createAdjustParameterHandler({
        getParameter: vi.fn(),
        setParameter: vi.fn(),
      });

      const result = await handler({ suggestedValue: 0.5 });
      expect(result.adjusted).toBe(false);
    });

    it('handles setParameter errors gracefully', async () => {
      const handler = createAdjustParameterHandler({
        getParameter: vi.fn().mockReturnValue({ value: 0.5, min: 0.1, max: 0.9 }),
        setParameter: vi.fn().mockImplementation(() => { throw new Error('DB locked'); }),
      });

      const result = await handler({
        engine: 'dream',
        parameter: 'prune_threshold',
        suggestedValue: 0.7,
        reason: 'test',
      });

      expect(result.adjusted).toBe(false);
    });
  });

  describe('Integration with ActionBridgeEngine', () => {
    let db: Database.Database;

    beforeEach(() => { db = new Database(':memory:'); });
    afterEach(() => { db.close(); });

    it('registers and executes adjust_parameter through ActionBridge', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      const setParameter = vi.fn();

      engine.registerHandler('adjust_parameter', createAdjustParameterHandler({
        getParameter: vi.fn().mockReturnValue({ value: 0.15, min: 0.01, max: 0.5 }),
        setParameter,
      }));

      const id = engine.propose({
        source: 'feedback-router',
        type: 'adjust_parameter',
        title: 'Adjust dream prune threshold',
        confidence: 0.85,
        payload: { engine: 'dream', parameter: 'prune_threshold', suggestedValue: 0.2, reason: 'test' },
      });

      const result = await engine.executeAction(id);
      expect(result.success).toBe(true);
      expect(setParameter).toHaveBeenCalledOnce();
    });

    it('auto-executes when confidence >= 0.8', async () => {
      const engine = new ActionBridgeEngine(db, { brainName: 'test' });
      engine.registerHandler('adjust_parameter', createAdjustParameterHandler({
        getParameter: vi.fn().mockReturnValue({ value: 0.1, min: 0.01, max: 0.5 }),
        setParameter: vi.fn(),
      }));

      engine.propose({
        source: 'feedback-router',
        type: 'adjust_parameter',
        title: 'Auto-adjust',
        confidence: 0.9,
        payload: { engine: 'dream', parameter: 'prune_threshold', suggestedValue: 0.3, reason: 'auto' },
      });

      const executed = await engine.processQueue();
      expect(executed).toBe(1);
    });
  });
});
