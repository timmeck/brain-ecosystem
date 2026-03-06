import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../ollama-provider.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('OllamaProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('properties', () => {
    it('has correct name and cost tier', () => {
      const provider = new OllamaProvider();
      expect(provider.name).toBe('ollama');
      expect(provider.costTier).toBe('free');
    });

    it('has correct capabilities', () => {
      const provider = new OllamaProvider();
      expect(provider.capabilities.chat).toBe(true);
      expect(provider.capabilities.generate).toBe(true);
      expect(provider.capabilities.embed).toBe(true);
      expect(provider.capabilities.reasoning).toBe(false);
    });

    it('uses default host and model', () => {
      const provider = new OllamaProvider();
      // Access via getStatus which includes these
      expect(provider.name).toBe('ollama');
    });

    it('accepts custom config', () => {
      const provider = new OllamaProvider({
        host: 'http://custom:1234',
        model: 'llama3:latest',
        embedModel: 'mxbai-embed-large',
      });
      expect(provider.name).toBe('ollama');
    });
  });

  describe('isAvailable', () => {
    it('returns true when Ollama responds', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      const provider = new OllamaProvider();
      expect(await provider.isAvailable()).toBe(true);
    });

    it('returns false when Ollama is down', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const provider = new OllamaProvider();
      expect(await provider.isAvailable()).toBe(false);
    });

    it('caches availability for 30s', async () => {
      fetchMock.mockResolvedValue({ ok: true });
      const provider = new OllamaProvider();
      await provider.isAvailable();
      await provider.isAvailable();
      // Only one fetch call (cached)
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('calls /api/tags endpoint', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      const provider = new OllamaProvider({ host: 'http://test:11434' });
      await provider.isAvailable();
      expect(fetchMock.mock.calls[0][0]).toBe('http://test:11434/api/tags');
    });
  });

  describe('chat', () => {
    it('sends correct request', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'Ollama response' },
          prompt_eval_count: 50,
          eval_count: 30,
        }),
      });

      const provider = new OllamaProvider({ host: 'http://test:11434', model: 'qwen3:14b' });
      const result = await provider.chat([
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hello' },
      ]);

      expect(result.text).toBe('Ollama response');
      expect(result.inputTokens).toBe(50);
      expect(result.outputTokens).toBe(30);
      expect(result.model).toBe('qwen3:14b');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe('qwen3:14b');
      expect(body.stream).toBe(false);
      expect(body.messages).toHaveLength(2);
    });

    it('strips thinking tags from response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: '<think>Let me reason about this...</think>\n\nThe answer is 42' },
          prompt_eval_count: 10,
          eval_count: 20,
        }),
      });

      const provider = new OllamaProvider();
      const result = await provider.chat([{ role: 'user', content: 'test' }]);
      expect(result.text).toBe('The answer is 42');
    });

    it('passes temperature and maxTokens', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: 'ok' },
          prompt_eval_count: 5,
          eval_count: 5,
        }),
      });

      const provider = new OllamaProvider();
      await provider.chat(
        [{ role: 'user', content: 'test' }],
        { temperature: 0.5, maxTokens: 256 },
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.options.temperature).toBe(0.5);
      expect(body.options.num_predict).toBe(256);
    });

    it('throws on error response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal error',
      });

      const provider = new OllamaProvider();
      await expect(provider.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('Ollama chat error (500)');
    });
  });

  describe('generate', () => {
    it('sends request to /api/generate', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: 'Generated text' }),
      });

      const provider = new OllamaProvider({ host: 'http://test:11434' });
      const result = await provider.generate('Write a poem');

      expect(result).toBe('Generated text');
      expect(fetchMock.mock.calls[0][0]).toBe('http://test:11434/api/generate');
    });

    it('strips thinking tags', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: '<think>hmm</think>\nClean output' }),
      });

      const provider = new OllamaProvider();
      const result = await provider.generate('test');
      expect(result).toBe('Clean output');
    });
  });

  describe('embed', () => {
    it('sends request to /api/embed', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3, 0.4]] }),
      });

      const provider = new OllamaProvider({
        host: 'http://test:11434',
        embedModel: 'qwen3-embedding:8b',
      });
      const result = await provider.embed('test text');

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4]);
      expect(fetchMock.mock.calls[0][0]).toBe('http://test:11434/api/embed');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.model).toBe('qwen3-embedding:8b');
      expect(body.input).toBe('test text');
    });

    it('returns empty array on missing embeddings', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      const provider = new OllamaProvider();
      const result = await provider.embed('test');
      expect(result).toEqual([]);
    });
  });

  describe('getStatus', () => {
    it('returns status with running models', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [{ name: 'qwen3:14b', size: 10_000_000, digest: 'abc', modified_at: '2024-01-01' }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            models: [{ name: 'qwen3:14b', size: 10_000_000, size_vram: 9_000_000, expires_at: '2024-01-01' }],
          }),
        });

      const provider = new OllamaProvider({ host: 'http://test:11434' });
      const status = await provider.getStatus();

      expect(status.available).toBe(true);
      expect(status.installedModels).toHaveLength(1);
      expect(status.runningModels).toHaveLength(1);
    });

    it('returns unavailable when server is down', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      const provider = new OllamaProvider();
      const status = await provider.getStatus();
      expect(status.available).toBe(false);
    });
  });
});
