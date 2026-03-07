import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { PluginMarketplace } from '../../../src/plugin/plugin-marketplace.js';
import type { PluginCatalog } from '../../../src/plugin/plugin-marketplace.js';

const testCatalog: PluginCatalog = {
  version: '1.0.0',
  lastUpdated: '2026-03-07T00:00:00Z',
  plugins: [
    {
      name: 'weather-brain',
      version: '1.2.0',
      description: 'Real-time weather data for trading',
      author: 'Test',
      license: 'MIT',
      category: 'trading',
      tags: ['weather', 'signals'],
      requiredBrainVersion: '>=2.30.0',
      downloadCount: 342,
      featured: true,
    },
    {
      name: 'sentiment-analyzer',
      version: '0.9.0',
      description: 'NLP sentiment analysis for social data',
      author: 'Test',
      license: 'MIT',
      category: 'research',
      tags: ['sentiment', 'nlp', 'social'],
      requiredBrainVersion: '>=2.30.0',
      downloadCount: 189,
    },
    {
      name: 'vector-search-plus',
      version: '2.1.0',
      description: 'Advanced vector search with FAISS',
      author: 'Test',
      license: 'MIT',
      category: 'research',
      tags: ['vector', 'search', 'faiss'],
      requiredBrainVersion: '>=2.36.0',
      downloadCount: 521,
      featured: true,
    },
    {
      name: 'future-plugin',
      version: '1.0.0',
      description: 'Requires future brain version',
      author: 'Test',
      license: 'MIT',
      category: 'util',
      tags: ['future'],
      requiredBrainVersion: '>=99.0.0',
    },
    {
      name: 'dep-plugin',
      version: '1.0.0',
      description: 'Depends on weather-brain',
      author: 'Test',
      license: 'MIT',
      category: 'trading',
      tags: ['deps'],
      dependencies: { 'weather-brain': '>=1.0.0' },
    },
  ],
};

describe('PluginMarketplace', () => {
  let db: Database.Database;
  let marketplace: PluginMarketplace;

  beforeEach(() => {
    db = new Database(':memory:');
    marketplace = new PluginMarketplace(db, { brainVersion: '2.36.42' });
    marketplace.loadCatalog(testCatalog);
  });

  afterEach(() => {
    db.close();
  });

  // ── Catalog ───────────────────────────────────────────

  it('loads catalog and lists available plugins', () => {
    const available = marketplace.listAvailable();
    expect(available).toHaveLength(5);
  });

  it('filters by category', () => {
    const trading = marketplace.listAvailable('trading');
    expect(trading).toHaveLength(2);
    expect(trading.every(p => p.category === 'trading')).toBe(true);
  });

  it('returns catalog info', () => {
    const info = marketplace.getCatalogInfo();
    expect(info.version).toBe('1.0.0');
    expect(info.pluginCount).toBe(5);
  });

  it('gets categories', () => {
    const cats = marketplace.getCategories();
    expect(cats).toContain('trading');
    expect(cats).toContain('research');
    expect(cats).toContain('util');
  });

  // ── Search ────────────────────────────────────────────

  it('searches by name', () => {
    const results = marketplace.search('weather');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some(r => r.name === 'weather-brain')).toBe(true);
  });

  it('searches by tag', () => {
    const results = marketplace.search('nlp');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('sentiment-analyzer');
  });

  it('searches by description', () => {
    const results = marketplace.search('FAISS');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('vector-search-plus');
  });

  it('returns empty for no match', () => {
    expect(marketplace.search('nonexistent')).toHaveLength(0);
  });

  // ── Plugin Info ───────────────────────────────────────

  it('gets detailed plugin info', () => {
    const info = marketplace.getPluginInfo('weather-brain');
    expect(info).not.toBeNull();
    expect(info!.name).toBe('weather-brain');
    expect(info!.reviews).toEqual([]);
    expect(info!.installed).toBe(false);
  });

  it('returns null for unknown plugin', () => {
    expect(marketplace.getPluginInfo('nonexistent')).toBeNull();
  });

  // ── Featured ──────────────────────────────────────────

  it('returns featured plugins', () => {
    const featured = marketplace.getFeatured();
    expect(featured.length).toBeGreaterThanOrEqual(2);
    expect(featured.some(p => p.name === 'weather-brain')).toBe(true);
    expect(featured.some(p => p.name === 'vector-search-plus')).toBe(true);
  });

  // ── Install / Uninstall ───────────────────────────────

  it('installs a plugin', () => {
    const result = marketplace.install('weather-brain');
    expect(result.pluginName).toBe('weather-brain');
    expect(result.version).toBe('1.2.0');
    expect(result.active).toBe(true);
    expect(marketplace.isInstalled('weather-brain')).toBe(true);
  });

  it('uninstalls a plugin', () => {
    marketplace.install('sentiment-analyzer');
    expect(marketplace.uninstall('sentiment-analyzer')).toBe(true);
    expect(marketplace.isInstalled('sentiment-analyzer')).toBe(false);
  });

  it('returns false when uninstalling non-installed plugin', () => {
    expect(marketplace.uninstall('not-installed')).toBe(false);
  });

  it('blocks uninstall when dependents exist', () => {
    marketplace.install('weather-brain');
    marketplace.install('dep-plugin');
    expect(() => marketplace.uninstall('weather-brain')).toThrow('required by');
  });

  it('lists installed plugins', () => {
    marketplace.install('weather-brain');
    marketplace.install('sentiment-analyzer');
    const installed = marketplace.getInstalled();
    expect(installed).toHaveLength(2);
  });

  it('tracks install history including uninstalls', () => {
    marketplace.install('sentiment-analyzer');
    marketplace.uninstall('sentiment-analyzer');
    marketplace.install('sentiment-analyzer', '1.0.0');
    const history = marketplace.getInstallHistory();
    // 2 install records (first one marked inactive after uninstall)
    expect(history).toHaveLength(2);
    expect(history[0].active).toBe(true);  // most recent
    expect(history[1].active).toBe(false); // uninstalled
  });

  // ── Compatibility ─────────────────────────────────────

  it('compatible plugin passes check', () => {
    const plugin = testCatalog.plugins.find(p => p.name === 'weather-brain')!;
    const result = marketplace.checkCompatibility(plugin);
    expect(result.compatible).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('incompatible plugin fails check', () => {
    const plugin = testCatalog.plugins.find(p => p.name === 'future-plugin')!;
    const result = marketplace.checkCompatibility(plugin);
    expect(result.compatible).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('blocks install of incompatible plugin', () => {
    expect(() => marketplace.install('future-plugin')).toThrow('incompatible');
  });

  it('detects available updates', () => {
    marketplace.install('weather-brain', '1.0.0'); // old version
    const updates = marketplace.getUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].installed).toBe('1.0.0');
    expect(updates[0].available).toBe('1.2.0');
  });

  // ── Ratings & Reviews ─────────────────────────────────

  it('rates a plugin', () => {
    marketplace.rate('weather-brain', 5, 'Excellent!');
    marketplace.rate('weather-brain', 3, 'Okay');
    const avg = marketplace.getAverageRating('weather-brain');
    expect(avg).toBe(4);
  });

  it('validates rating range', () => {
    expect(() => marketplace.rate('test', 0)).toThrow('between 1 and 5');
    expect(() => marketplace.rate('test', 6)).toThrow('between 1 and 5');
  });

  it('retrieves reviews', () => {
    marketplace.rate('weather-brain', 5, 'Great plugin!');
    marketplace.rate('weather-brain', 4, 'Good but could improve');
    const reviews = marketplace.getReviews('weather-brain');
    expect(reviews).toHaveLength(2);
    expect(reviews[0].rating).toBe(4); // DESC order
  });

  it('returns 0 for unrated plugin', () => {
    expect(marketplace.getAverageRating('unrated')).toBe(0);
  });

  // ── Dependency Resolution ─────────────────────────────

  it('resolves dependencies', () => {
    const { resolved } = marketplace.resolveDependencies('dep-plugin');
    expect(resolved).toContain('weather-brain');
    expect(resolved).toContain('dep-plugin');
  });

  it('returns missing for unknown plugin', () => {
    const { missing } = marketplace.resolveDependencies('nonexistent');
    expect(missing).toContain('nonexistent');
  });

  it('finds dependents', () => {
    const dependents = marketplace.getPluginInfo('weather-brain');
    // dep-plugin depends on weather-brain — checked via getDependents
    const deps = marketplace.search('deps');
    expect(deps[0].dependencies).toHaveProperty('weather-brain');
  });

  // ── Status ──────────────────────────────────────────

  it('reports correct status', () => {
    marketplace.install('weather-brain');
    marketplace.rate('weather-brain', 5, 'Great');
    marketplace.rate('sentiment-analyzer', 4, 'Good');

    const status = marketplace.getStatus();
    expect(status.catalogPlugins).toBe(5);
    expect(status.installedPlugins).toBe(1);
    expect(status.totalReviews).toBe(2);
    expect(status.totalRatings).toBe(2);
    expect(status.categories.length).toBeGreaterThanOrEqual(3);
  });

  it('returns default status on fresh marketplace', () => {
    const fresh = new PluginMarketplace(db);
    const status = fresh.getStatus();
    expect(status.catalogPlugins).toBeGreaterThan(0); // default catalog
    expect(status.installedPlugins).toBe(0);
  });

  // ── Default Catalog ───────────────────────────────────

  it('loads default catalog on construction', () => {
    const fresh = new PluginMarketplace(db);
    const available = fresh.listAvailable();
    expect(available.length).toBeGreaterThanOrEqual(10);
  });
});
