import type { ScoutAdapter, ScoutDiscovery } from '../data-scout.js';
import { getLogger } from '../../utils/logger.js';

const log = getLogger();

// ── Brave Search Adapter ───────────────────────────────

export class BraveSearchAdapter implements ScoutAdapter {
  readonly name = 'brave-search';
  private apiKey: string | null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.BRAVE_SEARCH_API_KEY ?? null;
  }

  isEnabled(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  async scout(): Promise<ScoutDiscovery[]> {
    return this.search('AI research trends 2026');
  }

  /** Search Brave and return ScoutDiscoveries. Can be called directly for mission queries. */
  async search(query: string, count = 10): Promise<ScoutDiscovery[]> {
    if (!this.isEnabled()) return [];

    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': this.apiKey!,
        },
      });

      if (!res.ok) {
        log.warn(`[brave-search] API error (${res.status}): ${await res.text().then(t => t.substring(0, 200))}`);
        return [];
      }

      const data = await res.json() as {
        web?: { results?: Array<{
          title?: string;
          url?: string;
          description?: string;
          age?: string;
          language?: string;
        }> };
      };

      const results = data.web?.results ?? [];
      return results.map((item, i) => ({
        source: this.name,
        title: item.title ?? 'Untitled',
        url: item.url ?? '',
        description: item.description ?? '',
        relevanceScore: Math.max(0.1, 1 - (i * 0.08)), // Position-based relevance
        metadata: {
          query,
          position: i + 1,
          age: item.age,
          language: item.language,
        },
        discoveredAt: new Date().toISOString(),
        imported: false,
      }));
    } catch (err) {
      log.warn(`[brave-search] Error: ${(err as Error).message}`);
      return [];
    }
  }
}

// ── Jina Reader Adapter ────────────────────────────────

export class JinaReaderAdapter implements ScoutAdapter {
  readonly name = 'jina-reader';

  isEnabled(): boolean {
    return true; // Jina Reader is free, no API key needed
  }

  async scout(): Promise<ScoutDiscovery[]> {
    // Jina Reader doesn't search — it extracts content from URLs.
    // Used by ResearchMissionEngine to read specific URLs.
    return [];
  }

  /**
   * Extract readable content from a URL using Jina Reader.
   * Returns markdown text. Free, no API key needed.
   */
  async extract(url: string): Promise<{ title: string; content: string; description: string } | null> {
    try {
      const jinaUrl = `https://r.jina.ai/${url}`;
      const res = await fetch(jinaUrl, {
        headers: {
          'Accept': 'text/plain',
        },
      });

      if (!res.ok) {
        log.debug(`[jina-reader] Failed to extract ${url}: ${res.status}`);
        return null;
      }

      const text = await res.text();
      if (!text || text.length < 50) return null;

      // Extract title from first markdown heading or first line
      const titleMatch = text.match(/^#\s+(.+)/m);
      const title = titleMatch ? titleMatch[1].trim() : text.split('\n')[0].substring(0, 100);

      // First 300 chars as description
      const description = text.replace(/^#.*\n/m, '').trim().substring(0, 300);

      return { title, content: text, description };
    } catch (err) {
      log.debug(`[jina-reader] Error extracting ${url}: ${(err as Error).message}`);
      return null;
    }
  }
}
