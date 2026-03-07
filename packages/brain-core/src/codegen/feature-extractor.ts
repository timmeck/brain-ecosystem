import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { RAGEngine, RAGResult } from '../rag/rag-engine.js';
import type { KnowledgeGraphEngine } from '../knowledge-graph/graph-engine.js';
import type { LLMService } from '../llm/llm-service.js';

// ── Types ────────────────────────────────────────────────

export interface ExtractedFeature {
  id: number;
  repo: string;
  name: string;
  category: FeatureCategory;
  description: string;
  codeSnippet: string;
  filePath: string;
  language: string;
  usefulness: number; // 0-1 score
  applicability: string; // how it could help Brain
  tags: string[];
  extractedAt: string;
}

export type FeatureCategory =
  | 'utility_function'
  | 'design_pattern'
  | 'architecture'
  | 'error_handling'
  | 'testing_pattern'
  | 'performance'
  | 'api_pattern'
  | 'data_structure'
  | 'config_pattern'
  | 'cli_pattern';

export interface FeatureExtractionResult {
  repo: string;
  featuresExtracted: number;
  categories: Record<string, number>;
  durationMs: number;
}

export interface FeatureSearchOptions {
  category?: FeatureCategory;
  repo?: string;
  minUsefulness?: number;
  limit?: number;
  query?: string;
}

export interface FeatureStats {
  totalFeatures: number;
  byCategory: Record<string, number>;
  byRepo: Record<string, number>;
  topFeatures: ExtractedFeature[];
  avgUsefulness: number;
}

// ── Regex patterns for feature detection ─────────────────

const FEATURE_PATTERNS: Array<{
  category: FeatureCategory;
  pattern: RegExp;
  nameExtract: (match: RegExpMatchArray) => string;
  minLines: number;
  maxLines: number;
}> = [
  // Utility functions (exported, standalone)
  {
    category: 'utility_function',
    pattern: /export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g,
    nameExtract: (m) => m[1]!,
    minLines: 3,
    maxLines: 50,
  },
  // Exported arrow functions
  {
    category: 'utility_function',
    pattern: /export\s+const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w[^=]*)?=>/g,
    nameExtract: (m) => m[1]!,
    minLines: 2,
    maxLines: 40,
  },
  // Class patterns (exported classes with interesting methods)
  {
    category: 'design_pattern',
    pattern: /export\s+(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+\w+)?\s*\{/g,
    nameExtract: (m) => m[1]!,
    minLines: 10,
    maxLines: 80,
  },
  // Error handling patterns (custom error classes, error boundaries)
  {
    category: 'error_handling',
    pattern: /export\s+class\s+(\w*Error\w*)\s+extends\s+(?:Error|BaseError|CustomError)\s*\{/g,
    nameExtract: (m) => m[1]!,
    minLines: 3,
    maxLines: 30,
  },
  // Testing utilities (describe wrappers, custom matchers, test helpers)
  {
    category: 'testing_pattern',
    pattern: /export\s+(?:async\s+)?function\s+((?:create|mock|setup|build|make)\w+)\s*\(/g,
    nameExtract: (m) => m[1]!,
    minLines: 3,
    maxLines: 40,
  },
  // CLI patterns (command builders, argument parsers)
  {
    category: 'cli_pattern',
    pattern: /export\s+(?:async\s+)?function\s+(\w*[Cc]ommand\w*)\s*\(/g,
    nameExtract: (m) => m[1]!,
    minLines: 5,
    maxLines: 60,
  },
  // Config patterns (config builders, validators)
  {
    category: 'config_pattern',
    pattern: /export\s+(?:async\s+)?function\s+((?:load|parse|validate|create)\w*[Cc]onfig\w*)\s*\(/g,
    nameExtract: (m) => m[1]!,
    minLines: 3,
    maxLines: 40,
  },
  // Data structures (exported interfaces/types with methods)
  {
    category: 'data_structure',
    pattern: /export\s+interface\s+(\w+)\s*\{/g,
    nameExtract: (m) => m[1]!,
    minLines: 3,
    maxLines: 30,
  },
  // Go: public functions (capitalized)
  {
    category: 'utility_function',
    pattern: /^func\s+([A-Z]\w+)\s*\(/gm,
    nameExtract: (m) => m[1]!,
    minLines: 3,
    maxLines: 50,
  },
  // Go: method receivers
  {
    category: 'design_pattern',
    pattern: /^func\s+\(\w+\s+\*?(\w+)\)\s+([A-Z]\w+)\s*\(/gm,
    nameExtract: (m) => `${m[1]}.${m[2]}`,
    minLines: 3,
    maxLines: 50,
  },
  // Python: class definitions
  {
    category: 'design_pattern',
    pattern: /^class\s+([A-Z]\w+)(?:\([^)]*\))?\s*:/gm,
    nameExtract: (m) => m[1]!,
    minLines: 5,
    maxLines: 60,
  },
  // Python: top-level function definitions
  {
    category: 'utility_function',
    pattern: /^def\s+([a-z_]\w+)\s*\([^)]*\)/gm,
    nameExtract: (m) => m[1]!,
    minLines: 3,
    maxLines: 50,
  },
  // Python: async functions
  {
    category: 'utility_function',
    pattern: /^async\s+def\s+([a-z_]\w+)\s*\([^)]*\)/gm,
    nameExtract: (m) => m[1]!,
    minLines: 3,
    maxLines: 50,
  },
  // Rust: public functions
  {
    category: 'utility_function',
    pattern: /pub\s+(?:async\s+)?fn\s+(\w+)\s*[(<]/gm,
    nameExtract: (m) => m[1]!,
    minLines: 3,
    maxLines: 50,
  },
  // Rust: impl blocks
  {
    category: 'design_pattern',
    pattern: /impl(?:<[^>]*>)?\s+(\w+)(?:\s+for\s+(\w+))?\s*\{/gm,
    nameExtract: (m) => m[2] ? `${m[1]}_for_${m[2]}` : m[1]!,
    minLines: 5,
    maxLines: 80,
  },
];

// Keywords that boost usefulness score
const USEFULNESS_KEYWORDS: Record<string, number> = {
  'retry': 0.15, 'cache': 0.15, 'throttle': 0.15, 'debounce': 0.15,
  'queue': 0.12, 'pool': 0.12, 'batch': 0.12,
  'parse': 0.10, 'serialize': 0.10, 'transform': 0.10,
  'validate': 0.10, 'sanitize': 0.10,
  'hash': 0.08, 'encrypt': 0.08, 'compress': 0.08,
  'stream': 0.10, 'pipe': 0.08, 'buffer': 0.08,
  'middleware': 0.12, 'plugin': 0.12, 'hook': 0.10,
  'logger': 0.08, 'monitor': 0.10, 'metric': 0.10,
  'scheduler': 0.12, 'worker': 0.10, 'parallel': 0.10,
  'EventEmitter': 0.08, 'Observable': 0.08,
  'singleton': 0.08, 'factory': 0.10, 'builder': 0.10,
  'adapter': 0.10, 'proxy': 0.08, 'decorator': 0.08,
};

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
  '.rb': 'ruby', '.php': 'php', '.cs': 'csharp', '.swift': 'swift', '.kt': 'kotlin',
};

// ── FeatureExtractor ─────────────────────────────────────

export class FeatureExtractor {
  private readonly db: Database.Database;
  private readonly log = getLogger();
  private ragEngine: RAGEngine | null = null;
  private knowledgeGraph: KnowledgeGraphEngine | null = null;
  private llmService: LLMService | null = null;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureTable();
  }

  setRAGEngine(rag: RAGEngine): void { this.ragEngine = rag; }
  setKnowledgeGraph(kg: KnowledgeGraphEngine): void { this.knowledgeGraph = kg; }
  setLLMService(llm: LLMService): void { this.llmService = llm; }

  private ensureTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS extracted_features (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        code_snippet TEXT NOT NULL,
        file_path TEXT NOT NULL,
        language TEXT NOT NULL DEFAULT 'unknown',
        usefulness REAL DEFAULT 0.5,
        applicability TEXT DEFAULT '',
        tags TEXT DEFAULT '[]',
        extracted_at TEXT DEFAULT (datetime('now')),
        UNIQUE(repo, name, file_path)
      );
      CREATE INDEX IF NOT EXISTS idx_features_repo ON extracted_features(repo);
      CREATE INDEX IF NOT EXISTS idx_features_category ON extracted_features(category);
      CREATE INDEX IF NOT EXISTS idx_features_usefulness ON extracted_features(usefulness DESC);
    `);
  }

  /**
   * Extract features from absorbed code via RAG search.
   * Searches for interesting patterns in the absorbed_code collection.
   */
  async extractFromAbsorbedCode(repo?: string): Promise<FeatureExtractionResult> {
    const start = Date.now();
    const categories: Record<string, number> = {};
    let featuresExtracted = 0;
    const targetRepo = repo ?? 'all';

    // Get absorbed code from RAG
    const codeEntries = this.getAbsorbedCode(repo);
    this.log.info(`[FeatureExtractor] Analyzing ${codeEntries.length} files from ${targetRepo}`);

    for (const entry of codeEntries) {
      try {
        const features = this.extractFeaturesFromCode(
          entry.content,
          entry.filePath,
          entry.repo,
          entry.ext,
        );

        for (const feature of features) {
          const saved = this.saveFeature(feature);
          if (saved) {
            featuresExtracted++;
            categories[feature.category] = (categories[feature.category] ?? 0) + 1;
          }
        }
      } catch {
        // skip file
      }
    }

    // Optional: use LLM to enrich top features with descriptions
    if (this.llmService && featuresExtracted > 0) {
      await this.enrichTopFeatures(5);
    }

    this.log.info(`[FeatureExtractor] Extracted ${featuresExtracted} features from ${targetRepo}`);

    return {
      repo: targetRepo,
      featuresExtracted,
      categories,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Extract features from a raw code string.
   */
  extractFeaturesFromCode(
    content: string,
    filePath: string,
    repo: string,
    ext: string,
  ): Array<Omit<ExtractedFeature, 'id' | 'extractedAt'>> {
    const features: Array<Omit<ExtractedFeature, 'id' | 'extractedAt'>> = [];
    const lines = content.split('\n');
    const language = EXT_TO_LANG[ext] ?? 'unknown';

    for (const fp of FEATURE_PATTERNS) {
      // Only apply relevant patterns to right languages
      if (fp.category === 'data_structure' && language !== 'typescript') continue;

      const regex = new RegExp(fp.pattern.source, fp.pattern.flags);
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const name = fp.nameExtract(match);
        if (!name || name.length < 3) continue;

        // Skip common/boring names
        if (['constructor', 'toString', 'valueOf', 'default'].includes(name)) continue;

        // Find the code block (from match position to closing brace)
        const startLine = content.substring(0, match.index).split('\n').length - 1;
        const snippet = this.extractCodeBlock(lines, startLine, fp.minLines, fp.maxLines, language);

        if (!snippet || snippet.split('\n').length < fp.minLines) continue;

        // Calculate usefulness score
        const usefulness = this.calculateUsefulness(name, snippet, fp.category);

        // Only keep features above threshold
        if (usefulness < 0.3) continue;

        // Generate tags from content
        const tags = this.extractTags(name, snippet);

        features.push({
          repo,
          name,
          category: fp.category,
          description: this.generateBasicDescription(name, fp.category, language),
          codeSnippet: snippet,
          filePath,
          language,
          usefulness,
          applicability: '',
          tags,
        });
      }
    }

    return features;
  }

  /**
   * Extract features from code and save them to the database.
   * Returns the number of features saved.
   */
  extractAndSave(content: string, filePath: string, repo: string, ext: string): number {
    const features = this.extractFeaturesFromCode(content, filePath, repo, ext);
    let saved = 0;
    for (const f of features) {
      if (this.saveFeature(f)) saved++;
    }
    return saved;
  }

  /**
   * Search for features matching criteria.
   */
  search(options: FeatureSearchOptions = {}): ExtractedFeature[] {
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }
    if (options.repo) {
      conditions.push('repo = ?');
      params.push(options.repo);
    }
    if (options.minUsefulness) {
      conditions.push('usefulness >= ?');
      params.push(options.minUsefulness);
    }
    if (options.query) {
      conditions.push('(name LIKE ? OR description LIKE ? OR code_snippet LIKE ?)');
      const q = `%${options.query}%`;
      params.push(q, q, q);
    }

    const limit = options.limit ?? 20;
    params.push(limit);

    return this.db.prepare(`
      SELECT id, repo, name, category, description, code_snippet as codeSnippet,
             file_path as filePath, language, usefulness, applicability,
             tags, extracted_at as extractedAt
      FROM extracted_features
      WHERE ${conditions.join(' AND ')}
      ORDER BY usefulness DESC
      LIMIT ?
    `).all(...params) as ExtractedFeature[];
  }

  /**
   * Semantic search for features using RAG.
   */
  async semanticSearch(query: string, limit = 10): Promise<ExtractedFeature[]> {
    if (!this.ragEngine) return this.search({ query, limit });

    // Search absorbed code
    const results = await this.ragEngine.search(query, {
      collections: ['absorbed_code'],
      limit: limit * 3,
    });

    if (!results.length) return [];

    // Map RAG results to features by matching repo+path
    const features: ExtractedFeature[] = [];
    for (const r of results) {
      const meta = r.metadata as { repo?: string; path?: string } | undefined;
      if (!meta?.repo || !meta?.path) continue;

      const matching = this.db.prepare(`
        SELECT id, repo, name, category, description, code_snippet as codeSnippet,
               file_path as filePath, language, usefulness, applicability,
               tags, extracted_at as extractedAt
        FROM extracted_features
        WHERE repo = ? AND file_path = ?
        ORDER BY usefulness DESC
      `).all(meta.repo, meta.path) as ExtractedFeature[];

      for (const f of matching) {
        if (!features.some(e => e.id === f.id)) {
          features.push(f);
        }
      }

      if (features.length >= limit) break;
    }

    return features.slice(0, limit);
  }

  /**
   * Suggest features that could help improve Brain based on current weaknesses.
   */
  async suggest(context?: string): Promise<ExtractedFeature[]> {
    // Get top features by usefulness
    const topFeatures = this.search({ minUsefulness: 0.6, limit: 20 });

    if (!context || !this.ragEngine) return topFeatures;

    // Use RAG to find features relevant to context
    const relevant = await this.semanticSearch(context, 10);

    // Merge: relevant first, then top features (deduplicated)
    const seen = new Set<number>();
    const merged: ExtractedFeature[] = [];
    for (const f of [...relevant, ...topFeatures]) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        merged.push(f);
      }
    }

    return merged.slice(0, 15);
  }

  /**
   * Get statistics about extracted features.
   */
  getStats(): FeatureStats {
    const total = this.db.prepare(
      'SELECT COUNT(*) as c FROM extracted_features',
    ).get() as { c: number };

    const byCategory = this.db.prepare(
      'SELECT category, COUNT(*) as c FROM extracted_features GROUP BY category ORDER BY c DESC',
    ).all() as Array<{ category: string; c: number }>;

    const byRepo = this.db.prepare(
      'SELECT repo, COUNT(*) as c FROM extracted_features GROUP BY repo ORDER BY c DESC LIMIT 10',
    ).all() as Array<{ repo: string; c: number }>;

    const avg = this.db.prepare(
      'SELECT AVG(usefulness) as avg FROM extracted_features',
    ).get() as { avg: number | null };

    const topFeatures = this.search({ minUsefulness: 0.6, limit: 5 });

    return {
      totalFeatures: total.c,
      byCategory: Object.fromEntries(byCategory.map(r => [r.category, r.c])),
      byRepo: Object.fromEntries(byRepo.map(r => [r.repo, r.c])),
      topFeatures,
      avgUsefulness: avg.avg ?? 0,
    };
  }

  // ── Private helpers ───────────────────────────────────────

  private getAbsorbedCode(repo?: string): Array<{ content: string; filePath: string; repo: string; ext: string }> {
    // Get metadata from RAG vectors (absorbed_code collection)
    try {
      const condition = repo
        ? `WHERE collection = 'absorbed_code' AND metadata LIKE '%"repo":"${repo.replace(/'/g, "''")}"%'`
        : `WHERE collection = 'absorbed_code'`;

      const rows = this.db.prepare(`
        SELECT text_preview, metadata FROM rag_vectors ${condition} LIMIT 500
      `).all() as Array<{ text_preview: string | null; metadata: string | null }>;

      return rows
        .filter(r => r.metadata)
        .map(r => {
          const meta = JSON.parse(r.metadata!) as { repo?: string; path?: string; ext?: string };
          return {
            content: r.text_preview ?? '',
            filePath: meta.path ?? '',
            repo: meta.repo ?? 'unknown',
            ext: meta.ext ?? '',
          };
        });
    } catch {
      return [];
    }
  }

  private extractCodeBlock(lines: string[], startLine: number, minLines: number, maxLines: number, language?: string): string | null {
    // Python: indent-based block extraction
    if (language === 'python') {
      const block: string[] = [lines[startLine]!];
      const baseIndent = lines[startLine]!.search(/\S/);
      for (let i = startLine + 1; i < lines.length && block.length < maxLines; i++) {
        const line = lines[i]!;
        if (line.trim() === '') { block.push(line); continue; }
        const indent = line.search(/\S/);
        if (indent <= baseIndent && line.trim() !== '') break;
        block.push(line);
      }
      if (block.length < minLines) return null;
      return block.join('\n');
    }

    // Brace-based languages (JS/TS, Go, Rust, Java, C)
    let depth = 0;
    let started = false;
    const block: string[] = [];

    for (let i = startLine; i < lines.length && block.length < maxLines; i++) {
      const line = lines[i]!;
      block.push(line);

      for (const ch of line) {
        if (ch === '{') { depth++; started = true; }
        if (ch === '}') depth--;
      }

      if (started && depth <= 0) break;
    }

    if (block.length < minLines) return null;
    return block.join('\n');
  }

  private calculateUsefulness(name: string, snippet: string, category: FeatureCategory): number {
    let score = 0.4; // base score

    // Boost for category
    const categoryBoost: Record<string, number> = {
      utility_function: 0.1,
      error_handling: 0.1,
      design_pattern: 0.05,
      performance: 0.15,
      testing_pattern: 0.05,
      api_pattern: 0.1,
      cli_pattern: 0.05,
      config_pattern: 0.05,
      data_structure: 0.0,
      architecture: 0.05,
    };
    score += categoryBoost[category] ?? 0;

    // Boost for useful keywords in name and snippet
    const lowerName = name.toLowerCase();
    const lowerSnippet = snippet.toLowerCase();
    for (const [keyword, boost] of Object.entries(USEFULNESS_KEYWORDS)) {
      if (lowerName.includes(keyword.toLowerCase()) || lowerSnippet.includes(keyword.toLowerCase())) {
        score += boost;
      }
    }

    // Boost for JSDoc/documentation
    if (snippet.includes('/**') || snippet.includes('///')) score += 0.05;

    // Boost for TypeScript types (well-typed code)
    if (snippet.includes(': ') && snippet.includes('=> ')) score += 0.03;

    // Penalize very short or very long snippets
    const lineCount = snippet.split('\n').length;
    if (lineCount < 5) score -= 0.1;
    if (lineCount > 60) score -= 0.05;

    // Penalize generic names
    if (['index', 'main', 'init', 'run', 'start', 'setup'].includes(lowerName)) {
      score -= 0.15;
    }

    return Math.max(0, Math.min(1, score));
  }

  private extractTags(name: string, snippet: string): string[] {
    const tags: string[] = [];
    const lower = (name + ' ' + snippet).toLowerCase();

    if (lower.includes('async') || lower.includes('await') || lower.includes('promise')) tags.push('async');
    if (lower.includes('stream') || lower.includes('pipe')) tags.push('streaming');
    if (lower.includes('cache') || lower.includes('memo')) tags.push('caching');
    if (lower.includes('retry') || lower.includes('backoff')) tags.push('retry');
    if (lower.includes('queue') || lower.includes('batch')) tags.push('batching');
    if (lower.includes('validate') || lower.includes('schema')) tags.push('validation');
    if (lower.includes('parse') || lower.includes('serialize')) tags.push('parsing');
    if (lower.includes('test') || lower.includes('mock') || lower.includes('stub')) tags.push('testing');
    if (lower.includes('log') || lower.includes('debug') || lower.includes('trace')) tags.push('logging');
    if (lower.includes('event') || lower.includes('emit') || lower.includes('listen')) tags.push('events');
    if (lower.includes('middleware') || lower.includes('plugin') || lower.includes('hook')) tags.push('extensible');
    if (lower.includes('concurr') || lower.includes('parallel') || lower.includes('worker')) tags.push('concurrency');

    return tags.slice(0, 5);
  }

  private generateBasicDescription(name: string, category: FeatureCategory, language: string): string {
    const categoryLabels: Record<string, string> = {
      utility_function: 'Utility function',
      design_pattern: 'Design pattern / class',
      architecture: 'Architecture component',
      error_handling: 'Error handling',
      testing_pattern: 'Test utility',
      performance: 'Performance optimization',
      api_pattern: 'API pattern',
      data_structure: 'Data structure / interface',
      config_pattern: 'Configuration utility',
      cli_pattern: 'CLI command pattern',
    };
    return `${categoryLabels[category] ?? 'Code'}: ${name} (${language})`;
  }

  private saveFeature(feature: Omit<ExtractedFeature, 'id' | 'extractedAt'>): boolean {
    try {
      this.db.prepare(`
        INSERT OR IGNORE INTO extracted_features
          (repo, name, category, description, code_snippet, file_path, language, usefulness, applicability, tags)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        feature.repo, feature.name, feature.category,
        feature.description, feature.codeSnippet, feature.filePath,
        feature.language, feature.usefulness, feature.applicability,
        JSON.stringify(feature.tags),
      );
      return true;
    } catch {
      return false; // duplicate
    }
  }

  /**
   * Use LLM to enrich top features with better descriptions and applicability.
   */
  private async enrichTopFeatures(count: number): Promise<void> {
    if (!this.llmService) return;

    const features = this.db.prepare(`
      SELECT id, name, category, code_snippet as codeSnippet, language
      FROM extracted_features
      WHERE description = '' OR applicability = ''
      ORDER BY usefulness DESC
      LIMIT ?
    `).all(count) as Array<{ id: number; name: string; category: string; codeSnippet: string; language: string }>;

    for (const f of features) {
      try {
        const prompt = `Analyze this ${f.language} code feature "${f.name}" (category: ${f.category}).
Return a JSON object with:
- "description": one-line description of what it does (max 100 chars)
- "applicability": how this could help an AI assistant system (max 150 chars)

Code:
\`\`\`${f.language}
${f.codeSnippet.slice(0, 1000)}
\`\`\`

Respond with ONLY the JSON object, no markdown.`;

        const response = await this.llmService.complete(prompt, {
          template: 'custom',
          maxTokens: 200,
        });

        const parsed = JSON.parse(response.text);
        if (parsed.description && parsed.applicability) {
          this.db.prepare(`
            UPDATE extracted_features SET description = ?, applicability = ? WHERE id = ?
          `).run(parsed.description, parsed.applicability, f.id);
        }
      } catch {
        // LLM enrichment is optional
      }
    }
  }
}
