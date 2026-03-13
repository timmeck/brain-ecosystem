import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { UptimeTracker } from '../uptime-tracker.js';

describe('UptimeTracker', () => {
  it('should initialize and track session uptime', () => {
    const db = new Database(':memory:');
    const tracker = new UptimeTracker(db);

    const stats = tracker.getStats();
    expect(stats.sessionMs).toBeGreaterThanOrEqual(0);
    expect(stats.cumulativeMs).toBeGreaterThanOrEqual(0);
    expect(stats.sessions).toBe(1);
    expect(stats.sessionFormatted).toBeTruthy();
    expect(stats.cumulativeFormatted).toBeTruthy();
  });

  it('should accumulate uptime across sessions', () => {
    const db = new Database(':memory:');

    // Session 1
    const tracker1 = new UptimeTracker(db);
    // Simulate some uptime by directly writing to DB
    db.prepare('UPDATE brain_uptime SET cumulative_ms = 3600000 WHERE id = 1').run();

    // Session 2
    const tracker2 = new UptimeTracker(db);
    const stats = tracker2.getStats();
    expect(stats.sessions).toBe(2);
    expect(stats.cumulativeMs).toBeGreaterThanOrEqual(3600000);
  });

  it('should persist heartbeat to DB', () => {
    const db = new Database(':memory:');
    const tracker = new UptimeTracker(db);

    tracker.heartbeat();

    const row = db.prepare('SELECT cumulative_ms FROM brain_uptime WHERE id = 1').get() as { cumulative_ms: number };
    expect(row.cumulative_ms).toBeGreaterThanOrEqual(0);
  });

  it('should format durations correctly', () => {
    const db = new Database(':memory:');
    const tracker = new UptimeTracker(db);

    // Simulate large cumulative
    db.prepare('UPDATE brain_uptime SET cumulative_ms = ? WHERE id = 1').run(90061000); // 1d 1h 1m 1s

    const tracker2 = new UptimeTracker(db);
    const stats = tracker2.getStats();
    expect(stats.cumulativeFormatted).toContain('d');
  });
});
