import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
import type { CodeMinerConfig, RepoContent, CodeMinerSummary } from './types.js';

// ── Migration ────────────────────────────────────────────

export function runCodeMinerMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS repo_contents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      content TEXT,
      content_hash TEXT,
      fetched_at TEXT DEFAULT (datetime('now')),
      UNIQUE(repo_id, file_path)
    );
    CREATE INDEX IF NOT EXISTS idx_repo_contents_repo ON repo_contents(repo_id);
  `);
}

// ── CodeMiner ────────────────────────────────────────────

export class CodeMiner {
  private db: Database.Database;
  private githubToken: string | null;
  private maxRepos: number;
  private batchSize: number;
  private delayMs: number;
  private aborted = false;
  private mining = false;
  private lastMinedAt: string | null = null;
  private log = getLogger();

  constructor(db: Database.Database, config: CodeMinerConfig = {}) {
    this.db = db;
    this.githubToken = config.githubToken ?? process.env.GITHUB_TOKEN ?? null;
    this.maxRepos = config.maxRepos ?? 50;
    this.batchSize = config.batchSize ?? 50;
    this.delayMs = config.delayMs ?? 1200;
    runCodeMinerMigration(db);
  }

  /** Bootstrap: fetch contents for all signal+breakout repos that haven't been mined yet. */
  async bootstrap(): Promise<{ mined: number; errors: number }> {
    if (!this.githubToken) {
      this.log.info('[code-miner] No GITHUB_TOKEN — skipping bootstrap');
      return { mined: 0, errors: 0 };
    }

    const unmined = this.db.prepare(`
      SELECT sr.id, sr.full_name
      FROM scanned_repos sr
      WHERE sr.signal_level IN ('breakout', 'signal')
        AND sr.id NOT IN (SELECT DISTINCT repo_id FROM repo_contents)
      ORDER BY sr.signal_score DESC
      LIMIT ?
    `).all(this.maxRepos) as Array<{ id: number; full_name: string }>;

    if (unmined.length === 0) {
      this.log.info('[code-miner] Bootstrap: all top repos already mined');
      return { mined: 0, errors: 0 };
    }

    this.log.info(`[code-miner] Bootstrap: mining ${unmined.length} repos`);
    return this.mineRepos(unmined);
  }

  /** Incremental: fetch contents for new/changed top repos. */
  async mine(): Promise<{ mined: number; errors: number }> {
    if (this.mining || !this.githubToken) {
      return { mined: 0, errors: 0 };
    }

    const newRepos = this.db.prepare(`
      SELECT sr.id, sr.full_name
      FROM scanned_repos sr
      WHERE sr.signal_level IN ('breakout', 'signal')
        AND sr.id NOT IN (SELECT DISTINCT repo_id FROM repo_contents)
      ORDER BY sr.signal_score DESC
      LIMIT ?
    `).all(this.batchSize) as Array<{ id: number; full_name: string }>;

    if (newRepos.length === 0) return { mined: 0, errors: 0 };
    return this.mineRepos(newRepos);
  }

  /** Fetch README, package.json, and root tree for a single repo. */
  async fetchRepoContents(fullName: string): Promise<Array<{ path: string; content: string | null }>> {
    if (!this.githubToken) return [];
    const results: Array<{ path: string; content: string | null }> = [];
    const headers = {
      Authorization: `token ${this.githubToken}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'brain-ecosystem-code-miner',
    };

    // 1. README
    try {
      const readmeRes = await fetch(`https://api.github.com/repos/${fullName}/readme`, { headers });
      if (readmeRes.ok) {
        const data = await readmeRes.json() as { content?: string; encoding?: string };
        if (data.content && data.encoding === 'base64') {
          const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
          results.push({ path: 'README.md', content: decoded.substring(0, 100_000) });
        }
      }
    } catch { /* skip */ }

    await this.delay();

    // 2. package.json
    try {
      const pkgRes = await fetch(`https://api.github.com/repos/${fullName}/contents/package.json`, { headers });
      if (pkgRes.ok) {
        const data = await pkgRes.json() as { content?: string; encoding?: string };
        if (data.content && data.encoding === 'base64') {
          const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
          results.push({ path: 'package.json', content: decoded.substring(0, 100_000) });
        }
      }
    } catch { /* skip */ }

    await this.delay();

    // 3. Root directory listing
    try {
      const treeRes = await fetch(`https://api.github.com/repos/${fullName}/contents`, { headers });
      if (treeRes.ok) {
        const items = await treeRes.json() as Array<{ name: string; type: string; size?: number }>;
        const listing = items.map(i => `${i.type === 'dir' ? 'd' : 'f'} ${i.name}${i.size ? ` (${i.size}B)` : ''}`).join('\n');
        results.push({ path: 'tree', content: listing });
      }
    } catch { /* skip */ }

    return results;
  }

  /** Get stored content for a repo. */
  getRepoContent(repoId: number, filePath: string): RepoContent | null {
    return this.db.prepare(
      'SELECT * FROM repo_contents WHERE repo_id = ? AND file_path = ?',
    ).get(repoId, filePath) as RepoContent | null;
  }

  /** Aggregate: which npm packages are used most across mined repos. */
  getTopDependencies(limit = 20): Array<{ name: string; count: number }> {
    const rows = this.db.prepare(`
      SELECT content FROM repo_contents WHERE file_path = 'package.json' AND content IS NOT NULL
    `).all() as Array<{ content: string }>;

    const counts = new Map<string, number>();
    for (const row of rows) {
      try {
        const pkg = JSON.parse(row.content) as Record<string, unknown>;
        const deps = { ...(pkg.dependencies as Record<string, string> ?? {}), ...(pkg.devDependencies as Record<string, string> ?? {}) };
        for (const name of Object.keys(deps)) {
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      } catch { /* skip invalid JSON */ }
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  /** Analyze package.json for architecture patterns (scripts, engines, type). */
  getArchitecturePatterns(): Record<string, number> {
    const rows = this.db.prepare(`
      SELECT content FROM repo_contents WHERE file_path = 'package.json' AND content IS NOT NULL
    `).all() as Array<{ content: string }>;

    const patterns: Record<string, number> = {};
    for (const row of rows) {
      try {
        const pkg = JSON.parse(row.content) as Record<string, unknown>;
        if (pkg.type === 'module') patterns['esm'] = (patterns['esm'] ?? 0) + 1;
        if (pkg.type === 'commonjs' || !pkg.type) patterns['cjs'] = (patterns['cjs'] ?? 0) + 1;
        const scripts = pkg.scripts as Record<string, string> | undefined;
        if (scripts) {
          if (scripts.test?.includes('vitest')) patterns['vitest'] = (patterns['vitest'] ?? 0) + 1;
          if (scripts.test?.includes('jest')) patterns['jest'] = (patterns['jest'] ?? 0) + 1;
          if (scripts.build?.includes('tsc')) patterns['tsc'] = (patterns['tsc'] ?? 0) + 1;
          if (scripts.build?.includes('esbuild')) patterns['esbuild'] = (patterns['esbuild'] ?? 0) + 1;
          if (scripts.build?.includes('rollup')) patterns['rollup'] = (patterns['rollup'] ?? 0) + 1;
        }
        const deps = pkg.dependencies as Record<string, string> | undefined;
        if (deps?.typescript || (pkg.devDependencies as Record<string, string> | undefined)?.typescript) {
          patterns['typescript'] = (patterns['typescript'] ?? 0) + 1;
        }
      } catch { /* skip */ }
    }
    return patterns;
  }

  /** Stats summary. */
  getSummary(): CodeMinerSummary {
    const total = this.db.prepare('SELECT COUNT(DISTINCT repo_id) as c FROM repo_contents').get() as { c: number };
    const contents = this.db.prepare('SELECT COUNT(*) as c FROM repo_contents').get() as { c: number };
    const size = this.db.prepare('SELECT COALESCE(SUM(LENGTH(content)), 0) as s FROM repo_contents').get() as { s: number };
    const last = this.db.prepare('SELECT MAX(fetched_at) as t FROM repo_contents').get() as { t: string | null };
    const byFile = this.db.prepare('SELECT file_path, COUNT(*) as count FROM repo_contents GROUP BY file_path').all() as Array<{ file_path: string; count: number }>;

    return {
      total_repos_mined: total.c,
      total_contents: contents.c,
      total_size_bytes: size.s,
      last_mined_at: last.t,
      by_file: byFile,
    };
  }

  /** Abort an in-progress mining operation. */
  abort(): void {
    this.aborted = true;
  }

  // ── Private ──────────────────────────────────────────────

  private async mineRepos(repos: Array<{ id: number; full_name: string }>): Promise<{ mined: number; errors: number }> {
    this.mining = true;
    this.aborted = false;
    let mined = 0;
    let errors = 0;

    const upsert = this.db.prepare(`
      INSERT INTO repo_contents (repo_id, file_path, content, content_hash)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(repo_id, file_path) DO UPDATE SET
        content = excluded.content,
        content_hash = excluded.content_hash,
        fetched_at = datetime('now')
    `);

    for (const repo of repos) {
      if (this.aborted) break;

      try {
        const contents = await this.fetchRepoContents(repo.full_name);
        for (const item of contents) {
          const hash = item.content ? createHash('sha256').update(item.content).digest('hex') : null;
          upsert.run(repo.id, item.path, item.content, hash);
        }
        mined++;
        this.log.debug(`[code-miner] Mined ${repo.full_name}: ${contents.length} files`);
      } catch (err) {
        errors++;
        this.log.error(`[code-miner] Error mining ${repo.full_name}: ${(err as Error).message}`);
      }

      await this.delay();
    }

    this.mining = false;
    this.lastMinedAt = new Date().toISOString();
    this.log.info(`[code-miner] Batch complete: ${mined} mined, ${errors} errors`);
    return { mined, errors };
  }

  private delay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, this.delayMs));
  }
}
