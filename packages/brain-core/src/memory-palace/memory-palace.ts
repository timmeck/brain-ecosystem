import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';

// ── Types ───────────────────────────────────────────────

export interface MemoryPalaceConfig {
  brainName: string;
  /** Maximum BFS path depth. Default: 6 */
  maxPathDepth?: number;
  /** Minimum strength for auto-detected connections. Default: 0.3 */
  minAutoStrength?: number;
}

export type NodeType =
  | 'principle'
  | 'anti_pattern'
  | 'strategy'
  | 'hypothesis'
  | 'experiment'
  | 'journal'
  | 'anomaly'
  | 'causal_edge'
  | 'emergence'
  | 'prediction'
  | 'curiosity_gap';

export type RelationType =
  | 'derived_from'
  | 'contradicts'
  | 'supports'
  | 'caused_by'
  | 'tested_by'
  | 'related_to'
  | 'supersedes'
  | 'references';

export interface KnowledgeConnection {
  id?: number;
  sourceType: NodeType;
  sourceId: string;
  targetType: NodeType;
  targetId: string;
  relation: RelationType;
  strength: number;
  autoDetected: boolean;
  createdAt: string;
}

export interface KnowledgeNode {
  type: NodeType;
  id: string;
  label: string;
  connections: number;
}

export interface KnowledgeEdge {
  source: string; // "type:id"
  target: string; // "type:id"
  relation: RelationType;
  strength: number;
}

export interface KnowledgeMap {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

export interface PathStep {
  type: NodeType;
  id: string;
  relation: RelationType;
}

export interface MemoryPalaceStats {
  totalNodes: number;
  totalEdges: number;
  density: number;
  nodesByType: Record<string, number>;
  topConnected: Array<{ type: NodeType; id: string; connections: number }>;
  avgStrength: number;
}

export interface BuildResult {
  newConnections: number;
  totalConnections: number;
  scannedSources: string[];
}

export interface MemoryPalaceStatus {
  stats: MemoryPalaceStats;
  recentConnections: KnowledgeConnection[];
  topConnectedNodes: Array<{ type: NodeType; id: string; connections: number }>;
  uptime: number;
}

export interface MemoryPalaceDataSources {
  /** Query confirmed hypotheses: {id, statement, status} */
  getHypotheses?: (status?: string, limit?: number) => Array<{ id?: number | string; statement: string; status?: string }>;
  /** Query principles: {id, statement} */
  getPrinciples?: (domain?: string, limit?: number) => Array<{ id: number | string; statement: string }>;
  /** Query anti-patterns: {id, statement} */
  getAntiPatterns?: (domain?: string, limit?: number) => Array<{ id: number | string; statement: string }>;
  /** Query experiments: {id, name, hypothesis} */
  getExperiments?: (status?: string, limit?: number) => Array<{ id?: number | string; name: string; hypothesis: string }>;
  /** Query journal entries: {id, title, tags (JSON string or array)} */
  getJournalEntries?: (limit?: number) => Array<{ id?: number; title: string; tags: string[] | string; data?: unknown }>;
  /** Query anomalies: {id, title} */
  getAnomalies?: (type?: string, limit?: number) => Array<{ id?: number; title: string }>;
  /** Query curiosity gaps: {id, topic} */
  getCuriosityGaps?: (limit?: number) => Array<{ id?: number; topic: string }>;
}

// ── Migration ───────────────────────────────────────────

export function runMemoryPalaceMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL DEFAULT 'related_to',
      strength REAL NOT NULL DEFAULT 0.5,
      auto_detected INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source_type, source_id, target_type, target_id, relation)
    );
    CREATE INDEX IF NOT EXISTS idx_kc_source ON knowledge_connections(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_kc_target ON knowledge_connections(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_kc_relation ON knowledge_connections(relation);
    CREATE INDEX IF NOT EXISTS idx_kc_strength ON knowledge_connections(strength DESC);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class MemoryPalace {
  private readonly db: Database.Database;
  private readonly config: Required<MemoryPalaceConfig>;
  private readonly log = getLogger();
  private ts: ThoughtStream | null = null;
  private sources: MemoryPalaceDataSources = {};
  private startTime = Date.now();

  // ── Prepared statements ──────────────────────────────
  private readonly stmtInsertConnection: Database.Statement;
  private readonly stmtGetConnectionsFor: Database.Statement;
  private readonly stmtGetConnectionsFrom: Database.Statement;
  private readonly stmtGetConnectionsTo: Database.Statement;
  private readonly stmtCountEdges: Database.Statement;
  private readonly stmtDistinctNodes: Database.Statement;
  private readonly stmtAvgStrength: Database.Statement;
  private readonly stmtTopConnected: Database.Statement;
  private readonly stmtRecentConnections: Database.Statement;
  private readonly stmtNodesByType: Database.Statement;
  private readonly stmtAllEdges: Database.Statement;

  constructor(db: Database.Database, config: MemoryPalaceConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      maxPathDepth: config.maxPathDepth ?? 6,
      minAutoStrength: config.minAutoStrength ?? 0.3,
    };

    runMemoryPalaceMigration(db);

    this.stmtInsertConnection = db.prepare(`
      INSERT OR IGNORE INTO knowledge_connections (source_type, source_id, target_type, target_id, relation, strength, auto_detected)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    this.stmtGetConnectionsFor = db.prepare(`
      SELECT * FROM knowledge_connections
      WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)
      ORDER BY strength DESC
    `);

    this.stmtGetConnectionsFrom = db.prepare(`
      SELECT * FROM knowledge_connections WHERE source_type = ? AND source_id = ? ORDER BY strength DESC
    `);

    this.stmtGetConnectionsTo = db.prepare(`
      SELECT * FROM knowledge_connections WHERE target_type = ? AND target_id = ? ORDER BY strength DESC
    `);

    this.stmtCountEdges = db.prepare('SELECT COUNT(*) as count FROM knowledge_connections');
    this.stmtDistinctNodes = db.prepare(`
      SELECT COUNT(*) as count FROM (
        SELECT source_type || ':' || source_id as node FROM knowledge_connections
        UNION
        SELECT target_type || ':' || target_id as node FROM knowledge_connections
      )
    `);
    this.stmtAvgStrength = db.prepare('SELECT AVG(strength) as avg FROM knowledge_connections');
    this.stmtTopConnected = db.prepare(`
      SELECT node_type, node_id, COUNT(*) as connections FROM (
        SELECT source_type as node_type, source_id as node_id FROM knowledge_connections
        UNION ALL
        SELECT target_type as node_type, target_id as node_id FROM knowledge_connections
      ) GROUP BY node_type, node_id ORDER BY connections DESC LIMIT ?
    `);
    this.stmtRecentConnections = db.prepare('SELECT * FROM knowledge_connections ORDER BY created_at DESC LIMIT ?');
    this.stmtNodesByType = db.prepare(`
      SELECT node_type, COUNT(*) as count FROM (
        SELECT source_type as node_type FROM knowledge_connections
        UNION ALL
        SELECT target_type as node_type FROM knowledge_connections
      ) GROUP BY node_type
    `);
    this.stmtAllEdges = db.prepare('SELECT * FROM knowledge_connections ORDER BY strength DESC LIMIT ?');
  }

  setThoughtStream(stream: ThoughtStream): void { this.ts = stream; }
  setDataSources(sources: MemoryPalaceDataSources): void { this.sources = sources; }

  // ── Build connections automatically ───────────────────

  buildConnections(): BuildResult {
    const scanned: string[] = [];
    let newCount = 0;

    // 1. Confirmed hypotheses → principles (text-overlap matching)
    if (this.sources.getHypotheses && this.sources.getPrinciples) {
      try {
        const confirmed = this.sources.getHypotheses('confirmed', 200);
        const principles = this.sources.getPrinciples(undefined, 200);
        for (const h of confirmed) {
          for (const p of principles) {
            const overlap = this.textOverlap(h.statement, p.statement);
            if (overlap >= this.config.minAutoStrength) {
              const added = this.insertConnection('hypothesis', String(h.id), 'principle', String(p.id), 'derived_from', overlap, true);
              if (added) newCount++;
            }
          }
        }
        scanned.push('hypotheses→principles');
      } catch (err) { this.log.warn(`[palace] hypotheses→principles scan error: ${(err as Error).message}`); }
    }

    // 2. Rejected hypotheses → anti-patterns
    if (this.sources.getHypotheses && this.sources.getAntiPatterns) {
      try {
        const rejected = this.sources.getHypotheses('rejected', 200);
        const antiPatterns = this.sources.getAntiPatterns(undefined, 200);
        for (const h of rejected) {
          for (const ap of antiPatterns) {
            const overlap = this.textOverlap(h.statement, ap.statement);
            if (overlap >= this.config.minAutoStrength) {
              const added = this.insertConnection('hypothesis', String(h.id), 'anti_pattern', String(ap.id), 'derived_from', overlap, true);
              if (added) newCount++;
            }
          }
        }
        scanned.push('rejected→anti_patterns');
      } catch (err) { this.log.warn(`[palace] rejected→anti_patterns scan error: ${(err as Error).message}`); }
    }

    // 3. Experiments → hypotheses (experiment.hypothesis match)
    if (this.sources.getExperiments && this.sources.getHypotheses) {
      try {
        const experiments = this.sources.getExperiments(undefined, 200);
        const allHypotheses = this.sources.getHypotheses(undefined, 500);
        for (const exp of experiments) {
          for (const h of allHypotheses) {
            const overlap = this.textOverlap(exp.hypothesis || exp.name, h.statement);
            if (overlap >= this.config.minAutoStrength) {
              const added = this.insertConnection('experiment', String(exp.id), 'hypothesis', String(h.id), 'tested_by', overlap, true);
              if (added) newCount++;
            }
          }
        }
        scanned.push('experiments→hypotheses');
      } catch (err) { this.log.warn(`[palace] experiments→hypotheses scan error: ${(err as Error).message}`); }
    }

    // 4. Anomalies → experiments (text-overlap)
    if (this.sources.getAnomalies && this.sources.getExperiments) {
      try {
        const anomalies = this.sources.getAnomalies(undefined, 200);
        const experiments = this.sources.getExperiments(undefined, 200);
        for (const a of anomalies) {
          for (const exp of experiments) {
            const overlap = this.textOverlap(a.title, exp.name);
            if (overlap >= this.config.minAutoStrength) {
              const added = this.insertConnection('anomaly', String(a.id), 'experiment', String(exp.id), 'caused_by', overlap, true);
              if (added) newCount++;
            }
          }
        }
        scanned.push('anomalies→experiments');
      } catch (err) { this.log.warn(`[palace] anomalies→experiments scan error: ${(err as Error).message}`); }
    }

    // 5. Journal entries → cross-references via tags/data
    if (this.sources.getJournalEntries) {
      try {
        const entries = this.sources.getJournalEntries(500);
        for (const entry of entries) {
          // Parse tags for cross-references (supports string[] or JSON string)
          let tags: string[] = [];
          if (Array.isArray(entry.tags)) { tags = entry.tags; }
          else { try { tags = JSON.parse(entry.tags || '[]'); } catch { /* skip */ } }

          // Connect journal entries that share tags
          for (const other of entries) {
            if (entry.id === other.id) continue;
            let otherTags: string[] = [];
            if (Array.isArray(other.tags)) { otherTags = other.tags; }
            else { try { otherTags = JSON.parse(other.tags || '[]'); } catch { /* skip */ } }
            const shared = tags.filter(t => otherTags.includes(t));
            if (shared.length >= 2) {
              const strength = Math.min(1, shared.length * 0.2);
              const added = this.insertConnection('journal', String(entry.id), 'journal', String(other.id), 'references', strength, true);
              if (added) newCount++;
            }
          }
        }
        scanned.push('journal→cross-refs');
      } catch (err) { this.log.warn(`[palace] journal cross-ref scan error: ${(err as Error).message}`); }
    }

    // 6. Curiosity gaps → journal entries (topic overlap)
    if (this.sources.getCuriosityGaps && this.sources.getJournalEntries) {
      try {
        const gaps = this.sources.getCuriosityGaps(100);
        const entries = this.sources.getJournalEntries(200);
        for (const gap of gaps) {
          for (const entry of entries) {
            const overlap = this.textOverlap(gap.topic, entry.title);
            if (overlap >= this.config.minAutoStrength) {
              const added = this.insertConnection('curiosity_gap', String(gap.id ?? 0), 'journal', String(entry.id), 'related_to', overlap, true);
              if (added) newCount++;
            }
          }
        }
        scanned.push('gaps→journal');
      } catch (err) { this.log.warn(`[palace] gaps→journal scan error: ${(err as Error).message}`); }
    }

    const totalEdges = (this.stmtCountEdges.get() as { count: number }).count;

    this.ts?.emit('palace', 'discovering', `MemoryPalace built ${newCount} new connections (${totalEdges} total, scanned: ${scanned.join(', ')})`,
      newCount > 5 ? 'notable' : 'routine');

    this.log.info(`[palace] buildConnections: +${newCount} new (${totalEdges} total), scanned: ${scanned.join(', ')}`);

    return { newConnections: newCount, totalConnections: totalEdges, scannedSources: scanned };
  }

  // ── Manual connection ─────────────────────────────────

  addConnection(sourceType: NodeType, sourceId: string, targetType: NodeType, targetId: string, relation: RelationType, strength = 0.5): boolean {
    return this.insertConnection(sourceType, sourceId, targetType, targetId, relation, strength, false);
  }

  // ── Query connections ─────────────────────────────────

  getConnections(type: NodeType, id: string): KnowledgeConnection[] {
    const rows = this.stmtGetConnectionsFor.all(type, id, type, id) as DbConnection[];
    return rows.map(r => this.toConnection(r));
  }

  // ── BFS shortest path ─────────────────────────────────

  getPath(fromType: NodeType, fromId: string, toType: NodeType, toId: string, maxDepth?: number): PathStep[] | null {
    const depth = maxDepth ?? this.config.maxPathDepth;
    const startKey = `${fromType}:${fromId}`;
    const endKey = `${toType}:${toId}`;

    if (startKey === endKey) return [];

    // BFS
    const visited = new Set<string>();
    const queue: Array<{ key: string; path: PathStep[] }> = [{ key: startKey, path: [] }];
    visited.add(startKey);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.path.length >= depth) continue;

      // Get all neighbors
      const [type, id] = current.key.split(':') as [NodeType, string];
      const fromRows = this.stmtGetConnectionsFrom.all(type, id) as DbConnection[];
      const toRows = this.stmtGetConnectionsTo.all(type, id) as DbConnection[];

      const neighbors: Array<{ key: string; relation: RelationType }> = [];
      for (const r of fromRows) {
        neighbors.push({ key: `${r.target_type}:${r.target_id}`, relation: r.relation as RelationType });
      }
      for (const r of toRows) {
        neighbors.push({ key: `${r.source_type}:${r.source_id}`, relation: r.relation as RelationType });
      }

      for (const neighbor of neighbors) {
        if (visited.has(neighbor.key)) continue;
        visited.add(neighbor.key);

        const [nType, nId] = neighbor.key.split(':') as [NodeType, string];
        const newPath = [...current.path, { type: nType, id: nId, relation: neighbor.relation }];

        if (neighbor.key === endKey) return newPath;

        queue.push({ key: neighbor.key, path: newPath });
      }
    }

    return null; // No path found
  }

  // ── Knowledge map (subgraph) ──────────────────────────

  getKnowledgeMap(topic?: string, limit = 100): KnowledgeMap {
    let edges: DbConnection[];

    if (topic) {
      // Get connections where source or target relates to the topic
      edges = this.db.prepare(`
        SELECT * FROM knowledge_connections
        WHERE source_type LIKE ? OR target_type LIKE ?
           OR source_id IN (SELECT source_id FROM knowledge_connections WHERE source_type = 'journal')
        ORDER BY strength DESC LIMIT ?
      `).all(`%${topic}%`, `%${topic}%`, limit) as DbConnection[];

      // If topic-based search didn't find much, search by checking all connection labels
      if (edges.length === 0) {
        edges = this.stmtAllEdges.all(limit) as DbConnection[];
      }
    } else {
      edges = this.stmtAllEdges.all(limit) as DbConnection[];
    }

    const nodeMap = new Map<string, KnowledgeNode>();
    const mapEdges: KnowledgeEdge[] = [];

    for (const e of edges) {
      const sourceKey = `${e.source_type}:${e.source_id}`;
      const targetKey = `${e.target_type}:${e.target_id}`;

      if (!nodeMap.has(sourceKey)) {
        nodeMap.set(sourceKey, { type: e.source_type as NodeType, id: e.source_id, label: sourceKey, connections: 0 });
      }
      if (!nodeMap.has(targetKey)) {
        nodeMap.set(targetKey, { type: e.target_type as NodeType, id: e.target_id, label: targetKey, connections: 0 });
      }

      nodeMap.get(sourceKey)!.connections++;
      nodeMap.get(targetKey)!.connections++;

      mapEdges.push({
        source: sourceKey,
        target: targetKey,
        relation: e.relation as RelationType,
        strength: e.strength,
      });
    }

    return { nodes: Array.from(nodeMap.values()), edges: mapEdges };
  }

  // ── Isolated nodes ────────────────────────────────────

  getIsolatedNodes(): Array<{ type: string; id: string }> {
    const connected = new Set<string>();

    const allEdges = this.stmtAllEdges.all(10000) as DbConnection[];
    for (const e of allEdges) {
      connected.add(`${e.source_type}:${e.source_id}`);
      connected.add(`${e.target_type}:${e.target_id}`);
    }

    const isolated: Array<{ type: string; id: string }> = [];

    // Check each data source for items not in the connection graph
    if (this.sources.getPrinciples) {
      try {
        const principles = this.sources.getPrinciples(undefined, 500);
        for (const p of principles) {
          if (!connected.has(`principle:${p.id}`)) {
            isolated.push({ type: 'principle', id: String(p.id) });
          }
        }
      } catch { /* skip */ }
    }

    if (this.sources.getHypotheses) {
      try {
        const hypotheses = this.sources.getHypotheses(undefined, 500);
        for (const h of hypotheses) {
          if (!connected.has(`hypothesis:${h.id}`)) {
            isolated.push({ type: 'hypothesis', id: String(h.id) });
          }
        }
      } catch { /* skip */ }
    }

    if (this.sources.getExperiments) {
      try {
        const experiments = this.sources.getExperiments(undefined, 500);
        for (const exp of experiments) {
          if (!connected.has(`experiment:${exp.id}`)) {
            isolated.push({ type: 'experiment', id: String(exp.id) });
          }
        }
      } catch { /* skip */ }
    }

    if (this.sources.getAnomalies) {
      try {
        const anomalies = this.sources.getAnomalies(undefined, 500);
        for (const a of anomalies) {
          if (!connected.has(`anomaly:${a.id}`)) {
            isolated.push({ type: 'anomaly', id: String(a.id) });
          }
        }
      } catch { /* skip */ }
    }

    return isolated;
  }

  // ── Stats ─────────────────────────────────────────────

  getStats(): MemoryPalaceStats {
    const totalEdges = (this.stmtCountEdges.get() as { count: number }).count;
    const totalNodes = (this.stmtDistinctNodes.get() as { count: number }).count;
    const avgStrength = (this.stmtAvgStrength.get() as { avg: number | null }).avg ?? 0;
    const topRows = this.stmtTopConnected.all(10) as Array<{ node_type: string; node_id: string; connections: number }>;

    // Density = edges / (nodes * (nodes - 1) / 2)  — for undirected graph
    const maxEdges = totalNodes > 1 ? (totalNodes * (totalNodes - 1)) / 2 : 1;
    const density = totalEdges / maxEdges;

    const nodesByTypeRows = this.stmtNodesByType.all() as Array<{ node_type: string; count: number }>;
    const nodesByType: Record<string, number> = {};
    for (const row of nodesByTypeRows) {
      nodesByType[row.node_type] = row.count;
    }

    return {
      totalNodes,
      totalEdges,
      density: Math.min(1, density),
      nodesByType,
      topConnected: topRows.map(r => ({ type: r.node_type as NodeType, id: r.node_id, connections: r.connections })),
      avgStrength,
    };
  }

  // ── Status ────────────────────────────────────────────

  getStatus(): MemoryPalaceStatus {
    const stats = this.getStats();
    const recent = this.stmtRecentConnections.all(10) as DbConnection[];

    return {
      stats,
      recentConnections: recent.map(r => this.toConnection(r)),
      topConnectedNodes: stats.topConnected,
      uptime: Date.now() - this.startTime,
    };
  }

  // ── Private helpers ───────────────────────────────────

  private insertConnection(sourceType: string, sourceId: string, targetType: string, targetId: string, relation: string, strength: number, auto: boolean): boolean {
    try {
      const result = this.stmtInsertConnection.run(sourceType, sourceId, targetType, targetId, relation, strength, auto ? 1 : 0);
      return result.changes > 0;
    } catch {
      return false; // UNIQUE constraint — already exists
    }
  }

  /** Compute text overlap between two strings using bigram similarity (Dice coefficient). */
  private textOverlap(a: string, b: string): number {
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

  private toConnection(row: DbConnection): KnowledgeConnection {
    return {
      id: row.id,
      sourceType: row.source_type as NodeType,
      sourceId: row.source_id,
      targetType: row.target_type as NodeType,
      targetId: row.target_id,
      relation: row.relation as RelationType,
      strength: row.strength,
      autoDetected: row.auto_detected === 1,
      createdAt: row.created_at,
    };
  }
}

// ── DB row type ─────────────────────────────────────────

interface DbConnection {
  id: number;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  relation: string;
  strength: number;
  auto_detected: number;
  created_at: string;
}
