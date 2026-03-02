import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export type EngineGrade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface EngineMetric {
  engine: string;
  cycle: number;
  insights: number;
  journal_entries: number;
  anomalies: number;
  predictions: number;
  thoughts: number;
  errors: number;
  duration_ms: number;
}

export interface EngineReportCard {
  engine: string;
  grade: EngineGrade;
  health_score: number;
  value_score: number;
  signal_to_noise: number;
  combined_score: number;
  evaluated_at?: string;
}

export interface FrequencyAdjustment {
  engine: string;
  old_frequency: number;
  new_frequency: number;
  reason: string;
  created_at?: string;
}

export interface MetaCognitionStatus {
  totalEngines: number;
  reportCards: EngineReportCard[];
  recentAdjustments: FrequencyAdjustment[];
  cycleMetrics: number;
}

// ── Migration ───────────────────────────────────────────

export function runMetaCognitionMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS engine_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine TEXT NOT NULL,
      cycle INTEGER NOT NULL,
      insights INTEGER NOT NULL DEFAULT 0,
      journal_entries INTEGER NOT NULL DEFAULT 0,
      anomalies INTEGER NOT NULL DEFAULT 0,
      predictions INTEGER NOT NULL DEFAULT 0,
      thoughts INTEGER NOT NULL DEFAULT 0,
      errors INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_engine_metrics_engine ON engine_metrics(engine, cycle);

    CREATE TABLE IF NOT EXISTS engine_report_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine TEXT NOT NULL,
      grade TEXT NOT NULL,
      health_score REAL NOT NULL,
      value_score REAL NOT NULL,
      signal_to_noise REAL NOT NULL,
      combined_score REAL NOT NULL,
      evaluated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_report_cards_engine ON engine_report_cards(engine);

    CREATE TABLE IF NOT EXISTS cycle_frequency_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      engine TEXT NOT NULL,
      old_frequency INTEGER NOT NULL,
      new_frequency INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── MetaCognition Layer ─────────────────────────────────

export class MetaCognitionLayer {
  private db: Database.Database;
  private log = getLogger();
  /** Current frequency multiplier per engine: 1 = every cycle, 2 = every 2 cycles, etc. */
  private engineFrequencies: Map<string, number> = new Map();

  constructor(db: Database.Database) {
    this.db = db;
    runMetaCognitionMigration(db);
  }

  /** Record metrics for a single engine step in a cycle. */
  recordStep(engine: string, cycle: number, metrics: Partial<Omit<EngineMetric, 'engine' | 'cycle'>>): void {
    // Upsert: if we already recorded this engine+cycle, add to it
    const existing = this.db.prepare(
      'SELECT id, insights, journal_entries, anomalies, predictions, thoughts, errors, duration_ms FROM engine_metrics WHERE engine = ? AND cycle = ?',
    ).get(engine, cycle) as { id: number; insights: number; journal_entries: number; anomalies: number; predictions: number; thoughts: number; errors: number; duration_ms: number } | undefined;

    if (existing) {
      this.db.prepare(`
        UPDATE engine_metrics SET
          insights = insights + ?, journal_entries = journal_entries + ?, anomalies = anomalies + ?,
          predictions = predictions + ?, thoughts = thoughts + ?, errors = errors + ?,
          duration_ms = duration_ms + ?
        WHERE id = ?
      `).run(
        metrics.insights ?? 0, metrics.journal_entries ?? 0, metrics.anomalies ?? 0,
        metrics.predictions ?? 0, metrics.thoughts ?? 0, metrics.errors ?? 0,
        metrics.duration_ms ?? 0, existing.id,
      );
    } else {
      this.db.prepare(`
        INSERT INTO engine_metrics (engine, cycle, insights, journal_entries, anomalies, predictions, thoughts, errors, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        engine, cycle,
        metrics.insights ?? 0, metrics.journal_entries ?? 0, metrics.anomalies ?? 0,
        metrics.predictions ?? 0, metrics.thoughts ?? 0, metrics.errors ?? 0,
        metrics.duration_ms ?? 0,
      );
    }
  }

  /** Evaluate all engines based on recent metrics. Returns report cards. */
  evaluate(windowCycles = 10): EngineReportCard[] {
    // Get all engines that have metrics in the last windowCycles
    const engines = this.db.prepare(`
      SELECT DISTINCT engine FROM engine_metrics
      WHERE cycle > (SELECT COALESCE(MAX(cycle), 0) FROM engine_metrics) - ?
    `).all(windowCycles) as { engine: string }[];

    const cards: EngineReportCard[] = [];

    for (const { engine } of engines) {
      const metrics = this.db.prepare(`
        SELECT insights, journal_entries, anomalies, predictions, thoughts, errors, duration_ms
        FROM engine_metrics WHERE engine = ?
        ORDER BY cycle DESC LIMIT ?
      `).all(engine, windowCycles) as EngineMetric[];

      if (metrics.length === 0) continue;

      // Health Score: low errors, reasonable duration
      const avgErrors = metrics.reduce((s, m) => s + m.errors, 0) / metrics.length;
      const avgDuration = metrics.reduce((s, m) => s + m.duration_ms, 0) / metrics.length;
      const healthScore = Math.max(0, Math.min(1,
        (1 - Math.min(avgErrors / 3, 1)) * 0.6 + // fewer errors = healthier
        (1 - Math.min(avgDuration / 5000, 1)) * 0.4, // faster = healthier
      ));

      // Value Score: producing useful outputs (insights, journal entries, predictions)
      const avgInsights = metrics.reduce((s, m) => s + m.insights, 0) / metrics.length;
      const avgJournal = metrics.reduce((s, m) => s + m.journal_entries, 0) / metrics.length;
      const avgPredictions = metrics.reduce((s, m) => s + m.predictions, 0) / metrics.length;
      const valueScore = Math.min(1,
        (avgInsights * 0.4 + avgJournal * 0.3 + avgPredictions * 0.3),
      );

      // Signal-to-Noise: useful outputs / total thoughts
      const avgThoughts = metrics.reduce((s, m) => s + m.thoughts, 0) / metrics.length;
      const signalToNoise = avgThoughts > 0
        ? Math.min(1, (avgInsights + avgJournal + avgPredictions) / avgThoughts)
        : 0;

      // Combined Score
      const combinedScore = healthScore * 0.3 + valueScore * 0.5 + signalToNoise * 0.2;

      // Grade
      const grade = this.scoreToGrade(combinedScore);

      const card: EngineReportCard = {
        engine, grade, health_score: healthScore, value_score: valueScore,
        signal_to_noise: signalToNoise, combined_score: combinedScore,
      };
      cards.push(card);

      // Persist
      this.db.prepare(`
        INSERT INTO engine_report_cards (engine, grade, health_score, value_score, signal_to_noise, combined_score)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(engine, grade, healthScore, valueScore, signalToNoise, combinedScore);
    }

    return cards;
  }

  /** Adjust engine frequencies based on report cards. A=more often, D/F=less often. */
  adjustFrequencies(cards: EngineReportCard[]): FrequencyAdjustment[] {
    const adjustments: FrequencyAdjustment[] = [];

    for (const card of cards) {
      const currentFreq = this.engineFrequencies.get(card.engine) ?? 1;
      let newFreq = currentFreq;

      if (card.grade === 'A' && currentFreq > 1) {
        newFreq = currentFreq - 1; // Run more often
      } else if (card.grade === 'D' || card.grade === 'F') {
        newFreq = Math.min(currentFreq + 1, 10); // Run less often, cap at 10
      }
      // B and C: keep current frequency

      if (newFreq !== currentFreq) {
        this.engineFrequencies.set(card.engine, newFreq);
        const adjustment: FrequencyAdjustment = {
          engine: card.engine,
          old_frequency: currentFreq,
          new_frequency: newFreq,
          reason: `Grade ${card.grade}: combined=${card.combined_score.toFixed(2)}`,
        };
        adjustments.push(adjustment);

        this.db.prepare(`
          INSERT INTO cycle_frequency_adjustments (engine, old_frequency, new_frequency, reason)
          VALUES (?, ?, ?, ?)
        `).run(card.engine, currentFreq, newFreq, adjustment.reason);

        this.log.info(`[metacognition] ${card.engine}: freq ${currentFreq} → ${newFreq} (grade ${card.grade})`);
      }
    }

    return adjustments;
  }

  /** Check if an engine should run this cycle based on its frequency. */
  shouldRun(engine: string, cycle: number): boolean {
    const freq = this.engineFrequencies.get(engine) ?? 1;
    return cycle % freq === 0;
  }

  /** Get engine frequency. */
  getFrequency(engine: string): number {
    return this.engineFrequencies.get(engine) ?? 1;
  }

  /** Get report card for a specific engine. */
  getReportCard(engine: string): EngineReportCard | undefined {
    const row = this.db.prepare(`
      SELECT engine, grade, health_score, value_score, signal_to_noise, combined_score, evaluated_at
      FROM engine_report_cards WHERE engine = ? ORDER BY id DESC LIMIT 1
    `).get(engine) as EngineReportCard | undefined;
    return row;
  }

  /** Get all latest report cards. */
  getLatestReportCards(): EngineReportCard[] {
    return this.db.prepare(`
      SELECT r.engine, r.grade, r.health_score, r.value_score, r.signal_to_noise, r.combined_score, r.evaluated_at
      FROM engine_report_cards r
      INNER JOIN (SELECT engine, MAX(id) as max_id FROM engine_report_cards GROUP BY engine) latest
      ON r.id = latest.max_id
      ORDER BY r.combined_score DESC
    `).all() as EngineReportCard[];
  }

  /** Get trend for an engine over time. */
  getTrend(engine: string, limit = 10): EngineReportCard[] {
    return this.db.prepare(`
      SELECT engine, grade, health_score, value_score, signal_to_noise, combined_score, evaluated_at
      FROM engine_report_cards WHERE engine = ? ORDER BY id DESC LIMIT ?
    `).all(engine, limit) as EngineReportCard[];
  }

  /** Get status summary. */
  getStatus(): MetaCognitionStatus {
    const cards = this.getLatestReportCards();
    const recentAdj = this.db.prepare(`
      SELECT engine, old_frequency, new_frequency, reason, created_at
      FROM cycle_frequency_adjustments ORDER BY id DESC LIMIT 10
    `).all() as FrequencyAdjustment[];
    const totalMetrics = (this.db.prepare('SELECT COUNT(*) as c FROM engine_metrics').get() as { c: number }).c;

    return {
      totalEngines: cards.length,
      reportCards: cards,
      recentAdjustments: recentAdj,
      cycleMetrics: totalMetrics,
    };
  }

  private scoreToGrade(score: number): EngineGrade {
    if (score >= 0.8) return 'A';
    if (score >= 0.6) return 'B';
    if (score >= 0.4) return 'C';
    if (score >= 0.2) return 'D';
    return 'F';
  }
}
