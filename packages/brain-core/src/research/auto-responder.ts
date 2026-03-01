import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { Anomaly, AnomalySeverity } from './anomaly-detective.js';
import type { AdaptiveStrategyEngine, StrategyDomain } from './adaptive-strategy.js';
import type { ResearchJournal } from './journal.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';

// ── Types ───────────────────────────────────────────────

export type ResponseAction = 'parameter_adjust' | 'alert' | 'escalate' | 'resolve' | 'log_only';

export interface AutoResponse {
  id?: number;
  anomaly_id: number;
  timestamp: number;
  action: ResponseAction;
  description: string;
  parameters_before: Record<string, unknown> | null;
  parameters_after: Record<string, unknown> | null;
  success: boolean;
  reverted: boolean;
}

export interface ResponseRule {
  metric_pattern: string;           // regex pattern for metric name
  min_severity: AnomalySeverity;    // minimum severity to trigger
  action: ResponseAction;
  strategy?: StrategyDomain;        // for parameter_adjust
  parameter?: string;               // for parameter_adjust
  adjustment: number;               // e.g. -0.1 = decrease by 10%
  description: string;
}

export interface AutoResponderConfig {
  brainName: string;
  /** Enable automatic responses. Default: true */
  enabled?: boolean;
  /** Max responses per cycle. Default: 3 */
  maxResponsesPerCycle?: number;
  /** Cooldown per metric (ms) before re-responding. Default: 30 min */
  cooldownMs?: number;
}

export interface AutoResponderStatus {
  enabled: boolean;
  total_responses: number;
  successful: number;
  reverted: number;
  success_rate: number;
  recent: AutoResponse[];
  rules_count: number;
}

// ── Severity levels for comparison ──────────────────────

const SEVERITY_ORDER: Record<AnomalySeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// ── Default Response Rules ──────────────────────────────

const DEFAULT_RULES: ResponseRule[] = [
  // High error rates → tighten match score threshold
  {
    metric_pattern: 'error',
    min_severity: 'high',
    action: 'parameter_adjust',
    strategy: 'recall',
    parameter: 'min_match_score',
    adjustment: -0.05,
    description: 'Hohe Error-Rate → Match-Score-Threshold senken für bessere Lösungsvorschläge',
  },
  // Learning drift → adjust decay rate
  {
    metric_pattern: 'synapse|learning',
    min_severity: 'medium',
    action: 'parameter_adjust',
    strategy: 'learning',
    parameter: 'synapse_decay_rate',
    adjustment: -0.01,
    description: 'Synapse/Learning-Drift → Decay-Rate reduzieren für stabilere Verbindungen',
  },
  // Research stagnation → lower hypothesis confidence bar
  {
    metric_pattern: 'research|hypothesis|insight',
    min_severity: 'medium',
    action: 'parameter_adjust',
    strategy: 'research',
    parameter: 'hypothesis_min_confidence',
    adjustment: -0.05,
    description: 'Research-Stagnation → Hypothesen-Threshold senken für mehr Experimente',
  },
  // High anomaly count → escalate (log for human review)
  {
    metric_pattern: '.*',
    min_severity: 'critical',
    action: 'escalate',
    adjustment: 0,
    description: 'Kritische Anomalie → Eskalation für menschliche Überprüfung',
  },
  // General high-severity → auto-resolve with note
  {
    metric_pattern: '.*',
    min_severity: 'high',
    action: 'resolve',
    adjustment: 0,
    description: 'Hohe Anomalie erkannt und als behandelt markiert',
  },
];

// ── Migration ───────────────────────────────────────────

export function runAutoResponderMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      anomaly_id INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      parameters_before TEXT,
      parameters_after TEXT,
      success INTEGER DEFAULT 1,
      reverted INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_auto_resp_ts ON auto_responses(timestamp);
    CREATE INDEX IF NOT EXISTS idx_auto_resp_anomaly ON auto_responses(anomaly_id);

    CREATE TABLE IF NOT EXISTS response_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric_pattern TEXT NOT NULL,
      min_severity TEXT NOT NULL,
      action TEXT NOT NULL,
      strategy TEXT,
      parameter TEXT,
      adjustment REAL DEFAULT 0,
      description TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── AutoResponder Engine ────────────────────────────────

export class AutoResponder {
  private db: Database.Database;
  private config: Required<AutoResponderConfig>;
  private rules: ResponseRule[];
  private adaptiveStrategy: AdaptiveStrategyEngine | null = null;
  private journal: ResearchJournal | null = null;
  private thoughtStream: ThoughtStream | null = null;
  private log = getLogger();

  constructor(db: Database.Database, config: AutoResponderConfig) {
    this.db = db;
    this.config = {
      brainName: config.brainName,
      enabled: config.enabled ?? true,
      maxResponsesPerCycle: config.maxResponsesPerCycle ?? 3,
      cooldownMs: config.cooldownMs ?? 30 * 60 * 1000,
    };
    runAutoResponderMigration(db);
    this.rules = this.loadRules();
  }

  setAdaptiveStrategy(engine: AdaptiveStrategyEngine): void {
    this.adaptiveStrategy = engine;
  }

  setJournal(journal: ResearchJournal): void {
    this.journal = journal;
  }

  setThoughtStream(stream: ThoughtStream): void {
    this.thoughtStream = stream;
  }

  /**
   * Process a batch of anomalies and automatically respond.
   * Returns the list of actions taken.
   */
  respond(anomalies: Anomaly[]): AutoResponse[] {
    if (!this.config.enabled || anomalies.length === 0) return [];

    const responses: AutoResponse[] = [];
    const now = Date.now();

    for (const anomaly of anomalies) {
      if (responses.length >= this.config.maxResponsesPerCycle) break;

      // Check cooldown — don't re-respond to same metric too quickly
      if (this.isOnCooldown(anomaly.metric)) continue;

      // Find matching rule
      const rule = this.findMatchingRule(anomaly);
      if (!rule) continue;

      // Execute response
      const response = this.executeResponse(anomaly, rule, now);
      if (response) {
        responses.push(response);
        this.persistResponse(response);
      }
    }

    return responses;
  }

  /** Get response history. */
  getHistory(limit = 20): AutoResponse[] {
    return this.db.prepare(`
      SELECT * FROM auto_responses ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as AutoResponse[];
  }

  /** Get status summary. */
  getStatus(): AutoResponderStatus {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM auto_responses').get() as { c: number }).c;
    const successful = (this.db.prepare('SELECT COUNT(*) as c FROM auto_responses WHERE success = 1').get() as { c: number }).c;
    const reverted = (this.db.prepare('SELECT COUNT(*) as c FROM auto_responses WHERE reverted = 1').get() as { c: number }).c;
    const recent = this.getHistory(5);

    return {
      enabled: this.config.enabled,
      total_responses: total,
      successful,
      reverted,
      success_rate: total > 0 ? successful / total : 0,
      recent,
      rules_count: this.rules.length,
    };
  }

  /** Add a custom response rule. */
  addRule(rule: ResponseRule): void {
    this.db.prepare(`
      INSERT INTO response_rules (metric_pattern, min_severity, action, strategy, parameter, adjustment, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(rule.metric_pattern, rule.min_severity, rule.action, rule.strategy ?? null, rule.parameter ?? null, rule.adjustment, rule.description);
    this.rules = this.loadRules();
  }

  /** List all rules. */
  getRules(): ResponseRule[] {
    return this.rules;
  }

  // ── Private Methods ─────────────────────────────────────

  private loadRules(): ResponseRule[] {
    const dbRules = this.db.prepare('SELECT * FROM response_rules WHERE enabled = 1').all() as Array<{
      metric_pattern: string;
      min_severity: AnomalySeverity;
      action: ResponseAction;
      strategy: string | null;
      parameter: string | null;
      adjustment: number;
      description: string;
    }>;

    if (dbRules.length > 0) {
      return dbRules.map(r => ({
        metric_pattern: r.metric_pattern,
        min_severity: r.min_severity,
        action: r.action,
        strategy: (r.strategy as StrategyDomain) ?? undefined,
        parameter: r.parameter ?? undefined,
        adjustment: r.adjustment,
        description: r.description,
      }));
    }

    return DEFAULT_RULES;
  }

  private isOnCooldown(metric: string): boolean {
    const recent = this.db.prepare(`
      SELECT id FROM auto_responses
      WHERE description LIKE ? AND timestamp > ?
      LIMIT 1
    `).get(`%${metric}%`, Date.now() - this.config.cooldownMs);
    return !!recent;
  }

  private findMatchingRule(anomaly: Anomaly): ResponseRule | null {
    for (const rule of this.rules) {
      const pattern = new RegExp(rule.metric_pattern, 'i');
      if (!pattern.test(anomaly.metric)) continue;
      if (SEVERITY_ORDER[anomaly.severity] < SEVERITY_ORDER[rule.min_severity]) continue;
      return rule;
    }
    return null;
  }

  private executeResponse(anomaly: Anomaly, rule: ResponseRule, now: number): AutoResponse | null {
    const ts = this.thoughtStream;

    switch (rule.action) {
      case 'parameter_adjust': {
        if (!this.adaptiveStrategy || !rule.strategy || !rule.parameter) {
          return this.logOnlyResponse(anomaly, rule, now, 'AdaptiveStrategy nicht verfügbar');
        }
        const status = this.adaptiveStrategy.getStatus();
        const domain = status.strategies[rule.strategy];
        if (!domain) return null;

        const oldValue = domain.parameters[rule.parameter];
        if (oldValue === undefined) return null;

        const newValue = oldValue + rule.adjustment;
        const description = `${rule.description} [${anomaly.metric}]: ${rule.parameter} ${oldValue.toFixed(3)} → ${newValue.toFixed(3)}`;

        const adaptation = this.adaptiveStrategy.adapt(
          rule.strategy, rule.parameter, newValue,
          `AutoResponder: ${anomaly.title}`,
          { anomaly_id: anomaly.id, severity: anomaly.severity, deviation: anomaly.deviation },
        );

        if (!adaptation) {
          ts?.emit('auto_responder', 'analyzing', `Parameter-Anpassung abgelehnt: ${rule.parameter} (Stabilitätsgrenze)`);
          return null;
        }

        ts?.emit('auto_responder', 'discovering', description, 'notable');
        this.journal?.write({
          type: 'adaptation',
          title: `AutoResponder: ${rule.parameter} angepasst`,
          content: description,
          tags: [this.config.brainName, 'auto_response', rule.action, anomaly.severity],
          references: [],
          significance: anomaly.severity === 'critical' ? 'breakthrough' : 'notable',
          data: { anomaly_id: anomaly.id, old_value: oldValue, new_value: newValue, rule: rule.description },
        });

        return {
          anomaly_id: anomaly.id ?? 0,
          timestamp: now,
          action: 'parameter_adjust',
          description,
          parameters_before: { [rule.parameter]: oldValue },
          parameters_after: { [rule.parameter]: adaptation.new_value },
          success: true,
          reverted: false,
        };
      }

      case 'escalate': {
        const description = `ESKALATION: ${anomaly.title} (${anomaly.severity}) — ${anomaly.metric} weicht ${anomaly.deviation.toFixed(1)}σ ab`;
        ts?.emit('auto_responder', 'discovering', description, 'breakthrough');
        this.journal?.write({
          type: 'anomaly',
          title: `AutoResponder ESKALATION: ${anomaly.title}`,
          content: `${description}\n\nExpected: ${anomaly.expected_value}, Actual: ${anomaly.actual_value}\n${anomaly.description}`,
          tags: [this.config.brainName, 'escalation', 'auto_response', anomaly.severity],
          references: [],
          significance: 'breakthrough',
          data: { anomaly, rule: rule.description },
        });

        return {
          anomaly_id: anomaly.id ?? 0,
          timestamp: now,
          action: 'escalate',
          description,
          parameters_before: null,
          parameters_after: null,
          success: true,
          reverted: false,
        };
      }

      case 'resolve': {
        const description = `Auto-Resolved: ${anomaly.title} (${anomaly.severity}) — ${anomaly.metric}`;
        ts?.emit('auto_responder', 'analyzing', description);

        return {
          anomaly_id: anomaly.id ?? 0,
          timestamp: now,
          action: 'resolve',
          description,
          parameters_before: null,
          parameters_after: null,
          success: true,
          reverted: false,
        };
      }

      case 'alert':
      case 'log_only':
      default:
        return this.logOnlyResponse(anomaly, rule, now, rule.description);
    }
  }

  private logOnlyResponse(anomaly: Anomaly, rule: ResponseRule, now: number, msg: string): AutoResponse {
    this.thoughtStream?.emit('auto_responder', 'perceiving', `Logged: ${anomaly.metric} — ${msg}`);
    return {
      anomaly_id: anomaly.id ?? 0,
      timestamp: now,
      action: 'log_only',
      description: `${msg} [${anomaly.metric}]`,
      parameters_before: null,
      parameters_after: null,
      success: true,
      reverted: false,
    };
  }

  private persistResponse(response: AutoResponse): void {
    this.db.prepare(`
      INSERT INTO auto_responses (anomaly_id, timestamp, action, description, parameters_before, parameters_after, success, reverted)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      response.anomaly_id, response.timestamp, response.action, response.description,
      response.parameters_before ? JSON.stringify(response.parameters_before) : null,
      response.parameters_after ? JSON.stringify(response.parameters_after) : null,
      response.success ? 1 : 0, 0,
    );
  }
}
