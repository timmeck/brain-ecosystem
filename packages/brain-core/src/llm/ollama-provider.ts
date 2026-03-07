/**
 * Ollama Provider — Lokale KI (GPU-beschleunigt)
 *
 * ═══════════════════════════════════════════════════════════════
 *  EINRICHTEN (optional)
 * ═══════════════════════════════════════════════════════════════
 *
 *  1. Ollama installieren: https://ollama.com → Download
 *  2. Modelle laden:
 *     ollama pull qwen3:14b              # Chat (16 GB VRAM, 62 tok/s)
 *     ollama pull qwen3-embedding:8b     # Embeddings (#1 MTEB Multilingual)
 *  3. Optional in .env:
 *     OLLAMA_HOST=http://localhost:11434  # Default
 *     OLLAMA_MODEL=qwen3:14b             # Default
 *     OLLAMA_EMBED_MODEL=qwen3-embedding:8b
 *
 *  Alternativ-Modelle:
 *  - deepseek-r1:8b       → Reasoning-Spezialist (~6 GB)
 *  - mxbai-embed-large    → Schnelle Embedding-Alternative (335M)
 *  - llama3.3:latest      → Meta's bestes Open-Source Modell
 *
 *  Brain erkennt Ollama automatisch. Kein Ollama? Kein Problem.
 *  → Anthropic wird als Fallback genutzt.
 * ═══════════════════════════════════════════════════════════════
 */

import { getLogger } from '../utils/logger.js';
import type { LLMProvider, LLMMessage, LLMCallOptions, LLMProviderResponse } from './provider.js';

export interface OllamaProviderConfig {
  /** Ollama server URL. Default: http://localhost:11434 */
  host?: string;
  /** Chat model. Default: qwen3:14b */
  model?: string;
  /** Embedding model. Default: qwen3-embedding:8b */
  embedModel?: string;
  /** Connection timeout in ms. Default: 5000 */
  timeoutMs?: number;
}

export class OllamaProvider implements LLMProvider {
  readonly name = 'ollama';
  readonly costTier = 'free' as const;
  readonly capabilities = {
    chat: true,
    generate: true,
    embed: true,
    reasoning: false,
  };

  private readonly host: string;
  private readonly model: string;
  private readonly embedModel: string;
  private readonly timeoutMs: number;
  private readonly log = getLogger();

  /** Cached availability check (refresh every 30s) */
  private availableCache: { value: boolean; expiresAt: number } | null = null;

  constructor(config: OllamaProviderConfig = {}) {
    this.host = (config.host ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = config.model ?? process.env.OLLAMA_MODEL ?? 'qwen3:14b';
    this.embedModel = config.embedModel ?? process.env.OLLAMA_EMBED_MODEL ?? 'qwen3-embedding:8b';
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  async isAvailable(): Promise<boolean> {
    // Use cached result if fresh
    if (this.availableCache && Date.now() < this.availableCache.expiresAt) {
      return this.availableCache.value;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(`${this.host}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const available = response.ok;
      this.availableCache = { value: available, expiresAt: Date.now() + 30_000 };
      return available;
    } catch {
      this.availableCache = { value: false, expiresAt: Date.now() + 30_000 };
      return false;
    }
  }

  async chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMProviderResponse> {
    const start = Date.now();

    // Convert system messages to Ollama format
    const ollamaMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: ollamaMessages,
        stream: false,
        options: {
          ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options?.maxTokens !== undefined ? { num_predict: options.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama chat error (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json() as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
    };

    const durationMs = Date.now() - start;
    const text = data.message?.content ?? '';

    // Strip thinking tags if present (Qwen3 sometimes wraps reasoning in <think>...</think>)
    const cleanText = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();

    return {
      text: cleanText,
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
      model: this.model,
      durationMs,
    };
  }

  async generate(prompt: string, options?: LLMCallOptions): Promise<string> {
    const response = await fetch(`${this.host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
          ...(options?.maxTokens !== undefined ? { num_predict: options.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama generate error (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json() as { response?: string };
    const text = data.response ?? '';

    // Strip thinking tags
    return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.host}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.embedModel,
        input: text,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama embed error (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json() as { embeddings?: number[][] };
    return data.embeddings?.[0] ?? [];
  }

  // ── Status Methods (for MCP tools / CLI) ────────────────

  /** Get Ollama server info: running models, version */
  async getStatus(): Promise<OllamaStatus> {
    try {
      const [tagsRes, psRes] = await Promise.all([
        fetch(`${this.host}/api/tags`),
        fetch(`${this.host}/api/ps`),
      ]);

      const tags = tagsRes.ok ? await tagsRes.json() as { models?: OllamaModelInfo[] } : { models: [] };
      const ps = psRes.ok ? await psRes.json() as { models?: OllamaRunningModel[] } : { models: [] };

      return {
        available: true,
        host: this.host,
        chatModel: this.model,
        embedModel: this.embedModel,
        installedModels: tags.models ?? [],
        runningModels: ps.models ?? [],
      };
    } catch {
      return {
        available: false,
        host: this.host,
        chatModel: this.model,
        embedModel: this.embedModel,
        installedModels: [],
        runningModels: [],
      };
    }
  }
}

// ── Status Types ──────────────────────────────────────────

export interface OllamaStatus {
  available: boolean;
  host: string;
  chatModel: string;
  embedModel: string;
  installedModels: OllamaModelInfo[];
  runningModels: OllamaRunningModel[];
}

export interface OllamaModelInfo {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

export interface OllamaRunningModel {
  name: string;
  size: number;
  size_vram: number;
  expires_at: string;
}
