import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { ResearchMissionEngine } from '../mission-engine.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('ResearchMissionEngine', () => {
  let db: Database.Database;
  let engine: ResearchMissionEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new ResearchMissionEngine(db, { maxConcurrentMissions: 2 });
  });

  afterEach(() => {
    db.close();
  });

  it('creates a mission', () => {
    const mission = engine.createMission('Test topic');
    expect(mission).toBeDefined();
    expect(mission.topic).toBe('Test topic');
    // Status may be 'pending' or already moved to 'decomposing' by async execution
    expect(['pending', 'decomposing']).toContain(mission.status);
  });

  it('lists missions', () => {
    engine.createMission('Topic A');
    engine.createMission('Topic B');
    const missions = engine.listMissions();
    expect(missions.length).toBe(2);
  });

  it('enforces maxConcurrentMissions limit', () => {
    engine.createMission('Mission 1');
    engine.createMission('Mission 2');
    // Third mission should be rejected (max = 2)
    expect(() => engine.createMission('Mission 3')).toThrow(/Maximum concurrent missions/);
  });

  it('allows new missions after previous ones complete', () => {
    const m1 = engine.createMission('Mission 1');
    engine.createMission('Mission 2');
    // Cancel m1 to free a slot
    engine.cancelMission(m1.id!);
    // Now should succeed
    const m3 = engine.createMission('Mission 3');
    expect(m3).toBeDefined();
  });

  it('returns engine status', () => {
    engine.createMission('Topic A');
    const status = engine.getStatus();
    expect(status.totalMissions).toBe(1);
    expect(status.activeMissions).toBe(1);
  });

  it('cancels a mission', () => {
    const m = engine.createMission('Cancel me');
    const result = engine.cancelMission(m.id!);
    expect(result).toBe(true);
    const cancelled = engine.getMission(m.id!);
    expect(cancelled!.status).toBe('failed');
  });

  it('returns null for non-existent mission', () => {
    expect(engine.getMission(999)).toBeNull();
  });
});
