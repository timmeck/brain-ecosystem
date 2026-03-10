import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { Principle, AntiPattern, KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { NarrativeEngine } from '../narrative/narrative-engine.js';

// ── Types ───────────────────────────────────────────────

export interface TransferEngineConfig {
  brainName: string;
  /** Minimum text similarity to consider an analogy (0-1). Default: 0.35 */
  minSimilarity?: number;
  /** Minimum confidence for auto-transfer. Default: 0.6 */
  minTransferConfidence?: number;
}

export interface Analogy {
  id?: number;
  source_brain: string;
  source_type: 'principle' | 'anti_pattern' | 'strategy';
  source_id: string;
  source_statement: string;
  target_brain: string;
  target_type: 'principle' | 'anti_pattern' | 'strategy';
  target_id: string;
  target_statement: string;
  similarity: number;
  narrative: string;
  discovered_at: number;
}

export interface TransferRecord {
  id?: number;
  source_brain: string;
  target_brain: string;
  knowledge_type: 'principle' | 'anti_pattern' | 'strategy';
  knowledge_id: string;
  statement: string;
  transfer_confidence: number;
  status: 'pending' | 'applied' | 'validated' | 'rejected';
  effectiveness: number | null;
  created_at: number;
  resolved_at: number | null;
}

export interface CrossDomainRule {
  id?: number;
  name: string;
  source_brain: string;
  source_event: string;
  target_brain: string;
  action: string;
  condition: string;
  cooldown_ms: number;
  enabled: boolean;
  fire_count: number;
  last_fired: number | null;
  created_at: number;
}

export interface TransferStatus {
  totalAnalogies: number;
  totalTransfers: number;
  pendingTransfers: number;
  appliedTransfers: number;
  validatedTransfers: number;
  rejectedTransfers: number;
  avgEffectiveness: number;
  totalRules: number;
  activeRules: number;
  totalDialogues: number;
  recentAnalogies: Analogy[];
  recentTransfers: TransferRecord[];
}

export interface CrossBrainDialogue {
  id?: number;
  sourceBrain: string;
  targetBrain: string;
  question: string;
  answer: string;
  usefulnessScore: number;
  context: string;
  askedAt: string;
  answeredAt: string | null;
}

export interface DialogueStats {
  totalDialogues: number;
  avgUsefulness: number;
  byPeer: Array<{ peer: string; count: number; avgUsefulness: number }>;
}

// ── Engine ──────────────────────────────────────────────

export class TransferEngine {
  private db: Database.Database;
  private brainName: string;
  private thoughtStream: ThoughtStream | null = null;
  private narrativeEngine: NarrativeEngine | null = null;
  private log = getLogger();

  // Knowledge sources from peer brains
  private peerDistillers: Map<string, KnowledgeDistiller> = new Map();

  // Config
  private minSimilarity: number;
  private minTransferConfidence: number;

  constructor(db: Database.Database, config: TransferEngineConfig) {
    this.db = db;
    this.brainName = config.brainName;
    this.minSimilarity = config.minSimilarity ?? 0.35;
    this.minTransferConfidence = config.minTransferConfidence ?? 0.6;

    this.runMigration();
  }

  // ── Setup ─────────────────────────────────────────────

  setThoughtStream(stream: ThoughtStream): void {
    this.thoughtStream = stream;
  }

  /** Register a peer brain's KnowledgeDistiller for cross-domain analysis. */
  registerPeerDistiller(brainName: string, distiller: KnowledgeDistiller): void {
    this.peerDistillers.set(brainName, distiller);
  }

  /** Set the NarrativeEngine for answering cross-brain questions. */
  setNarrativeEngine(engine: NarrativeEngine): void {
    this.narrativeEngine = engine;
  }

  /** Record an incoming knowledge transfer from a peer brain (e.g. via TeachingProtocol). */
  recordIncomingTransfer(sourceBrain: string, knowledgeType: string, statement: string, confidence: number): void {
    const validTypes = ['principle', 'anti_pattern', 'strategy'] as const;
    const kType = validTypes.includes(knowledgeType as typeof validTypes[number])
      ? knowledgeType as TransferRecord['knowledge_type']
      : 'principle';
    this.persistTransfer({
      source_brain: sourceBrain,
      target_brain: this.brainName,
      knowledge_type: kType,
      knowledge_id: `incoming_${Date.now()}`,
      statement,
      transfer_confidence: confidence,
      status: 'applied',
      effectiveness: null,
      created_at: Date.now(),
      resolved_at: null,
    });
    this.log.info(`[transfer] Recorded incoming transfer from ${sourceBrain}: ${knowledgeType}`);
  }

  // ── Analogy Finding ───────────────────────────────────

  /** Find analogies between this brain's knowledge and peer brains' knowledge. */
  findAnalogies(): Analogy[] {
    const ts = this.thoughtStream;
    ts?.emit('transfer', 'correlating', 'Scanning for cross-domain analogies...');

    const discovered: Analogy[] = [];

    for (const [peerName, peerDistiller] of this.peerDistillers) {
      // Get knowledge from both sides
      const myPrinciples = this.getLocalPrinciples();
      const peerPrinciples = peerDistiller.getPrinciples(undefined, 50);
      const myAntiPatterns = this.getLocalAntiPatterns();
      const peerAntiPatterns = peerDistiller.getAntiPatterns(undefined, 50);

      // Compare principles across domains
      for (const mine of myPrinciples) {
        for (const theirs of peerPrinciples) {
          const sim = this.textSimilarity(mine.statement, theirs.statement);
          if (sim >= this.minSimilarity) {
            const analogy: Analogy = {
              source_brain: this.brainName,
              source_type: 'principle',
              source_id: mine.id,
              source_statement: mine.statement,
              target_brain: peerName,
              target_type: 'principle',
              target_id: theirs.id,
              target_statement: theirs.statement,
              similarity: sim,
              narrative: `"${mine.statement.substring(0, 60)}" ≈ "${theirs.statement.substring(0, 60)}" (${(sim * 100).toFixed(0)}%)`,
              discovered_at: Date.now(),
            };
            this.persistAnalogy(analogy);
            discovered.push(analogy);
          }
        }
      }

      // Compare anti-patterns
      for (const mine of myAntiPatterns) {
        for (const theirs of peerAntiPatterns) {
          const sim = this.textSimilarity(mine.statement, theirs.statement);
          if (sim >= this.minSimilarity) {
            const analogy: Analogy = {
              source_brain: this.brainName,
              source_type: 'anti_pattern',
              source_id: mine.id,
              source_statement: mine.statement,
              target_brain: peerName,
              target_type: 'anti_pattern',
              target_id: theirs.id,
              target_statement: theirs.statement,
              similarity: sim,
              narrative: `Anti-pattern match: "${mine.statement.substring(0, 50)}" ≈ "${theirs.statement.substring(0, 50)}"`,
              discovered_at: Date.now(),
            };
            this.persistAnalogy(analogy);
            discovered.push(analogy);
          }
        }
      }
    }

    if (discovered.length > 0) {
      ts?.emit('transfer', 'discovering', `Found ${discovered.length} cross-domain analogies`, discovered.length >= 3 ? 'notable' : 'routine');
    }

    return discovered;
  }

  // ── Transfer Proposals ────────────────────────────────

  /** Propose knowledge transfers from peers to this brain. */
  proposeTransfers(): TransferRecord[] {
    const ts = this.thoughtStream;
    const proposals: TransferRecord[] = [];

    for (const [peerName, peerDistiller] of this.peerDistillers) {
      const peerPrinciples = peerDistiller.getPrinciples(undefined, 30);
      const myPrinciples = this.getLocalPrinciples();
      const myStatements = new Set(myPrinciples.map(p => p.statement.toLowerCase()));

      for (const principle of peerPrinciples) {
        // Skip if we already have this principle (exact match)
        if (myStatements.has(principle.statement.toLowerCase())) continue;

        // Skip if already transferred
        if (this.isAlreadyTransferred(principle.id, peerName)) continue;

        // Compute transfer confidence based on peer confidence + relevance
        const relevance = this.estimateRelevance(principle.statement);
        const confidence = principle.confidence * 0.6 + relevance * 0.4;

        if (confidence >= this.minTransferConfidence) {
          const record: TransferRecord = {
            source_brain: peerName,
            target_brain: this.brainName,
            knowledge_type: 'principle',
            knowledge_id: principle.id,
            statement: principle.statement,
            transfer_confidence: confidence,
            status: 'pending',
            effectiveness: null,
            created_at: Date.now(),
            resolved_at: null,
          };
          this.persistTransfer(record);
          proposals.push(record);
        }
      }

      // Also propose anti-patterns
      const peerAntiPatterns = peerDistiller.getAntiPatterns(undefined, 20);
      const myAPStatements = new Set(this.getLocalAntiPatterns().map(a => a.statement.toLowerCase()));

      for (const ap of peerAntiPatterns) {
        if (myAPStatements.has(ap.statement.toLowerCase())) continue;
        if (this.isAlreadyTransferred(ap.id, peerName)) continue;

        const relevance = this.estimateRelevance(ap.statement);
        const confidence = ap.confidence * 0.6 + relevance * 0.4;

        if (confidence >= this.minTransferConfidence) {
          const record: TransferRecord = {
            source_brain: peerName,
            target_brain: this.brainName,
            knowledge_type: 'anti_pattern',
            knowledge_id: ap.id,
            statement: ap.statement,
            transfer_confidence: confidence,
            status: 'pending',
            effectiveness: null,
            created_at: Date.now(),
            resolved_at: null,
          };
          this.persistTransfer(record);
          proposals.push(record);
        }
      }
    }

    if (proposals.length > 0) {
      ts?.emit('transfer', 'discovering', `Proposed ${proposals.length} knowledge transfers from peers`, 'notable');
    }

    return proposals;
  }

  // ── Cross-Domain Rules ────────────────────────────────

  /** Add a cross-domain rule. */
  addRule(rule: Omit<CrossDomainRule, 'id' | 'fire_count' | 'last_fired' | 'created_at'>): CrossDomainRule {
    const full: CrossDomainRule = {
      ...rule,
      fire_count: 0,
      last_fired: null,
      created_at: Date.now(),
    };

    const result = this.db.prepare(`
      INSERT INTO transfer_rules (name, source_brain, source_event, target_brain, action, condition, cooldown_ms, enabled, fire_count, last_fired, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)
    `).run(full.name, full.source_brain, full.source_event, full.target_brain, full.action, full.condition, full.cooldown_ms, full.enabled ? 1 : 0, full.created_at);

    full.id = Number(result.lastInsertRowid);
    this.log.info(`[transfer] Rule added: "${full.name}" (${full.source_brain}:${full.source_event} → ${full.target_brain}:${full.action})`);
    return full;
  }

  /** Evaluate rules against an incoming event. Returns fired rule names. */
  evaluateRules(sourceBrain: string, eventType: string, data: unknown): string[] {
    const now = Date.now();
    const rules = this.db.prepare(
      'SELECT * FROM transfer_rules WHERE source_brain = ? AND source_event = ? AND enabled = 1',
    ).all(sourceBrain, eventType) as Array<Record<string, unknown>>;

    const fired: string[] = [];

    for (const row of rules) {
      const lastFired = row.last_fired as number | null;
      const cooldown = row.cooldown_ms as number;

      // Cooldown check
      if (lastFired && now - lastFired < cooldown) continue;

      // Evaluate condition (simple JSON-based conditions)
      if (this.evaluateCondition(row.condition as string, data)) {
        // Fire the rule
        this.db.prepare(
          'UPDATE transfer_rules SET fire_count = fire_count + 1, last_fired = ? WHERE id = ?',
        ).run(now, row.id);

        fired.push(row.name as string);

        this.thoughtStream?.emit(
          'transfer', 'responding',
          `Rule fired: "${row.name}" (${sourceBrain}:${eventType} → ${row.target_brain}:${row.action})`,
          'notable',
        );
      }
    }

    return fired;
  }

  /** Get all rules. */
  getRules(): CrossDomainRule[] {
    return this.db.prepare('SELECT * FROM transfer_rules ORDER BY fire_count DESC').all().map(this.rowToRule);
  }

  /** Enable/disable a rule. */
  setRuleEnabled(ruleId: number, enabled: boolean): void {
    this.db.prepare('UPDATE transfer_rules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, ruleId);
  }

  // ── Transfer Resolution ───────────────────────────────

  /** Mark a transfer as applied. */
  applyTransfer(transferId: number): void {
    this.db.prepare(
      'UPDATE knowledge_transfers SET status = ?, resolved_at = ? WHERE id = ?',
    ).run('applied', Date.now(), transferId);
  }

  /** Validate a transfer (measure effectiveness). */
  validateTransfer(transferId: number, effectiveness: number): void {
    const status = effectiveness >= 0.5 ? 'validated' : 'rejected';
    this.db.prepare(
      'UPDATE knowledge_transfers SET status = ?, effectiveness = ?, resolved_at = ? WHERE id = ?',
    ).run(status, effectiveness, Date.now(), transferId);
  }

  // ── Analysis ──────────────────────────────────────────

  /** Run full transfer analysis cycle: analogies + proposals. */
  analyze(): { analogies: Analogy[]; proposals: TransferRecord[] } {
    const analogies = this.findAnalogies();
    const proposals = this.proposeTransfers();
    return { analogies, proposals };
  }

  /** Compute overall transfer effectiveness score. */
  getTransferScore(): { score: number; validated: number; total: number; avgEffectiveness: number } {
    const row = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'validated' THEN 1 ELSE 0 END) as validated,
        AVG(CASE WHEN effectiveness IS NOT NULL THEN effectiveness ELSE NULL END) as avg_eff
      FROM knowledge_transfers WHERE target_brain = ?
    `).get(this.brainName) as { total: number; validated: number; avg_eff: number | null };

    const avgEff = row.avg_eff ?? 0;
    const score = row.total > 0 ? (row.validated / row.total) * avgEff : 0;

    return {
      score,
      validated: row.validated,
      total: row.total,
      avgEffectiveness: avgEff,
    };
  }

  // ── Query Methods ─────────────────────────────────────

  getStatus(): TransferStatus {
    const analogyCount = (this.db.prepare('SELECT COUNT(*) as c FROM transfer_analogies').get() as { c: number }).c;
    const transfers = this.db.prepare('SELECT * FROM knowledge_transfers WHERE target_brain = ? ORDER BY created_at DESC LIMIT 50').all(this.brainName) as Array<Record<string, unknown>>;
    const rules = this.getRules();

    const pending = transfers.filter(t => t.status === 'pending').length;
    const applied = transfers.filter(t => t.status === 'applied').length;
    const validated = transfers.filter(t => t.status === 'validated').length;
    const rejected = transfers.filter(t => t.status === 'rejected').length;

    const effValues = transfers.filter(t => t.effectiveness !== null).map(t => t.effectiveness as number);
    const avgEff = effValues.length > 0 ? effValues.reduce((a, b) => a + b, 0) / effValues.length : 0;

    const recentAnalogies = this.db.prepare(
      'SELECT * FROM transfer_analogies ORDER BY discovered_at DESC LIMIT 10',
    ).all().map(this.rowToAnalogy);

    const recentTransfers = transfers.slice(0, 10).map(this.rowToTransfer);

    const dialogueCount = (this.db.prepare('SELECT COUNT(*) as c FROM cross_brain_dialogues').get() as { c: number }).c;

    return {
      totalAnalogies: analogyCount,
      totalTransfers: transfers.length,
      pendingTransfers: pending,
      appliedTransfers: applied,
      validatedTransfers: validated,
      rejectedTransfers: rejected,
      avgEffectiveness: avgEff,
      totalRules: rules.length,
      activeRules: rules.filter(r => r.enabled).length,
      totalDialogues: dialogueCount,
      recentAnalogies,
      recentTransfers,
    };
  }

  getAnalogies(limit = 20): Analogy[] {
    return this.db.prepare(
      'SELECT * FROM transfer_analogies ORDER BY similarity DESC LIMIT ?',
    ).all(limit).map(this.rowToAnalogy);
  }

  getTransferHistory(limit = 50): TransferRecord[] {
    return this.db.prepare(
      'SELECT * FROM knowledge_transfers WHERE target_brain = ? ORDER BY created_at DESC LIMIT ?',
    ).all(this.brainName, limit).map(this.rowToTransfer);
  }

  getPendingTransfers(): TransferRecord[] {
    return this.db.prepare(
      "SELECT * FROM knowledge_transfers WHERE target_brain = ? AND status = 'pending' ORDER BY transfer_confidence DESC",
    ).all(this.brainName).map(this.rowToTransfer);
  }

  // ── Text Similarity ───────────────────────────────────

  /** Simple word-overlap similarity (Jaccard + keyword boost). Fast, no embeddings needed. */
  private textSimilarity(a: string, b: string): number {
    const tokenize = (s: string): Set<string> => {
      const words = s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2);
      // Add bigrams for better matching
      const bigrams: string[] = [];
      for (let i = 0; i < words.length - 1; i++) {
        bigrams.push(`${words[i]}_${words[i + 1]}`);
      }
      return new Set([...words, ...bigrams]);
    };

    const setA = tokenize(a);
    const setB = tokenize(b);

    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) intersection++;
    }

    const union = new Set([...setA, ...setB]).size;
    return union > 0 ? intersection / union : 0;
  }

  /** Estimate how relevant a statement is to this brain's domain. */
  private estimateRelevance(statement: string): number {
    const lower = statement.toLowerCase();

    // Domain keyword maps
    const domainKeywords: Record<string, string[]> = {
      brain: ['error', 'bug', 'fix', 'code', 'module', 'function', 'test', 'debug', 'log', 'crash', 'exception'],
      'trading-brain': ['trade', 'signal', 'backtest', 'kelly', 'risk', 'position', 'profit', 'loss', 'equity', 'drawdown'],
      'marketing-brain': ['post', 'publish', 'engagement', 'campaign', 'schedule', 'hashtag', 'competitor', 'content', 'audience'],
    };

    const myKeywords = domainKeywords[this.brainName] ?? [];
    const otherKeywords = Object.entries(domainKeywords)
      .filter(([name]) => name !== this.brainName)
      .flatMap(([, kw]) => kw);

    let myHits = 0;
    let otherHits = 0;

    for (const kw of myKeywords) {
      if (lower.includes(kw)) myHits++;
    }
    for (const kw of otherKeywords) {
      if (lower.includes(kw)) otherHits++;
    }

    // Higher relevance if it matches MY domain keywords
    // Lower if it only matches other domains
    if (myHits > 0) return Math.min(1.0, 0.5 + myHits * 0.15);
    if (otherHits === 0) return 0.4; // Generic statement — moderate relevance
    return 0.2; // Specific to other domain — low relevance
  }

  // ── Condition Evaluation ──────────────────────────────

  /** Evaluate a simple condition string against event data. */
  private evaluateCondition(condition: string, data: unknown): boolean {
    if (!condition || condition === 'true' || condition === '*') return true;

    try {
      // Simple key=value conditions separated by " AND "
      const parts = condition.split(' AND ').map(s => s.trim());
      const obj = data as Record<string, unknown>;

      for (const part of parts) {
        // count>=3
        const matchGte = part.match(/^(\w+)\s*>=\s*(.+)$/);
        if (matchGte) {
          const val = Number(obj[matchGte[1]!]);
          if (isNaN(val) || val < Number(matchGte[2])) return false;
          continue;
        }

        // count>3
        const matchGt = part.match(/^(\w+)\s*>\s*(.+)$/);
        if (matchGt) {
          const val = Number(obj[matchGt[1]!]);
          if (isNaN(val) || val <= Number(matchGt[2])) return false;
          continue;
        }

        // status=active
        const matchEq = part.match(/^(\w+)\s*=\s*(.+)$/);
        if (matchEq) {
          if (String(obj[matchEq[1]!]) !== matchEq[2]!.trim()) return false;
          continue;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  // ── Helpers ───────────────────────────────────────────

  private getLocalPrinciples(): Principle[] {
    return this.db.prepare(
      'SELECT * FROM knowledge_principles ORDER BY confidence DESC LIMIT 50',
    ).all() as Principle[];
  }

  private getLocalAntiPatterns(): AntiPattern[] {
    return this.db.prepare(
      'SELECT * FROM knowledge_anti_patterns ORDER BY confidence DESC LIMIT 50',
    ).all() as AntiPattern[];
  }

  private isAlreadyTransferred(knowledgeId: string, sourceBrain: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM knowledge_transfers WHERE knowledge_id = ? AND source_brain = ? AND target_brain = ?',
    ).get(knowledgeId, sourceBrain, this.brainName);
    return !!row;
  }

  private rowToAnalogy = (row: unknown): Analogy => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      source_brain: r.source_brain as string,
      source_type: r.source_type as Analogy['source_type'],
      source_id: r.source_id as string,
      source_statement: r.source_statement as string,
      target_brain: r.target_brain as string,
      target_type: r.target_type as Analogy['target_type'],
      target_id: r.target_id as string,
      target_statement: r.target_statement as string,
      similarity: r.similarity as number,
      narrative: r.narrative as string,
      discovered_at: r.discovered_at as number,
    };
  };

  private rowToTransfer = (row: unknown): TransferRecord => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      source_brain: r.source_brain as string,
      target_brain: r.target_brain as string,
      knowledge_type: r.knowledge_type as TransferRecord['knowledge_type'],
      knowledge_id: r.knowledge_id as string,
      statement: r.statement as string,
      transfer_confidence: r.transfer_confidence as number,
      status: r.status as TransferRecord['status'],
      effectiveness: r.effectiveness as number | null,
      created_at: r.created_at as number,
      resolved_at: r.resolved_at as number | null,
    };
  };

  private rowToRule = (row: unknown): CrossDomainRule => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      name: r.name as string,
      source_brain: r.source_brain as string,
      source_event: r.source_event as string,
      target_brain: r.target_brain as string,
      action: r.action as string,
      condition: r.condition as string,
      cooldown_ms: r.cooldown_ms as number,
      enabled: !!(r.enabled as number),
      fire_count: r.fire_count as number,
      last_fired: r.last_fired as number | null,
      created_at: r.created_at as number,
    };
  };

  // ── Persistence ───────────────────────────────────────

  private persistAnalogy(analogy: Analogy): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO transfer_analogies
        (source_brain, source_type, source_id, source_statement, target_brain, target_type, target_id, target_statement, similarity, narrative, discovered_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      analogy.source_brain, analogy.source_type, analogy.source_id, analogy.source_statement,
      analogy.target_brain, analogy.target_type, analogy.target_id, analogy.target_statement,
      analogy.similarity, analogy.narrative, analogy.discovered_at,
    );
  }

  private persistTransfer(record: TransferRecord): void {
    this.db.prepare(`
      INSERT INTO knowledge_transfers
        (source_brain, target_brain, knowledge_type, knowledge_id, statement, transfer_confidence, status, effectiveness, created_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.source_brain, record.target_brain, record.knowledge_type,
      record.knowledge_id, record.statement, record.transfer_confidence,
      record.status, record.effectiveness, record.created_at, record.resolved_at,
    );
  }

  private runMigration(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transfer_analogies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_brain TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_statement TEXT NOT NULL,
        target_brain TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        target_statement TEXT NOT NULL,
        similarity REAL NOT NULL,
        narrative TEXT NOT NULL,
        discovered_at INTEGER NOT NULL,
        UNIQUE(source_brain, source_id, target_brain, target_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ta_sim ON transfer_analogies(similarity);

      CREATE TABLE IF NOT EXISTS knowledge_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_brain TEXT NOT NULL,
        target_brain TEXT NOT NULL,
        knowledge_type TEXT NOT NULL,
        knowledge_id TEXT NOT NULL,
        statement TEXT NOT NULL,
        transfer_confidence REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        effectiveness REAL,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_kt_target ON knowledge_transfers(target_brain, status);

      CREATE TABLE IF NOT EXISTS transfer_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        source_brain TEXT NOT NULL,
        source_event TEXT NOT NULL,
        target_brain TEXT NOT NULL,
        action TEXT NOT NULL,
        condition TEXT NOT NULL DEFAULT 'true',
        cooldown_ms INTEGER NOT NULL DEFAULT 300000,
        enabled INTEGER NOT NULL DEFAULT 1,
        fire_count INTEGER NOT NULL DEFAULT 0,
        last_fired INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tr_source ON transfer_rules(source_brain, source_event);

      CREATE TABLE IF NOT EXISTS cross_brain_dialogues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_brain TEXT NOT NULL,
        target_brain TEXT NOT NULL,
        question TEXT NOT NULL,
        answer TEXT DEFAULT '',
        usefulness_score REAL DEFAULT 0,
        context TEXT DEFAULT '',
        asked_at TEXT DEFAULT (datetime('now')),
        answered_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_dialogues_brains ON cross_brain_dialogues(source_brain, target_brain);
    `);
  }

  // ── Default Rules ─────────────────────────────────────

  /** Seed default cross-domain rules if none exist. */
  seedDefaultRules(): void {
    const count = (this.db.prepare('SELECT COUNT(*) as c FROM transfer_rules').get() as { c: number }).c;
    if (count > 0) return;

    const defaults: Array<Omit<CrossDomainRule, 'id' | 'fire_count' | 'last_fired' | 'created_at'>> = [
      {
        name: 'error-burst-warn-trading',
        source_brain: 'brain',
        source_event: 'error:reported',
        target_brain: 'trading-brain',
        action: 'warn:system-instability',
        condition: 'count>=3',
        cooldown_ms: 300_000,
        enabled: true,
      },
      {
        name: 'error-burst-pause-marketing',
        source_brain: 'brain',
        source_event: 'error:reported',
        target_brain: 'marketing-brain',
        action: 'pause:non-urgent-posts',
        condition: 'count>=5',
        cooldown_ms: 600_000,
        enabled: true,
      },
      {
        name: 'trade-loss-streak-notify-brain',
        source_brain: 'trading-brain',
        source_event: 'trade:outcome',
        target_brain: 'brain',
        action: 'alert:trading-losses',
        condition: 'consecutive_losses>=3',
        cooldown_ms: 600_000,
        enabled: true,
      },
      {
        name: 'engagement-spike-trading-hint',
        source_brain: 'marketing-brain',
        source_event: 'engagement:spike',
        target_brain: 'trading-brain',
        action: 'hint:high-activity-period',
        condition: 'true',
        cooldown_ms: 3_600_000,
        enabled: true,
      },
      {
        name: 'insight-share-all',
        source_brain: '*',
        source_event: 'insight:created',
        target_brain: '*',
        action: 'share:insight',
        condition: 'true',
        cooldown_ms: 60_000,
        enabled: true,
      },
    ];

    for (const rule of defaults) {
      this.addRule(rule);
    }

    this.log.info(`[transfer] Seeded ${defaults.length} default cross-domain rules`);
  }

  // ── Cross-Brain Dialogues ───────────────────────────────

  /** Formulate a question about a topic from this brain's perspective. */
  formulateQuestion(topic: string): string {
    const domainDescriptions: Record<string, string> = {
      brain: 'code quality and error patterns',
      'trading-brain': 'trading signals and risk management',
      'marketing-brain': 'content performance and audience engagement',
    };
    const domain = domainDescriptions[this.brainName] ?? this.brainName;
    return `How does "${topic}" affect ${domain}? What patterns have you observed?`;
  }

  /** Answer a question using local knowledge (NarrativeEngine or principles). */
  answerQuestion(question: string): string {
    // Try NarrativeEngine first
    if (this.narrativeEngine) {
      try {
        const answer = this.narrativeEngine.ask(question);
        if (answer.answer && answer.answer.length > 10) {
          return answer.answer;
        }
      } catch { /* fallback */ }
    }

    // Fallback: search local principles for relevant statements
    try {
      const principles = this.getLocalPrinciples();
      const lower = question.toLowerCase();
      const keywords = lower.split(/\s+/).filter(w => w.length > 3);

      const relevant = principles.filter(p =>
        keywords.some(k => p.statement.toLowerCase().includes(k)),
      );

      if (relevant.length > 0) {
        const parts = relevant.slice(0, 3).map(p =>
          `${p.statement} (confidence: ${(p.confidence * 100).toFixed(0)}%)`,
        );
        return `Based on ${this.brainName} knowledge: ${parts.join('. ')}.`;
      }
    } catch { /* ignore */ }

    return `${this.brainName} has no specific knowledge about this topic yet.`;
  }

  /** Record a dialogue between two brains. */
  recordDialogue(sourceBrain: string, targetBrain: string, question: string, answer: string, context = ''): CrossBrainDialogue {
    const info = this.db.prepare(`
      INSERT INTO cross_brain_dialogues (source_brain, target_brain, question, answer, context, answered_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(sourceBrain, targetBrain, question, answer, context);

    this.thoughtStream?.emit('transfer', 'correlating',
      `Dialogue: ${sourceBrain} → ${targetBrain}: "${question.substring(0, 50)}..."`,
      'routine',
    );

    return {
      id: Number(info.lastInsertRowid),
      sourceBrain,
      targetBrain,
      question,
      answer,
      usefulnessScore: 0,
      context,
      askedAt: new Date().toISOString(),
      answeredAt: new Date().toISOString(),
    };
  }

  /** Rate the usefulness of a dialogue. */
  rateDialogue(id: number, usefulness: number): void {
    this.db.prepare(
      'UPDATE cross_brain_dialogues SET usefulness_score = ? WHERE id = ?',
    ).run(usefulness, id);
  }

  /** Get dialogue history, optionally filtered by peer brain. */
  getDialogueHistory(peerBrain?: string, limit = 20): CrossBrainDialogue[] {
    let rows: Record<string, unknown>[];
    if (peerBrain) {
      rows = this.db.prepare(`
        SELECT * FROM cross_brain_dialogues
        WHERE source_brain = ? OR target_brain = ?
        ORDER BY asked_at DESC LIMIT ?
      `).all(peerBrain, peerBrain, limit) as Record<string, unknown>[];
    } else {
      rows = this.db.prepare(`
        SELECT * FROM cross_brain_dialogues
        ORDER BY asked_at DESC LIMIT ?
      `).all(limit) as Record<string, unknown>[];
    }
    return rows.map(r => this.toDialogue(r));
  }

  /** Get dialogue statistics. */
  getDialogueStats(): DialogueStats {
    const totalRow = this.db.prepare(
      'SELECT COUNT(*) as cnt, AVG(usefulness_score) as avg_useful FROM cross_brain_dialogues',
    ).get() as { cnt: number; avg_useful: number | null };

    const peerRows = this.db.prepare(`
      SELECT
        CASE
          WHEN source_brain = ? THEN target_brain
          ELSE source_brain
        END as peer,
        COUNT(*) as cnt,
        AVG(usefulness_score) as avg_useful
      FROM cross_brain_dialogues
      WHERE source_brain = ? OR target_brain = ?
      GROUP BY peer
      ORDER BY cnt DESC
    `).all(this.brainName, this.brainName, this.brainName) as Array<{ peer: string; cnt: number; avg_useful: number | null }>;

    return {
      totalDialogues: totalRow.cnt,
      avgUsefulness: totalRow.avg_useful ?? 0,
      byPeer: peerRows.map(r => ({
        peer: r.peer,
        count: r.cnt,
        avgUsefulness: r.avg_useful ?? 0,
      })),
    };
  }

  private toDialogue = (row: unknown): CrossBrainDialogue => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      sourceBrain: r.source_brain as string,
      targetBrain: r.target_brain as string,
      question: r.question as string,
      answer: (r.answer as string) ?? '',
      usefulnessScore: (r.usefulness_score as number) ?? 0,
      context: (r.context as string) ?? '',
      askedAt: r.asked_at as string,
      answeredAt: (r.answered_at as string) ?? null,
    };
  };
}
