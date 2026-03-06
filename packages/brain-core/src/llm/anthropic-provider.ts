/**
 * Anthropic Claude Provider — Cloud LLM
 *
 * Standard-Provider für das Brain Ecosystem.
 * Nutzt die Anthropic Messages API direkt via fetch.
 *
 * Einrichten:
 *   In .env: ANTHROPIC_API_KEY=sk-ant-...
 *   Oder:    new AnthropicProvider({ apiKey: '...' })
 */

import { getLogger } from '../utils/logger.js';
import type { LLMProvider, LLMMessage, LLMCallOptions, LLMProviderResponse } from './provider.js';

export interface AnthropicProviderConfig {
  /** API key. Falls back to ANTHROPIC_API_KEY env var. */
  apiKey?: string;
  /** Model to use. Default: claude-sonnet-4-20250514 */
  model?: string;
  /** Max tokens per request. Default: 2048 */
  maxTokens?: number;
  /** API base URL. Default: https://api.anthropic.com */
  baseUrl?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  readonly costTier = 'expensive' as const;
  readonly capabilities = {
    chat: true,
    generate: true,
    embed: false,
    reasoning: false,
  };

  private readonly apiKey: string | null;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly baseUrl: string;
  private readonly log = getLogger();

  constructor(config: AnthropicProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? null;
    this.model = config.model ?? 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens ?? 2048;
    this.baseUrl = config.baseUrl ?? 'https://api.anthropic.com';
  }

  async isAvailable(): Promise<boolean> {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  async chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMProviderResponse> {
    if (!this.apiKey) {
      throw new Error('AnthropicProvider: No API key configured');
    }

    // Separate system message from conversation
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');
    const systemPrompt = systemMessages.map(m => m.content).join('\n') || undefined;

    const start = Date.now();

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options?.maxTokens ?? this.maxTokens,
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: conversationMessages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content
      ?.filter(c => c.type === 'text')
      .map(c => c.text ?? '')
      .join('\n') ?? '';

    return {
      text,
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      model: this.model,
      durationMs,
    };
  }

  async generate(prompt: string, options?: LLMCallOptions): Promise<string> {
    const result = await this.chat(
      [{ role: 'user', content: prompt }],
      options,
    );
    return result.text;
  }

  async embed(_text: string): Promise<number[]> {
    // Anthropic doesn't provide embeddings
    return [];
  }
}
