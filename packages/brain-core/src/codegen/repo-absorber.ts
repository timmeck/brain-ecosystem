import type Database from 'better-sqlite3';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { RAGEngine } from '../rag/rag-engine.js';
import type { KnowledgeGraphEngine } from '../knowledge-graph/graph-engine.js';
import type { FeatureExtractor } from './feature-extractor.js';

// ── Types ────────────────────────────────────────────────

export interface AbsorbResult {
  repo: string;
  filesScanned: number;
  patternsFound: number;
  factsExtracted: number;
  ragVectorsAdded: number;
  featuresExtracted: number;
  durationMs: number;
}

export interface RepoAbsorberStatus {
  totalAbsorbed: number;
  lastAbsorbed: string | null;
  queueSize: number;
}

interface RepoCandidate {
  name: string;
  url: string;
  source: string;
  relevance: number;
}

// ── File patterns to scan ─────────────────────────────────

const CODE_EXTENSIONS = new Set([
  '.ts', '.js', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h',
  '.tsx', '.jsx', '.vue', '.svelte', '.rb', '.php', '.cs', '.swift', '.kt',
]);

const CONFIG_FILES = new Set([
  'package.json', 'tsconfig.json', 'Cargo.toml', 'go.mod', 'pyproject.toml',
  'setup.py', 'requirements.txt', 'Gemfile', 'pom.xml', 'build.gradle',
  'Dockerfile', 'docker-compose.yml', '.github/workflows/ci.yml',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', '__pycache__',
  '.next', '.nuxt', 'vendor', 'venv', '.venv', 'coverage',
]);

const MAX_FILE_SIZE = 50_000; // 50KB per file
const MAX_FILES_PER_REPO = 100;
const MAX_TOTAL_BYTES = 2_000_000; // 2MB total text

// ── RepoAbsorber ──────────────────────────────────────────

export class RepoAbsorber {
  private readonly db: Database.Database;
  private readonly log = getLogger();
  private thoughtStream: ThoughtStream | null = null;
  private ragEngine: RAGEngine | null = null;
  private knowledgeGraph: KnowledgeGraphEngine | null = null;
  private featureExtractor: FeatureExtractor | null = null;
  private totalAbsorbed = 0;
  private lastAbsorbed: string | null = null;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureTable();
  }

  setThoughtStream(ts: ThoughtStream): void { this.thoughtStream = ts; }
  setRAGEngine(rag: RAGEngine): void { this.ragEngine = rag; }
  setKnowledgeGraph(kg: KnowledgeGraphEngine): void { this.knowledgeGraph = kg; }
  setFeatureExtractor(fe: FeatureExtractor): void { this.featureExtractor = fe; }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS absorbed_repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        files_scanned INTEGER DEFAULT 0,
        patterns_found INTEGER DEFAULT 0,
        facts_extracted INTEGER DEFAULT 0,
        rag_vectors INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        absorbed_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_absorbed_name ON absorbed_repos(name);
    `);
  }

  /**
   * Pick the next repo to absorb from TechRadar + DataScout discoveries.
   * Skips repos already absorbed.
   */
  getNextCandidate(): RepoCandidate | null {
    // 1. Try TechRadar watched repos
    try {
      const watched = this.db.prepare(`
        SELECT full_name, url FROM techradar_watched_repos
        WHERE is_active = 1
        AND full_name NOT IN (SELECT name FROM absorbed_repos)
        ORDER BY RANDOM() LIMIT 1
      `).get() as { full_name: string; url: string } | undefined;
      if (watched) {
        return {
          name: watched.full_name,
          url: watched.url || `https://github.com/${watched.full_name}`,
          source: 'techradar_watched',
          relevance: 1.0,
        };
      }
    } catch { /* table may not exist */ }

    // 2. Try TechRadar entries (high relevance first)
    try {
      const entry = this.db.prepare(`
        SELECT name, source_url FROM techradar_entries
        WHERE source IN ('github_trending', 'github_release')
        AND source_url LIKE '%github.com%'
        AND name NOT IN (SELECT name FROM absorbed_repos)
        ORDER BY relevance_score DESC LIMIT 1
      `).get() as { name: string; source_url: string } | undefined;
      if (entry) {
        return {
          name: entry.name,
          url: entry.source_url,
          source: 'techradar_entry',
          relevance: 0.8,
        };
      }
    } catch { /* table may not exist */ }

    // 3. Try DataScout discoveries (GitHub sources)
    try {
      const discovery = this.db.prepare(`
        SELECT title, url FROM scout_discoveries
        WHERE source = 'github-trending'
        AND url LIKE '%github.com%'
        AND title NOT IN (SELECT name FROM absorbed_repos)
        ORDER BY relevance_score DESC LIMIT 1
      `).get() as { title: string; url: string } | undefined;
      if (discovery) {
        return {
          name: discovery.title,
          url: discovery.url,
          source: 'datascout',
          relevance: 0.6,
        };
      }
    } catch { /* table may not exist */ }

    return null;
  }

  /**
   * Absorb one repo: clone → scan → index → delete.
   * Returns null if no candidate available.
   */
  async absorbNext(): Promise<AbsorbResult | null> {
    const candidate = this.getNextCandidate();
    if (!candidate) return null;

    const start = Date.now();
    this.thoughtStream?.emit('repo_absorber', 'perceiving',
      `Absorbing repo: ${candidate.name}...`, 'notable');

    const tmpDir = path.join(os.tmpdir(), `brain-absorb-${Date.now()}`);
    const result: AbsorbResult = {
      repo: candidate.name,
      filesScanned: 0,
      patternsFound: 0,
      factsExtracted: 0,
      ragVectorsAdded: 0,
      featuresExtracted: 0,
      durationMs: 0,
    };

    try {
      // 1. Clone (shallow, no history)
      const cloneUrl = this.normalizeGitUrl(candidate.url);
      this.log.info(`[RepoAbsorber] Cloning ${cloneUrl} → ${tmpDir}`);
      execSync(`git clone --depth 1 --single-branch "${cloneUrl}" "${tmpDir}"`, {
        timeout: 60_000,
        stdio: 'pipe',
      });

      // 2. Scan code files
      const files = this.scanFiles(tmpDir);
      result.filesScanned = files.length;
      this.log.info(`[RepoAbsorber] Scanned ${files.length} files from ${candidate.name}`);

      // 3. Extract patterns & index into RAG
      let totalBytes = 0;
      for (const file of files) {
        if (totalBytes > MAX_TOTAL_BYTES) break;

        try {
          const content = fs.readFileSync(file.fullPath, 'utf8');
          if (content.length > MAX_FILE_SIZE) continue;
          totalBytes += content.length;

          // Index into RAG
          if (this.ragEngine) {
            try {
              // sourceId: use a hash of the file path as numeric ID
              const sourceId = Math.abs(file.relativePath.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0));
              await this.ragEngine.index('absorbed_code', sourceId, content, {
                repo: candidate.name, ext: file.ext, source: candidate.source, path: file.relativePath,
              });
              result.ragVectorsAdded++;
            } catch { /* embedding may fail */ }
          }

          // Extract patterns for Knowledge Graph
          if (this.knowledgeGraph) {
            const patterns = this.extractCodePatterns(content, file.relativePath, candidate.name);
            for (const p of patterns) {
              this.knowledgeGraph.addFact(p.subject, p.predicate, p.object, p.context, p.confidence, 'repo', candidate.name);
              result.factsExtracted++;
            }
          }

          // Extract reusable features (functions, classes, patterns)
          if (this.featureExtractor) {
            try {
              result.featuresExtracted += this.featureExtractor.extractAndSave(content, file.relativePath, candidate.name, file.ext);
            } catch { /* feature extraction is optional */ }
          }

          result.patternsFound += this.countPatterns(content, file.ext);
        } catch { /* read error, skip */ }
      }

      // 4. Extract project-level patterns
      const pkgJsonPath = path.join(tmpDir, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          if (this.knowledgeGraph && pkg.name) {
            const deps = Object.keys(pkg.dependencies ?? {});
            // devDependencies available in pkg.devDependencies if needed
            for (const dep of deps.slice(0, 10)) {
              this.knowledgeGraph.addFact(pkg.name, 'depends_on', dep,
                `repo:${candidate.name}`, 0.9, 'repo', candidate.name);
              result.factsExtracted++;
            }
            if (pkg.scripts?.test) {
              this.knowledgeGraph.addFact(candidate.name, 'uses_test_framework',
                this.detectTestFramework(pkg), `repo:${candidate.name}`, 0.8, 'repo', candidate.name);
              result.factsExtracted++;
            }
          }
        } catch { /* invalid json */ }
      }

      this.thoughtStream?.emit('repo_absorber', 'discovering',
        `Absorbed ${candidate.name}: ${result.filesScanned} files, ${result.ragVectorsAdded} vectors, ${result.factsExtracted} facts`,
        'notable');

    } catch (err) {
      this.log.warn(`[RepoAbsorber] Failed to absorb ${candidate.name}: ${(err as Error).message}`);
      this.thoughtStream?.emit('repo_absorber', 'analyzing',
        `Failed to absorb ${candidate.name}: ${(err as Error).message}`, 'routine');
    } finally {
      // 5. Always clean up
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        this.log.debug(`[RepoAbsorber] Cleaned up ${tmpDir}`);
      } catch { /* cleanup failed, not critical */ }
    }

    result.durationMs = Date.now() - start;

    // Record in DB
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO absorbed_repos (name, url, source, files_scanned, patterns_found, facts_extracted, rag_vectors, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(candidate.name, candidate.url, candidate.source,
        result.filesScanned, result.patternsFound, result.factsExtracted, result.ragVectorsAdded, result.durationMs);
    } catch { /* DB error */ }

    this.totalAbsorbed++;
    this.lastAbsorbed = candidate.name;
    return result;
  }

  /**
   * Recursively scan for code files, respecting limits.
   */
  private scanFiles(dir: string, base?: string): Array<{ fullPath: string; relativePath: string; ext: string }> {
    const root = base ?? dir;
    const results: Array<{ fullPath: string; relativePath: string; ext: string }> = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_FILES_PER_REPO) break;

        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) continue;
          results.push(...this.scanFiles(path.join(dir, entry.name), root));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const relativePath = path.relative(root, path.join(dir, entry.name)).replace(/\\/g, '/');

          if (CODE_EXTENSIONS.has(ext) || CONFIG_FILES.has(entry.name)) {
            results.push({ fullPath: path.join(dir, entry.name), relativePath, ext });
          }
        }
      }
    } catch { /* permission error */ }

    return results;
  }

  /**
   * Extract structured patterns from a code file for the Knowledge Graph.
   */
  private extractCodePatterns(content: string, filePath: string, repo: string): Array<{
    subject: string; predicate: string; object: string; context: string; confidence: number;
  }> {
    const facts: Array<{ subject: string; predicate: string; object: string; context: string; confidence: number }> = [];

    // Detect imports/dependencies
    const importMatches = content.matchAll(/(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g);
    const seenImports = new Set<string>();
    for (const m of importMatches) {
      const dep = m[1]!;
      if (dep.startsWith('.') || dep.startsWith('/')) continue; // skip relative
      const pkg = dep.startsWith('@') ? dep.split('/').slice(0, 2).join('/') : dep.split('/')[0]!;
      if (!seenImports.has(pkg)) {
        seenImports.add(pkg);
        facts.push({
          subject: filePath, predicate: 'imports', object: pkg,
          context: `repo:${repo}`, confidence: 0.9,
        });
      }
    }

    // Detect design patterns
    if (/class\s+\w+\s+extends/.test(content)) {
      facts.push({ subject: repo, predicate: 'uses_pattern', object: 'inheritance', context: filePath, confidence: 0.7 });
    }
    if (/implements\s+\w+/.test(content)) {
      facts.push({ subject: repo, predicate: 'uses_pattern', object: 'interface_impl', context: filePath, confidence: 0.7 });
    }
    if (/(?:export\s+)?(?:async\s+)?function\s+\w+Factory/i.test(content)) {
      facts.push({ subject: repo, predicate: 'uses_pattern', object: 'factory', context: filePath, confidence: 0.8 });
    }
    if (/\.subscribe\(|\.on\(|EventEmitter|addEventListener/i.test(content)) {
      facts.push({ subject: repo, predicate: 'uses_pattern', object: 'observer', context: filePath, confidence: 0.6 });
    }
    if (/Singleton|getInstance/i.test(content)) {
      facts.push({ subject: repo, predicate: 'uses_pattern', object: 'singleton', context: filePath, confidence: 0.8 });
    }

    return facts;
  }

  /**
   * Count interesting patterns in a file (for stats).
   */
  private countPatterns(content: string, ext: string): number {
    let count = 0;
    if (/export\s+(class|function|const|interface)/.test(content)) count++;
    if (/async\s+function|await\s/.test(content)) count++;
    if (/(?:try|catch|throw)\s/.test(content)) count++;
    if (ext === '.ts' && /interface\s+\w+/.test(content)) count++;
    return count;
  }

  /**
   * Detect test framework from package.json.
   */
  private detectTestFramework(pkg: Record<string, unknown>): string {
    const all = { ...(pkg.dependencies as Record<string, string> ?? {}), ...(pkg.devDependencies as Record<string, string> ?? {}) };
    if ('vitest' in all) return 'vitest';
    if ('jest' in all) return 'jest';
    if ('mocha' in all) return 'mocha';
    if ('ava' in all) return 'ava';
    if ('pytest' in all) return 'pytest';
    return 'unknown';
  }

  /**
   * Normalize various GitHub URL formats to a clonable URL.
   */
  private normalizeGitUrl(url: string): string {
    // Already a .git URL
    if (url.endsWith('.git')) return url;
    // GitHub URL like https://github.com/owner/repo
    const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
    if (match) return `https://github.com/${match[1]}.git`;
    // Fallback: assume it's a GitHub "owner/repo" string
    if (url.includes('/') && !url.includes('://')) return `https://github.com/${url}.git`;
    return url;
  }

  getStatus(): RepoAbsorberStatus {
    let queueSize = 0;
    try {
      const count = this.db.prepare(`
        SELECT COUNT(*) as c FROM techradar_watched_repos
        WHERE is_active = 1 AND full_name NOT IN (SELECT name FROM absorbed_repos)
      `).get() as { c: number };
      queueSize += count?.c ?? 0;
    } catch { /* table may not exist */ }
    try {
      const count = this.db.prepare(`
        SELECT COUNT(*) as c FROM techradar_entries
        WHERE source IN ('github_trending', 'github_release')
        AND source_url LIKE '%github.com%'
        AND name NOT IN (SELECT name FROM absorbed_repos)
      `).get() as { c: number };
      queueSize += count?.c ?? 0;
    } catch { /* table may not exist */ }

    return {
      totalAbsorbed: this.totalAbsorbed,
      lastAbsorbed: this.lastAbsorbed,
      queueSize,
    };
  }

  /**
   * Get recently absorbed repos from DB.
   */
  getHistory(limit = 10): Array<{ name: string; url: string; source: string; filesScanned: number; patternsFound: number; factsExtracted: number; ragVectors: number; durationMs: number; absorbedAt: string }> {
    try {
      return this.db.prepare(`
        SELECT name, url, source, files_scanned as filesScanned, patterns_found as patternsFound,
               facts_extracted as factsExtracted, rag_vectors as ragVectors, duration_ms as durationMs,
               absorbed_at as absorbedAt
        FROM absorbed_repos ORDER BY absorbed_at DESC LIMIT ?
      `).all(limit) as Array<{ name: string; url: string; source: string; filesScanned: number; patternsFound: number; factsExtracted: number; ragVectors: number; durationMs: number; absorbedAt: string }>;
    } catch { return []; }
  }
}
