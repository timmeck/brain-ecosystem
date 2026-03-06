/**
 * LLM Provider Interface — Multi-Provider Architecture
 *
 * Das Brain Ecosystem unterstützt mehrere LLM Provider gleichzeitig.
 * Der TaskRouter entscheidet automatisch, welcher Provider für welche Aufgabe genutzt wird.
 *
 * ═══════════════════════════════════════════════════════════════
 *  OPTIONALE PROVIDER EINRICHTEN
 * ═══════════════════════════════════════════════════════════════
 *
 *  1. Ollama (Lokale KI, kostenlos, GPU-beschleunigt)
 *     ─────────────────────────────────────────────────
 *     Installieren:  https://ollama.com → Download → installieren
 *     Modelle laden: ollama pull qwen3:14b
 *                    ollama pull qwen3-embedding:8b
 *     Konfigurieren: brain config set llm.preferLocal true
 *                    brain config set llm.ollamaModel qwen3:14b
 *     Oder in .env:  OLLAMA_HOST=http://localhost:11434
 *                    OLLAMA_MODEL=qwen3:14b
 *     → Brain erkennt Ollama automatisch beim Start.
 *       Einfache Tasks (classify, summarize) laufen lokal.
 *       Komplexe Tasks (debate, hypothesis) gehen weiter an Claude.
 *
 *  2. Anthropic / Claude (Cloud, Standard)
 *     ─────────────────────────────────────
 *     In .env:       ANTHROPIC_API_KEY=sk-ant-...
 *     → Wird automatisch als Provider registriert.
 *
 *  3. Eigenen Provider bauen
 *     ─────────────────────────────────────
 *     Implementiere das LLMProvider Interface (siehe unten).
 *     Registriere mit: llmService.registerProvider(new MyProvider())
 *
 * ═══════════════════════════════════════════════════════════════
 */

import type { PromptTemplate } from './llm-service.js';

// ── Messages ─────────────────────────────────────────────

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMCallOptions {
  maxTokens?: number;
  temperature?: number;
  /** Override auto-routing and force a specific provider */
  provider?: string;
}

// ── Provider Response ────────────────────────────────────

export interface LLMProviderResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  durationMs: number;
}

// ── Provider Interface ───────────────────────────────────

/**
 * Implement this interface to add a new LLM provider.
 *
 * Example:
 * ```typescript
 * class MyProvider implements LLMProvider {
 *   readonly name = 'my-provider';
 *   readonly costTier = 'cheap';
 *   readonly capabilities = { chat: true, generate: true, embed: false, reasoning: false };
 *
 *   async isAvailable() { return true; }
 *   async chat(messages, options) { ... }
 *   async generate(prompt, options) { ... }
 * }
 *
 * llmService.registerProvider(new MyProvider());
 * ```
 */
export interface LLMProvider {
  /** Unique provider name (e.g. 'ollama', 'anthropic') */
  readonly name: string;

  /** Cost classification for routing decisions */
  readonly costTier: 'free' | 'cheap' | 'expensive';

  /** What this provider can do */
  readonly capabilities: {
    chat: boolean;
    generate: boolean;
    embed: boolean;
    reasoning: boolean;
  };

  /** Check if the provider is reachable and ready. */
  isAvailable(): Promise<boolean>;

  /** Chat completion with message history. */
  chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMProviderResponse>;

  /** Simple text generation from a prompt. */
  generate(prompt: string, options?: LLMCallOptions): Promise<string>;

  /** Generate embedding vector for text. Returns empty array if not supported. */
  embed(text: string): Promise<number[]>;

  /** Optional: graceful shutdown */
  shutdown?(): Promise<void>;
}

// ── Task Router ──────────────────────────────────────────

/**
 * Routes prompt templates to the best available provider.
 *
 * Routing Strategie:
 * - Einfache Tasks → lokaler Provider (kostenlos, schnell)
 * - Komplexe Tasks → Cloud Provider (höchste Qualität)
 * - Fallback: wenn bevorzugter Provider down → nächster in der Kette
 */

export type RoutingTier = 'local' | 'cloud' | 'any';

/** Which tier a template prefers */
const TEMPLATE_ROUTING: Record<PromptTemplate, RoutingTier> = {
  // Simple tasks → prefer local (free)
  summarize: 'local',

  // Medium tasks → try local first, fallback to cloud
  research_question: 'any',
  analyze_contradiction: 'any',

  // Complex tasks → cloud (highest quality)
  explain: 'cloud',
  ask: 'cloud',
  synthesize_debate: 'cloud',
  creative_hypothesis: 'cloud',
  custom: 'cloud',
};

/** Sortierpriorität: free first, then cheap, then expensive */
function costPriority(tier: 'free' | 'cheap' | 'expensive'): number {
  switch (tier) {
    case 'free': return 0;
    case 'cheap': return 1;
    case 'expensive': return 2;
  }
}

export class TaskRouter {
  private preferLocal: boolean;

  constructor(preferLocal = true) {
    this.preferLocal = preferLocal;
  }

  setPreferLocal(prefer: boolean): void {
    this.preferLocal = prefer;
  }

  /**
   * Select the best provider for a template.
   * Returns providers in priority order (first = best choice).
   */
  route(template: PromptTemplate, providers: LLMProvider[]): LLMProvider[] {
    if (providers.length === 0) return [];

    const chatCapable = providers.filter(p => p.capabilities.chat);
    if (chatCapable.length === 0) return [];

    const tier = TEMPLATE_ROUTING[template] ?? 'cloud';

    // Sort by preference
    return [...chatCapable].sort((a, b) => {
      if (tier === 'local' && this.preferLocal) {
        // Prefer free/cheap providers
        return costPriority(a.costTier) - costPriority(b.costTier);
      }
      if (tier === 'cloud') {
        // Prefer expensive (higher quality) providers
        return costPriority(b.costTier) - costPriority(a.costTier);
      }
      // 'any' → prefer local if preferLocal, otherwise cloud
      if (this.preferLocal) {
        return costPriority(a.costTier) - costPriority(b.costTier);
      }
      return costPriority(b.costTier) - costPriority(a.costTier);
    });
  }

  /** Get the routing tier for a template */
  getTier(template: PromptTemplate): RoutingTier {
    return TEMPLATE_ROUTING[template] ?? 'cloud';
  }

  /** Get all routing rules (for MCP tool / debugging) */
  getRoutingTable(): Array<{ template: PromptTemplate; tier: RoutingTier }> {
    return (Object.entries(TEMPLATE_ROUTING) as Array<[PromptTemplate, RoutingTier]>)
      .map(([template, tier]) => ({ template, tier }));
  }
}
