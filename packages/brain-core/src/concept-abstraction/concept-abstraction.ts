import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { MemoryPalace } from '../memory-palace/memory-palace.js';

// ── Types ───────────────────────────────────────────────

export interface ConceptAbstractionConfig {
  brainName: string;
  /** Minimum Dice similarity to form a cluster. Default: 0.35 */
  clusterThreshold?: number;
  /** Minimum cluster size to keep. Default: 3 */
  minClusterSize?: number;
  /** Level-1 re-cluster threshold. Default: 0.25 */
  level1Threshold?: number;
  /** Level-2 re-cluster threshold. Default: 0.20 */
  level2Threshold?: number;
  /** Minimum word occurrence ratio for keyword extraction. Default: 0.6 */
  keywordMinRatio?: number;
}

export interface ConceptDataSources {
  getPrinciples: (domain?: string, limit?: number) => Array<{ id?: string | number; statement: string; confidence: number; domain?: string }>;
  getAntiPatterns: (domain?: string, limit?: number) => Array<{ id?: string | number; statement: string; confidence?: number; domain?: string }>;
  getHypotheses?: (status?: string, limit?: number) => Array<{ id?: string | number; statement: string; confidence?: number; domain?: string }>;
}

export interface AbstractConcept {
  id?: number;
  title: string;
  description: string;
  level: number;
  parentId: number | null;
  domain: string;
  memberCount: number;
  avgConfidence: number;
  avgSimilarity: number;
  keywords: string[];
  transferability: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConceptMember {
  conceptId: number;
  memberType: MemberType;
  memberId: number;
  similarityToCentroid: number;
}

export type MemberType = 'principle' | 'anti_pattern' | 'strategy' | 'hypothesis' | 'concept';

export interface ConceptHistoryEntry {
  cycle: number;
  totalConcepts: number;
  conceptsByLevel: Record<number, number>;
  newCount: number;
  mergedCount: number;
  avgTransferability: number;
}

export interface ConceptHierarchy {
  concept: AbstractConcept;
  children: ConceptHierarchy[];
  members: ConceptMember[];
}

export interface ConceptStatus {
  totalConcepts: number;
  conceptsByLevel: Record<number, number>;
  avgTransferability: number;
  topConcepts: AbstractConcept[];
  recentHistory: ConceptHistoryEntry[];
  cycleCount: number;
}

// ── Migration ───────────────────────────────────────────

export function runConceptAbstractionMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS abstract_concepts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      level INTEGER NOT NULL DEFAULT 0,
      parent_id INTEGER,
      domain TEXT NOT NULL DEFAULT 'general',
      member_count INTEGER NOT NULL DEFAULT 0,
      avg_confidence REAL NOT NULL DEFAULT 0,
      avg_similarity REAL NOT NULL DEFAULT 0,
      keywords TEXT NOT NULL DEFAULT '[]',
      transferability REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES abstract_concepts(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_abstract_concepts_level ON abstract_concepts(level);
    CREATE INDEX IF NOT EXISTS idx_abstract_concepts_parent ON abstract_concepts(parent_id);
    CREATE INDEX IF NOT EXISTS idx_abstract_concepts_transferability ON abstract_concepts(transferability DESC);

    CREATE TABLE IF NOT EXISTS concept_members (
      concept_id INTEGER NOT NULL,
      member_type TEXT NOT NULL,
      member_id INTEGER NOT NULL,
      similarity_to_centroid REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (concept_id, member_type, member_id),
      FOREIGN KEY (concept_id) REFERENCES abstract_concepts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_concept_members_type ON concept_members(member_type);

    CREATE TABLE IF NOT EXISTS concept_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle INTEGER NOT NULL,
      total_concepts INTEGER NOT NULL DEFAULT 0,
      concepts_by_level TEXT NOT NULL DEFAULT '{}',
      new_count INTEGER NOT NULL DEFAULT 0,
      merged_count INTEGER NOT NULL DEFAULT 0,
      avg_transferability REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_concept_history_cycle ON concept_history(cycle DESC);
  `);
}

// ── Internal types ────────────────────────────────────────

interface KnowledgeItem {
  type: MemberType;
  id: number;
  text: string;
  confidence: number;
  domain: string;
}

interface Cluster {
  items: KnowledgeItem[];
  centroid: KnowledgeItem;
}

// ── Engine ──────────────────────────────────────────────

export class ConceptAbstraction {
  private readonly db: Database.Database;
  private readonly config: Required<ConceptAbstractionConfig>;
  private readonly log = getLogger();
  private ts: ThoughtStream | null = null;
  private sources: ConceptDataSources | null = null;
  private cycleCount = 0;

  // Prepared statements
  private readonly insertConcept: Database.Statement;
  private readonly insertMember: Database.Statement;
  private readonly insertHistory: Database.Statement;
  private readonly getConceptById: Database.Statement;
  private readonly getMembersByConcept: Database.Statement;
  private readonly getConceptsByLevelStmt: Database.Statement;
  private readonly getChildConcepts: Database.Statement;
  private readonly getTopConceptsStmt: Database.Statement;
  private readonly getTransferableStmt: Database.Statement;
  private readonly getHistoryStmt: Database.Statement;
  private readonly countConceptsStmt: Database.Statement;
  private readonly countByLevelStmt: Database.Statement;
  private readonly avgTransferabilityStmt: Database.Statement;
  private readonly clearConceptsStmt: Database.Statement;
  private readonly clearMembersStmt: Database.Statement;

  constructor(db: Database.Database, config: ConceptAbstractionConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      clusterThreshold: config.clusterThreshold ?? 0.35,
      minClusterSize: config.minClusterSize ?? 3,
      level1Threshold: config.level1Threshold ?? 0.25,
      level2Threshold: config.level2Threshold ?? 0.20,
      keywordMinRatio: config.keywordMinRatio ?? 0.6,
    };

    runConceptAbstractionMigration(db);

    this.insertConcept = db.prepare(`
      INSERT INTO abstract_concepts (title, description, level, parent_id, domain, member_count, avg_confidence, avg_similarity, keywords, transferability)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.insertMember = db.prepare(`
      INSERT OR REPLACE INTO concept_members (concept_id, member_type, member_id, similarity_to_centroid)
      VALUES (?, ?, ?, ?)
    `);
    this.insertHistory = db.prepare(`
      INSERT INTO concept_history (cycle, total_concepts, concepts_by_level, new_count, merged_count, avg_transferability)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.getConceptById = db.prepare('SELECT * FROM abstract_concepts WHERE id = ?');
    this.getMembersByConcept = db.prepare('SELECT * FROM concept_members WHERE concept_id = ?');
    this.getConceptsByLevelStmt = db.prepare('SELECT * FROM abstract_concepts WHERE level = ? ORDER BY member_count DESC');
    this.getChildConcepts = db.prepare('SELECT * FROM abstract_concepts WHERE parent_id = ? ORDER BY member_count DESC');
    this.getTopConceptsStmt = db.prepare('SELECT * FROM abstract_concepts ORDER BY member_count DESC, transferability DESC LIMIT ?');
    this.getTransferableStmt = db.prepare('SELECT * FROM abstract_concepts WHERE transferability >= ? ORDER BY transferability DESC, member_count DESC');
    this.getHistoryStmt = db.prepare('SELECT * FROM concept_history ORDER BY cycle DESC LIMIT ?');
    this.countConceptsStmt = db.prepare('SELECT COUNT(*) as count FROM abstract_concepts');
    this.countByLevelStmt = db.prepare('SELECT level, COUNT(*) as count FROM abstract_concepts GROUP BY level');
    this.avgTransferabilityStmt = db.prepare('SELECT AVG(transferability) as avg FROM abstract_concepts');
    this.clearConceptsStmt = db.prepare('DELETE FROM abstract_concepts');
    this.clearMembersStmt = db.prepare('DELETE FROM concept_members');
  }

  setThoughtStream(stream: ThoughtStream): void {
    this.ts = stream;
  }

  setDataSources(sources: ConceptDataSources): void {
    this.sources = sources;
  }

  // ── Main algorithm ────────────────────────────────────

  /** Run concept formation: gather → cluster → hierarchy → persist */
  formConcepts(): { newConcepts: number; totalConcepts: number; levels: Record<number, number> } {
    this.cycleCount++;
    const ts = this.ts;
    ts?.emit('concept_abstraction', 'analyzing', 'Forming abstract concepts from knowledge...', 'routine');

    if (!this.sources) {
      this.log.warn('[concept-abstraction] No data sources set');
      return { newConcepts: 0, totalConcepts: 0, levels: {} };
    }

    // Phase 1: Gather all knowledge items
    const items = this.gatherItems();
    if (items.length < this.config.minClusterSize) {
      ts?.emit('concept_abstraction', 'reflecting', `Not enough items to cluster (${items.length})`, 'routine');
      return { newConcepts: 0, totalConcepts: this.getTotalCount(), levels: this.getLevelCounts() };
    }

    // Count existing before clearing
    const existingCount = this.getTotalCount();

    // Clear old concepts for full rebuild
    this.db.transaction(() => {
      this.clearMembersStmt.run();
      this.clearConceptsStmt.run();
    })();

    // Phase 2: Cluster level 0 (concrete → abstract)
    const level0Clusters = this.clusterItems(items, this.config.clusterThreshold);
    const level0Concepts = this.persistClusters(level0Clusters, 0, null);

    // Phase 3: Hierarchy — re-cluster level 0 concepts into level 1
    let level1Concepts: number[] = [];
    if (level0Concepts.length >= this.config.minClusterSize) {
      const l0Items = this.conceptsToItems(level0Concepts);
      const level1Clusters = this.clusterItems(l0Items, this.config.level1Threshold);
      level1Concepts = this.persistClusters(level1Clusters, 1, null);

      // Link level-0 → level-1 parentage
      for (const cluster of level1Clusters) {
        const parentId = this.findConceptByTitle(cluster.centroid.text, 1);
        if (parentId) {
          for (const item of cluster.items) {
            if (item.type === 'concept') {
              this.db.prepare('UPDATE abstract_concepts SET parent_id = ? WHERE id = ?').run(parentId, item.id);
            }
          }
        }
      }
    }

    // Phase 3b: level 1 → level 2
    let level2Concepts: number[] = [];
    if (level1Concepts.length >= this.config.minClusterSize) {
      const l1Items = this.conceptsToItems(level1Concepts);
      const level2Clusters = this.clusterItems(l1Items, this.config.level2Threshold);
      level2Concepts = this.persistClusters(level2Clusters, 2, null);

      for (const cluster of level2Clusters) {
        const parentId = this.findConceptByTitle(cluster.centroid.text, 2);
        if (parentId) {
          for (const item of cluster.items) {
            if (item.type === 'concept') {
              this.db.prepare('UPDATE abstract_concepts SET parent_id = ? WHERE id = ?').run(parentId, item.id);
            }
          }
        }
      }
    }

    const totalConcepts = this.getTotalCount();
    const levels = this.getLevelCounts();
    const newCount = Math.max(0, totalConcepts - existingCount);
    const mergedCount = Math.max(0, existingCount - totalConcepts);
    const avgTransfer = (this.avgTransferabilityStmt.get() as { avg: number | null })?.avg ?? 0;

    // Record history
    this.insertHistory.run(
      this.cycleCount,
      totalConcepts,
      JSON.stringify(levels),
      newCount,
      mergedCount,
      avgTransfer,
    );

    ts?.emit(
      'concept_abstraction',
      'discovering',
      `Formed ${totalConcepts} concepts (L0: ${levels[0] ?? 0}, L1: ${levels[1] ?? 0}, L2: ${levels[2] ?? 0})`,
      totalConcepts > 0 ? 'notable' : 'routine',
    );

    this.log.info(`[concept-abstraction] Formed ${totalConcepts} concepts across ${Object.keys(levels).length} levels`);
    return { newConcepts: newCount, totalConcepts, levels };
  }

  // ── Queries ───────────────────────────────────────────

  getConceptsByLevel(level: number): AbstractConcept[] {
    const rows = this.getConceptsByLevelStmt.all(level) as RawConcept[];
    return rows.map(toAbstractConcept);
  }

  getHierarchy(conceptId: number): ConceptHierarchy | null {
    const row = this.getConceptById.get(conceptId) as RawConcept | undefined;
    if (!row) return null;
    const concept = toAbstractConcept(row);
    const members = (this.getMembersByConcept.all(conceptId) as RawMember[]).map(toConceptMember);
    const children = (this.getChildConcepts.all(conceptId) as RawConcept[]).map(r => {
      const child = toAbstractConcept(r);
      const childMembers = (this.getMembersByConcept.all(r.id) as RawMember[]).map(toConceptMember);
      const grandchildren = (this.getChildConcepts.all(r.id) as RawConcept[]).map(gc => ({
        concept: toAbstractConcept(gc),
        children: [],
        members: (this.getMembersByConcept.all(gc.id) as RawMember[]).map(toConceptMember),
      }));
      return { concept: child, children: grandchildren, members: childMembers };
    });
    return { concept, children, members };
  }

  getMembers(conceptId: number): ConceptMember[] {
    return (this.getMembersByConcept.all(conceptId) as RawMember[]).map(toConceptMember);
  }

  getTransferableConcepts(minTransferability = 0.3): AbstractConcept[] {
    return (this.getTransferableStmt.all(minTransferability) as RawConcept[]).map(toAbstractConcept);
  }

  /** Register all concepts as nodes in MemoryPalace and link members. */
  registerInPalace(palace: MemoryPalace): number {
    const concepts = (this.getTopConceptsStmt.all(500) as RawConcept[]).map(toAbstractConcept);
    let registered = 0;

    for (const concept of concepts) {
      // Register concept node
      palace.addConnection('concept' as never, String(concept.id!), 'concept' as never, String(concept.id!), 'related_to' as never, 0);

      // Link members → concept
      const members = this.getMembers(concept.id!);
      for (const member of members) {
        if (member.memberType !== 'concept') {
          palace.addConnection(
            member.memberType as never,
            String(member.memberId),
            'concept' as never,
            String(concept.id!),
            'abstracted_from' as never,
            member.similarityToCentroid,
          );
        }
      }

      // Link child concepts with 'generalizes'
      if (concept.parentId) {
        palace.addConnection(
          'concept' as never,
          String(concept.parentId),
          'concept' as never,
          String(concept.id!),
          'generalizes' as never,
          concept.avgSimilarity,
        );
      }

      registered++;
    }

    return registered;
  }

  getStatus(): ConceptStatus {
    return {
      totalConcepts: this.getTotalCount(),
      conceptsByLevel: this.getLevelCounts(),
      avgTransferability: (this.avgTransferabilityStmt.get() as { avg: number | null })?.avg ?? 0,
      topConcepts: (this.getTopConceptsStmt.all(10) as RawConcept[]).map(toAbstractConcept),
      recentHistory: (this.getHistoryStmt.all(10) as RawHistory[]).map(toHistoryEntry),
      cycleCount: this.cycleCount,
    };
  }

  // ── Private: Gathering ────────────────────────────────

  private gatherItems(): KnowledgeItem[] {
    const items: KnowledgeItem[] = [];
    if (!this.sources) return items;

    try {
      const principles = this.sources.getPrinciples(undefined, 500);
      for (const p of principles) {
        items.push({
          type: 'principle',
          id: typeof p.id === 'string' ? parseInt(p.id, 10) || 0 : (p.id ?? 0),
          text: p.statement,
          confidence: p.confidence,
          domain: p.domain ?? 'general',
        });
      }
    } catch (err) { this.log.warn(`[concept-abstraction] Error gathering principles: ${(err as Error).message}`); }

    try {
      const antiPatterns = this.sources.getAntiPatterns(undefined, 500);
      for (const ap of antiPatterns) {
        items.push({
          type: 'anti_pattern',
          id: typeof ap.id === 'string' ? parseInt(ap.id, 10) || 0 : (ap.id ?? 0),
          text: ap.statement,
          confidence: ap.confidence ?? 0.7,
          domain: ap.domain ?? 'general',
        });
      }
    } catch (err) { this.log.warn(`[concept-abstraction] Error gathering anti-patterns: ${(err as Error).message}`); }

    if (this.sources.getHypotheses) {
      try {
        const hypotheses = this.sources.getHypotheses('confirmed', 500);
        for (const h of hypotheses) {
          items.push({
            type: 'hypothesis',
            id: typeof h.id === 'string' ? parseInt(h.id, 10) || 0 : (h.id ?? 0),
            text: h.statement,
            confidence: h.confidence ?? 0.5,
            domain: h.domain ?? 'general',
          });
        }
      } catch (err) { this.log.warn(`[concept-abstraction] Error gathering hypotheses: ${(err as Error).message}`); }
    }

    return items;
  }

  // ── Private: Clustering ───────────────────────────────

  /** Greedy agglomerative clustering via bigram Dice similarity. */
  private clusterItems(items: KnowledgeItem[], threshold: number): Cluster[] {
    const assigned = new Set<number>();
    const clusters: Cluster[] = [];

    // Sort by confidence descending — best items become centroids
    const sorted = [...items].sort((a, b) => b.confidence - a.confidence);

    for (let i = 0; i < sorted.length; i++) {
      if (assigned.has(i)) continue;

      const centroid = sorted[i];
      const cluster: KnowledgeItem[] = [centroid];
      assigned.add(i);

      for (let j = i + 1; j < sorted.length; j++) {
        if (assigned.has(j)) continue;
        const sim = this.textOverlap(centroid.text, sorted[j].text);
        if (sim >= threshold) {
          cluster.push(sorted[j]);
          assigned.add(j);
        }
      }

      if (cluster.length >= this.config.minClusterSize) {
        clusters.push({ items: cluster, centroid });
      }
    }

    return clusters;
  }

  /** Persist clusters as AbstractConcepts with members. Returns array of concept IDs. */
  private persistClusters(clusters: Cluster[], level: number, _parentId: number | null): number[] {
    const ids: number[] = [];

    for (const cluster of clusters) {
      const title = this.generateTitle(cluster);
      const description = this.generateDescription(cluster);
      const keywords = this.extractKeywords(cluster);
      const avgConfidence = cluster.items.reduce((s, it) => s + it.confidence, 0) / cluster.items.length;
      const avgSim = this.avgClusterSimilarity(cluster);
      const transferability = this.computeTransferability(cluster);
      const domain = this.computeDomain(cluster);

      const result = this.insertConcept.run(
        title,
        description,
        level,
        null, // parent_id set later
        domain,
        cluster.items.length,
        avgConfidence,
        avgSim,
        JSON.stringify(keywords),
        transferability,
      );
      const conceptId = Number(result.lastInsertRowid);
      ids.push(conceptId);

      // Insert members
      for (const item of cluster.items) {
        const sim = this.textOverlap(cluster.centroid.text, item.text);
        this.insertMember.run(conceptId, item.type, item.id, sim);
      }
    }

    return ids;
  }

  /** Convert persisted concepts to KnowledgeItems for re-clustering. */
  private conceptsToItems(conceptIds: number[]): KnowledgeItem[] {
    return conceptIds.map(id => {
      const row = this.getConceptById.get(id) as RawConcept | undefined;
      if (!row) return null;
      return {
        type: 'concept' as MemberType,
        id: row.id,
        text: `${row.title}: ${row.description}`,
        confidence: row.avg_confidence,
        domain: row.domain,
      };
    }).filter((x): x is KnowledgeItem => x !== null);
  }

  private findConceptByTitle(text: string, level: number): number | null {
    const concepts = this.getConceptsByLevelStmt.all(level) as RawConcept[];
    // Find best match by title overlap
    let bestId: number | null = null;
    let bestSim = 0;
    for (const c of concepts) {
      const candidateText = `${c.title}: ${c.description}`;
      const sim = this.textOverlap(text, candidateText);
      if (sim > bestSim) {
        bestSim = sim;
        bestId = c.id;
      }
    }
    return bestSim > 0.15 ? bestId : null;
  }

  // ── Private: Text analysis ────────────────────────────

  /** Bigram Dice coefficient — same algorithm as MemoryPalace and DreamConsolidator. */
  private textOverlap(a: string, b: string): number {
    if (!a || !b) return 0;
    const aBigrams = this.bigrams(a.toLowerCase());
    const bBigrams = this.bigrams(b.toLowerCase());
    if (aBigrams.size === 0 || bBigrams.size === 0) return 0;

    let intersection = 0;
    for (const bg of aBigrams) {
      if (bBigrams.has(bg)) intersection++;
    }

    return (2 * intersection) / (aBigrams.size + bBigrams.size);
  }

  private bigrams(text: string): Set<string> {
    const words = text.split(/\s+/).filter(w => w.length > 2);
    const result = new Set<string>();
    for (const word of words) {
      for (let i = 0; i < word.length - 1; i++) {
        result.add(word.substring(i, i + 2));
      }
    }
    return result;
  }

  private generateTitle(cluster: Cluster): string {
    const keywords = this.extractKeywords(cluster);
    if (keywords.length >= 2) return keywords.slice(0, 3).join(' + ');
    // Fallback: use centroid's first few meaningful words
    const words = cluster.centroid.text.split(/\s+/).filter(w => w.length > 3).slice(0, 4);
    return words.join(' ') || 'Abstract Concept';
  }

  private generateDescription(cluster: Cluster): string {
    const types = new Set(cluster.items.map(i => i.type));
    const typeStr = [...types].join(', ');
    return `Abstraction of ${cluster.items.length} knowledge items (${typeStr}) centered around: ${cluster.centroid.text.substring(0, 120)}`;
  }

  private extractKeywords(cluster: Cluster): string[] {
    const wordCounts = new Map<string, number>();
    const stopwords = new Set([
      'the', 'and', 'for', 'that', 'this', 'with', 'from', 'are', 'not', 'was', 'but', 'has', 'have', 'had',
      'been', 'will', 'can', 'may', 'should', 'could', 'would', 'more', 'than', 'also', 'its', 'into',
      'when', 'where', 'which', 'their', 'them', 'then', 'there', 'these', 'those', 'being', 'each',
      'der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'den', 'dem', 'des', 'sich', 'mit', 'auf',
      'von', 'als', 'für', 'nicht', 'auch', 'nur', 'noch', 'oder', 'aber', 'nach', 'wie', 'bei',
    ]);

    for (const item of cluster.items) {
      const words = item.text.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
      const unique = new Set(words);
      for (const w of unique) {
        wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
      }
    }

    const minOccurrence = Math.ceil(cluster.items.length * this.config.keywordMinRatio);
    return [...wordCounts.entries()]
      .filter(([, count]) => count >= minOccurrence)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([word]) => word);
  }

  private avgClusterSimilarity(cluster: Cluster): number {
    if (cluster.items.length <= 1) return 1;
    let total = 0;
    let count = 0;
    for (const item of cluster.items) {
      if (item !== cluster.centroid) {
        total += this.textOverlap(cluster.centroid.text, item.text);
        count++;
      }
    }
    return count > 0 ? total / count : 0;
  }

  private computeTransferability(cluster: Cluster): number {
    const domains = new Set(cluster.items.map(i => i.domain));
    if (domains.size <= 1) return 0;
    // Cross-domain items / total
    const mainDomain = this.mostCommon(cluster.items.map(i => i.domain));
    const crossDomain = cluster.items.filter(i => i.domain !== mainDomain).length;
    return crossDomain / cluster.items.length;
  }

  private computeDomain(cluster: Cluster): string {
    const domains = cluster.items.map(i => i.domain);
    const unique = new Set(domains);
    if (unique.size > 1) return 'cross-domain';
    return domains[0] ?? 'general';
  }

  private mostCommon(arr: string[]): string {
    const counts = new Map<string, number>();
    for (const item of arr) counts.set(item, (counts.get(item) ?? 0) + 1);
    let best = arr[0] ?? 'general';
    let bestCount = 0;
    for (const [key, count] of counts) {
      if (count > bestCount) { best = key; bestCount = count; }
    }
    return best;
  }

  // ── Private: Helpers ──────────────────────────────────

  private getTotalCount(): number {
    return (this.countConceptsStmt.get() as { count: number }).count;
  }

  private getLevelCounts(): Record<number, number> {
    const rows = this.countByLevelStmt.all() as Array<{ level: number; count: number }>;
    const result: Record<number, number> = {};
    for (const row of rows) result[row.level] = row.count;
    return result;
  }
}

// ── Row mappers ──────────────────────────────────────────

interface RawConcept {
  id: number;
  title: string;
  description: string;
  level: number;
  parent_id: number | null;
  domain: string;
  member_count: number;
  avg_confidence: number;
  avg_similarity: number;
  keywords: string;
  transferability: number;
  created_at: string;
  updated_at: string;
}

interface RawMember {
  concept_id: number;
  member_type: string;
  member_id: number;
  similarity_to_centroid: number;
}

interface RawHistory {
  cycle: number;
  total_concepts: number;
  concepts_by_level: string;
  new_count: number;
  merged_count: number;
  avg_transferability: number;
}

function toAbstractConcept(row: RawConcept): AbstractConcept {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    level: row.level,
    parentId: row.parent_id,
    domain: row.domain,
    memberCount: row.member_count,
    avgConfidence: row.avg_confidence,
    avgSimilarity: row.avg_similarity,
    keywords: JSON.parse(row.keywords),
    transferability: row.transferability,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toConceptMember(row: RawMember): ConceptMember {
  return {
    conceptId: row.concept_id,
    memberType: row.member_type as MemberType,
    memberId: row.member_id,
    similarityToCentroid: row.similarity_to_centroid,
  };
}

function toHistoryEntry(row: RawHistory): ConceptHistoryEntry {
  return {
    cycle: row.cycle,
    totalConcepts: row.total_concepts,
    conceptsByLevel: JSON.parse(row.concepts_by_level),
    newCount: row.new_count,
    mergedCount: row.merged_count,
    avgTransferability: row.avg_transferability,
  };
}
