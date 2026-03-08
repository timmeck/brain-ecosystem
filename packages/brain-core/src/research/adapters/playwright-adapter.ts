/**
 * Playwright Adapter — Headless Browser for JS-rendered pages
 *
 * ═══════════════════════════════════════════════════════════════
 *  EINRICHTEN
 * ═══════════════════════════════════════════════════════════════
 *
 *  1. Playwright ist als optionale peerDependency installiert.
 *     Falls nötig: npm install playwright
 *  2. Browser installieren:
 *     npx playwright install chromium
 *  3. Keine Config nötig — funktioniert automatisch.
 *
 *  Wann nutzen?
 *    → SPAs (React, Vue, Angular) — Inhalt wird per JS gerendert
 *    → Seiten die ohne JS leer oder unvollständig sind
 *    → Wenn Jina Reader kein brauchbares Ergebnis liefert
 *
 *  Fallback-Strategie:
 *    1. JinaReader (schnell, kostenlos, kein JS)
 *    2. PlaywrightAdapter (langsamer, lokal, JS-Rendering)
 *    3. FirecrawlAdapter (Cloud, optional)
 * ═══════════════════════════════════════════════════════════════
 */

import { getLogger } from '../../utils/logger.js';
import type { ScoutAdapter, ScoutDiscovery } from '../data-scout.js';

const log = getLogger();

export class PlaywrightAdapter implements ScoutAdapter {
  readonly name = 'playwright';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private browser: any = null;
  private available: boolean | null = null;

  isEnabled(): boolean {
    // Optimistic — actual check happens on first use
    return true;
  }

  async scout(): Promise<ScoutDiscovery[]> {
    // Playwright doesn't search — it extracts content from URLs.
    return [];
  }

  /**
   * Check if Playwright + Chromium are available.
   * Caches the result.
   */
  async checkAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;
    try {
      const pwPath = 'playwright';
      const { chromium } = await import(/* webpackIgnore: true */ pwPath);
      const browser = await chromium.launch({ headless: true });
      await browser.close();
      this.available = true;
    } catch {
      this.available = false;
      log.debug('[playwright] Not available (install with: npx playwright install chromium)');
    }
    return this.available;
  }

  /**
   * Extract content from a URL using a headless browser.
   * Renders JavaScript, waits for content, then extracts text.
   */
  async extract(url: string, options: {
    waitForSelector?: string;
    timeout?: number;
    screenshot?: boolean;
  } = {}): Promise<{
    title: string;
    content: string;
    description: string;
    screenshot?: Buffer;
  } | null> {
    // Global timeout guard: abort entire extraction after 30s
    const extractTimeout = options.timeout ?? 30_000;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), extractTimeout + 5_000);

    try {
      if (!(await this.checkAvailable())) return null;
      if (abortController.signal.aborted) {
        log.warn(`[playwright] Extraction aborted before start: ${url}`);
        return null;
      }

      const browser = await this.getBrowser();
      const context = await browser.newContext({
        userAgent: 'BrainEcosystem/1.0 (Research Bot)',
      });
      const page = await context.newPage();

      try {
        await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: extractTimeout,
        });

        if (options.waitForSelector) {
          await page.waitForSelector(options.waitForSelector, { timeout: 10_000 }).catch(() => {});
        }

        // Auto-scroll for lazy loading
        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });
        await page.waitForTimeout(1000);

        const title = await page.title();
        const content = await page.evaluate(() => {
          // Remove scripts, styles, navigation
          const clone = document.body.cloneNode(true) as HTMLElement;
          clone.querySelectorAll('script, style, nav, footer, header, aside, [role="navigation"]')
            .forEach(el => el.remove());
          return clone.innerText || clone.textContent || '';
        });

        const description = content.trim().substring(0, 300);

        let screenshot: Buffer | undefined;
        if (options.screenshot) {
          screenshot = await page.screenshot({ fullPage: false }) as Buffer;
        }

        return { title, content: content.trim(), description, screenshot };
      } finally {
        await context.close();
      }
    } catch (err) {
      log.warn(`[playwright] Error extracting ${url}: ${(err as Error).message}`);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getBrowser(): Promise<any> {
    // Health check: verify cached browser is still connected
    if (this.browser) {
      try {
        if (typeof this.browser.isConnected === 'function' && !this.browser.isConnected()) {
          log.warn('[playwright] Browser disconnected — relaunching');
          this.browser = null;
        }
      } catch {
        log.warn('[playwright] Browser health check failed — relaunching');
        this.browser = null;
      }
    }

    if (this.browser) return this.browser;

    const pwPath = 'playwright';
    const { chromium } = await import(/* webpackIgnore: true */ pwPath);
    this.browser = await chromium.launch({ headless: true });
    return this.browser;
  }

  /** Graceful shutdown — close the browser */
  async shutdown(): Promise<void> {
    if (this.browser) {
      try { await this.browser.close(); } catch (err) { log.debug(`[playwright] Browser close error: ${(err as Error).message}`); }
      this.browser = null;
    }
  }
}
