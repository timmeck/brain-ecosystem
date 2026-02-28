import { describe, it, expect, vi } from 'vitest';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { BaseEmbeddingEngine } from '../engine.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('BaseEmbeddingEngine', () => {
  describe('constructor', () => {
    it('sets modelName default to Xenova/all-MiniLM-L6-v2', () => {
      const engine = new BaseEmbeddingEngine({ enabled: true });
      expect((engine as any).modelName).toBe('Xenova/all-MiniLM-L6-v2');
    });

    it('respects custom modelName', () => {
      const engine = new BaseEmbeddingEngine({
        enabled: true,
        modelName: 'custom/model-v1',
      });
      expect((engine as any).modelName).toBe('custom/model-v1');
    });

    it('sets enabled flag', () => {
      const enabledEngine = new BaseEmbeddingEngine({ enabled: true });
      const disabledEngine = new BaseEmbeddingEngine({ enabled: false });
      expect((enabledEngine as any).enabled).toBe(true);
      expect((disabledEngine as any).enabled).toBe(false);
    });
  });

  describe('isReady', () => {
    it('returns false before initialize', () => {
      const engine = new BaseEmbeddingEngine({ enabled: true });
      expect(engine.isReady()).toBe(false);
    });
  });

  describe('embed', () => {
    it('throws if not initialized', async () => {
      const engine = new BaseEmbeddingEngine({ enabled: true });
      await expect(engine.embed('hello world')).rejects.toThrow(
        'EmbeddingEngine not initialized',
      );
    });
  });

  describe('embedBatch', () => {
    it('returns nulls if not ready', async () => {
      const engine = new BaseEmbeddingEngine({ enabled: true });
      const results = await engine.embedBatch(['hello', 'world']);
      expect(results).toEqual([null, null]);
    });
  });

  describe('similarity', () => {
    it('returns 1.0 for identical vectors', () => {
      // Normalized vector: [0.6, 0.8] has magnitude 1.0
      const a = new Float32Array([0.6, 0.8]);
      const b = new Float32Array([0.6, 0.8]);
      expect(BaseEmbeddingEngine.similarity(a, b)).toBeCloseTo(1.0, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      // [1, 0] and [0, 1] are orthogonal — dot product = 0
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([0, 1]);
      expect(BaseEmbeddingEngine.similarity(a, b)).toBe(0);
    });

    it('returns 0 for different length vectors', () => {
      const a = new Float32Array([0.6, 0.8]);
      const b = new Float32Array([0.6, 0.8, 0.0]);
      expect(BaseEmbeddingEngine.similarity(a, b)).toBe(0);
    });
  });

  describe('serialize / deserialize', () => {
    it('round-trip preserves data', () => {
      const original = new Float32Array([0.1, 0.25, -0.5, 1.0, 0.0]);
      const buffer = BaseEmbeddingEngine.serialize(original);
      const restored = BaseEmbeddingEngine.deserialize(buffer);
      expect(restored.length).toBe(original.length);
      for (let i = 0; i < original.length; i++) {
        expect(restored[i]).toBeCloseTo(original[i]!, 6);
      }
    });
  });
});
