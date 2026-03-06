/**
 * TechRadar Engine — Täglicher Internet-Scan + Relevanz-Analyse
 *
 * ═══════════════════════════════════════════════════════════════
 *  EINRICHTEN
 * ═══════════════════════════════════════════════════════════════
 *
 *  Funktioniert out of the box (nutzt SignalScanner-Daten).
 *
 *  Für bessere Ergebnisse:
 *    1. GITHUB_TOKEN in .env → höheres Rate Limit für Repo-Watching
 *    2. LLMService angebunden → intelligentes Relevanz-Scoring
 *    3. Repos watchlisten:
 *       brain techradar repos add anthropics/claude-code
 *       brain techradar repos add modelcontextprotocol/servers
 *
 *  CLI:
 *    brain techradar              → Heutigen Digest anzeigen
 *    brain techradar scan         → Jetzt scannen
 *    brain techradar repos list   → Überwachte Repos
 *    brain techradar repos add <repo>
 * ═══════════════════════════════════════════════════════════════
 */

import Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import { RepoWatcher } from './repo-watcher.js';
import { RelevanceScorer } from './relevance-scorer.js';
import { DigestGenerator } from './daily-digest.js';
import type { LLMService } from '../llm/llm-service.js';
import type {
  TechRadarConfig, TechRadarEntry, TechRadarScanResult,
  WatchedRepo, DailyDigest, TechRadarSource,
} from './types.js';

const log = getLogger();

const DEFAULT_CONFIG: TechRadarConfig = {
  enabled: true,
  scanIntervalMs: 6 * 60 * 60 * 1000, // 6h
  digestTime: '06:00',
  maxEntriesPerScan: 50,
  relevanceThreshold: 30,
  watchedRepos: [
    'anthropics/claude-code',
    'modelcontextprotocol/servers',
    'anthropics/anthropic-sdk-python',
  ],
};

// ── Migration ────────────────────────────────────────────

export function runTechRadarMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS techradar_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'other',
      ring TEXT NOT NULL DEFAULT 'assess',
      description TEXT NOT NULL DEFAULT '',
      relevance_score REAL DEFAULT 0,
      relevance_reason TEXT DEFAULT '',
      action_type TEXT DEFAULT 'none',
      action_detail TEXT DEFAULT '',
      first_seen_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT DEFAULT (datetime('now')),
      is_active INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_techradar_score ON techradar_entries(relevance_score DESC);
    CREATE INDEX IF NOT EXISTS idx_techradar_source ON techradar_entries(source);
    CREATE INDEX IF NOT EXISTS idx_techradar_ring ON techradar_entries(ring);

    CREATE TABLE IF NOT EXISTS techradar_watched_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT UNIQUE NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      reason TEXT DEFAULT '',
      last_release_tag TEXT,
      last_release_at TEXT,
      last_checked_at TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS techradar_digests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      entries_json TEXT DEFAULT '[]',
      opportunities_json TEXT DEFAULT '[]',
      action_items_json TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Engine ────────────────────────────────────────────────

export class TechRadarEngine {
  private readonly db: Database.Database;
  private readonly config: TechRadarConfig;
  private readonly repoWatcher: RepoWatcher;
  private readonly relevanceScorer: RelevanceScorer;
  private readonly digestGenerator: DigestGenerator;
  private scanTimer: ReturnType<typeof setInterval> | null = null;

  constructor(db: Database.Database, config: Partial<TechRadarConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.repoWatcher = new RepoWatcher(this.config.githubToken);
    this.relevanceScorer = new RelevanceScorer();
    this.digestGenerator = new DigestGenerator();

    runTechRadarMigration(db);
    this.ensureDefaultWatchedRepos();
  }

  setLLMService(llmService: LLMService): void {
    this.relevanceScorer.setLLMService(llmService);
    this.digestGenerator.setLLMService(llmService);
  }

  /** Start periodic scanning */
  start(): void {
    if (this.scanTimer) return;
    this.scanTimer = setInterval(() => {
      this.scan().catch(err => {
        log.error(`[TechRadar] Scan error: ${(err as Error).message}`);
      });
    }, this.config.scanIntervalMs);
    log.info(`[TechRadar] Engine started (interval: ${this.config.scanIntervalMs / 1000}s)`);
  }

  /** Stop periodic scanning */
  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
  }

  /** Run a full scan */
  async scan(): Promise<TechRadarScanResult> {
    const startedAt = new Date().toISOString();
    const errors: string[] = [];
    let newEntries = 0;
    let updatedEntries = 0;
    let releasesFound = 0;

    log.info('[TechRadar] Starting scan...');

    // 1. Check watched repos for new releases
    try {
      const releases = await this.checkWatchedRepos();
      releasesFound = releases;
      newEntries += releases;
    } catch (err) {
      errors.push(`Repo watch: ${(err as Error).message}`);
    }

    // 2. Import high-scoring entries from SignalScanner (if available)
    try {
      const imported = this.importFromSignalScanner();
      newEntries += imported.new;
      updatedEntries += imported.updated;
    } catch (err) {
      errors.push(`Signal import: ${(err as Error).message}`);
    }

    // 3. Generate digest if we have new entries
    let digestGenerated = false;
    const today = new Date().toISOString().split('T')[0]!;
    if (newEntries > 0 || updatedEntries > 0) {
      try {
        await this.generateDigest(today);
        digestGenerated = true;
      } catch (err) {
        errors.push(`Digest: ${(err as Error).message}`);
      }
    }

    const result: TechRadarScanResult = {
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - new Date(startedAt).getTime(),
      new_entries: newEntries,
      updated_entries: updatedEntries,
      releases_found: releasesFound,
      digest_generated: digestGenerated,
      errors,
    };

    log.info(`[TechRadar] Scan complete: ${newEntries} new, ${updatedEntries} updated, ${releasesFound} releases`);
    return result;
  }

  // ── Watched Repos ──────────────────────────────────────

  addWatchedRepo(fullName: string, reason = ''): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO techradar_watched_repos (full_name, url, reason)
      VALUES (?, ?, ?)
    `);
    stmt.run(fullName, `https://github.com/${fullName}`, reason);
  }

  removeWatchedRepo(fullName: string): void {
    this.db.prepare('UPDATE techradar_watched_repos SET is_active = 0 WHERE full_name = ?').run(fullName);
  }

  getWatchedRepos(): WatchedRepo[] {
    return this.db.prepare('SELECT * FROM techradar_watched_repos WHERE is_active = 1').all() as WatchedRepo[];
  }

  private ensureDefaultWatchedRepos(): void {
    for (const repo of this.config.watchedRepos) {
      this.addWatchedRepo(repo, 'default watchlist');
    }
  }

  private async checkWatchedRepos(): Promise<number> {
    const repos = this.getWatchedRepos();
    let count = 0;

    for (const repo of repos) {
      const releases = await this.repoWatcher.checkReleases(repo);
      if (releases.length > 0) {
        const latest = releases[0]!;

        // Score relevance
        const relevance = await this.relevanceScorer.score(
          `${repo.full_name} ${latest.tag}`,
          `New release: ${latest.name}. ${latest.body.substring(0, 500)}`,
          'github_release',
        );

        // Create/update radar entry
        this.upsertEntry({
          name: `${repo.full_name}@${latest.tag}`,
          source: 'github_release',
          source_url: latest.url,
          category: relevance.category,
          ring: relevance.ring,
          description: `Release ${latest.tag}: ${latest.name}. ${latest.body.substring(0, 300)}`,
          relevance_score: relevance.score,
          relevance_reason: relevance.reason,
          action_type: relevance.action,
          action_detail: relevance.actionDetail,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          is_active: true,
        });

        // Update watched repo
        this.db.prepare(`
          UPDATE techradar_watched_repos
          SET last_release_tag = ?, last_release_at = ?, last_checked_at = datetime('now')
          WHERE full_name = ?
        `).run(latest.tag, latest.published_at, repo.full_name);

        count += releases.length;
      } else {
        // Update last checked
        this.db.prepare(`
          UPDATE techradar_watched_repos SET last_checked_at = datetime('now') WHERE full_name = ?
        `).run(repo.full_name);
      }
    }

    return count;
  }

  // ── SignalScanner Integration ──────────────────────────

  /**
   * Import high-scoring repos from existing SignalScanner data.
   * Only imports breakout and signal-level repos.
   */
  private importFromSignalScanner(): { new: number; updated: number } {
    let newCount = 0;
    let updatedCount = 0;

    try {
      // Check if scanned_repos table exists
      const tableExists = this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='scanned_repos'"
      ).get();
      if (!tableExists) return { new: 0, updated: 0 };

      const repos = this.db.prepare(`
        SELECT full_name, url, description, language, topics, current_stars,
               signal_score, signal_level, star_velocity_24h
        FROM scanned_repos
        WHERE signal_level IN ('breakout', 'signal')
          AND is_active = 1
        ORDER BY signal_score DESC
        LIMIT ?
      `).all(this.config.maxEntriesPerScan) as Array<{
        full_name: string; url: string; description: string;
        language: string; topics: string; current_stars: number;
        signal_score: number; signal_level: string; star_velocity_24h: number;
      }>;

      for (const repo of repos) {
        const existing = this.db.prepare(
          'SELECT id FROM techradar_entries WHERE name = ? AND source = ?'
        ).get(repo.full_name, 'github_trending');

        // Score relevance
        const relevance = this.relevanceScorer.scoreKeywords(
          repo.full_name,
          `${repo.description ?? ''} ${repo.language ?? ''} ${repo.topics ?? ''}`,
        );

        if (relevance.score < this.config.relevanceThreshold) continue;

        if (existing) {
          this.db.prepare(`
            UPDATE techradar_entries
            SET relevance_score = ?, last_seen_at = datetime('now'), description = ?
            WHERE name = ? AND source = ?
          `).run(relevance.score, `${repo.description ?? ''}. Stars: ${repo.current_stars}, velocity: ${repo.star_velocity_24h}/day`, repo.full_name, 'github_trending');
          updatedCount++;
        } else {
          this.upsertEntry({
            name: repo.full_name,
            source: 'github_trending',
            source_url: repo.url,
            category: relevance.category,
            ring: relevance.ring,
            description: `${repo.description ?? ''}. Stars: ${repo.current_stars}, velocity: ${repo.star_velocity_24h}/day`,
            relevance_score: relevance.score,
            relevance_reason: relevance.reason,
            action_type: relevance.action,
            action_detail: relevance.actionDetail,
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            is_active: true,
          });
          newCount++;
        }
      }
    } catch (err) {
      log.warn(`[TechRadar] SignalScanner import error: ${(err as Error).message}`);
    }

    return { new: newCount, updated: updatedCount };
  }

  // ── Entries ────────────────────────────────────────────

  private upsertEntry(entry: TechRadarEntry): void {
    const existing = this.db.prepare(
      'SELECT id FROM techradar_entries WHERE name = ? AND source = ?'
    ).get(entry.name, entry.source) as { id: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE techradar_entries
        SET relevance_score = ?, relevance_reason = ?, ring = ?,
            action_type = ?, action_detail = ?, last_seen_at = datetime('now'),
            description = ?, category = ?
        WHERE id = ?
      `).run(
        entry.relevance_score, entry.relevance_reason, entry.ring,
        entry.action_type, entry.action_detail,
        entry.description, entry.category,
        existing.id,
      );
    } else {
      this.db.prepare(`
        INSERT INTO techradar_entries
        (name, source, source_url, category, ring, description,
         relevance_score, relevance_reason, action_type, action_detail)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.name, entry.source, entry.source_url, entry.category, entry.ring,
        entry.description, entry.relevance_score, entry.relevance_reason,
        entry.action_type, entry.action_detail,
      );
    }
  }

  getEntries(options: { minScore?: number; source?: TechRadarSource; ring?: string; limit?: number } = {}): TechRadarEntry[] {
    let sql = 'SELECT * FROM techradar_entries WHERE is_active = 1';
    const params: unknown[] = [];

    if (options.minScore !== undefined) {
      sql += ' AND relevance_score >= ?';
      params.push(options.minScore);
    }
    if (options.source) {
      sql += ' AND source = ?';
      params.push(options.source);
    }
    if (options.ring) {
      sql += ' AND ring = ?';
      params.push(options.ring);
    }

    sql += ' ORDER BY relevance_score DESC LIMIT ?';
    params.push(options.limit ?? 50);

    return this.db.prepare(sql).all(...params) as TechRadarEntry[];
  }

  // ── Digest ─────────────────────────────────────────────

  async generateDigest(date?: string): Promise<DailyDigest> {
    const today = date ?? new Date().toISOString().split('T')[0]!;
    const entries = this.getEntries({ minScore: this.config.relevanceThreshold });

    const digest = await this.digestGenerator.generate(entries, today);

    // Store digest
    this.db.prepare(`
      INSERT OR REPLACE INTO techradar_digests
      (date, summary, entries_json, opportunities_json, action_items_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      today,
      digest.summary,
      JSON.stringify(digest.entries),
      JSON.stringify(digest.opportunities),
      JSON.stringify(digest.action_items),
    );

    return digest;
  }

  getDigest(date?: string): DailyDigest | null {
    const today = date ?? new Date().toISOString().split('T')[0]!;
    const row = this.db.prepare('SELECT * FROM techradar_digests WHERE date = ?').get(today) as {
      date: string; summary: string;
      entries_json: string; opportunities_json: string; action_items_json: string;
      created_at: string;
    } | undefined;

    if (!row) return null;

    return {
      date: row.date,
      summary: row.summary,
      entries: JSON.parse(row.entries_json),
      opportunities: JSON.parse(row.opportunities_json),
      action_items: JSON.parse(row.action_items_json),
      created_at: row.created_at,
    };
  }

  // ── Stats ──────────────────────────────────────────────

  getStats(): {
    totalEntries: number;
    bySource: Record<string, number>;
    byRing: Record<string, number>;
    watchedRepos: number;
    lastDigest: string | null;
  } {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM techradar_entries WHERE is_active = 1').get() as { c: number }).c;

    const bySrc = this.db.prepare(
      'SELECT source, COUNT(*) as c FROM techradar_entries WHERE is_active = 1 GROUP BY source'
    ).all() as Array<{ source: string; c: number }>;

    const byRing = this.db.prepare(
      'SELECT ring, COUNT(*) as c FROM techradar_entries WHERE is_active = 1 GROUP BY ring'
    ).all() as Array<{ ring: string; c: number }>;

    const watched = (this.db.prepare('SELECT COUNT(*) as c FROM techradar_watched_repos WHERE is_active = 1').get() as { c: number }).c;

    const lastDigest = this.db.prepare(
      'SELECT date FROM techradar_digests ORDER BY date DESC LIMIT 1'
    ).get() as { date: string } | undefined;

    return {
      totalEntries: total,
      bySource: Object.fromEntries(bySrc.map(r => [r.source, r.c])),
      byRing: Object.fromEntries(byRing.map(r => [r.ring, r.c])),
      watchedRepos: watched,
      lastDigest: lastDigest?.date ?? null,
    };
  }
}
