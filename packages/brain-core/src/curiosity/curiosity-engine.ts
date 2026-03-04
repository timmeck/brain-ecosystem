import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { AttentionEngine } from '../attention/attention-engine.js';
import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { HypothesisEngine } from '../hypothesis/engine.js';
import type { ExperimentEngine } from '../research/experiment-engine.js';
import type { ResearchAgendaEngine } from '../research/agenda-engine.js';
import type { NarrativeEngine } from '../narrative/narrative-engine.js';

// ── Types ───────────────────────────────────────────────

export interface CuriosityEngineConfig {
  brainName: string;
  /** UCB1 exploration constant (higher = more exploration). Default: 1.41 (√2) */
  explorationConstant?: number;
  /** Minimum cycles between re-exploring same topic. Default: 5 */
  exploreCooldown?: number;
  /** Max questions per topic. Default: 10 */
  maxQuestionsPerTopic?: number;
  /** Gap score threshold to consider a topic a knowledge gap. Default: 0.6 */
  gapThreshold?: number;
}

export interface CuriosityDataSources {
  attentionEngine?: AttentionEngine;
  knowledgeDistiller?: KnowledgeDistiller;
  hypothesisEngine?: HypothesisEngine;
  experimentEngine?: ExperimentEngine;
  agendaEngine?: ResearchAgendaEngine;
  narrativeEngine?: NarrativeEngine;
}

export interface KnowledgeGap {
  id?: number;
  topic: string;
  attentionScore: number;
  knowledgeScore: number;
  gapScore: number;
  gapType: GapType;
  questions: string[];
  discoveredAt: string;
  addressedAt: string | null;
  explorationCount: number;
}

export type GapType =
  | 'dark_zone'        // No knowledge at all
  | 'shallow'          // Some knowledge but low confidence
  | 'contradictory'    // Conflicting evidence
  | 'stale'            // Knowledge exists but is old
  | 'unexplored';      // Attention but never researched

export interface CuriosityQuestion {
  id?: number;
  topic: string;
  question: string;
  questionType: QuestionType;
  priority: number;
  answered: boolean;
  answer: string | null;
  askedAt: string;
  answeredAt: string | null;
}

export type QuestionType =
  | 'what'             // What is X?
  | 'why'              // Why does X happen?
  | 'how'              // How does X work?
  | 'correlation'      // Is X related to Y?
  | 'prediction'       // What will happen if X?
  | 'comparison';      // How does X compare to Y?

export interface ExplorationRecord {
  id?: number;
  topic: string;
  action: 'explore' | 'exploit';
  reward: number;
  context: string;
  timestamp: string;
}

export interface BanditArm {
  topic: string;
  pulls: number;
  totalReward: number;
  averageReward: number;
  ucbScore: number;
  lastPulled: number | null;
}

export interface BlindSpot {
  id?: number;
  topic: string;
  hypothesisCount: number;
  predictionCount: number;
  journalCount: number;
  experimentCount: number;
  severity: number;
  detectedAt: string;
  resolvedAt: string | null;
}

export interface CuriosityStatus {
  totalGaps: number;
  activeGaps: number;
  totalQuestions: number;
  unansweredQuestions: number;
  totalExplorations: number;
  explorationRate: number;      // explore / (explore + exploit)
  topGaps: KnowledgeGap[];
  topArms: BanditArm[];
  blindSpots: number;
  topBlindSpots: BlindSpot[];
  uptime: number;
}

export interface ExplorationDecision {
  topic: string;
  action: 'explore' | 'exploit';
  ucbScore: number;
  reason: string;
  suggestedActions: string[];
}

// ── Migration ───────────────────────────────────────────

export function runCuriosityMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS curiosity_gaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      attention_score REAL NOT NULL DEFAULT 0,
      knowledge_score REAL NOT NULL DEFAULT 0,
      gap_score REAL NOT NULL DEFAULT 0,
      gap_type TEXT NOT NULL DEFAULT 'unexplored',
      questions TEXT NOT NULL DEFAULT '[]',
      discovered_at TEXT DEFAULT (datetime('now')),
      addressed_at TEXT,
      exploration_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_curiosity_gaps_topic ON curiosity_gaps(topic);
    CREATE INDEX IF NOT EXISTS idx_curiosity_gaps_score ON curiosity_gaps(gap_score DESC);

    CREATE TABLE IF NOT EXISTS curiosity_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      question TEXT NOT NULL,
      question_type TEXT NOT NULL DEFAULT 'what',
      priority REAL NOT NULL DEFAULT 0.5,
      answered INTEGER NOT NULL DEFAULT 0,
      answer TEXT,
      asked_at TEXT DEFAULT (datetime('now')),
      answered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_curiosity_questions_topic ON curiosity_questions(topic);
    CREATE INDEX IF NOT EXISTS idx_curiosity_questions_unanswered ON curiosity_questions(answered) WHERE answered = 0;

    CREATE TABLE IF NOT EXISTS curiosity_explorations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'explore',
      reward REAL NOT NULL DEFAULT 0,
      context TEXT NOT NULL DEFAULT '',
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_curiosity_explorations_topic ON curiosity_explorations(topic);

    CREATE TABLE IF NOT EXISTS blind_spots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      hypothesis_count INTEGER NOT NULL DEFAULT 0,
      prediction_count INTEGER NOT NULL DEFAULT 0,
      journal_count INTEGER NOT NULL DEFAULT 0,
      experiment_count INTEGER NOT NULL DEFAULT 0,
      severity REAL NOT NULL DEFAULT 0,
      detected_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_blind_spots_severity ON blind_spots(severity DESC);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class CuriosityEngine {
  private readonly db: Database.Database;
  private readonly config: Required<CuriosityEngineConfig>;
  private readonly log = getLogger();
  private ts: ThoughtStream | null = null;
  private sources: CuriosityDataSources = {};
  private startTime = Date.now();

  // ── Prepared statements ──────────────────────────────
  private readonly stmtInsertGap: Database.Statement;
  private readonly stmtUpdateGap: Database.Statement;
  private readonly stmtGetGap: Database.Statement;
  private readonly stmtGetGapByTopic: Database.Statement;
  private readonly stmtListGaps: Database.Statement;
  private readonly stmtActiveGapCount: Database.Statement;
  private readonly stmtInsertQuestion: Database.Statement;
  private readonly stmtAnswerQuestion: Database.Statement;
  private readonly stmtListQuestions: Database.Statement;
  private readonly stmtUnansweredCount: Database.Statement;
  private readonly stmtInsertExploration: Database.Statement;
  private readonly stmtGetExplorations: Database.Statement;
  private readonly stmtGetTopicStats: Database.Statement;
  private readonly stmtTotalExplorations: Database.Statement;
  private readonly stmtInsertBlindSpot: Database.Statement;
  private readonly stmtUpdateBlindSpot: Database.Statement;
  private readonly stmtGetBlindSpots: Database.Statement;
  private readonly stmtResolveBlindSpot: Database.Statement;
  private readonly stmtBlindSpotCount: Database.Statement;

  constructor(db: Database.Database, config: CuriosityEngineConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      explorationConstant: config.explorationConstant ?? 1.41,
      exploreCooldown: config.exploreCooldown ?? 5,
      maxQuestionsPerTopic: config.maxQuestionsPerTopic ?? 10,
      gapThreshold: config.gapThreshold ?? 0.6,
    };

    runCuriosityMigration(db);

    // Prepare statements
    this.stmtInsertGap = db.prepare(`
      INSERT INTO curiosity_gaps (topic, attention_score, knowledge_score, gap_score, gap_type, questions)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    this.stmtUpdateGap = db.prepare(`
      UPDATE curiosity_gaps SET attention_score = ?, knowledge_score = ?, gap_score = ?,
        gap_type = ?, questions = ?, exploration_count = ?, addressed_at = ?
      WHERE id = ?
    `);
    this.stmtGetGap = db.prepare('SELECT * FROM curiosity_gaps WHERE id = ?');
    this.stmtGetGapByTopic = db.prepare('SELECT * FROM curiosity_gaps WHERE topic = ? AND addressed_at IS NULL ORDER BY gap_score DESC LIMIT 1');
    this.stmtListGaps = db.prepare('SELECT * FROM curiosity_gaps WHERE addressed_at IS NULL ORDER BY gap_score DESC LIMIT ?');
    this.stmtActiveGapCount = db.prepare('SELECT COUNT(*) as cnt FROM curiosity_gaps WHERE addressed_at IS NULL');
    this.stmtInsertQuestion = db.prepare(`
      INSERT INTO curiosity_questions (topic, question, question_type, priority)
      VALUES (?, ?, ?, ?)
    `);
    this.stmtAnswerQuestion = db.prepare(`
      UPDATE curiosity_questions SET answered = 1, answer = ?, answered_at = datetime('now') WHERE id = ?
    `);
    this.stmtListQuestions = db.prepare('SELECT * FROM curiosity_questions WHERE answered = 0 ORDER BY priority DESC LIMIT ?');
    this.stmtUnansweredCount = db.prepare('SELECT COUNT(*) as cnt FROM curiosity_questions WHERE answered = 0');
    this.stmtInsertExploration = db.prepare(`
      INSERT INTO curiosity_explorations (topic, action, reward, context)
      VALUES (?, ?, ?, ?)
    `);
    this.stmtGetExplorations = db.prepare('SELECT * FROM curiosity_explorations ORDER BY timestamp DESC LIMIT ?');
    this.stmtGetTopicStats = db.prepare(`
      SELECT topic,
        COUNT(*) as pulls,
        SUM(reward) as total_reward,
        AVG(reward) as avg_reward,
        MAX(timestamp) as last_pulled
      FROM curiosity_explorations
      GROUP BY topic
    `);
    this.stmtTotalExplorations = db.prepare('SELECT COUNT(*) as cnt FROM curiosity_explorations');
    this.stmtInsertBlindSpot = db.prepare(`
      INSERT OR REPLACE INTO blind_spots (topic, hypothesis_count, prediction_count, journal_count, experiment_count, severity, detected_at, resolved_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), NULL)
    `);
    this.stmtUpdateBlindSpot = db.prepare(`
      UPDATE blind_spots SET hypothesis_count = ?, prediction_count = ?, journal_count = ?, experiment_count = ?, severity = ?
      WHERE id = ?
    `);
    this.stmtGetBlindSpots = db.prepare('SELECT * FROM blind_spots WHERE resolved_at IS NULL ORDER BY severity DESC LIMIT ?');
    this.stmtResolveBlindSpot = db.prepare("UPDATE blind_spots SET resolved_at = datetime('now') WHERE id = ?");
    this.stmtBlindSpotCount = db.prepare('SELECT COUNT(*) as cnt FROM blind_spots WHERE resolved_at IS NULL');

    this.log.debug(`[CuriosityEngine] Initialized for ${this.config.brainName}`);
  }

  // ── Setters ──────────────────────────────────────────

  setThoughtStream(stream: ThoughtStream): void { this.ts = stream; }

  setDataSources(sources: CuriosityDataSources): void {
    this.sources = sources;
  }

  // ── Core: Knowledge Gap Detection ─────────────────────

  /**
   * Scan attention topics and knowledge base to find gaps.
   * A gap = high attention + low knowledge.
   */
  detectGaps(): KnowledgeGap[] {
    this.ts?.emit('curiosity', 'analyzing', 'Scanning for knowledge gaps...', 'routine');

    const gaps: KnowledgeGap[] = [];
    const topicsToCheck = this.gatherTopics();

    for (const topic of topicsToCheck) {
      const attentionScore = this.getAttentionFor(topic);
      const knowledgeScore = this.getKnowledgeFor(topic);

      // Gap = high attention, low knowledge
      const gapScore = attentionScore * (1 - knowledgeScore);

      if (gapScore >= this.config.gapThreshold) {
        const gapType = this.classifyGap(topic, knowledgeScore);
        const questions = this.generateQuestionsFor(topic, gapType);

        const existing = this.stmtGetGapByTopic.get(topic) as Record<string, unknown> | undefined;
        if (existing) {
          // Update existing gap
          const id = existing.id as number;
          const explorationCount = (existing.exploration_count as number) || 0;
          const existingAddressedAt = (existing.addressed_at as string | null) ?? null;
          this.stmtUpdateGap.run(attentionScore, knowledgeScore, gapScore, gapType, JSON.stringify(questions), explorationCount, existingAddressedAt, id);
          gaps.push(this.toGap({ ...existing, attention_score: attentionScore, knowledge_score: knowledgeScore, gap_score: gapScore, gap_type: gapType, questions: JSON.stringify(questions), exploration_count: explorationCount }));
        } else {
          // Insert new gap
          const info = this.stmtInsertGap.run(topic, attentionScore, knowledgeScore, gapScore, gapType, JSON.stringify(questions));
          const newGap: KnowledgeGap = {
            id: Number(info.lastInsertRowid),
            topic,
            attentionScore,
            knowledgeScore,
            gapScore,
            gapType,
            questions,
            discoveredAt: new Date().toISOString(),
            addressedAt: null,
            explorationCount: 0,
          };
          gaps.push(newGap);

          // Also persist questions
          for (const q of questions) {
            const qType = this.inferQuestionType(q);
            this.stmtInsertQuestion.run(topic, q, qType, gapScore);
          }
        }
      }
    }

    if (gaps.length > 0) {
      this.ts?.emit('curiosity', 'discovering', `Found ${gaps.length} knowledge gap(s)`, gaps.length > 2 ? 'notable' : 'routine');
    }

    return gaps.sort((a, b) => b.gapScore - a.gapScore);
  }

  // ── Core: UCB1 Multi-Armed Bandit ─────────────────────

  /**
   * UCB1: Upper Confidence Bound algorithm.
   * Balances exploration (trying under-explored topics) vs exploitation
   * (deepening high-reward topics).
   *
   * UCB1(arm) = avg_reward + c * sqrt(ln(N) / n_i)
   * where N = total pulls, n_i = pulls for arm i, c = exploration constant
   */
  selectTopic(): ExplorationDecision | null {
    this.ts?.emit('curiosity', 'analyzing', 'Running bandit selection...', 'routine');

    const arms = this.getArms();
    const gaps = this.getGaps(20);

    if (arms.length === 0 && gaps.length === 0) {
      return null;
    }

    // Merge: arms from prior explorations + new gaps never explored
    const allTopics = new Map<string, BanditArm>();
    for (const arm of arms) {
      allTopics.set(arm.topic, arm);
    }
    for (const gap of gaps) {
      if (!allTopics.has(gap.topic)) {
        allTopics.set(gap.topic, {
          topic: gap.topic,
          pulls: 0,
          totalReward: 0,
          averageReward: 0,
          ucbScore: Infinity, // Never explored = infinite UCB (always try first)
          lastPulled: null,
        });
      }
    }

    if (allTopics.size === 0) return null;

    const totalPulls = Array.from(allTopics.values()).reduce((s, a) => s + a.pulls, 0);
    const c = this.config.explorationConstant;

    // Compute UCB1 scores
    let best: BanditArm | null = null;
    for (const arm of allTopics.values()) {
      if (arm.pulls === 0) {
        arm.ucbScore = Infinity; // Untried arm → explore
      } else {
        const exploitation = arm.averageReward;
        const exploration = c * Math.sqrt(Math.log(Math.max(totalPulls, 1)) / arm.pulls);
        arm.ucbScore = exploitation + exploration;
      }

      if (!best || arm.ucbScore > best.ucbScore) {
        best = arm;
      }
    }

    if (!best) return null;

    const action: 'explore' | 'exploit' = best.pulls === 0 || best.ucbScore > (best.averageReward + 0.5) ? 'explore' : 'exploit';
    const suggestedActions = this.suggestActions(best.topic, action);

    const decision: ExplorationDecision = {
      topic: best.topic,
      action,
      ucbScore: best.ucbScore === Infinity ? 999 : best.ucbScore,
      reason: best.pulls === 0
        ? `Never explored — high curiosity`
        : action === 'explore'
          ? `Under-explored (${best.pulls} pulls, UCB=${best.ucbScore.toFixed(2)})`
          : `High-reward topic (avg=${best.averageReward.toFixed(2)}, ${best.pulls} pulls)`,
      suggestedActions,
    };

    this.ts?.emit('curiosity', 'hypothesizing',
      `Bandit: ${action} "${best.topic}" (UCB=${decision.ucbScore === 999 ? '∞' : decision.ucbScore.toFixed(2)})`,
      action === 'explore' ? 'notable' : 'routine',
    );

    return decision;
  }

  /**
   * Record the outcome of an exploration/exploitation.
   * Reward: 0-1 where 1 = highly valuable outcome.
   */
  recordOutcome(topic: string, action: 'explore' | 'exploit', reward: number, context = ''): void {
    const clampedReward = Math.max(0, Math.min(1, reward));
    this.stmtInsertExploration.run(topic, action, clampedReward, context);

    // Update gap exploration count
    const gap = this.stmtGetGapByTopic.get(topic) as Record<string, unknown> | undefined;
    if (gap) {
      const count = ((gap.exploration_count as number) || 0) + 1;
      this.stmtUpdateGap.run(
        gap.attention_score, gap.knowledge_score, gap.gap_score,
        gap.gap_type, gap.questions, count,
        clampedReward >= 0.7 ? new Date().toISOString() : null,
        gap.id,
      );
    }

    this.log.debug(`[CuriosityEngine] Recorded ${action} "${topic}" reward=${clampedReward.toFixed(2)}`);
  }

  // ── Core: Question Generation ─────────────────────────

  /**
   * Generate concrete questions Brain should investigate.
   * Uses knowledge context to formulate specific questions.
   */
  generateQuestions(topic?: string): CuriosityQuestion[] {
    const questions: CuriosityQuestion[] = [];
    const gaps = topic
      ? [this.stmtGetGapByTopic.get(topic) as Record<string, unknown> | undefined].filter(Boolean)
      : (this.stmtListGaps.all(10) as Record<string, unknown>[]);

    for (const gap of gaps) {
      if (!gap) continue;
      const t = gap.topic as string;
      const gapType = gap.gap_type as GapType;
      const generated = this.generateQuestionsFor(t, gapType);

      for (const q of generated) {
        const qType = this.inferQuestionType(q);
        const existing = this.db.prepare(
          'SELECT id FROM curiosity_questions WHERE topic = ? AND question = ?',
        ).get(t, q);

        if (!existing) {
          const info = this.stmtInsertQuestion.run(t, q, qType, (gap.gap_score as number) || 0.5);
          questions.push({
            id: Number(info.lastInsertRowid),
            topic: t,
            question: q,
            questionType: qType,
            priority: (gap.gap_score as number) || 0.5,
            answered: false,
            answer: null,
            askedAt: new Date().toISOString(),
            answeredAt: null,
          });
        }
      }
    }

    if (questions.length > 0) {
      this.ts?.emit('curiosity', 'hypothesizing', `Generated ${questions.length} new question(s)`, 'routine');
    }

    return questions;
  }

  /**
   * Answer a question (e.g., when user or system provides an answer).
   */
  answerQuestion(questionId: number, answer: string): boolean {
    const changes = this.stmtAnswerQuestion.run(answer, questionId).changes;
    return changes > 0;
  }

  // ── Core: Surprise Detection ─────────────────────────

  /**
   * Check for surprises: things that violated expectations.
   * Compares predictions vs actual outcomes, hypothesis results vs expected.
   */
  detectSurprises(): Array<{ topic: string; expected: string; actual: string; deviation: number }> {
    const surprises: Array<{ topic: string; expected: string; actual: string; deviation: number }> = [];

    // Check hypothesis surprises: confirmed hypotheses with low prior confidence
    if (this.sources.hypothesisEngine) {
      try {
        const confirmed = this.sources.hypothesisEngine.list('confirmed', 10);
        for (const h of confirmed) {
          // Hypothesis that was expected to fail but succeeded
          if (h.confidence < 0.3) {
            surprises.push({
              topic: h.statement,
              expected: `Low confidence (${(h.confidence * 100).toFixed(0)}%) → expected rejection`,
              actual: 'Confirmed',
              deviation: 1 - h.confidence,
            });
          }
        }
        const rejected = this.sources.hypothesisEngine.list('rejected', 10);
        for (const h of rejected) {
          // Hypothesis that was expected to pass but failed
          if (h.confidence > 0.7) {
            surprises.push({
              topic: h.statement,
              expected: `High confidence (${(h.confidence * 100).toFixed(0)}%) → expected confirmation`,
              actual: 'Rejected',
              deviation: h.confidence,
            });
          }
        }
      } catch {
        // hypothesis engine may not be wired
      }
    }

    // Check experiment surprises
    if (this.sources.experimentEngine) {
      try {
        const completed = this.sources.experimentEngine.list('complete', 10);
        for (const exp of completed) {
          if (exp.conclusion?.significant && exp.conclusion.effect_size && Math.abs(exp.conclusion.effect_size) > 0.8) {
            surprises.push({
              topic: exp.name,
              expected: `Null hypothesis (no effect)`,
              actual: `Large effect (d=${exp.conclusion.effect_size.toFixed(2)}, p=${exp.conclusion.p_value?.toFixed(4)})`,
              deviation: Math.min(1, Math.abs(exp.conclusion.effect_size)),
            });
          }
        }
      } catch {
        // experiment engine may not be wired
      }
    }

    if (surprises.length > 0) {
      this.ts?.emit('curiosity', 'discovering',
        `Found ${surprises.length} surprise(s)!`,
        surprises.some(s => s.deviation > 0.7) ? 'notable' : 'routine',
      );
    }

    return surprises.sort((a, b) => b.deviation - a.deviation);
  }

  // ── Core: Blind Spot Detection ──────────────────────

  /**
   * Detect blind spots: topics that exist across attention/journal/hypotheses/experiments
   * but have very low coverage in one or more of those dimensions.
   * severity = 1 - avg(normalized counts). Topics with severity > 0.7 are blind spots.
   */
  detectBlindSpots(): BlindSpot[] {
    this.ts?.emit('curiosity', 'analyzing', 'Scanning for blind spots...', 'routine');

    const blindSpots: BlindSpot[] = [];
    const topicsToCheck = this.gatherTopics();

    // Gather counts per topic across all data sources
    const topicData: Map<string, { hypotheses: number; predictions: number; journal: number; experiments: number }> = new Map();

    for (const topic of topicsToCheck) {
      const data = { hypotheses: 0, predictions: 0, journal: 0, experiments: 0 };

      // Count hypotheses mentioning this topic
      if (this.sources.hypothesisEngine) {
        try {
          const all = this.sources.hypothesisEngine.list(undefined, 100);
          data.hypotheses = all.filter(h =>
            h.statement.toLowerCase().includes(topic.toLowerCase()),
          ).length;
        } catch { /* not wired */ }
      }

      // Count journal entries (via narrative engine)
      if (this.sources.narrativeEngine) {
        try {
          const explanation = this.sources.narrativeEngine.explain(topic);
          data.journal = explanation.sources?.length ?? 0;
        } catch { /* not wired */ }
      }

      // Count experiments
      if (this.sources.experimentEngine) {
        try {
          const allExps = this.sources.experimentEngine.list(undefined, 100);
          data.experiments = allExps.filter(e =>
            e.name.toLowerCase().includes(topic.toLowerCase()) ||
            e.hypothesis.toLowerCase().includes(topic.toLowerCase()),
          ).length;
        } catch { /* not wired */ }
      }

      // Count predictions (from hypotheses with type 'prediction' or tested status)
      if (this.sources.hypothesisEngine) {
        try {
          const all = this.sources.hypothesisEngine.list(undefined, 100);
          data.predictions = all.filter(h =>
            h.statement.toLowerCase().includes(topic.toLowerCase()) &&
            (h.status === 'confirmed' || h.status === 'rejected'),
          ).length;
        } catch { /* not wired */ }
      }

      topicData.set(topic, data);
    }

    // Find max counts for normalization
    let maxHypotheses = 0, maxPredictions = 0, maxJournal = 0, maxExperiments = 0;
    for (const data of topicData.values()) {
      maxHypotheses = Math.max(maxHypotheses, data.hypotheses);
      maxPredictions = Math.max(maxPredictions, data.predictions);
      maxJournal = Math.max(maxJournal, data.journal);
      maxExperiments = Math.max(maxExperiments, data.experiments);
    }

    // Normalize and compute severity
    for (const [topic, data] of topicData) {
      const normHypotheses = maxHypotheses > 0 ? data.hypotheses / maxHypotheses : 0;
      const normPredictions = maxPredictions > 0 ? data.predictions / maxPredictions : 0;
      const normJournal = maxJournal > 0 ? data.journal / maxJournal : 0;
      const normExperiments = maxExperiments > 0 ? data.experiments / maxExperiments : 0;

      const avgNormalized = (normHypotheses + normPredictions + normJournal + normExperiments) / 4;
      const severity = 1 - avgNormalized;

      if (severity > 0.7) {
        // Check if already exists (by topic)
        const existing = this.db.prepare('SELECT id FROM blind_spots WHERE topic = ? AND resolved_at IS NULL').get(topic) as { id: number } | undefined;

        if (existing) {
          this.stmtUpdateBlindSpot.run(data.hypotheses, data.predictions, data.journal, data.experiments, severity, existing.id);
        } else {
          this.stmtInsertBlindSpot.run(topic, data.hypotheses, data.predictions, data.journal, data.experiments, severity);
        }

        blindSpots.push({
          topic,
          hypothesisCount: data.hypotheses,
          predictionCount: data.predictions,
          journalCount: data.journal,
          experimentCount: data.experiments,
          severity,
          detectedAt: new Date().toISOString(),
          resolvedAt: null,
        });
      }
    }

    if (blindSpots.length > 0) {
      this.ts?.emit('curiosity', 'discovering',
        `Found ${blindSpots.length} blind spot(s)`,
        blindSpots.some(b => b.severity > 0.9) ? 'notable' : 'routine',
      );
    }

    return blindSpots.sort((a, b) => b.severity - a.severity);
  }

  /** Get unresolved blind spots sorted by severity. */
  getBlindSpots(limit = 10): BlindSpot[] {
    const rows = this.stmtGetBlindSpots.all(limit) as Record<string, unknown>[];
    return rows.map(r => this.toBlindSpot(r));
  }

  /** Mark a blind spot as resolved. */
  resolveBlindSpot(id: number): boolean {
    const changes = this.stmtResolveBlindSpot.run(id).changes;
    return changes > 0;
  }

  // ── Query Methods ────────────────────────────────────

  getGaps(limit = 10): KnowledgeGap[] {
    const rows = this.stmtListGaps.all(limit) as Record<string, unknown>[];
    return rows.map(r => this.toGap(r));
  }

  getGap(id: number): KnowledgeGap | null {
    const row = this.stmtGetGap.get(id) as Record<string, unknown> | undefined;
    return row ? this.toGap(row) : null;
  }

  getQuestions(limit = 20): CuriosityQuestion[] {
    const rows = this.stmtListQuestions.all(limit) as Record<string, unknown>[];
    return rows.map(r => this.toQuestion(r));
  }

  getArms(): BanditArm[] {
    const rows = this.stmtGetTopicStats.all() as Record<string, unknown>[];
    return rows.map(r => ({
      topic: r.topic as string,
      pulls: r.pulls as number,
      totalReward: r.total_reward as number,
      averageReward: r.avg_reward as number,
      ucbScore: 0, // Computed in selectTopic()
      lastPulled: r.last_pulled ? new Date(r.last_pulled as string).getTime() : null,
    }));
  }

  getExplorations(limit = 50): ExplorationRecord[] {
    const rows = this.stmtGetExplorations.all(limit) as Record<string, unknown>[];
    return rows.map(r => ({
      id: r.id as number,
      topic: r.topic as string,
      action: r.action as 'explore' | 'exploit',
      reward: r.reward as number,
      context: r.context as string,
      timestamp: r.timestamp as string,
    }));
  }

  getStatus(): CuriosityStatus {
    const totalGaps = this.db.prepare('SELECT COUNT(*) as cnt FROM curiosity_gaps').get() as { cnt: number };
    const activeGaps = this.stmtActiveGapCount.get() as { cnt: number };
    const totalQuestions = this.db.prepare('SELECT COUNT(*) as cnt FROM curiosity_questions').get() as { cnt: number };
    const unanswered = this.stmtUnansweredCount.get() as { cnt: number };
    const totalExpl = this.stmtTotalExplorations.get() as { cnt: number };

    const exploreCount = (this.db.prepare(
      "SELECT COUNT(*) as cnt FROM curiosity_explorations WHERE action = 'explore'",
    ).get() as { cnt: number }).cnt;
    const exploitCount = (this.db.prepare(
      "SELECT COUNT(*) as cnt FROM curiosity_explorations WHERE action = 'exploit'",
    ).get() as { cnt: number }).cnt;
    const total = exploreCount + exploitCount;

    const blindSpotCount = (this.stmtBlindSpotCount.get() as { cnt: number }).cnt;

    return {
      totalGaps: totalGaps.cnt,
      activeGaps: activeGaps.cnt,
      totalQuestions: totalQuestions.cnt,
      unansweredQuestions: unanswered.cnt,
      totalExplorations: totalExpl.cnt,
      explorationRate: total > 0 ? exploreCount / total : 0,
      topGaps: this.getGaps(5),
      topArms: this.getArms().sort((a, b) => b.averageReward - a.averageReward).slice(0, 5),
      blindSpots: blindSpotCount,
      topBlindSpots: this.getBlindSpots(5),
      uptime: Date.now() - this.startTime,
    };
  }

  // ── Private: Topic Gathering ─────────────────────────

  /** Gather topics from attention, knowledge, and hypotheses. */
  private gatherTopics(): string[] {
    const topics = new Set<string>();

    // From attention engine: what Brain is paying attention to
    if (this.sources.attentionEngine) {
      try {
        const topTopics = this.sources.attentionEngine.getTopTopics(15);
        for (const t of topTopics) topics.add(t.topic.toLowerCase());
      } catch { /* not wired */ }
    }

    // From knowledge distiller: known principles/strategies
    if (this.sources.knowledgeDistiller) {
      try {
        const pkg = this.sources.knowledgeDistiller.getPackage(this.config.brainName);
        for (const p of pkg.principles) {
          const words = this.extractTopicWords(p.statement);
          for (const w of words) topics.add(w);
        }
        for (const ap of pkg.anti_patterns) {
          const words = this.extractTopicWords(ap.statement);
          for (const w of words) topics.add(w);
        }
      } catch { /* not wired */ }
    }

    // From hypothesis engine: active hypothesis topics
    if (this.sources.hypothesisEngine) {
      try {
        const active = this.sources.hypothesisEngine.list('testing', 10);
        for (const h of active) {
          const words = this.extractTopicWords(h.statement);
          for (const w of words) topics.add(w);
        }
      } catch { /* not wired */ }
    }

    return Array.from(topics);
  }

  /** Extract meaningful topic words from a statement. */
  private extractTopicWords(statement: string): string[] {
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'must', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
      'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'but', 'and', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either', 'neither',
      'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
      'only', 'own', 'same', 'than', 'too', 'very', 'just', 'that', 'this', 'these', 'those',
      'it', 'its', 'if', 'then', 'when', 'while', 'where', 'how', 'what', 'which', 'who',
      'whom', 'why', 'because', 'about', 'also', 'up', 'out', 'one', 'two', 'three',
      'new', 'old', 'high', 'low', 'much', 'many', 'well', 'back', 'even', 'still', 'over',
      'they', 'them', 'their', 'we', 'us', 'our', 'you', 'your', 'he', 'she', 'him', 'her',
      'his', 'i', 'me', 'my', 'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'nicht',
      'mit', 'von', 'zu', 'ist', 'sind', 'hat', 'haben', 'wird', 'werden', 'kann', 'können',
    ]);

    return statement
      .toLowerCase()
      .replace(/[^a-z0-9äöüß\s-]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));
  }

  // ── Private: Scoring ──────────────────────────────────

  /** Get attention score for a topic (0-1 normalized). */
  private getAttentionFor(topic: string): number {
    if (!this.sources.attentionEngine) return 0.5; // Default moderate attention

    try {
      const topTopics = this.sources.attentionEngine.getTopTopics(20);
      const match = topTopics.find(t => t.topic.toLowerCase() === topic.toLowerCase());
      if (!match) return 0.1; // Known but not in focus

      // Normalize: highest attention topic = 1.0
      const maxScore = topTopics[0]?.score || 1;
      return Math.min(1, match.score / maxScore);
    } catch {
      return 0.5;
    }
  }

  /** Get knowledge score for a topic (0-1). High = we know a lot. */
  private getKnowledgeFor(topic: string): number {
    let score = 0;
    let factors = 0;

    // Check principles
    if (this.sources.knowledgeDistiller) {
      try {
        const pkg = this.sources.knowledgeDistiller.getPackage(this.config.brainName);
        const principleMatches = pkg.principles.filter(p =>
          p.statement.toLowerCase().includes(topic.toLowerCase()),
        ).length;
        score += Math.min(1, principleMatches / 2); // 2+ principles = full knowledge
        factors++;

        const antiPatternMatches = pkg.anti_patterns.filter(ap =>
          ap.statement.toLowerCase().includes(topic.toLowerCase()),
        ).length;
        score += Math.min(1, antiPatternMatches / 2);
        factors++;
      } catch { /* not wired */ }
    }

    // Check hypotheses
    if (this.sources.hypothesisEngine) {
      try {
        const all = this.sources.hypothesisEngine.list(undefined, 50);
        const confirmed = all.filter(h =>
          h.statement.toLowerCase().includes(topic.toLowerCase()) && h.status === 'confirmed',
        ).length;
        const total = all.filter(h =>
          h.statement.toLowerCase().includes(topic.toLowerCase()),
        ).length;
        score += total > 0 ? confirmed / Math.max(total, 1) : 0;
        factors++;
      } catch { /* not wired */ }
    }

    // Check experiments
    if (this.sources.experimentEngine) {
      try {
        const completed = this.sources.experimentEngine.list('complete', 50);
        const relevant = completed.filter(e =>
          e.name.toLowerCase().includes(topic.toLowerCase()) ||
          e.hypothesis.toLowerCase().includes(topic.toLowerCase()),
        ).length;
        score += Math.min(1, relevant / 2);
        factors++;
      } catch { /* not wired */ }
    }

    // Check narrative engine for confidence
    if (this.sources.narrativeEngine) {
      try {
        const confidence = this.sources.narrativeEngine.getConfidenceReport(topic);
        score += confidence.overallConfidence;
        factors++;
      } catch { /* not wired */ }
    }

    return factors > 0 ? score / factors : 0;
  }

  // ── Private: Gap Classification ──────────────────────

  private classifyGap(topic: string, knowledgeScore: number): GapType {
    if (knowledgeScore < 0.05) return 'dark_zone';
    if (knowledgeScore < 0.15) return 'unexplored';

    // Check for contradictions via narrative engine
    if (this.sources.narrativeEngine) {
      try {
        const contradictions = this.sources.narrativeEngine.findContradictions();
        const hasContradiction = contradictions.some(c =>
          c.statement_a?.toLowerCase().includes(topic.toLowerCase()) ||
          c.statement_b?.toLowerCase().includes(topic.toLowerCase()),
        );
        if (hasContradiction) return 'contradictory';
      } catch { /* not wired */ }
    }

    // Check if knowledge is stale (last hypothesis/experiment > 100 cycles ago)
    if (this.sources.hypothesisEngine) {
      try {
        const all = this.sources.hypothesisEngine.list(undefined, 50);
        const relevant = all.filter(h => h.statement.toLowerCase().includes(topic.toLowerCase()));
        if (relevant.length > 0) {
          const newest = relevant[0];
          const age = Date.now() - new Date(newest.created_at || 0).getTime();
          if (age > 3_600_000) return 'stale'; // > 1h old (stale for a 5-min cycle brain)
        }
      } catch { /* not wired */ }
    }

    return 'shallow';
  }

  // ── Private: Question Generation ─────────────────────

  private generateQuestionsFor(topic: string, gapType: GapType): string[] {
    const questions: string[] = [];
    const t = topic;

    switch (gapType) {
      case 'dark_zone':
        questions.push(
          `What is "${t}" and how does it relate to our domain?`,
          `What data do we need to collect about "${t}"?`,
          `Are there patterns in other domains that apply to "${t}"?`,
        );
        break;
      case 'shallow':
        questions.push(
          `What deeper patterns exist in "${t}" beyond surface observations?`,
          `How confident are our current assumptions about "${t}"?`,
        );
        break;
      case 'contradictory':
        questions.push(
          `What explains the contradictions in "${t}"?`,
          `Are there hidden variables affecting "${t}"?`,
          `Should we design an experiment to resolve "${t}" contradictions?`,
        );
        break;
      case 'stale':
        questions.push(
          `Has "${t}" changed since our last observation?`,
          `What new data about "${t}" should we collect?`,
        );
        break;
      case 'unexplored':
        questions.push(
          `Why haven't we investigated "${t}" despite paying attention to it?`,
          `What hypotheses can we form about "${t}"?`,
          `How does "${t}" relate to our confirmed principles?`,
        );
        break;
    }

    return questions.slice(0, this.config.maxQuestionsPerTopic);
  }

  private inferQuestionType(question: string): QuestionType {
    const q = question.toLowerCase();
    if (q.startsWith('what')) return 'what';
    if (q.startsWith('why')) return 'why';
    if (q.startsWith('how')) return 'how';
    if (q.includes('relate') || q.includes('correlat') || q.includes('connect')) return 'correlation';
    if (q.includes('predict') || q.includes('will') || q.includes('expect')) return 'prediction';
    if (q.includes('compar') || q.includes('differ') || q.includes('versus')) return 'comparison';
    return 'what';
  }

  // ── Private: Action Suggestions ──────────────────────

  private suggestActions(topic: string, action: 'explore' | 'exploit'): string[] {
    if (action === 'explore') {
      return [
        `Search for data related to "${topic}"`,
        `Form a hypothesis about "${topic}"`,
        `Check cross-brain knowledge about "${topic}"`,
        `Create a research agenda item for "${topic}"`,
      ];
    } else {
      return [
        `Design an experiment to deepen "${topic}" understanding`,
        `Distill existing "${topic}" knowledge into principles`,
        `Apply "${topic}" insights to current challenges`,
      ];
    }
  }

  // ── Private: Helpers ─────────────────────────────────

  private toGap(row: Record<string, unknown>): KnowledgeGap {
    let questions: string[] = [];
    try { questions = JSON.parse((row.questions as string) || '[]'); } catch { /* ignore */ }
    return {
      id: row.id as number,
      topic: row.topic as string,
      attentionScore: row.attention_score as number,
      knowledgeScore: row.knowledge_score as number,
      gapScore: row.gap_score as number,
      gapType: row.gap_type as GapType,
      questions,
      discoveredAt: row.discovered_at as string,
      addressedAt: (row.addressed_at as string) || null,
      explorationCount: (row.exploration_count as number) || 0,
    };
  }

  private toQuestion(row: Record<string, unknown>): CuriosityQuestion {
    return {
      id: row.id as number,
      topic: row.topic as string,
      question: row.question as string,
      questionType: row.question_type as QuestionType,
      priority: row.priority as number,
      answered: (row.answered as number) === 1,
      answer: (row.answer as string) || null,
      askedAt: row.asked_at as string,
      answeredAt: (row.answered_at as string) || null,
    };
  }

  private toBlindSpot(row: Record<string, unknown>): BlindSpot {
    return {
      id: row.id as number,
      topic: row.topic as string,
      hypothesisCount: (row.hypothesis_count as number) || 0,
      predictionCount: (row.prediction_count as number) || 0,
      journalCount: (row.journal_count as number) || 0,
      experimentCount: (row.experiment_count as number) || 0,
      severity: row.severity as number,
      detectedAt: row.detected_at as string,
      resolvedAt: (row.resolved_at as string) || null,
    };
  }
}
