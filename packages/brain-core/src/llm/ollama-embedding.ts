/**
 * Ollama Embedding Provider — GPU-beschleunigte Embeddings
 *
 * ═══════════════════════════════════════════════════════════════
 *  EINRICHTEN (optional)
 * ═══════════════════════════════════════════════════════════════
 *
 *  1. Ollama muss laufen (siehe ollama-provider.ts)
 *  2. Embedding-Modell laden:
 *     ollama pull qwen3-embedding:8b     # Bestes multilingual (#1 MTEB)
 *     ODER
 *     ollama pull mxbai-embed-large      # Schnellere Alternative (335M)
 *  3. Optional in .env:
 *     OLLAMA_EMBED_MODEL=qwen3-embedding:8b
 *
 *  Ohne Ollama: Brain nutzt automatisch HuggingFace all-MiniLM-L6-v2 (CPU).
 * ═══════════════════════════════════════════════════════════════
 */

import { getLogger } from '../utils/logger.js';

export interface OllamaEmbeddingConfig {
  /** Ollama server URL. Default: http://localhost:11434 */
  host?: string;
  /** Embedding model. Default: qwen3-embedding:8b */
  model?: string;
  /** Connection timeout in ms. Default: 5000 */
  timeoutMs?: number;
}

export class OllamaEmbeddingProvider {
  private readonly host: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly log = getLogger();
  private available: boolean | null = null;

  constructor(config: OllamaEmbeddingConfig = {}) {
    this.host = (config.host ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = config.model ?? process.env.OLLAMA_EMBED_MODEL ?? 'qwen3-embedding:8b';
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  /** Check if Ollama embedding is available. */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      const response = await fetch(`${this.host}/api/tags`, { signal: controller.signal });
      clearTimeout(timeout);
      this.available = response.ok;
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  /** Reset availability cache (force re-check on next call). */
  resetAvailability(): void {
    this.available = null;
  }

  /** Generate embedding for a single text. Returns Float32Array for compatibility with BaseEmbeddingEngine. */
  async embed(text: string): Promise<Float32Array> {
    const response = await fetch(`${this.host}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama embed error (${response.status}): ${errText.substring(0, 200)}`);
    }

    const data = await response.json() as { embeddings?: number[][] };
    const vector = data.embeddings?.[0] ?? [];
    return new Float32Array(vector);
  }

  /** Generate embeddings for a batch of texts. */
  async embedBatch(texts: string[]): Promise<(Float32Array | null)[]> {
    const results: (Float32Array | null)[] = [];

    for (const text of texts) {
      try {
        results.push(await this.embed(text));
      } catch (err) {
        this.log.warn(`Ollama batch embed error: ${(err as Error).message}`);
        results.push(null);
      }
    }

    return results;
  }

  /** Get the configured model name. */
  getModel(): string {
    return this.model;
  }

  /** Get the configured host. */
  getHost(): string {
    return this.host;
  }
}
