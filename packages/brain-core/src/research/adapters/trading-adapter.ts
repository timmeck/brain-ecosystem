import type Database from 'better-sqlite3';
import type { DataMinerAdapter, MinedObservation, MinedCausalEvent, MinedMetric, MinedHypothesisObservation, MinedCrossDomainEvent } from '../data-miner.js';

/**
 * DataMiner adapter for Trading Brain.
 * Mines: trades (win/loss, profit, regime, pair), rules (confidence, win-rate),
 *        chains (streak patterns), calibration.
 */
export class TradingDataMinerAdapter implements DataMinerAdapter {
  readonly name = 'trading-brain';

  mineObservations(db: Database.Database, since: number): MinedObservation[] {
    const observations: MinedObservation[] = [];

    // Trade outcomes by pair
    const trades = safeAll<{ pair: string; cnt: number; wins: number; total_profit: number }>(
      db,
      `SELECT pair, COUNT(*) as cnt, SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) as wins,
              SUM(COALESCE(profit, 0)) as total_profit
       FROM trades WHERE created_at > ? GROUP BY pair`,
      [isoFromTs(since)],
    );
    for (const t of trades) {
      observations.push({
        category: 'tool_usage',
        event_type: 'trade:pair_stats',
        metrics: { pair: t.pair, count: t.cnt, wins: t.wins, win_rate: t.cnt > 0 ? t.wins / t.cnt : 0, total_profit: t.total_profit },
      });
    }

    // Trade outcomes by regime
    const regimes = safeAll<{ regime: string; cnt: number; wins: number }>(
      db,
      `SELECT COALESCE(regime, 'unknown') as regime, COUNT(*) as cnt,
              SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) as wins
       FROM trades WHERE created_at > ? GROUP BY regime`,
      [isoFromTs(since)],
    );
    for (const r of regimes) {
      observations.push({
        category: 'tool_usage',
        event_type: 'trade:regime_stats',
        metrics: { regime: r.regime, count: r.cnt, wins: r.wins, win_rate: r.cnt > 0 ? r.wins / r.cnt : 0 },
      });
    }

    // Rule confidence distribution
    const rules = safeAll<{ id: number; pattern: string; confidence: number; win_rate: number }>(
      db,
      `SELECT id, pattern, confidence, COALESCE(win_rate, 0) as win_rate FROM rules WHERE updated_at > ?`,
      [isoFromTs(since)],
    );
    for (const r of rules) {
      observations.push({
        category: 'query_quality',
        event_type: 'rule:confidence',
        metrics: { rule_id: r.id, pattern: r.pattern, confidence: r.confidence, win_rate: r.win_rate },
      });
    }

    // Chain/streak patterns
    const chains = safeAll<{ pair: string; type: string; length: number }>(
      db,
      `SELECT pair, type, length FROM chains WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    for (const c of chains) {
      observations.push({
        category: 'tool_usage',
        event_type: 'chain:streak',
        metrics: { pair: c.pair, type: c.type, length: c.length },
      });
    }

    return observations;
  }

  mineCausalEvents(db: Database.Database, since: number): MinedCausalEvent[] {
    const events: MinedCausalEvent[] = [];

    // Individual trades as causal events
    const trades = safeAll<{ id: number; pair: string; win: number; profit: number; regime: string; fingerprint: string }>(
      db,
      `SELECT id, pair, win, COALESCE(profit, 0) as profit, COALESCE(regime, 'unknown') as regime, fingerprint
       FROM trades WHERE created_at > ? ORDER BY created_at LIMIT 500`,
      [isoFromTs(since)],
    );
    for (const t of trades) {
      events.push({
        source: 'trading-brain',
        type: t.win ? 'trade:win' : 'trade:loss',
        data: { tradeId: t.id, pair: t.pair, profit: t.profit, regime: t.regime, fingerprint: t.fingerprint },
      });
    }

    // Rule learning events
    const rules = safeAll<{ id: number; pattern: string; confidence: number }>(
      db,
      `SELECT id, pattern, confidence FROM rules WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    for (const r of rules) {
      events.push({
        source: 'trading-brain',
        type: 'rule:learned',
        data: { ruleId: r.id, pattern: r.pattern, confidence: r.confidence },
      });
    }

    return events;
  }

  mineMetrics(db: Database.Database, since: number): MinedMetric[] {
    const metrics: MinedMetric[] = [];

    // Overall win rate
    const winRate = safeGet<{ total: number; wins: number }>(
      db,
      `SELECT COUNT(*) as total, SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) as wins FROM trades WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (winRate && winRate.total > 0) {
      metrics.push({ name: 'win_rate', value: winRate.wins / winRate.total });
      metrics.push({ name: 'trade_count', value: winRate.total });
    }

    // Average profit per trade
    const profit = safeGet<{ avg_profit: number }>(
      db,
      `SELECT AVG(COALESCE(profit, 0)) as avg_profit FROM trades WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (profit?.avg_profit != null) {
      metrics.push({ name: 'avg_profit', value: profit.avg_profit });
    }

    // Average rule confidence
    const ruleConf = safeGet<{ avg_confidence: number }>(
      db,
      `SELECT AVG(confidence) as avg_confidence FROM rules WHERE confidence IS NOT NULL AND updated_at > ?`,
      [isoFromTs(since)],
    );
    if (ruleConf?.avg_confidence != null) {
      metrics.push({ name: 'avg_rule_confidence', value: ruleConf.avg_confidence });
    }

    // Max streak length
    const maxStreak = safeGet<{ max_length: number }>(
      db,
      `SELECT MAX(length) as max_length FROM chains WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (maxStreak?.max_length != null) {
      metrics.push({ name: 'max_streak_length', value: maxStreak.max_length });
    }

    // Calibration score
    const calibration = safeGet<{ overall_accuracy: number }>(
      db,
      `SELECT overall_accuracy FROM calibration ORDER BY updated_at DESC LIMIT 1`,
      [],
    );
    if (calibration?.overall_accuracy != null) {
      metrics.push({ name: 'calibration_accuracy', value: calibration.overall_accuracy });
    }

    return metrics;
  }

  mineHypothesisObservations(db: Database.Database, since: number): MinedHypothesisObservation[] {
    const observations: MinedHypothesisObservation[] = [];

    // Trade wins/losses per pair
    const trades = safeAll<{ pair: string; win: number; cnt: number }>(
      db,
      `SELECT pair, win, COUNT(*) as cnt FROM trades WHERE created_at > ? GROUP BY pair, win`,
      [isoFromTs(since)],
    );
    for (const t of trades) {
      observations.push({
        source: 'trading-brain',
        type: t.win ? 'trade:win' : 'trade:loss',
        value: t.cnt,
        metadata: { pair: t.pair },
      });
    }

    // Chain detections
    const chains = safeAll<{ pair: string; type: string; length: number }>(
      db,
      `SELECT pair, type, length FROM chains WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    for (const c of chains) {
      observations.push({
        source: 'trading-brain',
        type: 'chain:detected',
        value: c.length,
        metadata: { pair: c.pair, streakType: c.type },
      });
    }

    return observations;
  }

  mineCrossDomainEvents(db: Database.Database, since: number): MinedCrossDomainEvent[] {
    const events: MinedCrossDomainEvent[] = [];

    // Trade batch summary for cross-domain
    const summary = safeGet<{ total: number; wins: number; total_profit: number }>(
      db,
      `SELECT COUNT(*) as total, SUM(CASE WHEN win = 1 THEN 1 ELSE 0 END) as wins,
              SUM(COALESCE(profit, 0)) as total_profit
       FROM trades WHERE created_at > ?`,
      [isoFromTs(since)],
    );
    if (summary && summary.total > 0) {
      events.push({
        brain: 'trading-brain',
        eventType: 'trade:batch',
        data: { count: summary.total, wins: summary.wins, win_rate: summary.wins / summary.total, total_profit: summary.total_profit },
      });
    }

    return events;
  }
}

// ── Helpers ─────────────────────────────────────────────

function isoFromTs(ts: number): string {
  return ts > 0 ? new Date(ts).toISOString() : '1970-01-01T00:00:00.000Z';
}

function safeAll<T>(db: Database.Database, sql: string, params: unknown[]): T[] {
  try {
    return db.prepare(sql).all(...params) as T[];
  } catch {
    return [];
  }
}

function safeGet<T>(db: Database.Database, sql: string, params: unknown[]): T | undefined {
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } catch {
    return undefined;
  }
}
