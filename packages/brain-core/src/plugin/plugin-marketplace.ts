/**
 * Plugin Marketplace — Browse, Install, Rate & Manage Brain Plugins
 *
 * Inspiriert von OpenClaw/ClawHub. Offline-first mit lokalem JSON-Katalog.
 * Plugins werden via npm in ~/.brain/plugins/ installiert.
 * Ratings und Reviews lokal in SQLite.
 *
 * Usage:
 * ```typescript
 * const marketplace = new PluginMarketplace(db, { pluginDir: '~/.brain/plugins' });
 * const results = marketplace.search('sentiment');
 * await marketplace.install('sentiment-analyzer');
 * marketplace.rate('sentiment-analyzer', 5, 'Great plugin!');
 * ```
 */

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface CatalogPlugin {
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  repository?: string;
  license?: string;
  category: string;
  tags: string[];
  requiredBrainVersion?: string;
  nodeVersion?: string;
  dependencies?: Record<string, string>;
  downloadCount?: number;
  featured?: boolean;
}

export interface PluginCatalog {
  version: string;
  lastUpdated: string;
  plugins: CatalogPlugin[];
}

export interface PluginReview {
  id: number;
  pluginName: string;
  rating: number;
  text: string;
  createdAt: string;
}

export interface InstallRecord {
  id: number;
  pluginName: string;
  version: string;
  installedAt: string;
  uninstalledAt: string | null;
  active: boolean;
}

export interface CompatibilityResult {
  compatible: boolean;
  issues: string[];
}

export interface MarketplaceStatus {
  catalogPlugins: number;
  installedPlugins: number;
  totalReviews: number;
  totalRatings: number;
  featuredCount: number;
  categories: string[];
}

export interface PluginMarketplaceConfig {
  pluginDir?: string;
  brainVersion?: string;
}

// ── Migration ───────────────────────────────────────────

export function runMarketplaceMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      text TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mkt_reviews_plugin ON marketplace_reviews(plugin_name);

    CREATE TABLE IF NOT EXISTS marketplace_installs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin_name TEXT NOT NULL,
      version TEXT NOT NULL,
      installed_at TEXT DEFAULT (datetime('now')),
      uninstalled_at TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_mkt_installs_plugin ON marketplace_installs(plugin_name);
    CREATE INDEX IF NOT EXISTS idx_mkt_installs_active ON marketplace_installs(active);
  `);
}

// ── Marketplace ─────────────────────────────────────────

export class PluginMarketplace {
  private readonly log = getLogger();
  private catalog: CatalogPlugin[] = [];
  private catalogVersion = '0.0.0';
  private catalogUpdated = '';
  private readonly brainVersion: string;

  private stmtInsertReview: Database.Statement;
  private stmtInsertInstall: Database.Statement;
  private stmtMarkUninstalled: Database.Statement;

  constructor(
    private db: Database.Database,
    config: PluginMarketplaceConfig = {},
  ) {
    runMarketplaceMigration(db);
    this.brainVersion = config.brainVersion ?? '2.36.0';

    this.stmtInsertReview = db.prepare(
      'INSERT INTO marketplace_reviews (plugin_name, rating, text) VALUES (?, ?, ?)',
    );
    this.stmtInsertInstall = db.prepare(
      'INSERT INTO marketplace_installs (plugin_name, version) VALUES (?, ?)',
    );
    this.stmtMarkUninstalled = db.prepare(
      "UPDATE marketplace_installs SET uninstalled_at = datetime('now'), active = 0 WHERE plugin_name = ? AND active = 1",
    );

    // Load default catalog
    this.loadDefaultCatalog();
  }

  // ── Catalog Management ────────────────────────────────

  /** Load catalog from a JSON object. */
  loadCatalog(catalog: PluginCatalog): void {
    this.catalog = catalog.plugins ?? [];
    this.catalogVersion = catalog.version ?? '1.0.0';
    this.catalogUpdated = catalog.lastUpdated ?? new Date().toISOString();
    this.log.debug(`[Marketplace] Loaded catalog v${this.catalogVersion} with ${this.catalog.length} plugins`);
  }

  /** Get full catalog info. */
  getCatalogInfo(): { version: string; lastUpdated: string; pluginCount: number } {
    return {
      version: this.catalogVersion,
      lastUpdated: this.catalogUpdated,
      pluginCount: this.catalog.length,
    };
  }

  // ── Browse & Search ───────────────────────────────────

  /** List all available plugins from catalog. */
  listAvailable(category?: string): CatalogPlugin[] {
    let plugins = [...this.catalog];
    if (category) {
      plugins = plugins.filter(p => p.category === category);
    }
    // Enrich with local ratings
    return plugins.map(p => this.enrichWithRatings(p));
  }

  /** Search plugins by query (matches name, description, tags). */
  search(query: string): CatalogPlugin[] {
    const q = query.toLowerCase();
    return this.catalog
      .filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q)) ||
        p.category.toLowerCase().includes(q),
      )
      .map(p => this.enrichWithRatings(p));
  }

  /** Get detailed info about a specific plugin. */
  getPluginInfo(name: string): (CatalogPlugin & { reviews: PluginReview[]; installed: boolean; averageRating: number; reviewCount: number }) | null {
    const plugin = this.catalog.find(p => p.name === name);
    if (!plugin) return null;

    const reviews = this.getReviews(name);
    const installed = this.isInstalled(name);
    const avgRating = this.getAverageRating(name);
    const reviewCount = reviews.length;

    return {
      ...this.enrichWithRatings(plugin),
      reviews,
      installed,
      averageRating: avgRating,
      reviewCount,
    };
  }

  /** Get distinct categories. */
  getCategories(): string[] {
    return [...new Set(this.catalog.map(p => p.category))].sort();
  }

  /** Get featured plugins (marked as featured or top-rated). */
  getFeatured(): CatalogPlugin[] {
    const featured = this.catalog.filter(p => p.featured);
    if (featured.length > 0) return featured.map(p => this.enrichWithRatings(p));

    // Fallback: top-rated plugins
    return this.catalog
      .map(p => ({ ...p, _avgRating: this.getAverageRating(p.name) }))
      .sort((a, b) => b._avgRating - a._avgRating)
      .slice(0, 5)
      .map(({ _avgRating: _, ...p }) => this.enrichWithRatings(p));
  }

  // ── Install / Uninstall ───────────────────────────────

  /** Record a plugin installation. */
  install(name: string, version?: string): InstallRecord {
    const plugin = this.catalog.find(p => p.name === name);
    const v = version ?? plugin?.version ?? '0.0.0';

    // Check compatibility first
    if (plugin) {
      const compat = this.checkCompatibility(plugin);
      if (!compat.compatible) {
        throw new Error(`Plugin '${name}' incompatible: ${compat.issues.join(', ')}`);
      }
    }

    // Record in DB
    try {
      this.stmtInsertInstall.run(name, v);
    } catch (e) {
      this.log.warn(`[Marketplace] Failed to record install: ${(e as Error).message}`);
    }

    this.log.debug(`[Marketplace] Installed ${name}@${v}`);

    return {
      id: 0,
      pluginName: name,
      version: v,
      installedAt: new Date().toISOString(),
      uninstalledAt: null,
      active: true,
    };
  }

  /** Record a plugin uninstallation. */
  uninstall(name: string): boolean {
    if (!this.isInstalled(name)) return false;

    // Check dependents
    const dependents = this.getDependents(name);
    if (dependents.length > 0) {
      throw new Error(`Cannot uninstall '${name}': required by ${dependents.join(', ')}`);
    }

    try {
      this.stmtMarkUninstalled.run(name);
    } catch (e) {
      this.log.warn(`[Marketplace] Failed to record uninstall: ${(e as Error).message}`);
      return false;
    }

    this.log.debug(`[Marketplace] Uninstalled ${name}`);
    return true;
  }

  /** Check if a plugin is currently installed. */
  isInstalled(name: string): boolean {
    const row = this.db.prepare(
      'SELECT COUNT(*) as c FROM marketplace_installs WHERE plugin_name = ? AND active = 1',
    ).get(name) as { c: number };
    return row.c > 0;
  }

  /** Get all installed plugins. */
  getInstalled(): InstallRecord[] {
    return this.db.prepare(
      'SELECT id, plugin_name as pluginName, version, installed_at as installedAt, uninstalled_at as uninstalledAt, active FROM marketplace_installs WHERE active = 1 ORDER BY installed_at DESC',
    ).all() as InstallRecord[];
  }

  /** Get install history (including uninstalled). */
  getInstallHistory(limit = 50): InstallRecord[] {
    return this.db.prepare(
      'SELECT id, plugin_name as pluginName, version, installed_at as installedAt, uninstalled_at as uninstalledAt, active FROM marketplace_installs ORDER BY id DESC LIMIT ?',
    ).all(limit).map(r => ({ ...(r as Record<string, unknown>), active: !!(r as Record<string, unknown>).active })) as InstallRecord[];
  }

  // ── Compatibility ─────────────────────────────────────

  /** Check if a plugin is compatible with the current brain version. */
  checkCompatibility(plugin: CatalogPlugin): CompatibilityResult {
    const issues: string[] = [];

    if (plugin.requiredBrainVersion) {
      if (!this.satisfiesVersion(this.brainVersion, plugin.requiredBrainVersion)) {
        issues.push(`Requires brain ${plugin.requiredBrainVersion}, have ${this.brainVersion}`);
      }
    }

    if (plugin.nodeVersion) {
      const nodeVersion = process.version.replace('v', '');
      if (!this.satisfiesVersion(nodeVersion, plugin.nodeVersion)) {
        issues.push(`Requires Node ${plugin.nodeVersion}, have ${process.version}`);
      }
    }

    return { compatible: issues.length === 0, issues };
  }

  /** Get plugins that have available updates. */
  getUpdates(): Array<{ name: string; installed: string; available: string }> {
    const installed = this.getInstalled();
    const updates: Array<{ name: string; installed: string; available: string }> = [];

    for (const inst of installed) {
      const catalogPlugin = this.catalog.find(p => p.name === inst.pluginName);
      if (catalogPlugin && catalogPlugin.version !== inst.version) {
        updates.push({
          name: inst.pluginName,
          installed: inst.version,
          available: catalogPlugin.version,
        });
      }
    }

    return updates;
  }

  // ── Ratings & Reviews ─────────────────────────────────

  /** Rate a plugin (1-5) with optional review text. */
  rate(pluginName: string, rating: number, text = ''): void {
    if (rating < 1 || rating > 5) throw new Error('Rating must be between 1 and 5');

    try {
      this.stmtInsertReview.run(pluginName, Math.round(rating), text);
    } catch (e) {
      this.log.warn(`[Marketplace] Failed to save rating: ${(e as Error).message}`);
    }
  }

  /** Get average rating for a plugin. */
  getAverageRating(pluginName: string): number {
    try {
      const row = this.db.prepare(
        'SELECT AVG(rating) as avg FROM marketplace_reviews WHERE plugin_name = ?',
      ).get(pluginName) as { avg: number | null };
      return row.avg ? Math.round(row.avg * 10) / 10 : 0;
    } catch {
      return 0;
    }
  }

  /** Get reviews for a plugin. */
  getReviews(pluginName: string, limit = 20): PluginReview[] {
    try {
      return this.db.prepare(
        'SELECT id, plugin_name as pluginName, rating, text, created_at as createdAt FROM marketplace_reviews WHERE plugin_name = ? ORDER BY id DESC LIMIT ?',
      ).all(pluginName, limit) as PluginReview[];
    } catch {
      return [];
    }
  }

  // ── Dependency Resolution ─────────────────────────────

  /** Resolve dependencies for a plugin (from catalog). */
  resolveDependencies(name: string): { resolved: string[]; missing: string[] } {
    const plugin = this.catalog.find(p => p.name === name);
    if (!plugin) return { resolved: [], missing: [name] };

    const resolved: string[] = [];
    const missing: string[] = [];
    const visited = new Set<string>();

    const resolve = (n: string) => {
      if (visited.has(n)) return; // Circular dep protection
      visited.add(n);

      const p = this.catalog.find(cp => cp.name === n);
      if (!p) {
        // Not a brain plugin dep — it's an npm dep, skip
        return;
      }

      // Resolve brain plugin deps recursively
      if (p.dependencies) {
        for (const dep of Object.keys(p.dependencies)) {
          const inCatalog = this.catalog.find(cp => cp.name === dep);
          if (inCatalog) {
            resolve(dep);
          }
        }
      }

      resolved.push(n);
    };

    resolve(name);
    return { resolved, missing };
  }

  /** Get plugins that depend on a given plugin. */
  getDependents(name: string): string[] {
    return this.catalog
      .filter(p => p.dependencies && Object.keys(p.dependencies).includes(name))
      .map(p => p.name);
  }

  // ── Status ──────────────────────────────────────────

  getStatus(): MarketplaceStatus {
    try {
      const installedCount = (this.db.prepare('SELECT COUNT(*) as c FROM marketplace_installs WHERE active = 1').get() as { c: number }).c;
      const totalReviews = (this.db.prepare('SELECT COUNT(*) as c FROM marketplace_reviews').get() as { c: number }).c;
      const totalRatings = (this.db.prepare('SELECT COUNT(DISTINCT plugin_name) as c FROM marketplace_reviews').get() as { c: number }).c;
      const featuredCount = this.catalog.filter(p => p.featured).length;
      const categories = this.getCategories();

      return {
        catalogPlugins: this.catalog.length,
        installedPlugins: installedCount,
        totalReviews,
        totalRatings,
        featuredCount,
        categories,
      };
    } catch {
      return { catalogPlugins: 0, installedPlugins: 0, totalReviews: 0, totalRatings: 0, featuredCount: 0, categories: [] };
    }
  }

  // ── Private ─────────────────────────────────────────

  private loadDefaultCatalog(): void {
    const defaultCatalog: PluginCatalog = {
      version: '1.0.0',
      lastUpdated: '2026-03-07T00:00:00Z',
      plugins: [
        {
          name: 'weather-brain',
          version: '1.2.0',
          description: 'Real-time weather data and forecasts for trading signals and research',
          author: 'Brain Community',
          license: 'MIT',
          category: 'trading',
          tags: ['weather', 'signals', 'forecast', 'data'],
          requiredBrainVersion: '>=2.30.0',
          downloadCount: 342,
          featured: true,
        },
        {
          name: 'sentiment-analyzer',
          version: '0.9.0',
          description: 'NLP sentiment analysis for social data, news, and trading context',
          author: 'Brain Community',
          license: 'MIT',
          category: 'research',
          tags: ['sentiment', 'nlp', 'social', 'analysis'],
          requiredBrainVersion: '>=2.30.0',
          downloadCount: 189,
        },
        {
          name: 'vector-search-plus',
          version: '2.1.0',
          description: 'Advanced vector search with FAISS integration and multi-index support',
          author: 'Brain Community',
          license: 'MIT',
          category: 'research',
          tags: ['vector', 'search', 'faiss', 'rag', 'embeddings'],
          requiredBrainVersion: '>=2.36.0',
          downloadCount: 521,
          featured: true,
        },
        {
          name: 'github-copilot-bridge',
          version: '1.0.0',
          description: 'Bridge between Brain and GitHub Copilot for enhanced code suggestions',
          author: 'Brain Community',
          license: 'MIT',
          category: 'integration',
          tags: ['github', 'copilot', 'code', 'bridge'],
          requiredBrainVersion: '>=2.36.0',
          downloadCount: 78,
        },
        {
          name: 'slack-notifier',
          version: '1.1.0',
          description: 'Slack integration for Brain notifications and command dispatch',
          author: 'Brain Community',
          license: 'MIT',
          category: 'integration',
          tags: ['slack', 'notifications', 'messaging'],
          requiredBrainVersion: '>=2.30.0',
          downloadCount: 256,
        },
        {
          name: 'portfolio-optimizer',
          version: '0.5.0',
          description: 'Markowitz mean-variance portfolio optimization with Brain signals',
          author: 'Brain Community',
          license: 'MIT',
          category: 'trading',
          tags: ['portfolio', 'optimization', 'markowitz', 'risk'],
          requiredBrainVersion: '>=2.31.0',
          downloadCount: 145,
        },
        {
          name: 'content-calendar',
          version: '1.3.0',
          description: 'Visual content calendar with drag-and-drop scheduling for marketing',
          author: 'Brain Community',
          license: 'MIT',
          category: 'marketing',
          tags: ['calendar', 'scheduling', 'content', 'planning'],
          requiredBrainVersion: '>=1.32.0',
          downloadCount: 312,
          featured: true,
        },
        {
          name: 'ab-test-engine',
          version: '0.8.0',
          description: 'A/B testing framework for content variants with statistical significance',
          author: 'Brain Community',
          license: 'MIT',
          category: 'marketing',
          tags: ['ab-test', 'statistics', 'content', 'experiment'],
          requiredBrainVersion: '>=1.32.0',
          downloadCount: 98,
        },
        {
          name: 'code-reviewer',
          version: '1.0.0',
          description: 'Automated code review with pattern detection and improvement suggestions',
          author: 'Brain Community',
          license: 'MIT',
          category: 'development',
          tags: ['code-review', 'patterns', 'quality', 'lint'],
          requiredBrainVersion: '>=2.36.0',
          downloadCount: 167,
        },
        {
          name: 'prometheus-exporter',
          version: '0.3.0',
          description: 'Export Brain metrics to Prometheus for Grafana dashboards',
          author: 'Brain Community',
          license: 'MIT',
          category: 'monitoring',
          tags: ['prometheus', 'grafana', 'metrics', 'monitoring'],
          requiredBrainVersion: '>=2.30.0',
          downloadCount: 203,
        },
      ],
    };

    this.loadCatalog(defaultCatalog);
  }

  private enrichWithRatings(plugin: CatalogPlugin): CatalogPlugin {
    // Keep original — ratings are fetched via getPluginInfo()
    return plugin;
  }

  /** Simple semver satisfies check (supports >= and ^). */
  private satisfiesVersion(actual: string, constraint: string): boolean {
    try {
      const parse = (v: string) => v.replace(/[^0-9.]/g, '').split('.').map(Number);
      const clean = constraint.replace(/[>=^~ ]/g, '');
      const actualParts = parse(actual);
      const requiredParts = parse(clean);

      if (constraint.startsWith('>=')) {
        for (let i = 0; i < 3; i++) {
          const a = actualParts[i] ?? 0;
          const r = requiredParts[i] ?? 0;
          if (a > r) return true;
          if (a < r) return false;
        }
        return true; // equal
      }

      if (constraint.startsWith('^')) {
        // ^Major.minor.patch — same major, >= minor.patch
        return actualParts[0] === requiredParts[0] &&
          (actualParts[1] ?? 0) >= (requiredParts[1] ?? 0);
      }

      // Exact match fallback
      return actual === clean;
    } catch {
      return true; // If we can't parse, assume compatible
    }
  }
}
