import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { PredictionEngine } from '../prediction/prediction-engine.js';
import type { HypothesisEngine } from '../hypothesis/engine.js';

// ── Types ───────────────────────────────────────────────

export interface SelfTest {
  id?: number;
  principleStatement: string;
  derivedPrediction: string;
  predictionResult: 'untested' | 'confirmed' | 'contradicted' | 'inconclusive';
  understandingDepth: number;
  testedAt: string;
}

export interface UnderstandingReport {
  totalTested: number;
  deepUnderstanding: number;     // principles where we can predict
  shallowUnderstanding: number;  // principles we only describe
  untested: number;
  avgDepth: number;
  weakestPrinciples: SelfTest[];
}

export interface SelfTestStatus {
  totalTests: number;
  confirmed: number;
  contradicted: number;
  inconclusive: number;
  avgDepth: number;
}

// ── Migration ───────────────────────────────────────────

export function runSelfTestMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS self_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      principle_statement TEXT NOT NULL,
      derived_prediction TEXT NOT NULL DEFAULT '',
      prediction_result TEXT NOT NULL DEFAULT 'untested',
      understanding_depth REAL NOT NULL DEFAULT 0,
      tested_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_self_tests_result ON self_tests(prediction_result);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class SelfTestEngine {
  private db: Database.Database;
  private log = getLogger();
  private thoughtStream: ThoughtStream | null = null;
  private distiller: KnowledgeDistiller | null = null;
  private predictionEngine: PredictionEngine | null = null;
  private hypothesisEngine: HypothesisEngine | null = null;

  constructor(db: Database.Database) {
    this.db = db;
    runSelfTestMigration(db);
  }

  setThoughtStream(stream: ThoughtStream): void {
    this.thoughtStream = stream;
  }

  setKnowledgeDistiller(distiller: KnowledgeDistiller): void {
    this.distiller = distiller;
  }

  setPredictionEngine(engine: PredictionEngine): void {
    this.predictionEngine = engine;
  }

  setHypothesisEngine(engine: HypothesisEngine): void {
    this.hypothesisEngine = engine;
  }

  /** Test if brain truly understands a principle by checking predictions + hypotheses. */
  testPrinciple(statement: string): SelfTest {
    const keywords = this.extractKeywords(statement);
    let matchingConfirmed = 0;
    let matchingPredictions = 0;
    let hypothesisConfidence = 0;
    let derivedPrediction = '';

    // 1. Check predictions that match the principle keywords
    if (this.predictionEngine) {
      try {
        const predictions = this.predictionEngine.list(undefined, undefined, 100);
        for (const pred of predictions) {
          const predText = `${pred.metric} ${pred.reasoning ?? ''}`.toLowerCase();
          const matchCount = keywords.filter(kw => predText.includes(kw)).length;
          if (matchCount >= 1) {
            matchingPredictions++;
            if (pred.status === 'correct') {
              matchingConfirmed++;
              if (!derivedPrediction) {
                derivedPrediction = `Prediction "${pred.metric}" (${pred.predicted_direction}) matches this principle`;
              }
            }
          }
        }
      } catch { /* predictions table might not exist */ }
    }

    // 2. Check hypotheses that relate to this principle
    if (this.hypothesisEngine) {
      try {
        const hypotheses = this.hypothesisEngine.list(undefined, 100);
        let totalConf = 0;
        let matchCount = 0;
        for (const hyp of hypotheses) {
          const hypText = `${hyp.statement} ${hyp.type}`.toLowerCase();
          const kwMatches = keywords.filter(kw => hypText.includes(kw)).length;
          if (kwMatches >= 1) {
            matchCount++;
            totalConf += hyp.confidence;
            if (hyp.status === 'confirmed' && !derivedPrediction) {
              derivedPrediction = `Hypothesis "${hyp.statement}" confirms understanding`;
            }
          }
        }
        hypothesisConfidence = matchCount > 0 ? totalConf / matchCount : 0;
      } catch { /* hypotheses table might not exist */ }
    }

    // 3. Calculate understanding depth
    //    depth = (matchingConfirmed * 0.5 + matchingPredictions * 0.3 + hypothesisConfidence * 0.2) normalized 0-1
    const rawDepth = matchingConfirmed * 0.5 + matchingPredictions * 0.3 + hypothesisConfidence * 0.2;
    const understandingDepth = Math.min(1, Math.max(0, rawDepth));

    // 4. Determine result
    let predictionResult: SelfTest['predictionResult'];
    if (understandingDepth >= 0.6) {
      predictionResult = 'confirmed';
    } else if (understandingDepth <= 0.2) {
      predictionResult = 'contradicted';
    } else {
      predictionResult = 'inconclusive';
    }

    if (!derivedPrediction) {
      derivedPrediction = `Depth ${understandingDepth.toFixed(2)}: ${matchingPredictions} predictions, ${matchingConfirmed} confirmed, hypothesis confidence ${hypothesisConfidence.toFixed(2)}`;
    }

    // 5. Persist
    const result = this.db.prepare(`
      INSERT INTO self_tests (principle_statement, derived_prediction, prediction_result, understanding_depth)
      VALUES (?, ?, ?, ?)
    `).run(statement, derivedPrediction, predictionResult, understandingDepth);

    const selfTest: SelfTest = {
      id: result.lastInsertRowid as number,
      principleStatement: statement,
      derivedPrediction: derivedPrediction,
      predictionResult,
      understandingDepth,
      testedAt: new Date().toISOString(),
    };

    // 6. Emit thought
    this.thoughtStream?.emit(
      'self-test',
      'reflecting',
      `Self-tested principle: "${statement.slice(0, 80)}..." → ${predictionResult} (depth: ${understandingDepth.toFixed(2)})`,
      predictionResult === 'confirmed' ? 'notable' : 'routine',
    );

    this.log.debug(`[self-test] Tested: "${statement.slice(0, 60)}..." → ${predictionResult} (depth=${understandingDepth.toFixed(3)})`);

    return selfTest;
  }

  /** Test all confirmed principles from KnowledgeDistiller. */
  testAll(): SelfTest[] {
    if (!this.distiller) return [];

    const principles = this.distiller.getPrinciples(undefined, 100);
    const results: SelfTest[] = [];

    for (const p of principles) {
      const test = this.testPrinciple(p.statement);
      results.push(test);
    }

    this.log.info(`[self-test] Tested ${results.length} principles: ${results.filter(t => t.predictionResult === 'confirmed').length} confirmed, ${results.filter(t => t.predictionResult === 'contradicted').length} contradicted`);

    return results;
  }

  /** Generate an understanding report. */
  getUnderstandingReport(): UnderstandingReport {
    const allTests = this.db.prepare(`
      SELECT * FROM self_tests ORDER BY tested_at DESC
    `).all() as Array<Record<string, unknown>>;

    const tests = allTests.map(r => this.toSelfTest(r));
    const confirmed = tests.filter(t => t.predictionResult === 'confirmed');
    const inconclusive = tests.filter(t => t.predictionResult === 'inconclusive');
    const untested = tests.filter(t => t.predictionResult === 'untested');

    const avgDepth = tests.length > 0
      ? tests.reduce((s, t) => s + t.understandingDepth, 0) / tests.length
      : 0;

    // Weakest = lowest depth, exclude untested
    const testedTests = tests.filter(t => t.predictionResult !== 'untested');
    testedTests.sort((a, b) => a.understandingDepth - b.understandingDepth);

    return {
      totalTested: testedTests.length,
      deepUnderstanding: confirmed.length,
      shallowUnderstanding: inconclusive.length,
      untested: untested.length,
      avgDepth,
      weakestPrinciples: testedTests.slice(0, 5),
    };
  }

  /** Get status summary. */
  getStatus(): SelfTestStatus {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM self_tests').get() as { c: number }).c;
    const confirmed = (this.db.prepare("SELECT COUNT(*) as c FROM self_tests WHERE prediction_result = 'confirmed'").get() as { c: number }).c;
    const contradicted = (this.db.prepare("SELECT COUNT(*) as c FROM self_tests WHERE prediction_result = 'contradicted'").get() as { c: number }).c;
    const inconclusive = (this.db.prepare("SELECT COUNT(*) as c FROM self_tests WHERE prediction_result = 'inconclusive'").get() as { c: number }).c;

    const avgRow = this.db.prepare('SELECT AVG(understanding_depth) as avg FROM self_tests').get() as { avg: number | null };

    return {
      totalTests: total,
      confirmed,
      contradicted,
      inconclusive,
      avgDepth: avgRow.avg ?? 0,
    };
  }

  // ── Private ─────────────────────────────────────────────

  private toSelfTest(row: Record<string, unknown>): SelfTest {
    return {
      id: row.id as number,
      principleStatement: row.principle_statement as string,
      derivedPrediction: row.derived_prediction as string,
      predictionResult: row.prediction_result as SelfTest['predictionResult'],
      understandingDepth: row.understanding_depth as number,
      testedAt: row.tested_at as string,
    };
  }

  private extractKeywords(statement: string): string[] {
    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
      'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
      'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
      'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and',
      'or', 'if', 'while', 'that', 'this', 'these', 'those', 'it', 'its',
      'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'aber', 'wenn',
      'ist', 'sind', 'war', 'hat', 'mit', 'auf', 'fur', 'von', 'bei',
    ]);

    return statement
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
  }
}
