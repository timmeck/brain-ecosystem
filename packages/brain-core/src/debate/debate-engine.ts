import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { HypothesisEngine } from '../hypothesis/engine.js';
import type { ResearchJournal } from '../research/journal.js';
import type { AnomalyDetective } from '../research/anomaly-detective.js';
import type { PredictionEngine } from '../prediction/prediction-engine.js';
import type { NarrativeEngine } from '../narrative/narrative-engine.js';
import type { LLMService } from '../llm/llm-service.js';

// ── Types ───────────────────────────────────────────────

export interface DebateEngineConfig {
  brainName: string;
  /** Domain description for this brain (e.g. "error tracking and code intelligence"). */
  domainDescription?: string;
}

export interface DebateDataSources {
  knowledgeDistiller?: KnowledgeDistiller;
  hypothesisEngine?: HypothesisEngine;
  journal?: ResearchJournal;
  anomalyDetective?: AnomalyDetective;
  predictionEngine?: PredictionEngine;
  narrativeEngine?: NarrativeEngine;
}

export interface Debate {
  id?: number;
  question: string;
  status: DebateStatus;
  perspectives: DebatePerspective[];
  synthesis: DebateSynthesis | null;
  created_at?: string;
  closed_at?: string;
}

export type DebateStatus = 'open' | 'deliberating' | 'synthesized' | 'closed';

export interface DebatePerspective {
  id?: number;
  debateId?: number;
  brainName: string;
  position: string;
  arguments: DebateArgument[];
  confidence: number;
  relevance: number;
  created_at?: string;
}

export interface DebateArgument {
  claim: string;
  evidence: string[];
  source: 'principle' | 'hypothesis' | 'journal' | 'prediction' | 'anomaly' | 'narrative';
  strength: number;
}

export interface DebateSynthesis {
  consensus: string | null;
  conflicts: DebateConflict[];
  resolution: string;
  confidence: number;
  recommendations: string[];
  participantCount: number;
}

export interface DebateConflict {
  perspectiveA: string;
  perspectiveB: string;
  claimA: string;
  claimB: string;
  resolution: 'a_wins' | 'b_wins' | 'compromise' | 'unresolved';
  reason: string;
}

export interface DebateEngineStatus {
  totalDebates: number;
  openDebates: number;
  synthesizedDebates: number;
  avgConfidence: number;
  avgParticipants: number;
  recentDebates: Debate[];
  totalChallenges: number;
  vulnerablePrinciples: PrincipleChallenge[];
  uptime: number;
}

export interface PrincipleChallenge {
  id?: number;
  principleId: number | null;
  principleStatement: string;
  challengeArguments: string[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
  resilienceScore: number;
  outcome: 'pending' | 'survived' | 'weakened' | 'disproved';
  challengedAt: string;
}

// ── Migration ───────────────────────────────────────────

export function runDebateMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS debates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      synthesis_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_debates_status ON debates(status);

    CREATE TABLE IF NOT EXISTS debate_perspectives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debate_id INTEGER NOT NULL,
      brain_name TEXT NOT NULL,
      position TEXT NOT NULL,
      arguments_json TEXT NOT NULL DEFAULT '[]',
      confidence REAL NOT NULL DEFAULT 0,
      relevance REAL NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (debate_id) REFERENCES debates(id)
    );
    CREATE INDEX IF NOT EXISTS idx_debate_perspectives_debate ON debate_perspectives(debate_id);

    CREATE TABLE IF NOT EXISTS principle_challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      principle_id INTEGER,
      principle_statement TEXT NOT NULL,
      challenge_arguments TEXT NOT NULL DEFAULT '[]',
      supporting_evidence TEXT NOT NULL DEFAULT '[]',
      contradicting_evidence TEXT NOT NULL DEFAULT '[]',
      resilience_score REAL NOT NULL DEFAULT 0.5,
      outcome TEXT NOT NULL DEFAULT 'pending',
      challenged_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_principle_challenges_resilience ON principle_challenges(resilience_score);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class DebateEngine {
  private readonly db: Database.Database;
  private readonly config: DebateEngineConfig;
  private readonly log = getLogger();
  private ts: ThoughtStream | null = null;
  private sources: DebateDataSources = {};
  private llm: LLMService | null = null;
  private startTime = Date.now();

  // Prepared statements
  private readonly stmtInsertDebate: Database.Statement;
  private readonly stmtUpdateDebateStatus: Database.Statement;
  private readonly stmtSetSynthesis: Database.Statement;
  private readonly stmtInsertPerspective: Database.Statement;
  private readonly stmtGetDebate: Database.Statement;
  private readonly stmtGetPerspectives: Database.Statement;
  private readonly stmtListDebates: Database.Statement;
  private readonly stmtTotalDebates: Database.Statement;
  private readonly stmtOpenDebates: Database.Statement;
  private readonly stmtSynthesizedDebates: Database.Statement;
  private readonly stmtInsertChallenge: Database.Statement;
  private readonly stmtGetChallengeHistory: Database.Statement;
  private readonly stmtGetMostVulnerable: Database.Statement;
  private readonly stmtTotalChallenges: Database.Statement;

  constructor(db: Database.Database, config: DebateEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      domainDescription: config.domainDescription ?? config.brainName,
    };

    runDebateMigration(db);

    this.stmtInsertDebate = db.prepare('INSERT INTO debates (question, status) VALUES (?, ?)');
    this.stmtUpdateDebateStatus = db.prepare('UPDATE debates SET status = ?, closed_at = CASE WHEN ? = \'closed\' THEN datetime(\'now\') ELSE closed_at END WHERE id = ?');
    this.stmtSetSynthesis = db.prepare('UPDATE debates SET synthesis_json = ?, status = \'synthesized\' WHERE id = ?');
    this.stmtInsertPerspective = db.prepare('INSERT INTO debate_perspectives (debate_id, brain_name, position, arguments_json, confidence, relevance) VALUES (?, ?, ?, ?, ?, ?)');
    this.stmtGetDebate = db.prepare('SELECT * FROM debates WHERE id = ?');
    this.stmtGetPerspectives = db.prepare('SELECT * FROM debate_perspectives WHERE debate_id = ? ORDER BY confidence DESC');
    this.stmtListDebates = db.prepare('SELECT * FROM debates ORDER BY id DESC LIMIT ?');
    this.stmtTotalDebates = db.prepare('SELECT COUNT(*) as cnt FROM debates');
    this.stmtOpenDebates = db.prepare('SELECT COUNT(*) as cnt FROM debates WHERE status = \'open\' OR status = \'deliberating\'');
    this.stmtSynthesizedDebates = db.prepare('SELECT COUNT(*) as cnt FROM debates WHERE status = \'synthesized\' OR status = \'closed\'');
    this.stmtInsertChallenge = db.prepare('INSERT INTO principle_challenges (principle_id, principle_statement, challenge_arguments, supporting_evidence, contradicting_evidence, resilience_score, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)');
    this.stmtGetChallengeHistory = db.prepare('SELECT * FROM principle_challenges ORDER BY id DESC LIMIT ?');
    this.stmtGetMostVulnerable = db.prepare('SELECT * FROM principle_challenges ORDER BY resilience_score ASC LIMIT ?');
    this.stmtTotalChallenges = db.prepare('SELECT COUNT(*) as cnt FROM principle_challenges');

    this.log.debug(`[DebateEngine] Initialized for ${this.config.brainName}`);
  }

  // ── Setters ──────────────────────────────────────────

  setThoughtStream(stream: ThoughtStream): void { this.ts = stream; }

  setDataSources(sources: DebateDataSources): void {
    this.sources = sources;
  }

  setLLMService(llm: LLMService): void { this.llm = llm; }

  // ── Core: Start a Debate ─────────────────────────────

  /**
   * Start a new debate on a question.
   * Immediately generates this brain's perspective and adds it.
   */
  startDebate(question: string): Debate {
    this.ts?.emit('debate', 'reflecting', `New debate: "${question.substring(0, 60)}..."`, 'notable');

    const info = this.stmtInsertDebate.run(question, 'open');
    const debateId = Number(info.lastInsertRowid);

    // Generate and add this brain's perspective
    const perspective = this.generatePerspective(question);
    this.addPerspective(debateId, perspective);

    this.stmtUpdateDebateStatus.run('deliberating', 'deliberating', debateId);

    return this.getDebate(debateId)!;
  }

  // ── Core: Generate Perspective ────────────────────────

  /**
   * Generate this brain's perspective on a question based on local knowledge.
   * Searches principles, hypotheses, journal, anomalies, predictions.
   */
  generatePerspective(question: string): DebatePerspective {
    this.ts?.emit('reflecting', 'analyzing', `Forming perspective on: "${question.substring(0, 50)}..."`, 'routine');

    const args: DebateArgument[] = [];
    const keywords = this.extractKeywords(question);

    // 1. Arguments from principles
    if (this.sources.knowledgeDistiller) {
      try {
        const pkg = this.sources.knowledgeDistiller.getPackage(this.config.brainName);
        for (const p of pkg.principles) {
          if (this.isRelevant(p.statement, keywords)) {
            args.push({
              claim: p.statement,
              evidence: [`principle:${p.id}`, `confidence:${p.confidence.toFixed(2)}`, `samples:${p.sample_size}`],
              source: 'principle',
              strength: p.confidence * Math.min(1, p.sample_size / 10),
            });
          }
        }
        // Also check anti-patterns
        for (const ap of pkg.anti_patterns) {
          if (this.isRelevant(ap.statement, keywords)) {
            args.push({
              claim: `Warning: ${ap.statement}`,
              evidence: [`anti_pattern`, `confidence:${ap.confidence.toFixed(2)}`],
              source: 'principle',
              strength: ap.confidence * 0.8,
            });
          }
        }
      } catch { /* not wired */ }
    }

    // 2. Arguments from hypotheses
    if (this.sources.hypothesisEngine) {
      try {
        const confirmed = this.sources.hypothesisEngine.list('confirmed', 30);
        const testing = this.sources.hypothesisEngine.list('testing', 20);
        for (const h of [...confirmed, ...testing]) {
          if (this.isRelevant(h.statement, keywords)) {
            const statusWeight = h.status === 'confirmed' ? 1.0 : 0.6;
            args.push({
              claim: h.statement,
              evidence: [`hypothesis:${h.id}`, `status:${h.status}`, `p_value:${h.p_value.toFixed(4)}`],
              source: 'hypothesis',
              strength: h.confidence * statusWeight,
            });
          }
        }
      } catch { /* not wired */ }
    }

    // 3. Arguments from journal
    if (this.sources.journal) {
      try {
        const entries = this.sources.journal.search(question, 15);
        for (const e of entries) {
          if (e.significance === 'breakthrough' || e.significance === 'notable') {
            args.push({
              claim: e.title,
              evidence: [`journal:${e.id}`, `type:${e.type}`, `significance:${e.significance}`],
              source: 'journal',
              strength: e.significance === 'breakthrough' ? 0.9 : 0.6,
            });
          }
        }
      } catch { /* not wired */ }
    }

    // 4. Arguments from anomalies
    if (this.sources.anomalyDetective) {
      try {
        const anomalies = this.sources.anomalyDetective.getAnomalies(undefined, 30);
        for (const a of anomalies) {
          if (this.isRelevant(`${a.title} ${a.metric}`, keywords)) {
            args.push({
              claim: `Anomaly detected: ${a.title}`,
              evidence: [`anomaly:${a.id}`, `deviation:${a.deviation.toFixed(2)}`, `severity:${a.severity}`],
              source: 'anomaly',
              strength: Math.min(1, 0.3 + Math.abs(a.deviation) * 0.1),
            });
          }
        }
      } catch { /* not wired */ }
    }

    // 5. Arguments from predictions
    if (this.sources.predictionEngine) {
      try {
        const summary = this.sources.predictionEngine.getSummary();
        if (summary.accuracy_rate > 0 && this.isRelevant(JSON.stringify(summary), keywords)) {
          args.push({
            claim: `Prediction track record: ${(summary.accuracy_rate * 100).toFixed(0)}% accuracy over ${summary.total_predictions} predictions`,
            evidence: [`predictions:${summary.total_predictions}`, `accuracy:${summary.accuracy_rate.toFixed(2)}`],
            source: 'prediction',
            strength: summary.accuracy_rate,
          });
        }
      } catch { /* not wired */ }
    }

    // 6. Narrative explanation
    if (this.sources.narrativeEngine) {
      try {
        const explanation = this.sources.narrativeEngine.explain(question);
        if (explanation.details.length > 0) {
          args.push({
            claim: explanation.summary.substring(0, 200),
            evidence: [`narrative:${explanation.topic}`],
            source: 'narrative',
            strength: explanation.confidence,
          });
        }
      } catch { /* not wired */ }
    }

    // Sort by strength
    args.sort((a, b) => b.strength - a.strength);

    // Compute overall confidence and relevance
    const confidence = args.length > 0
      ? args.reduce((sum, a) => sum + a.strength, 0) / args.length
      : 0;

    const relevance = this.computeRelevance(question, args);

    // Generate position: summarize top arguments
    const position = this.generatePosition(question, args);

    this.ts?.emit('reflecting', 'analyzing',
      `Perspective formed: ${args.length} arguments, confidence=${(confidence * 100).toFixed(0)}%`,
      'routine',
    );

    return {
      brainName: this.config.brainName,
      position,
      arguments: args.slice(0, 10), // Top 10
      confidence,
      relevance,
    };
  }

  // ── Core: Add External Perspective ────────────────────

  /**
   * Add a perspective (from this or another brain) to an existing debate.
   */
  addPerspective(debateId: number, perspective: DebatePerspective): void {
    this.stmtInsertPerspective.run(
      debateId,
      perspective.brainName,
      perspective.position,
      JSON.stringify(perspective.arguments),
      perspective.confidence,
      perspective.relevance,
    );

    this.ts?.emit('debate', 'reflecting',
      `${perspective.brainName} added perspective (confidence=${(perspective.confidence * 100).toFixed(0)}%)`,
      'routine',
    );
  }

  // ── Core: Synthesize ──────────────────────────────────

  /**
   * Synthesize all perspectives in a debate: find conflicts, build consensus.
   */
  synthesize(debateId: number): DebateSynthesis | null {
    const debate = this.getDebate(debateId);
    if (!debate) return null;
    if (debate.perspectives.length === 0) return null;

    this.ts?.emit('debate', 'analyzing',
      `Synthesizing debate: "${debate.question.substring(0, 40)}..." (${debate.perspectives.length} perspectives)`,
      'notable',
    );

    // 1. Find conflicts between perspectives
    const conflicts = this.findConflicts(debate.perspectives);

    // 2. Build weighted consensus (heuristic)
    const consensus = this.buildConsensus(debate.perspectives, conflicts);

    // 3. Generate recommendations (heuristic)
    const recommendations = this.generateRecommendations(debate.perspectives, conflicts);

    // 4. Compute overall confidence
    const totalWeight = debate.perspectives.reduce((s, p) => s + p.confidence * p.relevance, 0);
    const totalRelevance = debate.perspectives.reduce((s, p) => s + p.relevance, 0);
    const avgConfidence = totalRelevance > 0 ? totalWeight / totalRelevance : 0;

    // 5. Try LLM synthesis for richer output (async warm-up for next call)
    if (this.llm?.isAvailable() && debate.perspectives.length > 0) {
      const perspectiveSummary = debate.perspectives.map(p =>
        `[${p.brainName}] (confidence: ${(p.confidence * 100).toFixed(0)}%, relevance: ${(p.relevance * 100).toFixed(0)}%):\n${p.position}\nArguments:\n${p.arguments.slice(0, 5).map(a => `- ${a.claim} (${a.source}, strength: ${a.strength.toFixed(2)})`).join('\n')}`,
      ).join('\n\n');
      const conflictSummary = conflicts.map(c =>
        `${c.perspectiveA} vs ${c.perspectiveB}: "${c.claimA}" vs "${c.claimB}" → ${c.resolution}`,
      ).join('\n');
      const llmPrompt = `Question: "${debate.question}"\n\nPerspectives:\n${perspectiveSummary}\n\n${conflicts.length > 0 ? `Conflicts:\n${conflictSummary}\n\n` : ''}Synthesize these perspectives. Find consensus, resolve conflicts, and make recommendations.`;
      void this.llm.call('synthesize_debate', llmPrompt).catch(() => {});
    }

    const synthesis: DebateSynthesis = {
      consensus,
      conflicts,
      resolution: conflicts.length === 0
        ? 'All perspectives align — strong consensus.'
        : `${conflicts.length} conflict(s) found. ${conflicts.filter(c => c.resolution !== 'unresolved').length} resolved.`,
      confidence: avgConfidence,
      recommendations,
      participantCount: debate.perspectives.length,
    };

    // Persist
    this.stmtSetSynthesis.run(JSON.stringify(synthesis), debateId);

    this.ts?.emit('debate', 'discovering',
      `Debate synthesized: ${conflicts.length} conflicts, confidence=${(avgConfidence * 100).toFixed(0)}%`,
      conflicts.length > 0 ? 'notable' : 'routine',
    );

    return synthesis;
  }

  /** Async version that waits for LLM synthesis. */
  async synthesizeAsync(debateId: number): Promise<DebateSynthesis | null> {
    const debate = this.getDebate(debateId);
    if (!debate || debate.perspectives.length === 0) return null;

    this.ts?.emit('debate', 'analyzing', `Synthesizing (LLM): "${debate.question.substring(0, 40)}..."`, 'notable');

    const conflicts = this.findConflicts(debate.perspectives);
    const totalWeight = debate.perspectives.reduce((s, p) => s + p.confidence * p.relevance, 0);
    const totalRelevance = debate.perspectives.reduce((s, p) => s + p.relevance, 0);
    const avgConfidence = totalRelevance > 0 ? totalWeight / totalRelevance : 0;

    let consensus = this.buildConsensus(debate.perspectives, conflicts);
    let recommendations = this.generateRecommendations(debate.perspectives, conflicts);

    // Try LLM synthesis
    if (this.llm?.isAvailable()) {
      const perspectiveSummary = debate.perspectives.map(p =>
        `[${p.brainName}] (confidence: ${(p.confidence * 100).toFixed(0)}%):\n${p.position}\nArguments:\n${p.arguments.slice(0, 5).map(a => `- ${a.claim} (${a.source}, strength: ${a.strength.toFixed(2)})`).join('\n')}`,
      ).join('\n\n');
      const conflictSummary = conflicts.map(c =>
        `${c.perspectiveA} vs ${c.perspectiveB}: "${c.claimA}" vs "${c.claimB}"`,
      ).join('\n');
      const llmPrompt = `Question: "${debate.question}"\n\nPerspectives:\n${perspectiveSummary}\n\n${conflicts.length > 0 ? `Conflicts:\n${conflictSummary}\n\n` : ''}Synthesize these perspectives. Output format:\nCONSENSUS: <one paragraph>\nRECOMMENDATIONS:\n- <recommendation 1>\n- <recommendation 2>`;
      const result = await this.llm.call('synthesize_debate', llmPrompt);
      if (result?.text) {
        // Parse LLM output
        const consensusMatch = result.text.match(/CONSENSUS:\s*([\s\S]*?)(?=RECOMMENDATIONS:|$)/i);
        if (consensusMatch?.[1]) consensus = consensusMatch[1].trim();
        const recMatch = result.text.match(/RECOMMENDATIONS:\s*([\s\S]*)/i);
        if (recMatch?.[1]) {
          const llmRecs = recMatch[1].split('\n').filter(l => l.trim().startsWith('-')).map(l => l.trim().replace(/^-\s*/, ''));
          if (llmRecs.length > 0) recommendations = llmRecs;
        }
      }
    }

    const synthesis: DebateSynthesis = {
      consensus,
      conflicts,
      resolution: conflicts.length === 0 ? 'All perspectives align — strong consensus.' : `${conflicts.length} conflict(s) found. ${conflicts.filter(c => c.resolution !== 'unresolved').length} resolved.`,
      confidence: avgConfidence,
      recommendations,
      participantCount: debate.perspectives.length,
    };

    this.stmtSetSynthesis.run(JSON.stringify(synthesis), debateId);
    return synthesis;
  }

  // ── Advocatus Diaboli: Principle Challenges ──────────

  /**
   * Challenge a principle by searching for contradicting evidence.
   * Returns a PrincipleChallenge with a resilience score.
   */
  challenge(principleStatement: string): PrincipleChallenge {
    this.ts?.emit('debate', 'analyzing', `Challenging principle: "${principleStatement.substring(0, 60)}..."`, 'notable');

    const keywords = this.extractKeywords(principleStatement);
    const contradictingEvidence: string[] = [];
    const supportingEvidence: string[] = [];
    let principleId: number | null = null;

    // 1. Search for contradicting rejected hypotheses
    if (this.sources.hypothesisEngine) {
      try {
        const rejected = this.sources.hypothesisEngine.list('rejected', 50);
        for (const h of rejected) {
          if (this.isRelevant(h.statement, keywords)) {
            contradictingEvidence.push(`Rejected hypothesis: ${h.statement}`);
          }
        }
      } catch { /* not wired */ }
    }

    // 2. Search for failed predictions that match the principle
    if (this.sources.predictionEngine) {
      try {
        const predictions = this.sources.predictionEngine.list(undefined, 'wrong', 30);
        for (const p of predictions) {
          if (this.isRelevant(`${p.reasoning} ${p.metric} ${p.domain}`, keywords)) {
            contradictingEvidence.push(`Failed prediction: ${p.metric} — ${p.reasoning}`);
          }
        }
      } catch { /* not wired */ }
    }

    // 3. Search anomalies that contradict the principle
    if (this.sources.anomalyDetective) {
      try {
        const anomalies = this.sources.anomalyDetective.getAnomalies(undefined, 30);
        for (const a of anomalies) {
          if (this.isRelevant(`${a.title} ${a.metric}`, keywords)) {
            contradictingEvidence.push(`Anomaly: ${a.title} (deviation: ${a.deviation.toFixed(2)})`);
          }
        }
      } catch { /* not wired */ }
    }

    // 4. Collect supporting evidence from confirmed hypotheses
    if (this.sources.hypothesisEngine) {
      try {
        const confirmed = this.sources.hypothesisEngine.list('confirmed', 50);
        for (const h of confirmed) {
          if (this.isRelevant(h.statement, keywords)) {
            supportingEvidence.push(`Confirmed hypothesis: ${h.statement}`);
          }
        }
      } catch { /* not wired */ }
    }

    // 4b. Supporting evidence from matching principles
    if (this.sources.knowledgeDistiller) {
      try {
        const pkg = this.sources.knowledgeDistiller.getPackage(this.config.brainName);
        for (const p of pkg.principles) {
          if (this.isRelevant(p.statement, keywords)) {
            supportingEvidence.push(`Principle: ${p.statement} (confidence: ${p.confidence.toFixed(2)})`);
            if (principleId === null) principleId = Number(p.id) || null;
          }
        }
      } catch { /* not wired */ }
    }

    // 5. Calculate resilience score
    const resilienceScore = supportingEvidence.length / (supportingEvidence.length + contradictingEvidence.length + 0.01);

    // 6. Determine outcome
    let outcome: PrincipleChallenge['outcome'];
    if (resilienceScore > 0.7) {
      outcome = 'survived';
    } else if (resilienceScore > 0.4) {
      outcome = 'weakened';
    } else {
      outcome = 'disproved';
    }

    // 7. Build challenge arguments summary
    const challengeArguments = [
      ...contradictingEvidence.slice(0, 5).map(e => `Against: ${e}`),
      ...supportingEvidence.slice(0, 5).map(e => `For: ${e}`),
    ];

    // Persist
    const info = this.stmtInsertChallenge.run(
      principleId,
      principleStatement,
      JSON.stringify(challengeArguments),
      JSON.stringify(supportingEvidence),
      JSON.stringify(contradictingEvidence),
      resilienceScore,
      outcome,
    );

    this.ts?.emit('debate', 'discovering',
      `Challenge result: ${outcome} (resilience=${(resilienceScore * 100).toFixed(0)}%, ${supportingEvidence.length} supporting, ${contradictingEvidence.length} contradicting)`,
      outcome === 'disproved' ? 'breakthrough' : 'notable',
    );

    return {
      id: Number(info.lastInsertRowid),
      principleId,
      principleStatement,
      challengeArguments,
      supportingEvidence,
      contradictingEvidence,
      resilienceScore,
      outcome,
      challengedAt: new Date().toISOString(),
    };
  }

  /** Get recent principle challenges. */
  getChallengeHistory(limit = 20): PrincipleChallenge[] {
    const rows = this.stmtGetChallengeHistory.all(limit) as Record<string, unknown>[];
    return rows.map(r => this.toPrincipleChallenge(r));
  }

  /** Get most vulnerable principles (lowest resilience scores). */
  getMostVulnerable(limit = 5): PrincipleChallenge[] {
    const rows = this.stmtGetMostVulnerable.all(limit) as Record<string, unknown>[];
    return rows.map(r => this.toPrincipleChallenge(r));
  }

  // ── Query Methods ────────────────────────────────────

  getDebate(id: number): Debate | null {
    const row = this.stmtGetDebate.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    const perspectives = this.loadPerspectives(id);
    return this.toDebate(row, perspectives);
  }

  listDebates(limit = 20): Debate[] {
    const rows = this.stmtListDebates.all(limit) as Record<string, unknown>[];
    return rows.map(r => {
      const perspectives = this.loadPerspectives(r.id as number);
      return this.toDebate(r, perspectives);
    });
  }

  getStatus(): DebateEngineStatus {
    const total = (this.stmtTotalDebates.get() as { cnt: number }).cnt;
    const open = (this.stmtOpenDebates.get() as { cnt: number }).cnt;
    const synthesized = (this.stmtSynthesizedDebates.get() as { cnt: number }).cnt;

    const recent = this.listDebates(5);
    const syntheses = recent
      .filter(d => d.synthesis)
      .map(d => d.synthesis!);

    const avgConfidence = syntheses.length > 0
      ? syntheses.reduce((s, syn) => s + syn.confidence, 0) / syntheses.length
      : 0;

    const avgParticipants = syntheses.length > 0
      ? syntheses.reduce((s, syn) => s + syn.participantCount, 0) / syntheses.length
      : 0;

    const totalChallenges = (this.stmtTotalChallenges.get() as { cnt: number }).cnt;
    const vulnerablePrinciples = this.getMostVulnerable(3);

    return {
      totalDebates: total,
      openDebates: open,
      synthesizedDebates: synthesized,
      avgConfidence,
      avgParticipants,
      recentDebates: recent,
      totalChallenges,
      vulnerablePrinciples,
      uptime: Date.now() - this.startTime,
    };
  }

  // ── Private: Conflict Detection ────────────────────────

  /**
   * Find conflicts between perspectives.
   * Two arguments conflict if they're about the same topic but make opposite claims.
   */
  private findConflicts(perspectives: DebatePerspective[]): DebateConflict[] {
    const conflicts: DebateConflict[] = [];

    for (let i = 0; i < perspectives.length; i++) {
      for (let j = i + 1; j < perspectives.length; j++) {
        const pA = perspectives[i];
        const pB = perspectives[j];

        // Compare each argument pair
        for (const argA of pA.arguments) {
          for (const argB of pB.arguments) {
            if (this.argumentsConflict(argA, argB)) {
              // Resolve: higher confidence × relevance wins
              const weightA = pA.confidence * pA.relevance * argA.strength;
              const weightB = pB.confidence * pB.relevance * argB.strength;

              let resolution: DebateConflict['resolution'];
              let reason: string;

              if (Math.abs(weightA - weightB) < 0.1) {
                resolution = 'compromise';
                reason = `Both sides have similar weight (${weightA.toFixed(2)} vs ${weightB.toFixed(2)}). Consider both perspectives.`;
              } else if (weightA > weightB) {
                resolution = 'a_wins';
                reason = `${pA.brainName}'s argument is stronger (weight: ${weightA.toFixed(2)} vs ${weightB.toFixed(2)}) based on confidence and evidence.`;
              } else {
                resolution = 'b_wins';
                reason = `${pB.brainName}'s argument is stronger (weight: ${weightB.toFixed(2)} vs ${weightA.toFixed(2)}) based on confidence and evidence.`;
              }

              conflicts.push({
                perspectiveA: pA.brainName,
                perspectiveB: pB.brainName,
                claimA: argA.claim.substring(0, 150),
                claimB: argB.claim.substring(0, 150),
                resolution,
                reason,
              });
            }
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Detect if two arguments conflict.
   * Heuristic: same topic keywords but one has "warning" / negation.
   */
  private argumentsConflict(a: DebateArgument, b: DebateArgument): boolean {
    const wordsA = new Set(a.claim.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    const wordsB = new Set(b.claim.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    // Must have some topic overlap
    let overlap = 0;
    for (const w of wordsA) if (wordsB.has(w)) overlap++;
    const overlapRatio = overlap / Math.max(wordsA.size, wordsB.size, 1);
    if (overlapRatio < 0.2) return false;

    // Check for opposing signals
    const negations = ['not', 'never', 'warning', 'avoid', 'decrease', 'reduce', 'lower', 'bad', 'risk', 'danger'];
    const hasNegA = negations.some(n => a.claim.toLowerCase().includes(n));
    const hasNegB = negations.some(n => b.claim.toLowerCase().includes(n));

    // One positive, one negative about same topic = conflict
    if (hasNegA !== hasNegB) return true;

    // Different sources about same topic with very different strengths
    if (a.source !== b.source && overlapRatio > 0.3 && Math.abs(a.strength - b.strength) > 0.4) {
      return true;
    }

    return false;
  }

  // ── Private: Consensus Building ────────────────────────

  /**
   * Build consensus from perspectives weighted by confidence × relevance.
   */
  private buildConsensus(perspectives: DebatePerspective[], conflicts: DebateConflict[]): string | null {
    if (perspectives.length === 0) return null;
    if (perspectives.length === 1) return perspectives[0].position;

    // Collect all non-conflicting claims
    const conflictingClaims = new Set<string>();
    for (const c of conflicts) {
      conflictingClaims.add(c.claimA.substring(0, 50));
      conflictingClaims.add(c.claimB.substring(0, 50));
    }

    // Aggregate non-conflicting arguments by weight
    const weightedClaims: Array<{ claim: string; weight: number; brain: string }> = [];
    for (const p of perspectives) {
      for (const arg of p.arguments) {
        const key = arg.claim.substring(0, 50);
        if (!conflictingClaims.has(key)) {
          weightedClaims.push({
            claim: arg.claim,
            weight: p.confidence * p.relevance * arg.strength,
            brain: p.brainName,
          });
        }
      }
    }

    weightedClaims.sort((a, b) => b.weight - a.weight);

    // Build consensus from top claims
    const topClaims = weightedClaims.slice(0, 5);
    if (topClaims.length === 0) {
      // Only conflicts, no agreement
      return `No consensus reached. ${conflicts.length} conflicting viewpoints from ${perspectives.map(p => p.brainName).join(', ')}.`;
    }

    const parts = topClaims.map(c => c.claim);
    const participants = [...new Set(perspectives.map(p => p.brainName))].join(', ');

    return `Consensus from ${participants}: ${parts.join('. ')}.`;
  }

  // ── Private: Recommendations ──────────────────────────

  private generateRecommendations(perspectives: DebatePerspective[], conflicts: DebateConflict[]): string[] {
    const recs: string[] = [];

    // High-confidence unanimous arguments → strong recommendation
    const allArgs = perspectives.flatMap(p =>
      p.arguments.map(a => ({ ...a, brain: p.brainName, pConfidence: p.confidence })),
    );

    // Find arguments that appear in multiple perspectives
    const claimCounts = new Map<string, { count: number; totalStrength: number; brains: string[] }>();
    for (const a of allArgs) {
      const key = a.claim.substring(0, 60).toLowerCase();
      const existing = claimCounts.get(key) ?? { count: 0, totalStrength: 0, brains: [] };
      existing.count++;
      existing.totalStrength += a.strength * a.pConfidence;
      existing.brains.push(a.brain);
      claimCounts.set(key, existing);
    }

    // Multi-brain agreement = strong recommendation
    for (const [, info] of claimCounts) {
      const uniqueBrains = [...new Set(info.brains)];
      if (uniqueBrains.length > 1) {
        recs.push(`Strong: ${uniqueBrains.join(' + ')} agree on this point (combined strength: ${info.totalStrength.toFixed(2)}).`);
      }
    }

    // Unresolved conflicts → investigate
    const unresolved = conflicts.filter(c => c.resolution === 'unresolved');
    if (unresolved.length > 0) {
      recs.push(`Investigate: ${unresolved.length} unresolved conflict(s) need more data.`);
    }

    // Low confidence → gather more evidence
    const lowConf = perspectives.filter(p => p.confidence < 0.3);
    if (lowConf.length > 0) {
      recs.push(`Low confidence from ${lowConf.map(p => p.brainName).join(', ')} — more data needed in these domains.`);
    }

    // If no recommendations, note it
    if (recs.length === 0) {
      recs.push('All perspectives considered. Act on the consensus with measured confidence.');
    }

    return recs;
  }

  // ── Private: Helpers ──────────────────────────────────

  private extractKeywords(text: string): string[] {
    const stopwords = new Set([
      'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in',
      'with', 'to', 'for', 'of', 'not', 'no', 'can', 'will', 'do', 'does',
      'was', 'were', 'has', 'have', 'had', 'this', 'that', 'from', 'are',
      'der', 'die', 'das', 'und', 'oder', 'aber', 'ist', 'sind', 'ein', 'eine',
      'für', 'mit', 'auf', 'bei', 'nach', 'von', 'wie', 'was', 'wir', 'ich',
      'warum', 'wann', 'wenn', 'als', 'auch', 'noch', 'nur', 'mehr', 'sehr',
      'should', 'would', 'could', 'how', 'why', 'what', 'when', 'where', 'who',
    ]);

    return text.toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w))
      .map(w => w.replace(/[^a-z0-9äöüß-]/g, ''))
      .filter(w => w.length > 2);
  }

  private isRelevant(text: string, keywords: string[]): boolean {
    const lower = text.toLowerCase();
    const matches = keywords.filter(k => lower.includes(k));
    return matches.length >= 1;
  }

  private computeRelevance(question: string, args: DebateArgument[]): number {
    if (args.length === 0) return 0.1; // Minimal relevance
    // More arguments = more relevant domain
    const argScore = Math.min(1, args.length / 5);
    // Higher average strength = more relevant
    const avgStrength = args.reduce((s, a) => s + a.strength, 0) / args.length;
    return (argScore * 0.5 + avgStrength * 0.5);
  }

  private generatePosition(question: string, args: DebateArgument[]): string {
    if (args.length === 0) {
      return `${this.config.brainName} has limited knowledge about this topic.`;
    }

    const topArgs = args.slice(0, 3);
    const domain = this.config.domainDescription ?? this.config.brainName;
    const claims = topArgs.map(a => a.claim).join('; ');

    return `From ${domain} perspective: ${claims}`;
  }

  private loadPerspectives(debateId: number): DebatePerspective[] {
    const rows = this.stmtGetPerspectives.all(debateId) as Record<string, unknown>[];
    return rows.map(r => this.toPerspective(r));
  }

  private toDebate(row: Record<string, unknown>, perspectives: DebatePerspective[]): Debate {
    let synthesis: DebateSynthesis | null = null;
    try {
      if (row.synthesis_json) synthesis = JSON.parse(row.synthesis_json as string);
    } catch { /* ignore */ }

    return {
      id: row.id as number,
      question: row.question as string,
      status: row.status as DebateStatus,
      perspectives,
      synthesis,
      created_at: row.created_at as string,
      closed_at: row.closed_at as string | undefined,
    };
  }

  private toPerspective(row: Record<string, unknown>): DebatePerspective {
    let args: DebateArgument[] = [];
    try { args = JSON.parse((row.arguments_json as string) || '[]'); } catch { /* ignore */ }

    return {
      id: row.id as number,
      debateId: row.debate_id as number,
      brainName: row.brain_name as string,
      position: row.position as string,
      arguments: args,
      confidence: row.confidence as number,
      relevance: row.relevance as number,
      created_at: row.created_at as string,
    };
  }

  private toPrincipleChallenge(row: Record<string, unknown>): PrincipleChallenge {
    let challengeArguments: string[] = [];
    let supportingEvidence: string[] = [];
    let contradictingEvidence: string[] = [];
    try { challengeArguments = JSON.parse((row.challenge_arguments as string) || '[]'); } catch { /* ignore */ }
    try { supportingEvidence = JSON.parse((row.supporting_evidence as string) || '[]'); } catch { /* ignore */ }
    try { contradictingEvidence = JSON.parse((row.contradicting_evidence as string) || '[]'); } catch { /* ignore */ }

    return {
      id: row.id as number,
      principleId: (row.principle_id as number) ?? null,
      principleStatement: row.principle_statement as string,
      challengeArguments,
      supportingEvidence,
      contradictingEvidence,
      resilienceScore: row.resilience_score as number,
      outcome: row.outcome as PrincipleChallenge['outcome'],
      challengedAt: row.challenged_at as string,
    };
  }
}
