/**
 * Cumulative Uptime Tracker — tracks real running time across restarts.
 *
 * Stores heartbeats in DB. On startup, loads previous cumulative uptime.
 * Call heartbeat() periodically (e.g. every cycle) to accumulate runtime.
 * When daemon stops and restarts, the gap is not counted.
 */
import type Database from 'better-sqlite3';

export interface UptimeStats {
  /** Current session uptime in ms */
  sessionMs: number;
  /** Cumulative uptime across all sessions in ms */
  cumulativeMs: number;
  /** Number of restarts/sessions */
  sessions: number;
  /** Timestamp when tracking started (first ever boot) */
  trackingSince: string;
  /** Human-readable cumulative uptime */
  cumulativeFormatted: string;
  /** Human-readable session uptime */
  sessionFormatted: string;
}

export class UptimeTracker {
  private sessionStart = Date.now();
  private previousCumulative = 0;
  private sessions = 0;
  private trackingSince = '';

  constructor(private db: Database.Database) {
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS brain_uptime (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        cumulative_ms INTEGER NOT NULL DEFAULT 0,
        sessions INTEGER NOT NULL DEFAULT 0,
        tracking_since TEXT NOT NULL DEFAULT (datetime('now')),
        last_heartbeat TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO brain_uptime (id) VALUES (1);
    `);

    // Load previous state
    const row = this.db.prepare('SELECT * FROM brain_uptime WHERE id = 1').get() as {
      cumulative_ms: number; sessions: number; tracking_since: string;
    };

    this.previousCumulative = row.cumulative_ms;
    this.sessions = row.sessions + 1; // new session
    this.trackingSince = row.tracking_since;

    // Record new session start
    this.db.prepare(`
      UPDATE brain_uptime SET sessions = ?, last_heartbeat = datetime('now') WHERE id = 1
    `).run(this.sessions);
  }

  /** Call periodically (every cycle) to persist cumulative uptime. */
  heartbeat(): void {
    const sessionMs = Date.now() - this.sessionStart;
    const totalMs = this.previousCumulative + sessionMs;
    this.db.prepare(`
      UPDATE brain_uptime SET cumulative_ms = ?, last_heartbeat = datetime('now') WHERE id = 1
    `).run(totalMs);
  }

  /** Get current uptime statistics. */
  getStats(): UptimeStats {
    const sessionMs = Date.now() - this.sessionStart;
    const cumulativeMs = this.previousCumulative + sessionMs;

    return {
      sessionMs,
      cumulativeMs,
      sessions: this.sessions,
      trackingSince: this.trackingSince,
      cumulativeFormatted: this.formatDuration(cumulativeMs),
      sessionFormatted: this.formatDuration(sessionMs),
    };
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}
