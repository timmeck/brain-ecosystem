import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';

// ── Types ───────────────────────────────────────────────

export interface TeachingConfig {
  brainName: string;
  minRelevance?: number;
}

export interface Lesson {
  id?: number;
  direction: 'sent' | 'received';
  targetBrain?: string;
  sourceBrain?: string;
  domain: string;
  principle: string;
  evidence?: string;
  applicability: number;
  accepted: boolean;
  relevanceScore: number;
  createdAt?: string;
}

export interface LessonInput {
  domain: string;
  principle: string;
  evidence?: string;
  applicability?: number;
}

export interface IncomingLesson {
  sourceBrain: string;
  domain: string;
  principle: string;
  evidence?: string;
  applicability?: number;
}

export interface LearnResult {
  accepted: boolean;
  relevanceScore: number;
}

export interface LessonRequest {
  id?: number;
  direction: 'sent';
  targetBrain: string;
  domain: string;
  principle: string;
  createdAt?: string;
}

export interface TeachingStatus {
  totalSent: number;
  totalReceived: number;
  acceptedCount: number;
  avgRelevance: number;
}

// ── Migration ───────────────────────────────────────────

export function runTeachingMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teaching_lessons (
      id INTEGER PRIMARY KEY,
      direction TEXT NOT NULL CHECK(direction IN ('sent','received')),
      target_brain TEXT,
      source_brain TEXT,
      domain TEXT NOT NULL,
      principle TEXT NOT NULL,
      evidence TEXT,
      applicability REAL DEFAULT 0.5,
      accepted INTEGER DEFAULT 0,
      relevance_score REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_teaching_direction ON teaching_lessons(direction);
    CREATE INDEX IF NOT EXISTS idx_teaching_domain ON teaching_lessons(domain);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class TeachingProtocol {
  private readonly db: Database.Database;
  private readonly config: Required<TeachingConfig>;
  private readonly log = getLogger();
  private ts: ThoughtStream | null = null;
  private notifier: { notifyPeer(peer: string, event: string, data: unknown): Promise<void> } | null = null;

  // Prepared statements
  private readonly stmtInsertLesson: Database.Statement;
  private readonly stmtGetHistory: Database.Statement;
  private readonly stmtGetHistoryByDirection: Database.Statement;
  private readonly stmtTotalSent: Database.Statement;
  private readonly stmtTotalReceived: Database.Statement;
  private readonly stmtAcceptedCount: Database.Statement;
  private readonly stmtAvgRelevance: Database.Statement;

  constructor(db: Database.Database, config: TeachingConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      minRelevance: config.minRelevance ?? 0.3,
    };

    runTeachingMigration(db);

    this.stmtInsertLesson = db.prepare(
      `INSERT INTO teaching_lessons (direction, target_brain, source_brain, domain, principle, evidence, applicability, accepted, relevance_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.stmtGetHistory = db.prepare(
      'SELECT * FROM teaching_lessons ORDER BY id DESC LIMIT ?',
    );
    this.stmtGetHistoryByDirection = db.prepare(
      'SELECT * FROM teaching_lessons WHERE direction = ? ORDER BY id DESC LIMIT ?',
    );
    this.stmtTotalSent = db.prepare(
      "SELECT COUNT(*) as cnt FROM teaching_lessons WHERE direction = 'sent'",
    );
    this.stmtTotalReceived = db.prepare(
      "SELECT COUNT(*) as cnt FROM teaching_lessons WHERE direction = 'received'",
    );
    this.stmtAcceptedCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM teaching_lessons WHERE accepted = 1',
    );
    this.stmtAvgRelevance = db.prepare(
      'SELECT AVG(relevance_score) as avg FROM teaching_lessons WHERE relevance_score IS NOT NULL',
    );

    this.log.debug(`[TeachingProtocol] Initialized for ${this.config.brainName}`);
  }

  // ── Setters ──────────────────────────────────────────

  setThoughtStream(stream: ThoughtStream): void {
    this.ts = stream;
  }

  setNotifier(notifier: { notifyPeer(peer: string, event: string, data: unknown): Promise<void> }): void {
    this.notifier = notifier;
  }

  // ── Core: Teach ──────────────────────────────────────

  teach(targetBrain: string, lesson: LessonInput): Lesson {
    const applicability = lesson.applicability ?? 0.5;
    const relevanceScore = applicability; // When teaching, relevance = applicability estimate

    const info = this.stmtInsertLesson.run(
      'sent',
      targetBrain,
      this.config.brainName,
      lesson.domain,
      lesson.principle,
      lesson.evidence ?? null,
      applicability,
      0,
      relevanceScore,
    );

    this.ts?.emit(
      'teaching',
      'reflecting',
      `Teaching ${targetBrain}: ${lesson.principle.substring(0, 60)}`,
      'notable',
    );

    this.log.debug(`[TeachingProtocol] Taught ${targetBrain}: ${lesson.domain}`);

    // Actually deliver the lesson to the peer brain via IPC
    if (this.notifier) {
      this.notifier.notifyPeer(targetBrain, 'teaching.learn', {
        sourceBrain: this.config.brainName,
        domain: lesson.domain,
        principle: lesson.principle,
        evidence: lesson.evidence,
        applicability,
      }).catch((err) => {
        this.log.warn(`[TeachingProtocol] Failed to deliver lesson to ${targetBrain}: ${(err as Error).message}`);
      });
    }

    return {
      id: Number(info.lastInsertRowid),
      direction: 'sent',
      targetBrain,
      sourceBrain: this.config.brainName,
      domain: lesson.domain,
      principle: lesson.principle,
      evidence: lesson.evidence,
      applicability,
      accepted: false,
      relevanceScore,
    };
  }

  // ── Core: Learn ──────────────────────────────────────

  learn(lesson: IncomingLesson): LearnResult {
    const applicability = lesson.applicability ?? 0.5;

    // Evaluate relevance via keyword overlap with own brain name / known domains
    const relevanceScore = this.evaluateRelevance(lesson);
    const accepted = relevanceScore >= this.config.minRelevance;

    this.stmtInsertLesson.run(
      'received',
      this.config.brainName,
      lesson.sourceBrain,
      lesson.domain,
      lesson.principle,
      lesson.evidence ?? null,
      applicability,
      accepted ? 1 : 0,
      relevanceScore,
    );

    this.ts?.emit(
      'teaching',
      accepted ? 'discovering' : 'reflecting',
      `Lesson from ${lesson.sourceBrain}: ${accepted ? 'accepted' : 'rejected'} (relevance=${relevanceScore.toFixed(2)})`,
      accepted ? 'notable' : 'routine',
    );

    this.log.debug(
      `[TeachingProtocol] Learn from ${lesson.sourceBrain}: ${accepted ? 'accepted' : 'rejected'} (${relevanceScore.toFixed(2)})`,
    );

    return { accepted, relevanceScore };
  }

  // ── Core: Request Lesson ─────────────────────────────

  requestLesson(fromBrain: string, topic: string): LessonRequest {
    const info = this.stmtInsertLesson.run(
      'sent',
      fromBrain,
      this.config.brainName,
      topic,
      `REQUEST: Teach me about ${topic}`,
      null,
      0.5,
      0,
      null,
    );

    this.ts?.emit('teaching', 'reflecting', `Requesting lesson from ${fromBrain}: ${topic}`, 'routine');

    return {
      id: Number(info.lastInsertRowid),
      direction: 'sent',
      targetBrain: fromBrain,
      domain: topic,
      principle: `REQUEST: Teach me about ${topic}`,
    };
  }

  // ── Core: History ────────────────────────────────────

  getHistory(direction?: 'sent' | 'received', limit = 20): Lesson[] {
    const rows = direction
      ? (this.stmtGetHistoryByDirection.all(direction, limit) as Record<string, unknown>[])
      : (this.stmtGetHistory.all(limit) as Record<string, unknown>[]);

    return rows.map(r => this.toLesson(r));
  }

  // ── Core: Status ─────────────────────────────────────

  getStatus(): TeachingStatus {
    const totalSent = (this.stmtTotalSent.get() as { cnt: number }).cnt;
    const totalReceived = (this.stmtTotalReceived.get() as { cnt: number }).cnt;
    const acceptedCount = (this.stmtAcceptedCount.get() as { cnt: number }).cnt;
    const avgRow = this.stmtAvgRelevance.get() as { avg: number | null };
    const avgRelevance = avgRow.avg ?? 0;

    return { totalSent, totalReceived, acceptedCount, avgRelevance };
  }

  // ── Private: Relevance Evaluation ────────────────────

  private evaluateRelevance(lesson: IncomingLesson): number {
    // Keyword overlap heuristic: check how many words in the lesson
    // match the brain's known domain
    const domainKeywords = this.getDomainKeywords();
    const lessonWords = new Set(
      `${lesson.domain} ${lesson.principle} ${lesson.evidence ?? ''}`
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2),
    );

    let matches = 0;
    for (const keyword of domainKeywords) {
      if (lessonWords.has(keyword)) matches++;
    }

    // Base relevance from applicability
    const keywordScore = domainKeywords.length > 0
      ? matches / domainKeywords.length
      : 0;

    // Blend keyword match with applicability
    const applicability = lesson.applicability ?? 0.5;
    return keywordScore * 0.6 + applicability * 0.4;
  }

  private getDomainKeywords(): string[] {
    // Domain keywords based on brain name
    const brainKeywords: Record<string, string[]> = {
      brain: ['error', 'code', 'bug', 'pattern', 'debug', 'fix', 'intelligence', 'analysis'],
      'trading-brain': ['trade', 'market', 'price', 'signal', 'position', 'profit', 'loss', 'equity'],
      'marketing-brain': ['content', 'engagement', 'social', 'audience', 'campaign', 'strategy', 'brand'],
    };

    return brainKeywords[this.config.brainName] ?? [this.config.brainName];
  }

  // ── Private: Row Mapping ─────────────────────────────

  private toLesson(row: Record<string, unknown>): Lesson {
    return {
      id: row.id as number,
      direction: row.direction as 'sent' | 'received',
      targetBrain: (row.target_brain as string) ?? undefined,
      sourceBrain: (row.source_brain as string) ?? undefined,
      domain: row.domain as string,
      principle: row.principle as string,
      evidence: (row.evidence as string) ?? undefined,
      applicability: row.applicability as number,
      accepted: (row.accepted as number) === 1,
      relevanceScore: row.relevance_score as number,
      createdAt: row.created_at as string,
    };
  }
}
