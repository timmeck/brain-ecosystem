import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { Thought } from '../consciousness/types.js';

// ── Types ───────────────────────────────────────────────

export interface AttentionEngineConfig {
  brainName: string;
  /** How quickly attention decays per cycle (0-1). Default: 0.85 */
  decayRate?: number;
  /** Burst window in ms for urgency detection. Default: 180_000 (3 min) */
  burstWindowMs?: number;
  /** How many events in the burst window trigger urgency. Default: 3 */
  burstThreshold?: number;
}

export interface AttentionScore {
  topic: string;
  score: number;
  recency: number;
  frequency: number;
  impact: number;
  urgency: number;
  lastSeen: number;
}

export type WorkContext =
  | 'debugging'
  | 'coding'
  | 'reviewing'
  | 'trading'
  | 'publishing'
  | 'researching'
  | 'idle';

export interface ContextSwitch {
  from: WorkContext;
  to: WorkContext;
  timestamp: number;
  trigger: string;
}

export interface FocusEntry {
  topic: string;
  score: number;
  context: WorkContext;
  timestamp: number;
}

export interface AttentionStatus {
  currentContext: WorkContext;
  topTopics: AttentionScore[];
  contextHistory: ContextSwitch[];
  engineWeights: Record<string, number>;
  urgentTopics: string[];
  totalEvents: number;
  uptime: number;
}

export interface EngineWeight {
  engine: string;
  weight: number;
  reason: string;
}

// ── Engine ──────────────────────────────────────────────

export class AttentionEngine {
  private db: Database.Database;
  private brainName: string;
  private thoughtStream: ThoughtStream | null = null;
  private unsubscribe: (() => void) | null = null;
  private log = getLogger();

  // Attention state
  private scores: Map<string, AttentionScore> = new Map();
  private currentContext: WorkContext = 'idle';
  private contextHistory: ContextSwitch[] = [];
  private engineWeights: Map<string, number> = new Map();
  private eventLog: Array<{ topic: string; timestamp: number; significance: number }> = [];
  private totalEvents = 0;
  private startTime = Date.now();

  // Config
  private decayRate: number;
  private burstWindowMs: number;
  private burstThreshold: number;

  // Context detection rules: tool/event patterns → context
  private static readonly CONTEXT_RULES: Array<{ pattern: RegExp; context: WorkContext }> = [
    { pattern: /error|bug|fix|crash|exception|stack|debug/i, context: 'debugging' },
    { pattern: /trade|signal|backtest|kelly|dca|grid|risk/i, context: 'trading' },
    { pattern: /post|publish|campaign|schedule|hashtag|engagement|competitor/i, context: 'publishing' },
    { pattern: /review|pr|diff|approve|reject|codegen/i, context: 'reviewing' },
    { pattern: /research|hypothes|experiment|distill|agenda|journal/i, context: 'researching' },
    { pattern: /code|module|register|function|refactor|implement/i, context: 'coding' },
  ];

  constructor(db: Database.Database, config: AttentionEngineConfig) {
    this.db = db;
    this.brainName = config.brainName;
    this.decayRate = config.decayRate ?? 0.85;
    this.burstWindowMs = config.burstWindowMs ?? 180_000;
    this.burstThreshold = config.burstThreshold ?? 3;

    this.runMigration();

    // Initialize default engine weights (equal)
    const engines = [
      'self_observer', 'anomaly_detective', 'cross_domain', 'adaptive_strategy',
      'experiment', 'knowledge_distiller', 'research_agenda', 'counterfactual', 'journal',
    ];
    for (const e of engines) {
      this.engineWeights.set(e, 1.0);
    }

    // Load persisted focus timeline on startup
    this.loadPersistedState();
  }

  // ── ThoughtStream integration ─────────────────────────

  /** Wire into ThoughtStream to passively observe all engine activity. */
  setThoughtStream(stream: ThoughtStream): void {
    // Unsubscribe from previous stream if any
    if (this.unsubscribe) this.unsubscribe();

    this.thoughtStream = stream;
    this.unsubscribe = stream.onThought((thought) => {
      this.onThought(thought);
    });
  }

  /** Process a thought from any engine. */
  private onThought(thought: Thought): void {
    this.totalEvents++;

    // Extract topic from thought content + engine
    const topic = this.extractTopic(thought);
    const significance = thought.significance === 'breakthrough' ? 3 : thought.significance === 'notable' ? 2 : 1;

    // Record event
    this.eventLog.push({ topic, timestamp: thought.timestamp, significance });

    // Trim event log (keep last 1000)
    if (this.eventLog.length > 1000) {
      this.eventLog.splice(0, this.eventLog.length - 1000);
    }

    // Update attention score
    this.updateScore(topic, significance);

    // Detect context switches
    const detectedContext = this.detectContext(thought);
    if (detectedContext !== this.currentContext) {
      this.switchContext(detectedContext, `${thought.engine}: ${thought.content.substring(0, 60)}`);
    }

    // Check urgency (burst detection)
    this.checkUrgency(topic);
  }

  // ── Attention scoring ─────────────────────────────────

  /** Update the attention score for a topic. */
  private updateScore(topic: string, significance: number): void {
    const now = Date.now();
    const existing = this.scores.get(topic);

    if (existing) {
      existing.frequency++;
      existing.impact = Math.max(existing.impact, significance);
      existing.lastSeen = now;
      // Recalculate composite score
      existing.recency = 1.0; // Just seen
      existing.score = this.computeScore(existing);
    } else {
      const score: AttentionScore = {
        topic,
        score: significance,
        recency: 1.0,
        frequency: 1,
        impact: significance,
        urgency: 0,
        lastSeen: now,
      };
      score.score = this.computeScore(score);
      this.scores.set(topic, score);
    }
  }

  /** Compute composite attention score. */
  private computeScore(s: AttentionScore): number {
    // Weighted formula: recency × (frequency_log × impact × (1 + urgency))
    const freqFactor = Math.log2(s.frequency + 1); // Logarithmic so it doesn't explode
    return s.recency * freqFactor * s.impact * (1 + s.urgency);
  }

  /** Apply time-based decay to all attention scores. Called each feedback cycle. */
  decay(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [topic, score] of this.scores) {
      // Recency decays based on time since last seen
      const ageMs = now - score.lastSeen;
      score.recency = Math.exp(-ageMs / 600_000); // 10-min half-life
      score.urgency *= this.decayRate;
      score.score = this.computeScore(score);

      // Remove very stale topics (score < 0.01)
      if (score.score < 0.01) {
        toDelete.push(topic);
      }
    }

    for (const t of toDelete) {
      this.scores.delete(t);
    }
  }

  // ── Context detection ─────────────────────────────────

  /** Detect work context from a thought. */
  private detectContext(thought: Thought): WorkContext {
    const text = `${thought.engine} ${thought.content} ${thought.type}`;
    for (const rule of AttentionEngine.CONTEXT_RULES) {
      if (rule.pattern.test(text)) return rule.context;
    }
    return this.currentContext; // No change if nothing matches
  }

  /** Record a context switch. */
  private switchContext(newContext: WorkContext, trigger: string): void {
    const sw: ContextSwitch = {
      from: this.currentContext,
      to: newContext,
      timestamp: Date.now(),
      trigger,
    };

    this.contextHistory.push(sw);

    // Keep last 100 switches
    if (this.contextHistory.length > 100) {
      this.contextHistory.splice(0, this.contextHistory.length - 100);
    }

    this.log.info(`[attention] Context switch: ${sw.from} → ${sw.to} (${trigger.substring(0, 40)})`);
    this.currentContext = newContext;

    // Persist context switch
    this.persistContextSwitch(sw);
  }

  // ── Urgency detection (burst detection) ───────────────

  /** Check if a topic has burst activity (urgency). */
  private checkUrgency(topic: string): void {
    const now = Date.now();
    const windowStart = now - this.burstWindowMs;

    const recentCount = this.eventLog.filter(
      e => e.topic === topic && e.timestamp > windowStart,
    ).length;

    if (recentCount >= this.burstThreshold) {
      const score = this.scores.get(topic);
      if (score) {
        const newUrgency = Math.min(3.0, recentCount / this.burstThreshold);
        if (newUrgency > score.urgency) {
          score.urgency = newUrgency;
          score.score = this.computeScore(score);
          this.log.info(`[attention] Urgency burst: "${topic}" (${recentCount} events in ${this.burstWindowMs / 1000}s)`);
        }
      }
    }
  }

  // ── Resource allocation ───────────────────────────────

  /** Compute recommended engine weights based on current attention state.
   *  Engines related to high-attention topics get more weight. */
  computeEngineWeights(): EngineWeight[] {
    const weights: EngineWeight[] = [];
    const topTopics = this.getTopTopics(5);

    // Base weight for all engines
    const baseWeight = 1.0;

    // Map: which engines handle which types of attention
    const engineTopicMap: Record<string, RegExp> = {
      anomaly_detective: /anomal|spike|burst|error|deviation/i,
      self_observer: /performance|insight|observation|metric/i,
      cross_domain: /cross|correlat|peer|brain/i,
      experiment: /experiment|test|hypothesis|parameter/i,
      knowledge_distiller: /knowledge|principle|pattern|distill/i,
      adaptive_strategy: /strategy|adapt|revert|regression/i,
      research_agenda: /agenda|research|priority|gap/i,
      counterfactual: /counterfactual|what.if|hypothetical/i,
      journal: /journal|reflect|discover|breakthrough/i,
    };

    for (const [engine, pattern] of Object.entries(engineTopicMap)) {
      let boost = 0;
      let reason = 'baseline';

      for (const topic of topTopics) {
        if (pattern.test(topic.topic)) {
          boost += topic.score * 0.5;
          reason = `high attention on "${topic.topic}"`;
        }
      }

      // Urgency boost
      const urgentTopics = topTopics.filter(t => t.urgency > 1.0);
      for (const urgent of urgentTopics) {
        if (pattern.test(urgent.topic)) {
          boost += urgent.urgency;
          reason = `urgent: "${urgent.topic}"`;
        }
      }

      const weight = baseWeight + boost;
      this.engineWeights.set(engine, weight);
      weights.push({ engine, weight, reason });
    }

    return weights.sort((a, b) => b.weight - a.weight);
  }

  /** Get the current weight for an engine. Orchestrator uses this to decide cycle budget. */
  getEngineWeight(engine: string): number {
    return this.engineWeights.get(engine) ?? 1.0;
  }

  // ── Manual focus ──────────────────────────────────────

  /** Manually set high attention on a topic (via MCP tool). */
  setFocus(topic: string, intensity = 2.0): void {
    const existing = this.scores.get(topic);
    if (existing) {
      existing.impact = Math.max(existing.impact, intensity);
      existing.urgency = Math.max(existing.urgency, intensity);
      existing.lastSeen = Date.now();
      existing.recency = 1.0;
      existing.score = this.computeScore(existing);
    } else {
      const score: AttentionScore = {
        topic,
        score: intensity * 2,
        recency: 1.0,
        frequency: 1,
        impact: intensity,
        urgency: intensity,
        lastSeen: Date.now(),
      };
      score.score = this.computeScore(score);
      this.scores.set(topic, score);
    }

    this.thoughtStream?.emit('attention', 'focusing', `Manual focus set: "${topic}" (intensity: ${intensity})`, 'notable');
    this.persistFocusEntry(topic);
  }

  // ── Query methods ─────────────────────────────────────

  /** Get top N topics by attention score. */
  getTopTopics(limit = 10): AttentionScore[] {
    return Array.from(this.scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /** Get topics with urgency > 1.0. */
  getUrgentTopics(): AttentionScore[] {
    return Array.from(this.scores.values())
      .filter(s => s.urgency >= 1.0)
      .sort((a, b) => b.urgency - a.urgency);
  }

  /** Get context switch history. */
  getContextHistory(limit = 20): ContextSwitch[] {
    return this.contextHistory.slice(-limit).reverse();
  }

  /** Get current work context. */
  getCurrentContext(): WorkContext {
    return this.currentContext;
  }

  /** Get full attention status. */
  getStatus(): AttentionStatus {
    return {
      currentContext: this.currentContext,
      topTopics: this.getTopTopics(10),
      contextHistory: this.getContextHistory(10),
      engineWeights: Object.fromEntries(this.engineWeights),
      urgentTopics: this.getUrgentTopics().map(t => t.topic),
      totalEvents: this.totalEvents,
      uptime: Date.now() - this.startTime,
    };
  }

  /** Get focus timeline from DB. */
  getFocusTimeline(limit = 50): FocusEntry[] {
    const rows = this.db.prepare(
      'SELECT topic, score, context, timestamp FROM attention_focus ORDER BY timestamp DESC LIMIT ?',
    ).all(limit) as FocusEntry[];
    return rows;
  }

  // ── Topic extraction ──────────────────────────────────

  /** Extract a normalized topic from a thought. */
  private extractTopic(thought: Thought): string {
    // Use engine name + thought type as primary topic
    const base = `${thought.engine}:${thought.type}`;

    // Extract specific keywords for more granular tracking
    const content = thought.content.toLowerCase();

    // Anomaly-specific
    if (content.includes('anomal')) return 'anomaly_detection';
    if (content.includes('breakout')) return 'signal_breakout';
    if (content.includes('hypothesis') || content.includes('hypothes')) return 'hypothesis_testing';
    if (content.includes('experiment')) return 'experiment_management';
    if (content.includes('dream') || content.includes('consolidat')) return 'dream_consolidation';
    if (content.includes('prediction') || content.includes('predict')) return 'prediction_accuracy';
    if (content.includes('knowledge') || content.includes('distill') || content.includes('principle')) return 'knowledge_distillation';
    if (content.includes('correlation')) return 'cross_domain_correlation';
    if (content.includes('autorespond') || content.includes('parameter')) return 'auto_response';
    if (content.includes('code') && content.includes('min')) return 'code_mining';
    if (content.includes('code') && content.includes('gen')) return 'code_generation';
    if (content.includes('error') || content.includes('bug')) return 'error_tracking';
    if (content.includes('trade') || content.includes('signal')) return 'trade_signals';
    if (content.includes('post') || content.includes('publish') || content.includes('engagement')) return 'content_publishing';
    if (content.includes('insight')) return 'insight_generation';
    if (content.includes('feedback cycle')) return 'feedback_cycle';

    return base;
  }

  // ── Persistence ───────────────────────────────────────

  private runMigration(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attention_focus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        score REAL NOT NULL,
        context TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attention_context_switches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_context TEXT NOT NULL,
        to_context TEXT NOT NULL,
        trigger_text TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_attention_focus_ts ON attention_focus(timestamp);
      CREATE INDEX IF NOT EXISTS idx_attention_context_ts ON attention_context_switches(timestamp);
    `);
  }

  private persistFocusEntry(topic: string): void {
    const score = this.scores.get(topic);
    if (!score) return;
    this.db.prepare(
      'INSERT INTO attention_focus (topic, score, context, timestamp) VALUES (?, ?, ?, ?)',
    ).run(topic, score.score, this.currentContext, Date.now());
  }

  private persistContextSwitch(sw: ContextSwitch): void {
    this.db.prepare(
      'INSERT INTO attention_context_switches (from_context, to_context, trigger_text, timestamp) VALUES (?, ?, ?, ?)',
    ).run(sw.from, sw.to, sw.trigger, sw.timestamp);
  }

  private loadPersistedState(): void {
    // Load recent context switches
    const switches = this.db.prepare(
      'SELECT from_context, to_context, trigger_text, timestamp FROM attention_context_switches ORDER BY timestamp DESC LIMIT 50',
    ).all() as Array<{ from_context: string; to_context: string; trigger_text: string; timestamp: number }>;

    for (const s of switches.reverse()) {
      this.contextHistory.push({
        from: s.from_context as WorkContext,
        to: s.to_context as WorkContext,
        timestamp: s.timestamp,
        trigger: s.trigger_text,
      });
    }

    // Set current context from last switch
    if (switches.length > 0) {
      this.currentContext = switches[0]!.to_context as WorkContext;
    }

    // Load recent focus entries to seed scores
    const entries = this.db.prepare(
      'SELECT topic, score, context, timestamp FROM attention_focus ORDER BY timestamp DESC LIMIT 100',
    ).all() as FocusEntry[];

    for (const entry of entries) {
      if (!this.scores.has(entry.topic)) {
        const age = Date.now() - entry.timestamp;
        const recency = Math.exp(-age / 600_000);
        this.scores.set(entry.topic, {
          topic: entry.topic,
          score: entry.score * recency,
          recency,
          frequency: 1,
          impact: 1,
          urgency: 0,
          lastSeen: entry.timestamp,
        });
      }
    }
  }

  // ── Lifecycle ─────────────────────────────────────────

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Persist top focus entries on shutdown
    const top = this.getTopTopics(20);
    for (const t of top) {
      this.persistFocusEntry(t.topic);
    }
  }
}
