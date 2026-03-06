/**
 * Firecrawl Adapter — Cloud-based LLM-optimized web scraping
 *
 * ═══════════════════════════════════════════════════════════════
 *  EINRICHTEN
 * ═══════════════════════════════════════════════════════════════
 *
 *  1. Account erstellen: https://firecrawl.dev
 *  2. API Key holen
 *  3. In .env:
 *     FIRECRAWL_API_KEY=fc-...
 *
 *  Wann nutzen?
 *    → Bulk Crawling (ganze Websites)
 *    → Wenn LLM-ready Markdown gebraucht wird
 *    → Wenn lokaler Playwright zu langsam ist
 *
 *  Fallback-Strategie:
 *    1. JinaReader (schnell, kostenlos, kein JS)
 *    2. PlaywrightAdapter (lokal, JS-Rendering)
 *    3. FirecrawlAdapter (Cloud, bezahlt, beste Qualität)
 * ═══════════════════════════════════════════════════════════════
 */

import { getLogger } from '../../utils/logger.js';
import type { ScoutAdapter, ScoutDiscovery } from '../data-scout.js';

const log = getLogger();

export interface FirecrawlConfig {
  apiKey?: string;
  baseUrl?: string;
}

export class FirecrawlAdapter implements ScoutAdapter {
  readonly name = 'firecrawl';
  private readonly apiKey: string | null;
  private readonly baseUrl: string;

  constructor(config: FirecrawlConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.FIRECRAWL_API_KEY ?? null;
    this.baseUrl = config.baseUrl ?? 'https://api.firecrawl.dev/v1';
  }

  isEnabled(): boolean {
    return this.apiKey !== null && this.apiKey.length > 0;
  }

  async scout(): Promise<ScoutDiscovery[]> {
    // Firecrawl doesn't search — it scrapes URLs.
    return [];
  }

  /**
   * Scrape a single URL and return LLM-ready markdown content.
   */
  async scrape(url: string): Promise<{
    title: string;
    content: string;
    description: string;
    markdown: string;
  } | null> {
    if (!this.isEnabled()) return null;

    try {
      const response = await fetch(`${this.baseUrl}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
        }),
      });

      if (!response.ok) {
        log.warn(`[firecrawl] API error (${response.status})`);
        return null;
      }

      const data = await response.json() as {
        success: boolean;
        data?: {
          markdown?: string;
          metadata?: {
            title?: string;
            description?: string;
          };
        };
      };

      if (!data.success || !data.data?.markdown) return null;

      const markdown = data.data.markdown;
      const title = data.data.metadata?.title ?? url;
      const description = data.data.metadata?.description ?? markdown.substring(0, 300);

      return { title, content: markdown, description, markdown };
    } catch (err) {
      log.warn(`[firecrawl] Error scraping ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Crawl a website starting from a URL.
   * Returns markdown for multiple pages.
   */
  async crawl(url: string, options: {
    limit?: number;
    maxDepth?: number;
  } = {}): Promise<Array<{
    url: string;
    title: string;
    markdown: string;
  }>> {
    if (!this.isEnabled()) return [];

    try {
      // Start crawl job
      const startResponse = await fetch(`${this.baseUrl}/crawl`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          url,
          limit: options.limit ?? 10,
          maxDepth: options.maxDepth ?? 2,
          formats: ['markdown'],
        }),
      });

      if (!startResponse.ok) {
        log.warn(`[firecrawl] Crawl start error (${startResponse.status})`);
        return [];
      }

      const startData = await startResponse.json() as { success: boolean; id?: string };
      if (!startData.success || !startData.id) return [];

      // Poll for results (max 60s)
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));

        const statusResponse = await fetch(`${this.baseUrl}/crawl/${startData.id}`, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` },
        });

        if (!statusResponse.ok) continue;

        const statusData = await statusResponse.json() as {
          status: string;
          data?: Array<{
            markdown?: string;
            metadata?: { title?: string; sourceURL?: string };
          }>;
        };

        if (statusData.status === 'completed' && statusData.data) {
          return statusData.data
            .filter(d => d.markdown)
            .map(d => ({
              url: d.metadata?.sourceURL ?? url,
              title: d.metadata?.title ?? 'Untitled',
              markdown: d.markdown!,
            }));
        }

        if (statusData.status === 'failed') {
          log.warn('[firecrawl] Crawl job failed');
          return [];
        }
      }

      log.warn('[firecrawl] Crawl job timed out');
      return [];
    } catch (err) {
      log.warn(`[firecrawl] Error crawling ${url}: ${(err as Error).message}`);
      return [];
    }
  }
}
