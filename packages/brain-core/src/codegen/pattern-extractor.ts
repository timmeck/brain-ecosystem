import type Database from 'better-sqlite3';
import type { DependencyPattern, TechStack, ProjectStructure, ReadmePattern, ExtractedPattern } from './types.js';

// ── Migration ────────────────────────────────────────────

export function runPatternExtractorMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS extracted_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern_type TEXT NOT NULL,
      pattern_key TEXT NOT NULL,
      pattern_data TEXT NOT NULL,
      frequency INTEGER DEFAULT 1,
      confidence REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(pattern_type, pattern_key)
    );
  `);
}

// ── PatternExtractor ─────────────────────────────────────

export class PatternExtractor {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    runPatternExtractorMigration(db);
  }

  /** Extract top-N dependency patterns from mined package.json files. */
  extractDependencyPatterns(limit = 20): DependencyPattern[] {
    const rows = this.db.prepare(`
      SELECT content FROM repo_contents WHERE file_path = 'package.json' AND content IS NOT NULL
    `).all() as Array<{ content: string }>;

    const counts = new Map<string, number>();
    let total = 0;

    for (const row of rows) {
      try {
        const pkg = JSON.parse(row.content) as Record<string, unknown>;
        const deps = Object.keys(pkg.dependencies as Record<string, string> ?? {});
        for (const name of deps) {
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
        total++;
      } catch { /* skip */ }
    }

    const patterns = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({
        name,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

    // Save to DB
    this.savePatterns('dependency', patterns.map(p => ({
      key: p.name,
      data: JSON.stringify(p),
      frequency: p.count,
      confidence: p.percentage / 100,
    })));

    return patterns;
  }

  /** Extract common tech stack combinations. */
  extractTechStacks(limit = 10): TechStack[] {
    const rows = this.db.prepare(`
      SELECT rc.content, sr.full_name
      FROM repo_contents rc
      JOIN scanned_repos sr ON sr.id = rc.repo_id
      WHERE rc.file_path = 'package.json' AND rc.content IS NOT NULL
    `).all() as Array<{ content: string; full_name: string }>;

    const stacks = new Map<string, { count: number; repos: string[] }>();

    for (const row of rows) {
      try {
        const pkg = JSON.parse(row.content) as Record<string, unknown>;
        const allDeps = {
          ...(pkg.dependencies as Record<string, string> ?? {}),
          ...(pkg.devDependencies as Record<string, string> ?? {}),
        };
        const components: string[] = [];

        if (allDeps.typescript) components.push('TypeScript');
        if (allDeps.vitest) components.push('Vitest');
        if (allDeps.jest) components.push('Jest');
        if (allDeps.zod) components.push('Zod');
        if (allDeps.express || allDeps.fastify || allDeps.hono) {
          components.push(allDeps.express ? 'Express' : allDeps.fastify ? 'Fastify' : 'Hono');
        }
        if (allDeps.react) components.push('React');
        if (allDeps.vue) components.push('Vue');
        if (allDeps.svelte) components.push('Svelte');
        if (allDeps.prisma || allDeps['@prisma/client']) components.push('Prisma');
        if (allDeps.drizzle || allDeps['drizzle-orm']) components.push('Drizzle');
        if (pkg.type === 'module') components.push('ESM');

        if (components.length >= 2) {
          const key = components.sort().join(' + ');
          const entry = stacks.get(key) ?? { count: 0, repos: [] };
          entry.count++;
          if (entry.repos.length < 5) entry.repos.push(row.full_name);
          stacks.set(key, entry);
        }
      } catch { /* skip */ }
    }

    const result = [...stacks.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([stack, data]) => ({ stack, count: data.count, repos: data.repos }));

    this.savePatterns('tech_stack', result.map(s => ({
      key: s.stack,
      data: JSON.stringify(s),
      frequency: s.count,
      confidence: Math.min(1, s.count / 10),
    })));

    return result;
  }

  /** Extract common project directory structures from tree listings. */
  extractProjectStructures(limit = 20): ProjectStructure[] {
    const rows = this.db.prepare(`
      SELECT content FROM repo_contents WHERE file_path = 'tree' AND content IS NOT NULL
    `).all() as Array<{ content: string }>;

    const dirCounts = new Map<string, number>();
    let total = 0;

    for (const row of rows) {
      const lines = row.content.split('\n');
      for (const line of lines) {
        const match = line.match(/^d (.+)/);
        if (match) {
          const dir = match[1].trim();
          dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
        }
      }
      total++;
    }

    const result = [...dirCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([path, count]) => ({
        path,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

    this.savePatterns('structure', result.map(s => ({
      key: s.path,
      data: JSON.stringify(s),
      frequency: s.count,
      confidence: s.percentage / 100,
    })));

    return result;
  }

  /** Extract common README sections. */
  extractReadmePatterns(limit = 15): ReadmePattern[] {
    const rows = this.db.prepare(`
      SELECT content FROM repo_contents WHERE file_path = 'README.md' AND content IS NOT NULL
    `).all() as Array<{ content: string }>;

    const sectionCounts = new Map<string, number>();
    let total = 0;

    for (const row of rows) {
      const headings = row.content.match(/^#{1,3}\s+(.+)$/gm) ?? [];
      const normalized = new Set<string>();
      for (const h of headings) {
        const text = h.replace(/^#+\s+/, '').trim().toLowerCase();
        normalized.add(text);
      }
      for (const section of normalized) {
        sectionCounts.set(section, (sectionCounts.get(section) ?? 0) + 1);
      }
      total++;
    }

    const result = [...sectionCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([section, count]) => ({
        section,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

    this.savePatterns('readme', result.map(s => ({
      key: s.section,
      data: JSON.stringify(s),
      frequency: s.count,
      confidence: s.percentage / 100,
    })));

    return result;
  }

  /** Get all extracted patterns from DB. */
  getPatterns(type?: string, limit = 50): ExtractedPattern[] {
    if (type) {
      return this.db.prepare(
        'SELECT * FROM extracted_patterns WHERE pattern_type = ? ORDER BY frequency DESC LIMIT ?',
      ).all(type, limit) as ExtractedPattern[];
    }
    return this.db.prepare(
      'SELECT * FROM extracted_patterns ORDER BY frequency DESC LIMIT ?',
    ).all(limit) as ExtractedPattern[];
  }

  /** Run all extraction methods. */
  extractAll(): { dependencies: DependencyPattern[]; techStacks: TechStack[]; structures: ProjectStructure[]; readmePatterns: ReadmePattern[] } {
    return {
      dependencies: this.extractDependencyPatterns(),
      techStacks: this.extractTechStacks(),
      structures: this.extractProjectStructures(),
      readmePatterns: this.extractReadmePatterns(),
    };
  }

  // ── Private ──────────────────────────────────────────────

  private savePatterns(type: string, patterns: Array<{ key: string; data: string; frequency: number; confidence: number }>): void {
    const upsert = this.db.prepare(`
      INSERT INTO extracted_patterns (pattern_type, pattern_key, pattern_data, frequency, confidence, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(pattern_type, pattern_key) DO UPDATE SET
        pattern_data = excluded.pattern_data,
        frequency = excluded.frequency,
        confidence = excluded.confidence,
        updated_at = datetime('now')
    `);

    for (const p of patterns) {
      upsert.run(type, p.key, p.data, p.frequency, p.confidence);
    }
  }
}
