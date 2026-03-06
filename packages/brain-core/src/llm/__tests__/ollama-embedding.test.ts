import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaEmbeddingProvider } from '../ollama-embedding.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('OllamaEmbeddingProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isAvailable', () => {
    it('returns true when Ollama responds', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      const provider = new OllamaEmbeddingProvider();
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when Ollama is down', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const provider = new OllamaEmbeddingProvider();
      expect(await provider.isAvailable()).toBe(false);
    });

    it('caches availability result', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      const provider = new OllamaEmbeddingProvider();
      await provider.isAvailable();
      await provider.isAvailable();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('resetAvailability clears cache', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const provider = new OllamaEmbeddingProvider();
      await provider.isAvailable();
      provider.resetAvailability();
      await provider.isAvailable();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('embed', () => {
    it('returns Float32Array embedding', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3, 0.4, 0.5]] }),
      });

      const provider = new OllamaEmbeddingProvider({ host: 'http://test:11434' });
      const result = await provider.embed('test text');

      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(5);
      expect(result[0]).toBeCloseTo(0.1);

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe('qwen3-embedding:8b');
      expect(body.input).toBe('test text');
    });

    it('uses custom model', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embeddings: [[0.1]] }),
      });

      const provider = new OllamaEmbeddingProvider({ model: 'mxbai-embed-large' });
      await provider.embed('test');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe('mxbai-embed-large');
    });

    it('throws on error response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'model not found',
      });

      const provider = new OllamaEmbeddingProvider();
      await expect(provider.embed('test')).rejects.toThrow('Ollama embed error (404)');
    });

    it('returns empty Float32Array when no embeddings', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const provider = new OllamaEmbeddingProvider();
      const result = await provider.embed('test');
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(0);
    });
  });

  describe('embedBatch', () => {
    it('processes multiple texts', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ embeddings: [[0.1, 0.2]] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ embeddings: [[0.3, 0.4]] }) });

      const provider = new OllamaEmbeddingProvider();
      const results = await provider.embedBatch(['text1', 'text2']);

      expect(results).toHaveLength(2);
      expect(results[0]).toBeInstanceOf(Float32Array);
      expect(results[1]).toBeInstanceOf(Float32Array);
    });

    it('returns null for failed items', async () => {
      fetchMock
        .mockResolvedValueOnce({ ok: true, json: async () => ({ embeddings: [[0.1]] }) })
        .mockRejectedValueOnce(new Error('failed'));

      const provider = new OllamaEmbeddingProvider();
      const results = await provider.embedBatch(['ok', 'fail']);

      expect(results[0]).toBeInstanceOf(Float32Array);
      expect(results[1]).toBeNull();
    });
  });

  describe('config', () => {
    it('getModel returns configured model', () => {
      const provider = new OllamaEmbeddingProvider({ model: 'custom-model' });
      expect(provider.getModel()).toBe('custom-model');
    });

    it('getHost returns configured host', () => {
      const provider = new OllamaEmbeddingProvider({ host: 'http://custom:1234' });
      expect(provider.getHost()).toBe('http://custom:1234');
    });

    it('strips trailing slash from host', () => {
      const provider = new OllamaEmbeddingProvider({ host: 'http://localhost:11434/' });
      expect(provider.getHost()).toBe('http://localhost:11434');
    });
  });
});
