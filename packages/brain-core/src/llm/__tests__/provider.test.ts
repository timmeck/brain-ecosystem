import { describe, it, expect } from 'vitest';
import { TaskRouter } from '../provider.js';
import type { LLMProvider, LLMProviderResponse } from '../provider.js';
import type { PromptTemplate } from '../llm-service.js';

// ── Mock Provider Factory ────────────────────────────────

function createMockProvider(overrides: Partial<LLMProvider> = {}): LLMProvider {
  return {
    name: overrides.name ?? 'mock',
    costTier: overrides.costTier ?? 'free',
    capabilities: overrides.capabilities ?? { chat: true, generate: true, embed: true, reasoning: false },
    isAvailable: overrides.isAvailable ?? (async () => true),
    chat: overrides.chat ?? (async (): Promise<LLMProviderResponse> => ({
      text: 'mock response',
      inputTokens: 10,
      outputTokens: 10,
      model: 'mock-model',
      durationMs: 50,
    })),
    generate: overrides.generate ?? (async () => 'mock generated'),
    embed: overrides.embed ?? (async () => [0.1, 0.2, 0.3]),
  };
}

// ── TaskRouter Tests ─────────────────────────────────────

describe('TaskRouter', () => {
  const freeProvider = createMockProvider({ name: 'local', costTier: 'free' });
  const cheapProvider = createMockProvider({ name: 'cheap', costTier: 'cheap' });
  const expensiveProvider = createMockProvider({ name: 'cloud', costTier: 'expensive' });
  const allProviders = [freeProvider, cheapProvider, expensiveProvider];

  describe('route', () => {
    it('returns empty array for no providers', () => {
      const router = new TaskRouter(true);
      expect(router.route('explain', [])).toEqual([]);
    });

    it('routes simple tasks to free providers first when preferLocal', () => {
      const router = new TaskRouter(true);
      const result = router.route('summarize', allProviders);
      expect(result[0].name).toBe('local');
      expect(result[1].name).toBe('cheap');
      expect(result[2].name).toBe('cloud');
    });

    it('routes complex tasks to expensive providers first', () => {
      const router = new TaskRouter(true);
      const result = router.route('synthesize_debate', allProviders);
      expect(result[0].name).toBe('cloud');
      expect(result[1].name).toBe('cheap');
      expect(result[2].name).toBe('local');
    });

    it('routes "any" tasks to free providers when preferLocal', () => {
      const router = new TaskRouter(true);
      const result = router.route('research_question', allProviders);
      expect(result[0].name).toBe('local');
    });

    it('routes "any" tasks to expensive providers when not preferLocal', () => {
      const router = new TaskRouter(false);
      const result = router.route('research_question', allProviders);
      expect(result[0].name).toBe('cloud');
    });

    it('skips providers without chat capability', () => {
      const embedOnly = createMockProvider({
        name: 'embed-only',
        capabilities: { chat: false, generate: false, embed: true, reasoning: false },
      });
      const router = new TaskRouter(true);
      const result = router.route('summarize', [embedOnly, freeProvider]);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('local');
    });
  });

  describe('setPreferLocal', () => {
    it('changes routing preference dynamically', () => {
      const router = new TaskRouter(true);
      expect(router.route('research_question', allProviders)[0].name).toBe('local');

      router.setPreferLocal(false);
      expect(router.route('research_question', allProviders)[0].name).toBe('cloud');
    });
  });

  describe('getTier', () => {
    it('returns correct tier for each template', () => {
      const router = new TaskRouter();
      expect(router.getTier('summarize')).toBe('local');
      expect(router.getTier('synthesize_debate')).toBe('cloud');
      expect(router.getTier('research_question')).toBe('any');
      expect(router.getTier('explain')).toBe('cloud');
    });
  });

  describe('getRoutingTable', () => {
    it('returns all routing rules', () => {
      const router = new TaskRouter();
      const table = router.getRoutingTable();
      expect(table.length).toBeGreaterThanOrEqual(8);

      const templates = table.map(r => r.template);
      expect(templates).toContain('explain');
      expect(templates).toContain('summarize');
      expect(templates).toContain('synthesize_debate');
    });
  });
});

// ── LLMProvider Interface Tests ──────────────────────────

describe('LLMProvider interface', () => {
  it('mock provider satisfies interface', async () => {
    const provider = createMockProvider();
    expect(provider.name).toBe('mock');
    expect(provider.costTier).toBe('free');
    expect(provider.capabilities.chat).toBe(true);
    expect(await provider.isAvailable()).toBe(true);
  });

  it('chat returns proper response', async () => {
    const provider = createMockProvider();
    const response = await provider.chat([{ role: 'user', content: 'hello' }]);
    expect(response.text).toBe('mock response');
    expect(response.inputTokens).toBe(10);
    expect(response.outputTokens).toBe(10);
    expect(response.model).toBe('mock-model');
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('generate returns string', async () => {
    const provider = createMockProvider();
    const result = await provider.generate('hello');
    expect(typeof result).toBe('string');
  });

  it('embed returns number array', async () => {
    const provider = createMockProvider();
    const result = await provider.embed('hello');
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});
