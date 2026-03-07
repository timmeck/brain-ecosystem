import Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import { GitHubCollector } from './github-collector.js';
import { HnCollector } from './hn-collector.js';
import { CryptoCollector } from './crypto-collector.js';
import { scoreRepo, classifyWithHysteresis, scoreCrypto } from './signal-scorer.js';
import type {
  ScannerConfig, ScanResult, ScannerStatus, ScannedRepo,
  SignalLevel, GitHubRepo, HnMention, CryptoToken, DailyStats,
} from './types.js';

const log = getLogger();

// ── Migration ───────────────────────────────────────────────

export function runScannerMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scanned_repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_id INTEGER UNIQUE NOT NULL,
      full_name TEXT NOT NULL,
      name TEXT NOT NULL,
      owner TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT,
      language TEXT,
      topics TEXT DEFAULT '[]',
      created_at TEXT,
      first_seen_at TEXT DEFAULT (datetime('now')),
      current_stars INTEGER DEFAULT 0,
      current_forks INTEGER DEFAULT 0,
      current_watchers INTEGER DEFAULT 0,
      current_issues INTEGER DEFAULT 0,
      signal_score REAL DEFAULT 0,
      signal_level TEXT DEFAULT 'noise',
      phase TEXT DEFAULT 'discovery',
      peak_signal_level TEXT,
      peak_level_since TEXT,
      star_velocity_24h INTEGER DEFAULT 0,
      star_velocity_7d INTEGER DEFAULT 0,
      star_acceleration REAL DEFAULT 0,
      last_scanned_at TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_scanned_repos_level ON scanned_repos(signal_level);
    CREATE INDEX IF NOT EXISTS idx_scanned_repos_score ON scanned_repos(signal_score DESC);
    CREATE INDEX IF NOT EXISTS idx_scanned_repos_language ON scanned_repos(language);
    CREATE INDEX IF NOT EXISTS idx_scanned_repos_stars ON scanned_repos(current_stars DESC);

    CREATE TABLE IF NOT EXISTS repo_daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      stars INTEGER DEFAULT 0,
      forks INTEGER DEFAULT 0,
      watchers INTEGER DEFAULT 0,
      issues INTEGER DEFAULT 0,
      star_velocity_24h INTEGER DEFAULT 0,
      star_velocity_7d INTEGER DEFAULT 0,
      star_acceleration REAL DEFAULT 0,
      fork_velocity_24h INTEGER DEFAULT 0,
      UNIQUE(repo_id, date)
    );

    CREATE TABLE IF NOT EXISTS hn_mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hn_id INTEGER UNIQUE,
      title TEXT NOT NULL,
      url TEXT,
      score INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      author TEXT,
      posted_at TEXT,
      detected_at TEXT DEFAULT (datetime('now')),
      repo_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS crypto_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coingecko_id TEXT UNIQUE NOT NULL,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      current_price REAL,
      market_cap REAL,
      market_cap_rank INTEGER,
      price_change_24h REAL,
      price_change_7d REAL,
      total_volume REAL,
      signal_score REAL DEFAULT 0,
      signal_level TEXT DEFAULT 'noise',
      last_scanned_at TEXT,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS scanner_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Scanner ─────────────────────────────────────────────────

export class SignalScanner {
  private db: Database.Database;
  private config: ScannerConfig;
  private github: GitHubCollector;
  private hn: HnCollector;
  private crypto: CryptoCollector;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scanning = false;
  private lastResult: ScanResult | null = null;

  constructor(db: Database.Database, config: Partial<ScannerConfig> & { githubToken?: string }) {
    this.db = db;
    this.config = {
      enabled: config.enabled ?? true,
      githubToken: config.githubToken ?? process.env['GITHUB_TOKEN'] ?? '',
      scanIntervalMs: config.scanIntervalMs ?? 21_600_000, // 6h
      minStarsEmerging: config.minStarsEmerging ?? 15,
      minStarsTrending: config.minStarsTrending ?? 200,
      maxReposPerScan: config.maxReposPerScan ?? 5000,
      cryptoEnabled: config.cryptoEnabled ?? true,
      hnEnabled: config.hnEnabled ?? true,
    };

    this.github = new GitHubCollector(this.config);
    this.hn = new HnCollector();
    this.crypto = new CryptoCollector();

    runScannerMigration(db);

    // Load last result from state
    this.loadLastResult();
  }

  /** Start periodic scanning. */
  start(): void {
    if (!this.config.enabled || this.timer) return;
    if (!this.config.githubToken) {
      log.warn('[scanner] No GITHUB_TOKEN — scanner disabled');
      return;
    }

    log.info(`[scanner] Starting (interval: ${this.config.scanIntervalMs}ms)`);

    // First scan after 30 seconds (let other engines initialize)
    setTimeout(() => {
      this.scan().catch(err => log.error(`[scanner] Initial scan error: ${(err as Error).message}`));
    }, 30_000);

    this.timer = setInterval(() => {
      this.scan().catch(err => log.error(`[scanner] Periodic scan error: ${(err as Error).message}`));
    }, this.config.scanIntervalMs);
  }

  /** Stop periodic scanning. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.abortScan();
  }

  /** Abort currently running scan. */
  abortScan(): void {
    this.github.abort();
    this.hn.abort();
    this.crypto.abort();
    this.scanning = false;
  }

  /** Run a full scan pipeline. */
  async scan(): Promise<ScanResult> {
    if (this.scanning) {
      log.warn('[scanner] Scan already in progress');
      return this.lastResult ?? createEmptyResult();
    }

    this.scanning = true;
    this.github.reset();
    this.hn.reset();
    this.crypto.reset();

    const started = new Date().toISOString();
    const start = Date.now();
    const errors: string[] = [];
    let reposDiscovered = 0;
    let reposUpdated = 0;
    let newBreakouts = 0;
    let newSignals = 0;
    let hnMentionsFound = 0;
    let cryptoTokensScanned = 0;

    try {
      // Step 1: GitHub Emerging Repos
      log.info('[scanner] Step 1/8: Collecting emerging repos...');
      let emerging: GitHubRepo[] = [];
      try {
        emerging = await this.github.collectEmerging();
        log.info(`[scanner] Found ${emerging.length} emerging repos`);
      } catch (err) { errors.push(`emerging: ${(err as Error).message}`); }

      // Step 2: GitHub Trending Repos
      log.info('[scanner] Step 2/8: Collecting trending repos...');
      let trending: GitHubRepo[] = [];
      try {
        trending = await this.github.collectTrending();
        log.info(`[scanner] Found ${trending.length} trending repos`);
      } catch (err) { errors.push(`trending: ${(err as Error).message}`); }

      // Step 3: Upsert repos + calculate velocity
      log.info('[scanner] Step 3/8: Upserting repos and calculating velocity...');
      const allRepos = dedupeRepos([...emerging, ...trending]);
      for (const ghRepo of allRepos) {
        const isNew = this.upsertRepo(ghRepo);
        if (isNew) reposDiscovered++;
        else reposUpdated++;
      }
      this.calculateVelocities();
      log.info(`[scanner] Upserted: ${reposDiscovered} new, ${reposUpdated} updated`);

      // Step 4: HN Mentions
      if (this.config.hnEnabled) {
        log.info('[scanner] Step 4/8: Scanning HackerNews...');
        try {
          const hnHits = await this.hn.collectFrontpage();
          hnMentionsFound = this.processHnMentions(hnHits);
          log.info(`[scanner] HN: ${hnMentionsFound} mentions processed`);
        } catch (err) { errors.push(`hn: ${(err as Error).message}`); }
      }

      // Step 5: Score all active repos
      log.info('[scanner] Step 5/8: Scoring repos...');
      this.scoreAllRepos();

      // Step 6: Classify with hysteresis
      log.info('[scanner] Step 6/8: Classifying signal levels...');
      const classResult = this.classifyAll();
      newBreakouts = classResult.newBreakouts;
      newSignals = classResult.newSignals;

      // Step 7: Crypto scan
      if (this.config.cryptoEnabled) {
        log.info('[scanner] Step 7/8: Scanning crypto...');
        try {
          cryptoTokensScanned = await this.scanCrypto();
          log.info(`[scanner] Crypto: ${cryptoTokensScanned} tokens scanned`);
        } catch (err) { errors.push(`crypto: ${(err as Error).message}`); }
      }

      // Step 8: Update state
      log.info('[scanner] Step 8/8: Updating state...');
    } catch (err) {
      errors.push(`fatal: ${(err as Error).message}`);
      log.error(`[scanner] Fatal error: ${(err as Error).message}`);
    } finally {
      this.scanning = false;
    }

    const result: ScanResult = {
      started_at: started,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
      repos_discovered: reposDiscovered,
      repos_updated: reposUpdated,
      new_breakouts: newBreakouts,
      new_signals: newSignals,
      hn_mentions_found: hnMentionsFound,
      crypto_tokens_scanned: cryptoTokensScanned,
      errors,
    };

    this.lastResult = result;
    this.saveState('last_scan', JSON.stringify(result));
    this.saveState('last_scan_at', result.finished_at);

    log.info(`[scanner] Scan complete in ${result.duration_ms}ms — ${reposDiscovered} new, ${newBreakouts} breakouts, ${newSignals} signals`);
    return result;
  }

  // ── Read Methods ─────────────────────────────────────────

  getStatus(): ScannerStatus {
    const counts = this.db.prepare(`
      SELECT signal_level, COUNT(*) as count FROM scanned_repos
      WHERE is_active = 1 GROUP BY signal_level
    `).all() as Array<{ signal_level: string; count: number }>;

    const byLevel: Record<SignalLevel, number> = { breakout: 0, signal: 0, watch: 0, noise: 0 };
    let totalActive = 0;
    for (const r of counts) {
      byLevel[r.signal_level as SignalLevel] = r.count;
      totalActive += r.count;
    }

    const totalRepos = (this.db.prepare('SELECT COUNT(*) as c FROM scanned_repos').get() as { c: number }).c;
    const nextScan = this.timer ? new Date(Date.now() + this.config.scanIntervalMs).toISOString() : null;

    return {
      running: this.scanning,
      enabled: this.config.enabled && !!this.config.githubToken,
      last_scan: this.lastResult,
      total_repos: totalRepos,
      total_active: totalActive,
      by_level: byLevel,
      next_scan_at: nextScan,
    };
  }

  getSignals(level: SignalLevel, limit = 50): ScannedRepo[] {
    const rows = this.db.prepare(`
      SELECT * FROM scanned_repos
      WHERE signal_level = ? AND is_active = 1
      ORDER BY signal_score DESC
      LIMIT ?
    `).all(level, limit) as ScannedRepo[];
    return rows.map(deserializeRepo);
  }

  getTrending(limit = 30): ScannedRepo[] {
    const rows = this.db.prepare(`
      SELECT * FROM scanned_repos
      WHERE is_active = 1
      ORDER BY star_velocity_24h DESC
      LIMIT ?
    `).all(limit) as ScannedRepo[];
    return rows.map(deserializeRepo);
  }

  searchRepos(query: string, language?: string, limit = 50): ScannedRepo[] {
    let sql = 'SELECT * FROM scanned_repos WHERE is_active = 1';
    const params: unknown[] = [];

    if (query) {
      sql += ' AND (full_name LIKE ? OR description LIKE ? OR topics LIKE ?)';
      const like = `%${query}%`;
      params.push(like, like, like);
    }
    if (language) {
      sql += ' AND language = ?';
      params.push(language);
    }

    sql += ' ORDER BY signal_score DESC LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as ScannedRepo[];
    return rows.map(deserializeRepo);
  }

  getRepo(githubId: number): (ScannedRepo & { daily_stats: DailyStats[] }) | null {
    const row = this.db.prepare('SELECT * FROM scanned_repos WHERE github_id = ?').get(githubId) as ScannedRepo | undefined;
    if (!row) return null;
    const repo = deserializeRepo(row);
    const daily = this.db.prepare(`
      SELECT * FROM repo_daily_stats WHERE repo_id = ?
      ORDER BY date DESC LIMIT 30
    `).all(repo.id!) as DailyStats[];
    return { ...repo, daily_stats: daily };
  }

  getHnMentions(limit = 50): HnMention[] {
    return this.db.prepare(`
      SELECT * FROM hn_mentions ORDER BY score DESC LIMIT ?
    `).all(limit) as HnMention[];
  }

  getCryptoTokens(limit = 50): CryptoToken[] {
    return this.db.prepare(`
      SELECT * FROM crypto_tokens WHERE is_active = 1
      ORDER BY signal_score DESC LIMIT ?
    `).all(limit) as CryptoToken[];
  }

  getCryptoTrending(): CryptoToken[] {
    return this.db.prepare(`
      SELECT * FROM crypto_tokens WHERE is_active = 1
      ORDER BY ABS(COALESCE(price_change_24h, 0)) DESC LIMIT 20
    `).all() as CryptoToken[];
  }

  getStats(): Record<string, unknown> {
    const totalRepos = (this.db.prepare('SELECT COUNT(*) as c FROM scanned_repos').get() as { c: number }).c;
    const activeRepos = (this.db.prepare('SELECT COUNT(*) as c FROM scanned_repos WHERE is_active = 1').get() as { c: number }).c;
    const byLanguage = this.db.prepare(`
      SELECT language, COUNT(*) as count FROM scanned_repos
      WHERE is_active = 1 AND language IS NOT NULL
      GROUP BY language ORDER BY count DESC LIMIT 20
    `).all() as Array<{ language: string; count: number }>;
    const byLevel = this.db.prepare(`
      SELECT signal_level, COUNT(*) as count FROM scanned_repos
      WHERE is_active = 1 GROUP BY signal_level
    `).all() as Array<{ signal_level: string; count: number }>;
    const hnTotal = (this.db.prepare('SELECT COUNT(*) as c FROM hn_mentions').get() as { c: number }).c;
    const cryptoTotal = (this.db.prepare('SELECT COUNT(*) as c FROM crypto_tokens WHERE is_active = 1').get() as { c: number }).c;
    const avgScore = (this.db.prepare('SELECT AVG(signal_score) as avg FROM scanned_repos WHERE is_active = 1').get() as { avg: number | null }).avg ?? 0;

    return {
      total_repos: totalRepos,
      active_repos: activeRepos,
      by_language: byLanguage,
      by_level: byLevel,
      hn_mentions: hnTotal,
      crypto_tokens: cryptoTotal,
      avg_score: Math.round(avgScore * 100) / 100,
      last_scan: this.lastResult,
    };
  }

  getConfig(): ScannerConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<ScannerConfig>): ScannerConfig {
    Object.assign(this.config, updates);
    return { ...this.config };
  }

  // ── Internal Write Methods ───────────────────────────────

  /** Upsert a GitHub repo. Returns true if new. */
  private upsertRepo(gh: GitHubRepo): boolean {
    const existing = this.db.prepare('SELECT id FROM scanned_repos WHERE github_id = ?').get(gh.id);
    const now = new Date().toISOString();

    if (!existing) {
      this.db.prepare(`
        INSERT INTO scanned_repos (github_id, full_name, name, owner, url, description, language, topics, created_at, current_stars, current_forks, current_watchers, current_issues, last_scanned_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        gh.id, gh.full_name, gh.name, gh.owner.login, gh.html_url,
        gh.description, gh.language, JSON.stringify(gh.topics ?? []),
        gh.created_at, gh.stargazers_count, gh.forks_count,
        gh.watchers_count, gh.open_issues_count, now,
      );

      // Record first daily stats
      const repoId = (this.db.prepare('SELECT id FROM scanned_repos WHERE github_id = ?').get(gh.id) as { id: number }).id;
      this.recordDailyStats(repoId, gh.stargazers_count, gh.forks_count, gh.watchers_count, gh.open_issues_count);
      return true;
    }

    // Update existing
    this.db.prepare(`
      UPDATE scanned_repos SET
        current_stars = ?, current_forks = ?, current_watchers = ?,
        current_issues = ?, description = ?, language = ?,
        topics = ?, last_scanned_at = ?
      WHERE github_id = ?
    `).run(
      gh.stargazers_count, gh.forks_count, gh.watchers_count,
      gh.open_issues_count, gh.description, gh.language,
      JSON.stringify(gh.topics ?? []), now, gh.id,
    );

    // Record daily stats
    const row = this.db.prepare('SELECT id FROM scanned_repos WHERE github_id = ?').get(gh.id) as { id: number };
    this.recordDailyStats(row.id, gh.stargazers_count, gh.forks_count, gh.watchers_count, gh.open_issues_count);
    return false;
  }

  /** Record daily stats (UPSERT). */
  private recordDailyStats(repoId: number, stars: number, forks: number, watchers: number, issues: number): void {
    const today = new Date().toISOString().split('T')[0];
    this.db.prepare(`
      INSERT INTO repo_daily_stats (repo_id, date, stars, forks, watchers, issues)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id, date) DO UPDATE SET
        stars = excluded.stars, forks = excluded.forks,
        watchers = excluded.watchers, issues = excluded.issues
    `).run(repoId, today, stars, forks, watchers, issues);
  }

  /** Calculate velocity for all active repos from daily_stats. */
  private calculateVelocities(): void {
    const repos = this.db.prepare('SELECT id FROM scanned_repos WHERE is_active = 1').all() as Array<{ id: number }>;
    const today = new Date().toISOString().split('T')[0];

    for (const { id } of repos) {
      const stats = this.db.prepare(`
        SELECT date, stars FROM repo_daily_stats
        WHERE repo_id = ? ORDER BY date DESC LIMIT 8
      `).all(id) as Array<{ date: string; stars: number }>;

      if (stats.length < 2) continue;

      const todayStars = stats[0].stars;
      const yesterday = stats.find(s => s.date !== today);
      const weekAgo = stats[stats.length - 1];

      const vel24h = yesterday ? Math.max(0, todayStars - yesterday.stars) : 0;
      const vel7d = weekAgo ? Math.max(0, todayStars - weekAgo.stars) : 0;

      // Acceleration: change in velocity
      let accel = 0;
      if (stats.length >= 3) {
        const prevVel = stats[1].stars - stats[2].stars;
        const curVel = stats[0].stars - stats[1].stars;
        accel = curVel - prevVel;
      }

      this.db.prepare(`
        UPDATE scanned_repos SET star_velocity_24h = ?, star_velocity_7d = ?, star_acceleration = ?
        WHERE id = ?
      `).run(vel24h, vel7d, accel, id);

      // Also update today's daily_stats
      this.db.prepare(`
        UPDATE repo_daily_stats SET star_velocity_24h = ?, star_velocity_7d = ?, star_acceleration = ?
        WHERE repo_id = ? AND date = ?
      `).run(vel24h, vel7d, accel, id, today);
    }
  }

  /** Process HN mentions and link to repos. */
  private processHnMentions(hits: Array<{ objectID: string; title: string; url: string | null; points: number; num_comments: number; author: string; created_at: string }>): number {
    let count = 0;
    for (const hit of hits) {
      const hnId = parseInt(hit.objectID, 10);
      const existing = this.db.prepare('SELECT id FROM hn_mentions WHERE hn_id = ?').get(hnId);
      if (existing) continue;

      // Try to match URL to a repo
      let repoId: number | null = null;
      if (hit.url && hit.url.includes('github.com')) {
        const match = hit.url.match(/github\.com\/([^/]+\/[^/]+)/);
        if (match) {
          const repo = this.db.prepare('SELECT id FROM scanned_repos WHERE full_name = ?').get(match[1]) as { id: number } | undefined;
          repoId = repo?.id ?? null;
        }
      }

      this.db.prepare(`
        INSERT INTO hn_mentions (hn_id, title, url, score, comment_count, author, posted_at, repo_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(hnId, hit.title, hit.url, hit.points, hit.num_comments, hit.author, hit.created_at, repoId);
      count++;
    }
    return count;
  }

  /** Score all active repos. */
  private scoreAllRepos(): void {
    const repos = this.db.prepare(`
      SELECT * FROM scanned_repos WHERE is_active = 1
    `).all() as ScannedRepo[];

    for (const repo of repos) {
      // Get HN mentions for this repo
      const mentions = repo.id
        ? this.db.prepare('SELECT score, comment_count FROM hn_mentions WHERE repo_id = ?').all(repo.id) as Array<{ score: number; comment_count: number }>
        : [];

      const deserialized = deserializeRepo(repo);
      const breakdown = scoreRepo(deserialized, mentions);

      this.db.prepare(`
        UPDATE scanned_repos SET signal_score = ? WHERE id = ?
      `).run(breakdown.total, repo.id);
    }
  }

  /** Classify all repos with hysteresis. Returns new breakout/signal counts. */
  private classifyAll(): { newBreakouts: number; newSignals: number } {
    const repos = this.db.prepare(`
      SELECT id, signal_score, signal_level, peak_signal_level, peak_level_since
      FROM scanned_repos WHERE is_active = 1
    `).all() as Array<{ id: number; signal_score: number; signal_level: string; peak_signal_level: string | null; peak_level_since: string | null }>;

    let newBreakouts = 0;
    let newSignals = 0;

    for (const repo of repos) {
      const { level, peak, peakSince } = classifyWithHysteresis(
        repo.signal_score,
        repo.signal_level as SignalLevel,
        repo.peak_signal_level as SignalLevel | null,
        repo.peak_level_since,
      );

      if (level !== repo.signal_level) {
        if (level === 'breakout' && repo.signal_level !== 'breakout') newBreakouts++;
        if (level === 'signal' && repo.signal_level !== 'signal' && repo.signal_level !== 'breakout') newSignals++;
      }

      this.db.prepare(`
        UPDATE scanned_repos SET signal_level = ?, phase = ?, peak_signal_level = ?, peak_level_since = ?
        WHERE id = ?
      `).run(level, this.getPhase(repo.signal_score), peak, peakSince, repo.id);
    }

    return { newBreakouts, newSignals };
  }

  private getPhase(_score: number): string {
    // Phase is based on stars, but we need the stars from DB
    // This is a simplified version; real phase is set during scoring
    return 'discovery';
  }

  /** Scan crypto tokens. */
  private async scanCrypto(): Promise<number> {
    let count = 0;
    const now = new Date().toISOString();

    // Watchlist
    const watchlist = await this.crypto.collectWatchlist();
    for (const coin of watchlist) {
      this.upsertCrypto(coin, 'watchlist', now);
      count++;
    }

    // Trending
    const trending = await this.crypto.collectTrending();
    if (trending) {
      for (const item of trending.coins) {
        // Trending API returns minimal data; mark as trending
        this.db.prepare(`
          INSERT INTO crypto_tokens (coingecko_id, symbol, name, category, market_cap_rank, last_scanned_at)
          VALUES (?, ?, ?, 'trending', ?, ?)
          ON CONFLICT(coingecko_id) DO UPDATE SET category = 'trending', last_scanned_at = ?
        `).run(item.item.id, item.item.symbol, item.item.name, item.item.market_cap_rank, now, now);
        count++;
      }
    }

    return count;
  }

  private upsertCrypto(coin: { id: string; symbol: string; name: string; current_price: number; market_cap: number; market_cap_rank: number; price_change_percentage_24h: number; price_change_percentage_7d_in_currency?: number; total_volume: number }, category: string, now: string): void {
    const { score, level } = scoreCrypto(
      coin.price_change_percentage_24h,
      coin.price_change_percentage_7d_in_currency ?? null,
      coin.total_volume,
      coin.market_cap,
    );

    this.db.prepare(`
      INSERT INTO crypto_tokens (coingecko_id, symbol, name, category, current_price, market_cap, market_cap_rank, price_change_24h, price_change_7d, total_volume, signal_score, signal_level, last_scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(coingecko_id) DO UPDATE SET
        current_price = excluded.current_price, market_cap = excluded.market_cap,
        market_cap_rank = excluded.market_cap_rank, price_change_24h = excluded.price_change_24h,
        price_change_7d = excluded.price_change_7d, total_volume = excluded.total_volume,
        signal_score = excluded.signal_score, signal_level = excluded.signal_level,
        last_scanned_at = excluded.last_scanned_at
    `).run(
      coin.id, coin.symbol, coin.name, category,
      coin.current_price, coin.market_cap, coin.market_cap_rank,
      coin.price_change_percentage_24h, coin.price_change_percentage_7d_in_currency ?? null,
      coin.total_volume, score, level, now,
    );
  }

  // ── Bulk Import from Reposignal API ─────────────────────────

  /**
   * Import repos from the reposignal.dev API into scanned_repos.
   * Fetches all signals from the live API and upserts them.
   */
  async importFromApi(apiUrl: string = 'https://www.reposignal.dev/api/signals', options: {
    limit?: number; level?: string; adminKey?: string;
  } = {}): Promise<{ repos: number; skipped: number; duration_ms: number }> {
    const start = Date.now();
    const limit = options.limit ?? 50000;
    let url = `${apiUrl}?limit=${limit}`;
    if (options.level) url += `&level=${options.level}`;
    if (options.adminKey) url += `&key=${options.adminKey}`;

    log.info(`[scanner] Fetching repos from ${apiUrl} (limit=${limit})...`);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`API request failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as { signals: Array<Record<string, unknown>>; count: number };
    const signals = data.signals ?? [];
    log.info(`[scanner] Received ${signals.length} repos from API`);

    let repos = 0, skipped = 0;

    const insertRepo = this.db.prepare(`
      INSERT INTO scanned_repos (
        github_id, full_name, name, owner, url, description, language, topics,
        created_at, first_seen_at, current_stars, current_forks, current_watchers, current_issues,
        signal_score, signal_level, phase, peak_signal_level, peak_level_since,
        star_velocity_24h, star_velocity_7d, star_acceleration, last_scanned_at, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(github_id) DO UPDATE SET
        current_stars = excluded.current_stars, current_forks = excluded.current_forks,
        current_watchers = excluded.current_watchers, current_issues = excluded.current_issues,
        signal_score = excluded.signal_score, signal_level = excluded.signal_level,
        phase = excluded.phase, star_velocity_24h = excluded.star_velocity_24h,
        star_velocity_7d = excluded.star_velocity_7d, star_acceleration = excluded.star_acceleration,
        last_scanned_at = excluded.last_scanned_at, description = excluded.description,
        language = excluded.language, topics = excluded.topics
    `);

    const importBatch = this.db.transaction(() => {
      for (const r of signals) {
        const ghId = r.github_id as number;
        if (!ghId) { skipped++; continue; }
        try {
          const topics = Array.isArray(r.topics) ? JSON.stringify(r.topics) : (r.topics as string ?? '[]');
          insertRepo.run(
            ghId, r.full_name, r.name ?? (r.full_name as string).split('/')[1],
            r.owner ?? (r.full_name as string).split('/')[0],
            r.url ?? `https://github.com/${r.full_name}`,
            r.description, r.language, topics,
            r.created_at, r.first_seen_at ?? new Date().toISOString(),
            r.current_stars ?? 0, r.current_forks ?? 0, r.current_watchers ?? 0, r.current_issues ?? 0,
            r.signal_score ?? 0, r.signal_level ?? 'noise', r.phase ?? 'discovery',
            r.peak_signal_level ?? r.signal_level, r.peak_level_since,
            r.star_velocity_24h ?? 0, r.star_velocity_7d ?? 0, r.star_acceleration ?? 0,
            r.last_scanned_at, r.is_active ?? 1,
          );
          repos++;
        } catch {
          skipped++;
        }
      }
    });
    importBatch();

    const duration_ms = Date.now() - start;
    log.info(`[scanner] API import complete: ${repos} repos imported, ${skipped} skipped in ${duration_ms}ms`);

    this.saveState('api_import', JSON.stringify({ repos, skipped, duration_ms, source: apiUrl, importedAt: new Date().toISOString() }));

    return { repos, skipped, duration_ms };
  }

  // ── Bulk Import from Reposignal DB ────────────────────────

  /**
   * Import repos from a reposignal/aisurvival SQLite database directly into scanned_repos.
   * Copies: repositories → scanned_repos, repo_daily_stats → repo_daily_stats,
   *         hn_mentions → hn_mentions, crypto_tokens → crypto_tokens.
   */
  importFromReposignal(dbPath: string, options: { minLevel?: string } = {}): {
    repos: number; dailyStats: number; hnMentions: number; crypto: number; skipped: number; duration_ms: number;
  } {
    const start = Date.now();
    const minLevel = options.minLevel ?? 'noise'; // Import everything by default
    const extDb = new Database(dbPath, { readonly: true });
    let repos = 0, dailyStats = 0, hnMentions = 0, crypto = 0, skipped = 0;

    try {
      // 1. Import repositories → scanned_repos
      const levelOrder = ['noise', 'watch', 'signal', 'breakout'];
      const minIdx = levelOrder.indexOf(minLevel);
      const allowed = levelOrder.filter((_, i) => i >= minIdx);
      const placeholders = allowed.map(() => '?').join(',');

      const extRepos = extDb.prepare(`
        SELECT github_id, full_name, name, owner, url, description, language, topics,
               created_at, first_seen_at, current_stars, current_forks, current_watchers, current_issues,
               signal_score, signal_level, phase, star_velocity_24h, star_velocity_7d, star_acceleration,
               last_scanned_at, is_active
        FROM repositories
        WHERE signal_level IN (${placeholders})
        ORDER BY signal_score DESC
      `).all(...allowed) as Array<Record<string, unknown>>;

      log.info(`[scanner] Importing ${extRepos.length} repos from reposignal DB...`);

      const insertRepo = this.db.prepare(`
        INSERT INTO scanned_repos (
          github_id, full_name, name, owner, url, description, language, topics,
          created_at, first_seen_at, current_stars, current_forks, current_watchers, current_issues,
          signal_score, signal_level, phase, peak_signal_level, peak_level_since,
          star_velocity_24h, star_velocity_7d, star_acceleration, last_scanned_at, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(github_id) DO UPDATE SET
          current_stars = excluded.current_stars, current_forks = excluded.current_forks,
          current_watchers = excluded.current_watchers, current_issues = excluded.current_issues,
          signal_score = excluded.signal_score, signal_level = excluded.signal_level,
          phase = excluded.phase, star_velocity_24h = excluded.star_velocity_24h,
          star_velocity_7d = excluded.star_velocity_7d, star_acceleration = excluded.star_acceleration,
          last_scanned_at = excluded.last_scanned_at, description = excluded.description,
          language = excluded.language, topics = excluded.topics
      `);

      const importRepos = this.db.transaction(() => {
        for (const r of extRepos) {
          try {
            insertRepo.run(
              r.github_id, r.full_name, r.name, r.owner,
              r.url ?? `https://github.com/${r.full_name}`,
              r.description, r.language, r.topics ?? '[]',
              r.created_at, r.first_seen_at ?? new Date().toISOString(),
              r.current_stars ?? 0, r.current_forks ?? 0, r.current_watchers ?? 0, r.current_issues ?? 0,
              r.signal_score ?? 0, r.signal_level ?? 'noise', r.phase ?? 'discovery',
              r.signal_level, new Date().toISOString(),
              r.star_velocity_24h ?? 0, r.star_velocity_7d ?? 0, r.star_acceleration ?? 0,
              r.last_scanned_at, r.is_active ?? 1,
            );
            repos++;
          } catch {
            skipped++;
          }
        }
      });
      importRepos();
      log.info(`[scanner] Imported ${repos} repos (${skipped} skipped)`);

      // 2. Import repo_daily_stats (need to map repo_id from github_id)
      try {
        const idMap = new Map<number, number>();
        const mappings = this.db.prepare('SELECT id, github_id FROM scanned_repos').all() as Array<{ id: number; github_id: number }>;
        for (const m of mappings) idMap.set(m.github_id, m.id);

        // Get external repo id → github_id mapping
        const extIdMap = new Map<number, number>();
        const extMappings = extDb.prepare('SELECT id, github_id FROM repositories').all() as Array<{ id: number; github_id: number }>;
        for (const m of extMappings) extIdMap.set(m.id, m.github_id);

        const extStats = extDb.prepare(`
          SELECT repo_id, date, stars, forks, watchers, issues,
                 star_velocity_24h, star_velocity_7d, star_acceleration, fork_velocity_24h
          FROM repo_daily_stats ORDER BY date DESC
        `).all() as Array<Record<string, unknown>>;

        const insertStats = this.db.prepare(`
          INSERT INTO repo_daily_stats (repo_id, date, stars, forks, watchers, issues,
            star_velocity_24h, star_velocity_7d, star_acceleration, fork_velocity_24h)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(repo_id, date) DO NOTHING
        `);

        const importStats = this.db.transaction(() => {
          for (const s of extStats) {
            const ghId = extIdMap.get(s.repo_id as number);
            if (!ghId) continue;
            const localId = idMap.get(ghId);
            if (!localId) continue;
            try {
              insertStats.run(localId, s.date, s.stars ?? 0, s.forks ?? 0, s.watchers ?? 0, s.issues ?? 0,
                s.star_velocity_24h ?? 0, s.star_velocity_7d ?? 0, s.star_acceleration ?? 0, s.fork_velocity_24h ?? 0);
              dailyStats++;
            } catch { /* skip duplicates */ }
          }
        });
        importStats();
        log.info(`[scanner] Imported ${dailyStats} daily stats`);
      } catch (err) {
        log.warn(`[scanner] daily_stats import skipped: ${(err as Error).message}`);
      }

      // 3. Import hn_mentions
      try {
        const extHn = extDb.prepare(`
          SELECT hn_id, title, url, score, comment_count, author, posted_at, repo_id
          FROM hn_mentions ORDER BY score DESC
        `).all() as Array<Record<string, unknown>>;

        const insertHn = this.db.prepare(`
          INSERT INTO hn_mentions (hn_id, title, url, score, comment_count, author, posted_at, repo_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(hn_id) DO NOTHING
        `);

        // Map ext repo_id to local repo_id via github_id
        const idMap = new Map<number, number>();
        const mappings = this.db.prepare('SELECT id, github_id FROM scanned_repos').all() as Array<{ id: number; github_id: number }>;
        for (const m of mappings) idMap.set(m.github_id, m.id);
        const extIdMap = new Map<number, number>();
        try {
          const extMappings = extDb.prepare('SELECT id, github_id FROM repositories').all() as Array<{ id: number; github_id: number }>;
          for (const m of extMappings) extIdMap.set(m.id, m.github_id);
        } catch { /* no repositories table */ }

        const importHn = this.db.transaction(() => {
          for (const h of extHn) {
            let localRepoId: number | null = null;
            if (h.repo_id) {
              const ghId = extIdMap.get(h.repo_id as number);
              if (ghId) localRepoId = idMap.get(ghId) ?? null;
            }
            try {
              insertHn.run(h.hn_id, h.title, h.url, h.score ?? 0, h.comment_count ?? 0, h.author, h.posted_at, localRepoId);
              hnMentions++;
            } catch { /* skip dupes */ }
          }
        });
        importHn();
        log.info(`[scanner] Imported ${hnMentions} HN mentions`);
      } catch (err) {
        log.warn(`[scanner] hn_mentions import skipped: ${(err as Error).message}`);
      }

      // 4. Import crypto_tokens
      try {
        const extCrypto = extDb.prepare(`
          SELECT coingecko_id, symbol, name, category, current_price, market_cap, market_cap_rank,
                 price_change_24h, price_change_7d, total_volume, signal_score, signal_level,
                 last_scanned_at, is_active
          FROM crypto_tokens
        `).all() as Array<Record<string, unknown>>;

        const insertCrypto = this.db.prepare(`
          INSERT INTO crypto_tokens (coingecko_id, symbol, name, category, current_price, market_cap, market_cap_rank,
            price_change_24h, price_change_7d, total_volume, signal_score, signal_level, last_scanned_at, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(coingecko_id) DO UPDATE SET
            current_price = excluded.current_price, market_cap = excluded.market_cap,
            signal_score = excluded.signal_score, signal_level = excluded.signal_level
        `);

        const importCrypto = this.db.transaction(() => {
          for (const c of extCrypto) {
            try {
              insertCrypto.run(c.coingecko_id, c.symbol, c.name, c.category,
                c.current_price, c.market_cap, c.market_cap_rank,
                c.price_change_24h, c.price_change_7d, c.total_volume,
                c.signal_score ?? 0, c.signal_level ?? 'noise', c.last_scanned_at, c.is_active ?? 1);
              crypto++;
            } catch { /* skip */ }
          }
        });
        importCrypto();
        log.info(`[scanner] Imported ${crypto} crypto tokens`);
      } catch (err) {
        log.warn(`[scanner] crypto_tokens import skipped: ${(err as Error).message}`);
      }

    } finally {
      extDb.close();
    }

    const duration_ms = Date.now() - start;
    log.info(`[scanner] Reposignal import complete: ${repos} repos, ${dailyStats} stats, ${hnMentions} HN, ${crypto} crypto in ${duration_ms}ms`);

    // Save import state
    this.saveState('reposignal_import', JSON.stringify({ repos, dailyStats, hnMentions, crypto, skipped, duration_ms, importedAt: new Date().toISOString() }));

    return { repos, dailyStats, hnMentions, crypto, skipped, duration_ms };
  }

  // ── State Persistence ────────────────────────────────────

  private saveState(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO scanner_state (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `).run(key, value);
  }

  private loadLastResult(): void {
    const row = this.db.prepare('SELECT value FROM scanner_state WHERE key = ?').get('last_scan') as { value: string } | undefined;
    if (row) {
      try { this.lastResult = JSON.parse(row.value); } catch { /* ignore */ }
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────

function dedupeRepos(repos: GitHubRepo[]): GitHubRepo[] {
  const seen = new Set<number>();
  return repos.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

function deserializeRepo(row: ScannedRepo): ScannedRepo {
  return {
    ...row,
    topics: typeof row.topics === 'string' ? JSON.parse(row.topics as string) : (row.topics ?? []),
    is_active: Boolean(row.is_active),
  };
}

function createEmptyResult(): ScanResult {
  const now = new Date().toISOString();
  return {
    started_at: now, finished_at: now, duration_ms: 0,
    repos_discovered: 0, repos_updated: 0, new_breakouts: 0,
    new_signals: 0, hn_mentions_found: 0, crypto_tokens_scanned: 0,
    errors: ['Scan already in progress'],
  };
}
