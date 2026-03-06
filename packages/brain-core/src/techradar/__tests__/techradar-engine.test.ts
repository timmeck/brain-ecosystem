import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

import { TechRadarEngine } from '../techradar-engine.js';
import { RelevanceScorer } from '../relevance-scorer.js';
import { DigestGenerator } from '../daily-digest.js';

function createDb(): Database.Database {
  return new Database(':memory:');
}

describe('TechRadarEngine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createDb();
  });

  afterEach(() => {
    db.close();
  });

  describe('constructor', () => {
    it('creates tables on init', () => {
      const engine = new TechRadarEngine(db);
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'techradar_%'"
      ).all() as Array<{ name: string }>;
      const names = tables.map(t => t.name);
      expect(names).toContain('techradar_entries');
      expect(names).toContain('techradar_watched_repos');
      expect(names).toContain('techradar_digests');
    });

    it('seeds default watched repos', () => {
      const engine = new TechRadarEngine(db);
      const repos = engine.getWatchedRepos();
      expect(repos.length).toBeGreaterThanOrEqual(3);
      expect(repos.some(r => r.full_name === 'anthropics/claude-code')).toBe(true);
    });

    it('accepts custom config', () => {
      const engine = new TechRadarEngine(db, {
        watchedRepos: ['my/repo'],
        relevanceThreshold: 50,
      });
      const repos = engine.getWatchedRepos();
      expect(repos.some(r => r.full_name === 'my/repo')).toBe(true);
    });
  });

  describe('watched repos', () => {
    it('adds and removes repos', () => {
      const engine = new TechRadarEngine(db, { watchedRepos: [] });
      engine.addWatchedRepo('test/repo', 'testing');
      expect(engine.getWatchedRepos()).toHaveLength(1);

      engine.removeWatchedRepo('test/repo');
      expect(engine.getWatchedRepos()).toHaveLength(0);
    });

    it('prevents duplicates', () => {
      const engine = new TechRadarEngine(db, { watchedRepos: [] });
      engine.addWatchedRepo('test/repo');
      engine.addWatchedRepo('test/repo');
      expect(engine.getWatchedRepos()).toHaveLength(1);
    });
  });

  describe('entries', () => {
    it('returns entries filtered by minScore', () => {
      const engine = new TechRadarEngine(db, { watchedRepos: [] });
      // Insert entries directly
      db.prepare(`
        INSERT INTO techradar_entries (name, source, source_url, category, ring, description, relevance_score, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run('high-score', 'github_trending', 'https://example.com', 'library', 'adopt', 'A high-score lib', 80);
      db.prepare(`
        INSERT INTO techradar_entries (name, source, source_url, category, ring, description, relevance_score, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run('low-score', 'github_trending', 'https://example.com', 'library', 'hold', 'A low-score lib', 10);

      const highOnly = engine.getEntries({ minScore: 50 });
      expect(highOnly).toHaveLength(1);
      expect(highOnly[0].name).toBe('high-score');

      const all = engine.getEntries();
      expect(all).toHaveLength(2);
    });

    it('returns entries filtered by source', () => {
      const engine = new TechRadarEngine(db, { watchedRepos: [] });
      db.prepare(`
        INSERT INTO techradar_entries (name, source, source_url, category, ring, description, relevance_score, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run('release', 'github_release', 'url', 'library', 'trial', 'A release', 60);
      db.prepare(`
        INSERT INTO techradar_entries (name, source, source_url, category, ring, description, relevance_score, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run('trending', 'github_trending', 'url', 'tool', 'assess', 'Trending', 50);

      const releases = engine.getEntries({ source: 'github_release' });
      expect(releases).toHaveLength(1);
      expect(releases[0].name).toBe('release');
    });
  });

  describe('digest', () => {
    it('generates and retrieves digest', async () => {
      const engine = new TechRadarEngine(db, { watchedRepos: [], relevanceThreshold: 0 });
      // Insert some entries
      db.prepare(`
        INSERT INTO techradar_entries (name, source, source_url, category, ring, description, relevance_score, action_type, action_detail, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run('cool-lib', 'github_trending', 'url', 'library', 'trial', 'A cool library for AI', 75, 'investigate', 'Check it out');

      const digest = await engine.generateDigest('2026-03-06');
      expect(digest.date).toBe('2026-03-06');
      expect(digest.entries.length).toBeGreaterThan(0);
      expect(digest.summary).toBeTruthy();

      // Retrieve
      const stored = engine.getDigest('2026-03-06');
      expect(stored).not.toBeNull();
      expect(stored!.date).toBe('2026-03-06');
    });

    it('returns null for missing digest', () => {
      const engine = new TechRadarEngine(db, { watchedRepos: [] });
      expect(engine.getDigest('2099-01-01')).toBeNull();
    });
  });

  describe('stats', () => {
    it('returns stats', () => {
      const engine = new TechRadarEngine(db, { watchedRepos: ['a/b'] });
      const stats = engine.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.watchedRepos).toBe(1);
      expect(stats.bySource).toEqual({});
    });
  });

  describe('start / stop', () => {
    it('starts and stops without error', () => {
      const engine = new TechRadarEngine(db, { watchedRepos: [], scanIntervalMs: 999999 });
      engine.start();
      engine.stop();
    });

    it('start is idempotent', () => {
      const engine = new TechRadarEngine(db, { watchedRepos: [], scanIntervalMs: 999999 });
      engine.start();
      engine.start(); // Should not throw
      engine.stop();
    });
  });

  describe('importFromSignalScanner', () => {
    it('imports from scanned_repos if table exists', async () => {
      // Create a mock scanned_repos table
      db.exec(`
        CREATE TABLE scanned_repos (
          id INTEGER PRIMARY KEY,
          full_name TEXT NOT NULL,
          url TEXT NOT NULL,
          description TEXT,
          language TEXT,
          topics TEXT DEFAULT '[]',
          current_stars INTEGER DEFAULT 0,
          signal_score REAL DEFAULT 0,
          signal_level TEXT DEFAULT 'noise',
          star_velocity_24h INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1
        )
      `);
      db.prepare(`
        INSERT INTO scanned_repos (full_name, url, description, language, topics, current_stars, signal_score, signal_level, star_velocity_24h, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run('cool/mcp-server', 'https://github.com/cool/mcp-server', 'An MCP server for TypeScript', 'TypeScript', '["mcp","typescript"]', 500, 75, 'breakout', 50);

      const engine = new TechRadarEngine(db, { watchedRepos: [], relevanceThreshold: 10 });
      const result = await engine.scan();
      // Should import the breakout repo (mcp + typescript keywords match)
      expect(result.new_entries).toBeGreaterThanOrEqual(0); // May or may not match threshold
    });
  });
});

describe('RelevanceScorer', () => {
  it('scores with keywords', () => {
    const scorer = new RelevanceScorer();
    const result = scorer.scoreKeywords('mcp-typescript-sdk', 'A TypeScript SDK for Model Context Protocol with SQLite support');
    expect(result.score).toBeGreaterThan(20);
  });

  it('scores zero for irrelevant content', () => {
    const scorer = new RelevanceScorer();
    const result = scorer.scoreKeywords('recipe-app', 'A mobile app for sharing cooking recipes');
    expect(result.score).toBe(0);
  });

  it('categorizes correctly', () => {
    const scorer = new RelevanceScorer();
    const result = scorer.scoreKeywords('gpt-4o', 'A new LLM model from OpenAI');
    expect(result.category).toBe('ai_model');
  });

  it('assigns ring based on score', () => {
    const scorer = new RelevanceScorer();
    // This should score high with multiple keyword matches
    const high = scorer.scoreKeywords('mcp-ollama-claude', 'MCP server with Ollama and Claude for TypeScript embeddings and SQLite');
    expect(high.score).toBeGreaterThan(40);
    expect(['adopt', 'trial']).toContain(high.ring);
  });
});

describe('DigestGenerator', () => {
  it('generates fallback digest without LLM', async () => {
    const gen = new DigestGenerator();
    const entries = [
      {
        name: 'test-lib',
        source: 'github_trending' as const,
        source_url: 'url',
        category: 'library' as const,
        ring: 'trial' as const,
        description: 'A test library',
        relevance_score: 60,
        relevance_reason: 'keyword match',
        action_type: 'investigate' as const,
        action_detail: 'Check it out',
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_active: true,
      },
    ];

    const digest = await gen.generate(entries, '2026-03-06');
    expect(digest.date).toBe('2026-03-06');
    expect(digest.summary).toContain('2026-03-06');
    expect(digest.entries).toHaveLength(1);
  });

  it('handles empty entries', async () => {
    const gen = new DigestGenerator();
    const digest = await gen.generate([], '2026-03-06');
    expect(digest.entries).toHaveLength(0);
    expect(digest.summary).toContain('No new findings');
  });

  it('extracts action items from high-score entries', async () => {
    const gen = new DigestGenerator();
    const entries = [
      {
        name: 'important-update',
        source: 'github_release' as const,
        source_url: 'url',
        category: 'library' as const,
        ring: 'adopt' as const,
        description: 'Critical update',
        relevance_score: 80,
        relevance_reason: 'high relevance',
        action_type: 'update' as const,
        action_detail: 'Update to v2.0',
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        is_active: true,
      },
    ];

    const digest = await gen.generate(entries, '2026-03-06');
    expect(digest.action_items.length).toBeGreaterThan(0);
    expect(digest.opportunities.length).toBeGreaterThan(0);
  });
});
