import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { FeatureExtractor, ExtractedFeature } from './feature-extractor.js';
import type { RAGEngine } from '../rag/rag-engine.js';
import type { KnowledgeGraphEngine } from '../knowledge-graph/graph-engine.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';

// ── Types ────────────────────────────────────────────────

export interface FeatureWish {
  id: number;
  need: string;          // what Brain needs ("better retry logic", "caching layer")
  reason: string;        // why it needs it
  priority: number;      // 0-1 score
  matchedFeatureId: number | null; // if a matching extracted feature exists
  matchedFeatureName: string | null;
  matchScore: number;    // how well the match fits (0-1)
  status: 'open' | 'matched' | 'adopted' | 'dismissed';
  createdAt: string;
  updatedAt: string;
}

export interface FeatureConnection {
  id: number;
  featureIdA: number;
  featureIdB: number;
  nameA: string;
  nameB: string;
  relationship: string;  // "complementary", "prerequisite", "enhances", "alternative"
  strength: number;      // 0-1
  reason: string;
}

export interface RecommendationResult {
  wishesCreated: number;
  connectionsFound: number;
  matchesFound: number;
  durationMs: number;
}

export interface FeatureRecommenderStatus {
  totalWishes: number;
  openWishes: number;
  matchedWishes: number;
  adoptedWishes: number;
  totalConnections: number;
  lastScanAt: string | null;
}

// ── Need detection patterns ──────────────────────────────

/** Analyze error patterns, knowledge gaps, and existing code to detect needs */
const NEED_DETECTORS: Array<{
  need: string;
  reason: string;
  priority: number;
  /** SQL query that returns count > 0 if the need exists */
  detectQuery: string;
  /** Keywords to match against extracted features */
  matchKeywords: string[];
}> = [
  {
    need: 'retry mechanism',
    reason: 'Repeated errors of the same type suggest missing retry/backoff logic',
    priority: 0.8,
    detectQuery: `SELECT COUNT(*) as c FROM errors WHERE occurrence_count >= 3`,
    matchKeywords: ['retry', 'backoff', 'retryWithBackoff', 'retryable', 'exponential'],
  },
  {
    need: 'rate limiter',
    reason: 'API rate limit errors detected — need throttling/rate limiting',
    priority: 0.75,
    detectQuery: `SELECT COUNT(*) as c FROM errors WHERE fingerprint LIKE '%rate%limit%' OR fingerprint LIKE '%429%' OR fingerprint LIKE '%throttl%'`,
    matchKeywords: ['rateLimit', 'throttle', 'RateLimiter', 'Throttle', 'limiter'],
  },
  {
    need: 'cache layer',
    reason: 'Repeated identical queries could benefit from caching',
    priority: 0.7,
    detectQuery: `SELECT COUNT(*) as c FROM rag_vectors WHERE collection = 'errors' AND id > 10`,
    matchKeywords: ['cache', 'Cache', 'LRU', 'memoize', 'TTL', 'CacheStore', 'CacheManager'],
  },
  {
    need: 'better error classes',
    reason: 'Many UnknownError types — custom error hierarchy would improve error handling',
    priority: 0.65,
    detectQuery: `SELECT COUNT(*) as c FROM errors WHERE fingerprint LIKE '%UnknownError%'`,
    matchKeywords: ['Error', 'AppError', 'HttpError', 'CustomError', 'BaseError', 'error_handling'],
  },
  {
    need: 'queue/batch processing',
    reason: 'Multiple sequential operations could be batched for efficiency',
    priority: 0.6,
    detectQuery: `SELECT COUNT(*) as c FROM tool_usage WHERE duration_ms > 5000`,
    matchKeywords: ['queue', 'Queue', 'batch', 'Batch', 'pool', 'Pool', 'worker', 'Worker'],
  },
  {
    need: 'validation layer',
    reason: 'Input validation errors suggest need for schema validation',
    priority: 0.55,
    detectQuery: `SELECT COUNT(*) as c FROM errors WHERE fingerprint LIKE '%validat%' OR fingerprint LIKE '%schema%' OR fingerprint LIKE '%TypeError%'`,
    matchKeywords: ['validate', 'Validator', 'schema', 'Schema', 'zod', 'joi', 'sanitize'],
  },
  {
    need: 'streaming/pipeline pattern',
    reason: 'Large data processing could benefit from streaming',
    priority: 0.5,
    detectQuery: `SELECT COUNT(*) as c FROM rag_vectors WHERE collection = 'insights'`,
    matchKeywords: ['stream', 'Stream', 'pipe', 'Pipeline', 'Transform', 'readable', 'writable'],
  },
  {
    need: 'middleware pattern',
    reason: 'Request processing chains could use middleware architecture',
    priority: 0.45,
    detectQuery: `SELECT COUNT(*) as c FROM tool_usage WHERE tool_name LIKE '%.%' GROUP BY tool_name HAVING COUNT(*) > 5 LIMIT 1`,
    matchKeywords: ['middleware', 'Middleware', 'plugin', 'Plugin', 'hook', 'Hook', 'interceptor'],
  },
  {
    need: 'monitoring/metrics',
    reason: 'System observability would improve debugging and optimization',
    priority: 0.5,
    detectQuery: `SELECT 1 as c`,
    matchKeywords: ['monitor', 'Monitor', 'metric', 'Metric', 'health', 'HealthCheck', 'observe'],
  },
  {
    need: 'concurrency control',
    reason: 'Parallel operations need proper concurrency management',
    priority: 0.6,
    detectQuery: `SELECT COUNT(*) as c FROM tool_usage WHERE outcome = 'failure' AND tool_name LIKE '%parallel%' OR tool_name LIKE '%concurrent%'`,
    matchKeywords: ['concurrent', 'parallel', 'Semaphore', 'Mutex', 'lock', 'throttledQueue', 'Pool'],
  },
];

// ── Tag-based connection rules ───────────────────────────

const CONNECTION_RULES: Array<{
  tagA: string;
  tagB: string;
  relationship: string;
  strength: number;
  reason: string;
}> = [
  { tagA: 'caching', tagB: 'retry', relationship: 'complementary', strength: 0.8, reason: 'Caching reduces load, retry handles failures — together they make systems resilient' },
  { tagA: 'caching', tagB: 'validation', relationship: 'complementary', strength: 0.6, reason: 'Validate before caching to avoid storing invalid data' },
  { tagA: 'retry', tagB: 'logging', relationship: 'complementary', strength: 0.7, reason: 'Retry attempts should be logged for debugging' },
  { tagA: 'streaming', tagB: 'batching', relationship: 'complementary', strength: 0.8, reason: 'Stream processing and batch processing are complementary data patterns' },
  { tagA: 'async', tagB: 'concurrency', relationship: 'enhances', strength: 0.7, reason: 'Async operations benefit from concurrency control' },
  { tagA: 'events', tagB: 'logging', relationship: 'complementary', strength: 0.6, reason: 'Event systems should emit logs for observability' },
  { tagA: 'extensible', tagB: 'events', relationship: 'enhances', strength: 0.7, reason: 'Plugin/middleware systems often use events for hooks' },
  { tagA: 'testing', tagB: 'validation', relationship: 'complementary', strength: 0.5, reason: 'Test utilities and validation share assertion patterns' },
  { tagA: 'parsing', tagB: 'validation', relationship: 'prerequisite', strength: 0.7, reason: 'Parse first, then validate — they go hand in hand' },
  { tagA: 'concurrency', tagB: 'batching', relationship: 'enhances', strength: 0.7, reason: 'Batch operations with concurrency limits for optimal throughput' },
];

// ── FeatureRecommender ───────────────────────────────────

export class FeatureRecommender {
  private readonly db: Database.Database;
  private readonly log = getLogger();
  private featureExtractor: FeatureExtractor | null = null;
  private ragEngine: RAGEngine | null = null;
  private knowledgeGraph: KnowledgeGraphEngine | null = null;
  private thoughtStream: ThoughtStream | null = null;
  private lastScanAt: string | null = null;

  constructor(db: Database.Database) {
    this.db = db;
    this.ensureTables();
  }

  setFeatureExtractor(fe: FeatureExtractor): void { this.featureExtractor = fe; }
  setRAGEngine(rag: RAGEngine): void { this.ragEngine = rag; }
  setKnowledgeGraph(kg: KnowledgeGraphEngine): void { this.knowledgeGraph = kg; }
  setThoughtStream(ts: ThoughtStream): void { this.thoughtStream = ts; }

  private ensureTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS feature_wishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        need TEXT NOT NULL,
        reason TEXT NOT NULL DEFAULT '',
        priority REAL DEFAULT 0.5,
        matched_feature_id INTEGER,
        matched_feature_name TEXT,
        match_score REAL DEFAULT 0,
        status TEXT DEFAULT 'open',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(need)
      );
      CREATE INDEX IF NOT EXISTS idx_wishes_status ON feature_wishes(status);
      CREATE INDEX IF NOT EXISTS idx_wishes_priority ON feature_wishes(priority DESC);

      CREATE TABLE IF NOT EXISTS feature_connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feature_id_a INTEGER NOT NULL,
        feature_id_b INTEGER NOT NULL,
        name_a TEXT NOT NULL,
        name_b TEXT NOT NULL,
        relationship TEXT NOT NULL DEFAULT 'complementary',
        strength REAL DEFAULT 0.5,
        reason TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(feature_id_a, feature_id_b)
      );
      CREATE INDEX IF NOT EXISTS idx_connections_feature ON feature_connections(feature_id_a);
    `);
  }

  /**
   * Full recommendation cycle: detect needs → match features → build connections.
   * Called periodically by ResearchOrchestrator.
   */
  async runCycle(): Promise<RecommendationResult> {
    const start = Date.now();
    let wishesCreated = 0;
    let connectionsFound = 0;
    let matchesFound = 0;

    this.thoughtStream?.emit('feature_recommender', 'analyzing',
      'Scanning for feature needs and connections...', 'routine');

    // 1. Detect needs from Brain's own data
    wishesCreated = this.detectNeeds();

    // 2. Match wishes against extracted features
    matchesFound = this.matchWishesToFeatures();

    // 3. Build connections between features
    connectionsFound = this.buildConnections();

    this.lastScanAt = new Date().toISOString();

    if (wishesCreated > 0 || matchesFound > 0) {
      this.thoughtStream?.emit('feature_recommender', 'discovering',
        `Feature scan: ${wishesCreated} needs detected, ${matchesFound} matches found, ${connectionsFound} connections built`,
        matchesFound > 0 ? 'notable' : 'routine');
    }

    this.log.info(`[FeatureRecommender] Cycle complete: ${wishesCreated} wishes, ${matchesFound} matches, ${connectionsFound} connections (${Date.now() - start}ms)`);

    return {
      wishesCreated,
      connectionsFound,
      matchesFound,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Detect needs by analyzing Brain's own data (errors, tool usage, knowledge gaps).
   */
  private detectNeeds(): number {
    let created = 0;

    for (const detector of NEED_DETECTORS) {
      try {
        const result = this.db.prepare(detector.detectQuery).get() as { c: number } | undefined;
        if (result && result.c > 0) {
          const inserted = this.db.prepare(`
            INSERT OR IGNORE INTO feature_wishes (need, reason, priority)
            VALUES (?, ?, ?)
          `).run(detector.need, detector.reason, detector.priority);
          if (inserted.changes > 0) created++;
        }
      } catch {
        // Query may reference tables that don't exist — that's fine
      }
    }

    // Also detect needs from knowledge graph gaps
    if (this.knowledgeGraph) {
      try {
        const contradictions = this.knowledgeGraph.contradictions();
        if (contradictions.length > 3) {
          const inserted = this.db.prepare(`
            INSERT OR IGNORE INTO feature_wishes (need, reason, priority)
            VALUES (?, ?, ?)
          `).run(
            'contradiction resolver',
            `${contradictions.length} contradictions in knowledge graph need resolution`,
            0.55,
          );
          if (inserted.changes > 0) created++;
        }
      } catch { /* KG may not be ready */ }
    }

    return created;
  }

  /**
   * Match open wishes against extracted features.
   */
  private matchWishesToFeatures(): number {
    if (!this.featureExtractor) return 0;

    const openWishes = this.db.prepare(
      `SELECT id, need FROM feature_wishes WHERE status = 'open'`,
    ).all() as Array<{ id: number; need: string }>;

    let matched = 0;

    for (const wish of openWishes) {
      // Find the detector keywords for this need
      const detector = NEED_DETECTORS.find(d => d.need === wish.need);
      if (!detector) continue;

      // Search features matching any keyword
      let bestMatch: { id: number; name: string; score: number } | null = null;

      for (const keyword of detector.matchKeywords) {
        const features = this.featureExtractor.search({
          query: keyword,
          minUsefulness: 0.4,
          limit: 3,
        });

        for (const f of features) {
          const score = this.calculateMatchScore(wish.need, f, detector.matchKeywords);
          if (score > (bestMatch?.score ?? 0)) {
            bestMatch = { id: f.id, name: f.name, score };
          }
        }
      }

      if (bestMatch && bestMatch.score >= 0.3) {
        this.db.prepare(`
          UPDATE feature_wishes
          SET matched_feature_id = ?, matched_feature_name = ?, match_score = ?,
              status = 'matched', updated_at = datetime('now')
          WHERE id = ?
        `).run(bestMatch.id, bestMatch.name, bestMatch.score, wish.id);
        matched++;
      }
    }

    return matched;
  }

  /**
   * Build connections between extracted features based on tags and co-occurrence.
   */
  private buildConnections(): number {
    if (!this.featureExtractor) return 0;

    const allFeatures = this.featureExtractor.search({ minUsefulness: 0.4, limit: 100 });
    let created = 0;

    // Parse tags for each feature
    const featureTags: Map<number, { feature: ExtractedFeature; tags: string[] }> = new Map();
    for (const f of allFeatures) {
      const tags = typeof f.tags === 'string' ? JSON.parse(f.tags) : (f.tags ?? []);
      featureTags.set(f.id, { feature: f, tags });
    }

    // Apply connection rules
    for (const rule of CONNECTION_RULES) {
      const withTagA = [...featureTags.entries()].filter(([, v]) => v.tags.includes(rule.tagA));
      const withTagB = [...featureTags.entries()].filter(([, v]) => v.tags.includes(rule.tagB));

      for (const [idA, a] of withTagA) {
        for (const [idB, b] of withTagB) {
          if (idA === idB) continue;
          // Ensure consistent ordering (lower ID first)
          const [first, second] = idA < idB ? [idA, idB] : [idB, idA];
          const [nameFirst, nameSecond] = idA < idB
            ? [a.feature.name, b.feature.name]
            : [b.feature.name, a.feature.name];

          try {
            const inserted = this.db.prepare(`
              INSERT OR IGNORE INTO feature_connections
                (feature_id_a, feature_id_b, name_a, name_b, relationship, strength, reason)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(first, second, nameFirst, nameSecond, rule.relationship, rule.strength, rule.reason);
            if (inserted.changes > 0) created++;
          } catch { /* duplicate */ }
        }
      }
    }

    // Also connect features from the same repo that share categories
    const byRepo = new Map<string, ExtractedFeature[]>();
    for (const f of allFeatures) {
      const list = byRepo.get(f.repo) ?? [];
      list.push(f);
      byRepo.set(f.repo, list);
    }

    for (const features of byRepo.values()) {
      if (features.length < 2) continue;
      // Connect top features within same repo as "complementary"
      const top = features.sort((a, b) => b.usefulness - a.usefulness).slice(0, 5);
      for (let i = 0; i < top.length; i++) {
        for (let j = i + 1; j < top.length; j++) {
          const a = top[i]!;
          const b = top[j]!;
          if (a.category === b.category) continue; // same category = less interesting
          try {
            this.db.prepare(`
              INSERT OR IGNORE INTO feature_connections
                (feature_id_a, feature_id_b, name_a, name_b, relationship, strength, reason)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              Math.min(a.id, b.id), Math.max(a.id, b.id),
              a.id < b.id ? a.name : b.name,
              a.id < b.id ? b.name : a.name,
              'complementary', 0.4,
              `Both from ${a.repo} — different roles (${a.category} + ${b.category})`,
            );
            created++;
          } catch { /* duplicate */ }
        }
      }
    }

    return created;
  }

  /**
   * Calculate how well a feature matches a need.
   */
  private calculateMatchScore(need: string, feature: ExtractedFeature, keywords: string[]): number {
    let score = 0;
    const lowerName = feature.name.toLowerCase();
    const lowerSnippet = (feature.codeSnippet ?? '').toLowerCase();
    const lowerNeed = need.toLowerCase();

    // Direct name match
    for (const kw of keywords) {
      if (lowerName.includes(kw.toLowerCase())) score += 0.3;
      if (lowerSnippet.includes(kw.toLowerCase())) score += 0.1;
    }

    // Need words in feature name
    for (const word of lowerNeed.split(/\s+/)) {
      if (word.length > 3 && lowerName.includes(word)) score += 0.2;
    }

    // Usefulness boost
    score += feature.usefulness * 0.2;

    return Math.min(1, score);
  }

  // ── Query methods ──────────────────────────────────────

  /**
   * Get the feature wishlist (what Brain wants).
   */
  getWishlist(status?: string): FeatureWish[] {
    const condition = status ? `WHERE status = ?` : '';
    const params = status ? [status] : [];

    return this.db.prepare(`
      SELECT id, need, reason, priority, matched_feature_id as matchedFeatureId,
             matched_feature_name as matchedFeatureName, match_score as matchScore,
             status, created_at as createdAt, updated_at as updatedAt
      FROM feature_wishes
      ${condition}
      ORDER BY priority DESC
    `).all(...params) as FeatureWish[];
  }

  /**
   * Get connections for a specific feature (what goes well with it).
   */
  getConnections(featureId?: number): FeatureConnection[] {
    if (featureId) {
      return this.db.prepare(`
        SELECT id, feature_id_a as featureIdA, feature_id_b as featureIdB,
               name_a as nameA, name_b as nameB, relationship, strength, reason
        FROM feature_connections
        WHERE feature_id_a = ? OR feature_id_b = ?
        ORDER BY strength DESC
      `).all(featureId, featureId) as FeatureConnection[];
    }

    return this.db.prepare(`
      SELECT id, feature_id_a as featureIdA, feature_id_b as featureIdB,
             name_a as nameA, name_b as nameB, relationship, strength, reason
      FROM feature_connections
      ORDER BY strength DESC
      LIMIT 50
    `).all() as FeatureConnection[];
  }

  /**
   * Get "if you have X, you could also use Y" suggestions.
   */
  getRelatedSuggestions(featureName: string): Array<{ feature: string; relationship: string; reason: string; strength: number }> {
    const connections = this.db.prepare(`
      SELECT name_a as nameA, name_b as nameB, relationship, strength, reason
      FROM feature_connections
      WHERE name_a = ? OR name_b = ?
      ORDER BY strength DESC
      LIMIT 10
    `).all(featureName, featureName) as Array<{ nameA: string; nameB: string; relationship: string; strength: number; reason: string }>;

    return connections.map(c => ({
      feature: c.nameA === featureName ? c.nameB : c.nameA,
      relationship: c.relationship,
      reason: c.reason,
      strength: c.strength,
    }));
  }

  /**
   * Adopt a feature (mark wish as fulfilled).
   */
  adoptFeature(wishId: number): void {
    this.db.prepare(`
      UPDATE feature_wishes SET status = 'adopted', updated_at = datetime('now') WHERE id = ?
    `).run(wishId);
  }

  /**
   * Dismiss a wish (not needed).
   */
  dismissWish(wishId: number): void {
    this.db.prepare(`
      UPDATE feature_wishes SET status = 'dismissed', updated_at = datetime('now') WHERE id = ?
    `).run(wishId);
  }

  getStatus(): FeatureRecommenderStatus {
    const total = this.db.prepare('SELECT COUNT(*) as c FROM feature_wishes').get() as { c: number };
    const open = this.db.prepare(`SELECT COUNT(*) as c FROM feature_wishes WHERE status = 'open'`).get() as { c: number };
    const matched = this.db.prepare(`SELECT COUNT(*) as c FROM feature_wishes WHERE status = 'matched'`).get() as { c: number };
    const adopted = this.db.prepare(`SELECT COUNT(*) as c FROM feature_wishes WHERE status = 'adopted'`).get() as { c: number };
    const connections = this.db.prepare('SELECT COUNT(*) as c FROM feature_connections').get() as { c: number };

    return {
      totalWishes: total.c,
      openWishes: open.c,
      matchedWishes: matched.c,
      adoptedWishes: adopted.c,
      totalConnections: connections.c,
      lastScanAt: this.lastScanAt,
    };
  }
}
