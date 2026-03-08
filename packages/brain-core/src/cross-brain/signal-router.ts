import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { CrossBrainNotifier } from './notifications.js';

// ── Types ──────────────────────────────────────────────────

export interface CrossBrainSignal {
  id: string;
  sourceBrain: string;
  targetBrain: string;
  signalType: string;
  payload: Record<string, unknown>;
  confidence: number;
  timestamp: number;
  processed: boolean;
}

export type SignalHandler = (signal: CrossBrainSignal) => void | Promise<void>;

// ── Migration ──────────────────────────────────────────────

export function runSignalRouterMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cross_brain_signals (
      id TEXT PRIMARY KEY,
      source_brain TEXT NOT NULL,
      target_brain TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      confidence REAL DEFAULT 0,
      timestamp INTEGER NOT NULL,
      processed INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_signal_source ON cross_brain_signals(source_brain);
    CREATE INDEX IF NOT EXISTS idx_signal_target ON cross_brain_signals(target_brain);
    CREATE INDEX IF NOT EXISTS idx_signal_type ON cross_brain_signals(signal_type);
    CREATE INDEX IF NOT EXISTS idx_signal_processed ON cross_brain_signals(processed);
  `);
}

// ── SignalRouter ──────────────────────────────────────────

const log = getLogger();

/**
 * CrossBrainSignalRouter — bidirectional signal routing between brains.
 * Registers handlers for signal types and dispatches incoming signals.
 * Persists signal history to SQLite.
 */
export class CrossBrainSignalRouter {
  private readonly db: Database.Database;
  private readonly brainName: string;
  private readonly handlers = new Map<string, SignalHandler[]>();
  private notifier: CrossBrainNotifier | null = null;

  private readonly stmtInsert;
  private readonly stmtMarkProcessed;
  private readonly stmtGetHistory;
  private readonly stmtGetUnprocessed;
  private readonly stmtCountByType;

  constructor(db: Database.Database, brainName: string) {
    this.db = db;
    this.brainName = brainName;
    runSignalRouterMigration(db);

    this.stmtInsert = db.prepare(`
      INSERT INTO cross_brain_signals (id, source_brain, target_brain, signal_type, payload, confidence, timestamp, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `);
    this.stmtMarkProcessed = db.prepare(`UPDATE cross_brain_signals SET processed = 1 WHERE id = ?`);
    this.stmtGetHistory = db.prepare(`SELECT * FROM cross_brain_signals ORDER BY timestamp DESC LIMIT ?`);
    this.stmtGetUnprocessed = db.prepare(`SELECT * FROM cross_brain_signals WHERE target_brain = ? AND processed = 0 ORDER BY timestamp ASC LIMIT ?`);
    this.stmtCountByType = db.prepare(`SELECT signal_type, COUNT(*) as count FROM cross_brain_signals GROUP BY signal_type`);
  }

  /** Set the notifier for outgoing signals */
  setNotifier(notifier: CrossBrainNotifier): void {
    this.notifier = notifier;
  }

  /** Register a handler for a signal type */
  onSignal(signalType: string, handler: SignalHandler): void {
    const existing = this.handlers.get(signalType) ?? [];
    existing.push(handler);
    this.handlers.set(signalType, existing);
  }

  /** Emit a signal to a target brain */
  async emit(signal: {
    targetBrain: string;
    signalType: string;
    payload: Record<string, unknown>;
    confidence?: number;
  }): Promise<string> {
    const id = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const fullSignal: CrossBrainSignal = {
      id,
      sourceBrain: this.brainName,
      targetBrain: signal.targetBrain,
      signalType: signal.signalType,
      payload: signal.payload,
      confidence: signal.confidence ?? 0.5,
      timestamp: now,
      processed: false,
    };

    // Persist
    this.stmtInsert.run(id, fullSignal.sourceBrain, fullSignal.targetBrain, fullSignal.signalType, JSON.stringify(fullSignal.payload), fullSignal.confidence, now);

    // Notify target brain via cross-brain IPC
    if (this.notifier) {
      try {
        await this.notifier.notifyPeer(signal.targetBrain, `signal:${signal.signalType}`, fullSignal);
      } catch {
        log.debug(`[signal-router] Failed to notify ${signal.targetBrain} (may be offline)`);
      }
    }

    log.info(`[signal-router] Emitted ${signal.signalType} → ${signal.targetBrain} (conf=${fullSignal.confidence.toFixed(2)})`);
    return id;
  }

  /** Handle an incoming signal (called by IPC handler) */
  async handleIncoming(signal: CrossBrainSignal): Promise<void> {
    // Persist incoming signal
    try {
      this.stmtInsert.run(signal.id, signal.sourceBrain, signal.targetBrain, signal.signalType, JSON.stringify(signal.payload), signal.confidence, signal.timestamp);
    } catch { /* duplicate id — already recorded */ }

    // Dispatch to handlers
    const handlers = this.handlers.get(signal.signalType) ?? [];
    for (const handler of handlers) {
      try {
        await handler(signal);
      } catch (err) {
        log.warn(`[signal-router] Handler error for ${signal.signalType}: ${(err as Error).message}`);
      }
    }

    // Mark as processed
    this.stmtMarkProcessed.run(signal.id);
    log.info(`[signal-router] Processed incoming ${signal.signalType} from ${signal.sourceBrain}`);
  }

  /** Process all unprocessed incoming signals */
  async processQueue(limit?: number): Promise<number> {
    const rows = this.stmtGetUnprocessed.all(this.brainName, limit ?? 50) as RawSignal[];
    let processed = 0;

    for (const row of rows) {
      const signal = deserializeSignal(row);
      await this.handleIncoming(signal);
      processed++;
    }

    return processed;
  }

  /** Get signal history */
  getHistory(limit?: number): CrossBrainSignal[] {
    return (this.stmtGetHistory.all(limit ?? 50) as RawSignal[]).map(deserializeSignal);
  }

  /** Get status overview */
  getStatus(): { totalSignals: number; byType: Array<{ signalType: string; count: number }>; handlerCount: number } {
    const byType = this.stmtCountByType.all() as Array<{ signal_type: string; count: number }>;
    const totalSignals = byType.reduce((sum, r) => sum + r.count, 0);

    return {
      totalSignals,
      byType: byType.map(r => ({ signalType: r.signal_type, count: r.count })),
      handlerCount: this.handlers.size,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────

interface RawSignal {
  id: string;
  source_brain: string;
  target_brain: string;
  signal_type: string;
  payload: string;
  confidence: number;
  timestamp: number;
  processed: number;
}

function deserializeSignal(row: RawSignal): CrossBrainSignal {
  return {
    id: row.id,
    sourceBrain: row.source_brain,
    targetBrain: row.target_brain,
    signalType: row.signal_type,
    payload: JSON.parse(row.payload || '{}'),
    confidence: row.confidence,
    timestamp: row.timestamp,
    processed: row.processed === 1,
  };
}
