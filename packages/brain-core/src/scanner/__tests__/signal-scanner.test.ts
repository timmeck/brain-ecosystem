import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SignalScanner, runScannerMigration } from '../signal-scanner.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../github-collector.js', () => ({
  GitHubCollector: vi.fn().mockImplementation(() => ({
    abort: vi.fn(),
    reset: vi.fn(),
    collectEmerging: vi.fn().mockResolvedValue([]),
    collectTrending: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../hn-collector.js', () => ({
  HnCollector: vi.fn().mockImplementation(() => ({
    abort: vi.fn(),
    reset: vi.fn(),
    collectFrontpage: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../crypto-collector.js', () => ({
  CryptoCollector: vi.fn().mockImplementation(() => ({
    abort: vi.fn(),
    reset: vi.fn(),
    collectWatchlist: vi.fn().mockResolvedValue([]),
    collectTrending: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('../signal-scorer.js', () => ({
  scoreRepo: vi.fn().mockReturnValue({ total: 0, level: 'noise', phase: 'discovery' }),
  classifyWithHysteresis: vi.fn().mockReturnValue({ level: 'noise', peak: null, peakSince: null }),
  scoreCrypto: vi.fn().mockReturnValue({ score: 0, level: 'noise' }),
}));

describe('SignalScanner', () => {
  let db: Database.Database;
  let scanner: SignalScanner;

  beforeEach(() => {
    db = new Database(':memory:');
    runScannerMigration(db);
    scanner = new SignalScanner(db, { enabled: true, githubToken: 'fake-token' });
  });

  afterEach(() => {
    scanner.stop();
    db.close();
  });

  // ── 1. Creation ──────────────────────────────────────────────

  it('should create a SignalScanner instance', () => {
    expect(scanner).toBeInstanceOf(SignalScanner);
  });

  // ── 2. getStatus (initial) ───────────────────────────────────

  it('should return initial status with zero counts', () => {
    const status = scanner.getStatus();

    expect(status.running).toBe(false);
    expect(status.enabled).toBe(true);
    expect(status.last_scan).toBeNull();
    expect(status.total_repos).toBe(0);
    expect(status.total_active).toBe(0);
    expect(status.by_level).toEqual({ breakout: 0, signal: 0, watch: 0, noise: 0 });
    expect(status.next_scan_at).toBeNull();
  });

  // ── 3. getConfig ─────────────────────────────────────────────

  it('should return config with defaults merged', () => {
    const config = scanner.getConfig();

    expect(config.enabled).toBe(true);
    expect(config.githubToken).toBe('fake-token');
    expect(config.scanIntervalMs).toBe(21_600_000);
    expect(config.minStarsEmerging).toBe(15);
    expect(config.minStarsTrending).toBe(200);
    expect(config.maxReposPerScan).toBe(5000);
    expect(config.cryptoEnabled).toBe(true);
    expect(config.hnEnabled).toBe(true);
  });

  // ── 4. updateConfig ──────────────────────────────────────────

  it('should update config and return the merged result', () => {
    const updated = scanner.updateConfig({ minStarsEmerging: 50, cryptoEnabled: false });

    expect(updated.minStarsEmerging).toBe(50);
    expect(updated.cryptoEnabled).toBe(false);
    // Unchanged fields remain
    expect(updated.githubToken).toBe('fake-token');
    expect(updated.scanIntervalMs).toBe(21_600_000);

    // Verify via getConfig too
    const config = scanner.getConfig();
    expect(config.minStarsEmerging).toBe(50);
    expect(config.cryptoEnabled).toBe(false);
  });

  // ── 5. getSignals (empty) ────────────────────────────────────

  it('should return empty array for getSignals when no repos exist', () => {
    const breakouts = scanner.getSignals('breakout');
    const signals = scanner.getSignals('signal');
    const watches = scanner.getSignals('watch');
    const noise = scanner.getSignals('noise');

    expect(breakouts).toEqual([]);
    expect(signals).toEqual([]);
    expect(watches).toEqual([]);
    expect(noise).toEqual([]);
  });

  // ── 6. getTrending (empty) ───────────────────────────────────

  it('should return empty array for getTrending when no repos exist', () => {
    const trending = scanner.getTrending();
    expect(trending).toEqual([]);
  });

  // ── 7. searchRepos (empty) ───────────────────────────────────

  it('should return empty array for searchRepos when no repos exist', () => {
    const results = scanner.searchRepos('typescript');
    expect(results).toEqual([]);

    const withLang = scanner.searchRepos('', 'TypeScript');
    expect(withLang).toEqual([]);
  });

  // ── 8. getStats ──────────────────────────────────────────────

  it('should return initial stats with all zeroes', () => {
    const stats = scanner.getStats();

    expect(stats.total_repos).toBe(0);
    expect(stats.active_repos).toBe(0);
    expect(stats.by_language).toEqual([]);
    expect(stats.by_level).toEqual([]);
    expect(stats.hn_mentions).toBe(0);
    expect(stats.crypto_tokens).toBe(0);
    expect(stats.avg_score).toBe(0);
    expect(stats.last_scan).toBeNull();
  });

  // ── 9. getHnMentions (empty) ─────────────────────────────────

  it('should return empty array for getHnMentions when no mentions exist', () => {
    const mentions = scanner.getHnMentions();
    expect(mentions).toEqual([]);

    const limited = scanner.getHnMentions(10);
    expect(limited).toEqual([]);
  });

  // ── 10. getCryptoTokens (empty) ──────────────────────────────

  it('should return empty array for getCryptoTokens when no tokens exist', () => {
    const tokens = scanner.getCryptoTokens();
    expect(tokens).toEqual([]);

    const limited = scanner.getCryptoTokens(10);
    expect(limited).toEqual([]);
  });
});
