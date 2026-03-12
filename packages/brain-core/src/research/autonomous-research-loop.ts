// ── Autonomous Research Loop ─────────────────────────────────
//
// Brain gibt sich selbst Forschungsaufträge. Kein Mensch nötig.
//
// Loop: CuriosityEngine → DesireEngine → MissionEngine
//       → Brave Search + Playwright → Insight → Hypothese → Test
//
// Guards: max missions/day, budget check, cooldown between cycles.

import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { ResearchJournal } from './journal.js';

// ── Types ───────────────────────────────────────────────

export interface AutonomousResearchConfig {
  /** Max autonomous missions per day. Default: 5 */
  maxMissionsPerDay?: number;
  /** Cooldown between research cycles in ms. Default: 30min */
  cycleCooldownMs?: number;
  /** Minimum gap score to trigger research. Default: 0.5 */
  minGapScore?: number;
  /** Minimum desire priority to trigger research. Default: 5 */
  minDesirePriority?: number;
  /** Mission depth for autonomous missions. Default: 'standard' */
  missionDepth?: 'quick' | 'standard' | 'deep';
  /** Enable/disable the loop. Default: false (opt-in) */
  enabled?: boolean;
}

export interface AutonomousResearchStatus {
  enabled: boolean;
  running: boolean;
  cyclesCompleted: number;
  missionsLaunchedToday: number;
  maxMissionsPerDay: number;
  lastCycleAt: number | null;
  nextCycleAt: number | null;
  lastTopic: string | null;
  recentTopics: string[];
}

export interface AutonomousResearchResult {
  action: 'mission_launched' | 'skipped_no_target' | 'skipped_budget' | 'skipped_cooldown' | 'skipped_disabled';
  topic?: string;
  missionId?: number;
  reason?: string;
}

// ── Data Source Interfaces (injected, not imported) ─────

export interface AutonomousResearchSources {
  getCuriosityGaps?: (limit: number) => Array<{ topic: string; gapScore: number; gapType: string; questions: string[] }>;
  getDesires?: () => Array<{ key: string; suggestion: string; priority: number }>;
  createMission?: (topic: string, depth: 'quick' | 'standard' | 'deep') => { id?: number; topic: string; status: string };
  getMissionStatus?: () => { activeMissions: number; completedMissions: number; totalMissions: number };
  observeHypothesis?: (obs: { source: string; type: string; value: number; timestamp: number }) => void;
  checkBudget?: (engineId: string) => { allowed: boolean; reason?: string };
}

// ── Migration ───────────────────────────────────────────

export function runAutonomousResearchMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS autonomous_research_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      source TEXT NOT NULL,
      mission_id INTEGER,
      action TEXT NOT NULL,
      reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_auto_research_created ON autonomous_research_log(created_at);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class AutonomousResearchLoop {
  private readonly db: Database.Database;
  private readonly config: Required<AutonomousResearchConfig>;
  private readonly log = getLogger();
  private ts: ThoughtStream | null = null;
  private journal: ResearchJournal | null = null;
  private sources: AutonomousResearchSources = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private cyclesCompleted = 0;
  private lastCycleAt: number | null = null;
  private lastTopic: string | null = null;
  private recentTopics: string[] = [];

  // Prepared statements
  private readonly stmtLogAction;
  private readonly stmtCountToday;
  private readonly stmtRecentTopics;

  constructor(db: Database.Database, config: AutonomousResearchConfig = {}) {
    this.db = db;
    this.config = {
      maxMissionsPerDay: config.maxMissionsPerDay ?? 5,
      cycleCooldownMs: config.cycleCooldownMs ?? 30 * 60_000, // 30min
      minGapScore: config.minGapScore ?? 0.5,
      minDesirePriority: config.minDesirePriority ?? 5,
      missionDepth: config.missionDepth ?? 'standard',
      enabled: config.enabled ?? false,
    };

    runAutonomousResearchMigration(db);

    this.stmtLogAction = db.prepare(
      'INSERT INTO autonomous_research_log (topic, source, mission_id, action, reason) VALUES (?, ?, ?, ?, ?)',
    );
    this.stmtCountToday = db.prepare(
      `SELECT COUNT(*) as c FROM autonomous_research_log WHERE action = 'mission_launched' AND created_at > datetime('now', '-24 hours')`,
    );
    this.stmtRecentTopics = db.prepare(
      `SELECT DISTINCT topic FROM autonomous_research_log WHERE action = 'mission_launched' ORDER BY id DESC LIMIT 10`,
    );
  }

  // ── Setters ──────────────────────────────────────────

  setThoughtStream(stream: ThoughtStream): void { this.ts = stream; }
  setJournal(journal: ResearchJournal): void { this.journal = journal; }
  setSources(sources: AutonomousResearchSources): void { this.sources = sources; }

  /** Update config at runtime. */
  updateConfig(partial: Partial<AutonomousResearchConfig>): void {
    if (partial.maxMissionsPerDay !== undefined) this.config.maxMissionsPerDay = partial.maxMissionsPerDay;
    if (partial.cycleCooldownMs !== undefined) this.config.cycleCooldownMs = partial.cycleCooldownMs;
    if (partial.minGapScore !== undefined) this.config.minGapScore = partial.minGapScore;
    if (partial.minDesirePriority !== undefined) this.config.minDesirePriority = partial.minDesirePriority;
    if (partial.missionDepth !== undefined) this.config.missionDepth = partial.missionDepth;
    if (partial.enabled !== undefined) this.config.enabled = partial.enabled;
  }

  // ── Lifecycle ─────────────────────────────────────────

  /** Start the autonomous research timer. */
  start(): void {
    if (this.timer) return;
    if (!this.config.enabled) {
      this.log.info('[autonomous-research] Not enabled — skipping start');
      return;
    }
    this.timer = setInterval(() => {
      this.cycle().catch(err => this.log.error(`[autonomous-research] Cycle error: ${(err as Error).message}`));
    }, this.config.cycleCooldownMs);
    this.log.info(`[autonomous-research] Started (interval: ${(this.config.cycleCooldownMs / 60_000).toFixed(0)}min, max: ${this.config.maxMissionsPerDay}/day)`);
  }

  /** Stop the timer. */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.log.info('[autonomous-research] Stopped');
    }
  }

  // ── Core Cycle ─────────────────────────────────────────

  /** Run one autonomous research cycle. Can be called manually or by timer. */
  async cycle(): Promise<AutonomousResearchResult> {
    // Guard: enabled?
    if (!this.config.enabled) {
      return { action: 'skipped_disabled', reason: 'Autonomous research not enabled' };
    }

    // Guard: cooldown?
    if (this.lastCycleAt && Date.now() - this.lastCycleAt < this.config.cycleCooldownMs * 0.9) {
      return { action: 'skipped_cooldown', reason: 'Cooldown not elapsed' };
    }

    // Guard: daily budget?
    const todayCount = (this.stmtCountToday.get() as { c: number }).c;
    if (todayCount >= this.config.maxMissionsPerDay) {
      return { action: 'skipped_budget', reason: `Daily limit reached (${todayCount}/${this.config.maxMissionsPerDay})` };
    }

    // Guard: token budget?
    if (this.sources.checkBudget) {
      const budget = this.sources.checkBudget('autonomous_research');
      if (!budget.allowed) {
        return { action: 'skipped_budget', reason: budget.reason ?? 'Token budget exhausted' };
      }
    }

    // Step 1: Select research target
    const target = this.selectTarget();
    if (!target) {
      this.lastCycleAt = Date.now();
      this.cyclesCompleted++;
      return { action: 'skipped_no_target', reason: 'No gaps or desires above threshold' };
    }

    // Step 2: Check we haven't researched this recently
    const recentTopics = (this.stmtRecentTopics.all() as { topic: string }[]).map(r => r.topic);
    if (recentTopics.some(t => this.topicOverlap(t, target.topic) > 0.7)) {
      this.log.debug(`[autonomous-research] Skipping "${target.topic}" — too similar to recent research`);
      this.lastCycleAt = Date.now();
      return { action: 'skipped_no_target', reason: `Topic "${target.topic}" too similar to recent research` };
    }

    // Step 3: Launch mission
    if (!this.sources.createMission) {
      return { action: 'skipped_no_target', reason: 'MissionEngine not wired' };
    }

    this.ts?.emit('research', 'exploring', `Autonomous research: "${target.topic}" (source: ${target.source})`, 'notable');

    const mission = this.sources.createMission(target.topic, this.config.missionDepth);

    // Step 4: Log
    this.stmtLogAction.run(target.topic, target.source, mission.id ?? null, 'mission_launched', null);
    this.lastCycleAt = Date.now();
    this.lastTopic = target.topic;
    this.recentTopics = [target.topic, ...this.recentTopics.slice(0, 9)];
    this.cyclesCompleted++;

    // Step 5: Observe for hypothesis engine
    if (this.sources.observeHypothesis) {
      this.sources.observeHypothesis({
        source: 'autonomous_research',
        type: 'mission_launched',
        value: 1,
        timestamp: Date.now(),
      });
    }

    // Step 6: Journal entry
    if (this.journal) {
      try {
        this.journal.recordDiscovery(
          `Autonomous research: ${target.topic}`,
          `Self-directed research mission launched. Source: ${target.source}. Depth: ${this.config.missionDepth}.`,
          { mission_id: mission.id, source: target.source },
          'routine',
        );
      } catch { /* best effort */ }
    }

    this.log.info(`[autonomous-research] Mission launched: "${target.topic}" (id: ${mission.id}, source: ${target.source})`);

    return { action: 'mission_launched', topic: target.topic, missionId: mission.id };
  }

  // ── Target Selection ──────────────────────────────────

  /** Select the best research target from curiosity gaps and desires. */
  private selectTarget(): { topic: string; source: string } | null {
    const candidates: Array<{ topic: string; source: string; score: number }> = [];

    // Source 1: Curiosity gaps
    if (this.sources.getCuriosityGaps) {
      const gaps = this.sources.getCuriosityGaps(5);
      for (const gap of gaps) {
        if (gap.gapScore >= this.config.minGapScore) {
          // Use the first question as research topic, or the gap topic itself
          const topic = gap.questions[0] ?? gap.topic;
          candidates.push({ topic, source: `curiosity_gap:${gap.gapType}`, score: gap.gapScore });
        }
      }
    }

    // Source 2: Desires
    if (this.sources.getDesires) {
      const desires = this.sources.getDesires();
      for (const desire of desires) {
        if (desire.priority >= this.config.minDesirePriority) {
          // Extract topic from desire suggestion
          const topic = this.extractTopicFromDesire(desire.suggestion);
          if (topic) {
            candidates.push({ topic, source: `desire:${desire.key}`, score: desire.priority / 10 });
          }
        }
      }
    }

    if (candidates.length === 0) return null;

    // Sort by score descending, pick the best
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]!;
  }

  /** Extract a researchable topic from a desire suggestion string. */
  private extractTopicFromDesire(suggestion: string): string | null {
    // Try to extract quoted topic
    const match = suggestion.match(/"([^"]+)"/);
    if (match) return match[1]!;

    // Try to extract after "regarding" or "about"
    const aboutMatch = suggestion.match(/(?:regarding|about|gap:?)\s+"?([^"]+)"?/i);
    if (aboutMatch) return aboutMatch[1]!.trim();

    // Fallback: use the suggestion itself if short enough
    if (suggestion.length < 100) return suggestion;

    return null;
  }

  /** Simple topic overlap check (Jaccard on words). */
  private topicOverlap(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 2));
    if (wordsA.size === 0 || wordsB.size === 0) return 0;
    let intersection = 0;
    for (const w of wordsA) if (wordsB.has(w)) intersection++;
    return intersection / Math.max(wordsA.size, wordsB.size);
  }

  // ── Status ─────────────────────────────────────────────

  getStatus(): AutonomousResearchStatus {
    const todayCount = (this.stmtCountToday.get() as { c: number }).c;
    return {
      enabled: this.config.enabled,
      running: this.timer !== null,
      cyclesCompleted: this.cyclesCompleted,
      missionsLaunchedToday: todayCount,
      maxMissionsPerDay: this.config.maxMissionsPerDay,
      lastCycleAt: this.lastCycleAt,
      nextCycleAt: this.lastCycleAt ? this.lastCycleAt + this.config.cycleCooldownMs : null,
      lastTopic: this.lastTopic,
      recentTopics: this.recentTopics,
    };
  }

  getConfig(): Readonly<Required<AutonomousResearchConfig>> {
    return { ...this.config };
  }
}
