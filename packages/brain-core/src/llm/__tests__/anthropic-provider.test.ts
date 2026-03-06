import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../anthropic-provider.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('AnthropicProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ type: 'text', text: 'Claude response' }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isAvailable', () => {
    it('returns false without API key', async () => {
      const provider = new AnthropicProvider({ apiKey: undefined });
      // Force no env var
      const original = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      const p = new AnthropicProvider({});
      expect(await p.isAvailable()).toBe(false);
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    });

    it('returns true with API key', async () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      expect(await provider.isAvailable()).toBe(true);
    });
  });

  describe('properties', () => {
    it('has correct name and cost tier', () => {
      const provider = new AnthropicProvider();
      expect(provider.name).toBe('anthropic');
      expect(provider.costTier).toBe('expensive');
    });

    it('has correct capabilities', () => {
      const provider = new AnthropicProvider();
      expect(provider.capabilities.chat).toBe(true);
      expect(provider.capabilities.generate).toBe(true);
      expect(provider.capabilities.embed).toBe(false);
      expect(provider.capabilities.reasoning).toBe(false);
    });
  });

  describe('chat', () => {
    it('sends correct request to Anthropic API', async () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key', model: 'claude-test' });
      await provider.chat([
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(opts.headers['x-api-key']).toBe('test-key');
      expect(opts.headers['anthropic-version']).toBe('2023-06-01');

      const body = JSON.parse(opts.body);
      expect(body.model).toBe('claude-test');
      expect(body.system).toBe('You are helpful');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('returns parsed response', async () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      const result = await provider.chat([{ role: 'user', content: 'test' }]);

      expect(result.text).toBe('Claude response');
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('passes maxTokens and temperature', async () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      await provider.chat(
        [{ role: 'user', content: 'test' }],
        { maxTokens: 512, temperature: 0.7 },
      );

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(512);
      expect(body.temperature).toBe(0.7);
    });

    it('throws on API error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limited',
      });

      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      await expect(provider.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('Anthropic API error (429)');
    });

    it('throws without API key', async () => {
      const provider = new AnthropicProvider({ apiKey: undefined });
      // Hack: clear the key
      (provider as any).apiKey = null;
      await expect(provider.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('No API key');
    });
  });

  describe('generate', () => {
    it('delegates to chat and returns text', async () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      const result = await provider.generate('test prompt');
      expect(result).toBe('Claude response');
    });
  });

  describe('embed', () => {
    it('returns empty array (not supported)', async () => {
      const provider = new AnthropicProvider({ apiKey: 'test-key' });
      const result = await provider.embed('test');
      expect(result).toEqual([]);
    });
  });
});
