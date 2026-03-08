import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { GoalEngine, runGoalEngineMigration } from '../goal-engine.js';

describe('GoalEngine', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  // ── 1. Creation ────────────────────────────────────────

  it('constructs without error and runs migration', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    expect(engine).toBeDefined();

    // Tables should exist
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('goals', 'goal_progress') ORDER BY name").all() as Array<{ name: string }>;
    expect(tables.map(t => t.name)).toEqual(['goal_progress', 'goals']);
  });

  // ── 2. createGoal ─────────────────────────────────────

  it('creates a goal and returns it with an id', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    const goal = engine.createGoal('Hit 80% accuracy', 'accuracy', 0.8, 50, {
      description: 'Improve prediction accuracy',
      type: 'quality',
      baselineValue: 0.4,
      currentCycle: 10,
      priority: 0.9,
      direction: 'higher_is_better',
    });

    expect(goal.id).toBeGreaterThan(0);
    expect(goal.title).toBe('Hit 80% accuracy');
    expect(goal.metricName).toBe('accuracy');
    expect(goal.targetValue).toBe(0.8);
    expect(goal.baselineValue).toBe(0.4);
    expect(goal.currentValue).toBe(0.4);
    expect(goal.deadlineCycles).toBe(50);
    expect(goal.startedCycle).toBe(10);
    expect(goal.status).toBe('active');
    expect(goal.priority).toBe(0.9);
    expect(goal.direction).toBe('higher_is_better');
    expect(goal.description).toBe('Improve prediction accuracy');
    expect(goal.type).toBe('quality');
  });

  it('throws when max active goals reached', () => {
    const engine = new GoalEngine(db, { brainName: 'test', maxActiveGoals: 2 });
    engine.createGoal('G1', 'm1', 10, 50);
    engine.createGoal('G2', 'm2', 20, 50);

    expect(() => engine.createGoal('G3', 'm3', 30, 50)).toThrow(/Max active goals/);
  });

  // ── 3. listGoals ──────────────────────────────────────

  it('lists goals with optional status filter', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    engine.createGoal('A', 'x', 10, 50);
    engine.createGoal('B', 'y', 20, 50);

    const all = engine.listGoals();
    expect(all).toHaveLength(2);

    const active = engine.listGoals('active');
    expect(active).toHaveLength(2);

    // Pause one and filter
    engine.pauseGoal(all[0].id!);
    expect(engine.listGoals('active')).toHaveLength(1);
    expect(engine.listGoals('paused')).toHaveLength(1);
  });

  // ── 4. getGoal ────────────────────────────────────────

  it('gets a goal by id or returns null', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    const created = engine.createGoal('Find me', 'metric', 100, 30);

    const found = engine.getGoal(created.id!);
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Find me');

    const missing = engine.getGoal(9999);
    expect(missing).toBeNull();
  });

  // ── 5. recordProgress ─────────────────────────────────

  it('records progress for active goals matching metric names', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    engine.createGoal('Accuracy goal', 'accuracy', 0.9, 50, { baselineValue: 0.5 });
    engine.createGoal('Speed goal', 'speed', 100, 50);

    const updated = engine.recordProgress(1, { accuracy: 0.6, speed: 20, unknown: 42 });
    expect(updated).toBe(2);

    // Verify values were stored
    const acc = engine.listGoals('active').find(g => g.metricName === 'accuracy');
    expect(acc!.currentValue).toBe(0.6);
    const spd = engine.listGoals('active').find(g => g.metricName === 'speed');
    expect(spd!.currentValue).toBe(20);
  });

  // ── 6. checkGoals — achieved ──────────────────────────

  it('marks goal as achieved when target is met (higher_is_better)', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    const goal = engine.createGoal('Hit 10', 'score', 10, 50);

    engine.recordProgress(1, { score: 10 });
    const result = engine.checkGoals(1);

    expect(result.achieved).toHaveLength(1);
    expect(result.achieved[0].title).toBe('Hit 10');
    expect(result.achieved[0].status).toBe('achieved');
    expect(result.achieved[0].achievedAt).not.toBeNull();
    expect(result.failed).toHaveLength(0);

    // Verify persisted
    const fetched = engine.getGoal(goal.id!);
    expect(fetched!.status).toBe('achieved');
  });

  it('marks goal as achieved when target is met (lower_is_better)', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    engine.createGoal('Reduce errors', 'errorRate', 5, 50, {
      baselineValue: 20,
      direction: 'lower_is_better',
    });

    engine.recordProgress(1, { errorRate: 4 });
    const result = engine.checkGoals(1);

    expect(result.achieved).toHaveLength(1);
    expect(result.achieved[0].metricName).toBe('errorRate');
    expect(result.failed).toHaveLength(0);
  });

  // ── 7. checkGoals — failed ────────────────────────────

  it('marks goal as failed when deadline passes without achievement', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    engine.createGoal('Unreachable', 'metric', 100, 10, { currentCycle: 0, baselineValue: 0 });

    // Record some progress but not enough
    engine.recordProgress(5, { metric: 30 });

    const result = engine.checkGoals(10); // deadline reached (elapsed = 10 - 0 = 10 >= 10)
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].title).toBe('Unreachable');
    expect(result.failed[0].status).toBe('failed');
    expect(result.achieved).toHaveLength(0);
  });

  // ── 8. pauseGoal / resumeGoal ─────────────────────────

  it('pauses and resumes goals', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    const goal = engine.createGoal('Pausable', 'metric', 50, 30);

    expect(engine.pauseGoal(goal.id!)).toBe(true);
    expect(engine.getGoal(goal.id!)!.status).toBe('paused');

    // Pausing again fails (not active)
    expect(engine.pauseGoal(goal.id!)).toBe(false);

    // Resume works
    expect(engine.resumeGoal(goal.id!, 5)).toBe(true);
    expect(engine.getGoal(goal.id!)!.status).toBe('active');

    // Resuming again fails (not paused)
    expect(engine.resumeGoal(goal.id!, 5)).toBe(false);

    // Pause/resume on non-existent goal
    expect(engine.pauseGoal(9999)).toBe(false);
    expect(engine.resumeGoal(9999, 0)).toBe(false);
  });

  // ── 9. getProgress ────────────────────────────────────

  it('returns progress report with percent and trend', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    const goal = engine.createGoal('Track me', 'metric', 100, 50, { baselineValue: 0 });

    // Record improving data points
    engine.recordProgress(1, { metric: 20 });
    engine.recordProgress(2, { metric: 40 });
    engine.recordProgress(3, { metric: 60 });

    const report = engine.getProgress(goal.id!);
    expect(report).not.toBeNull();
    expect(report!.goal.title).toBe('Track me');
    expect(report!.progressPercent).toBe(60); // 60/100 * 100
    expect(report!.trend).toBe('improving');
    expect(report!.dataPoints).toBe(3);

    // Non-existent goal returns null
    expect(engine.getProgress(9999)).toBeNull();
  });

  it('detects declining trend for higher_is_better', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    const goal = engine.createGoal('Declining', 'metric', 100, 50, { baselineValue: 50 });

    engine.recordProgress(1, { metric: 45 });
    engine.recordProgress(2, { metric: 40 });
    engine.recordProgress(3, { metric: 35 });

    const report = engine.getProgress(goal.id!);
    expect(report!.trend).toBe('declining');
    // Progress should be 0 because currentValue (35) < baselineValue (50) — negative clamped by formula
    expect(report!.progressPercent).toBeLessThanOrEqual(0);
  });

  // ── 10. getStatus ─────────────────────────────────────

  it('returns engine status with counts and recent achievements', () => {
    const engine = new GoalEngine(db, { brainName: 'test' });
    engine.createGoal('Active1', 'a', 10, 50);
    engine.createGoal('Active2', 'b', 10, 50);
    engine.createGoal('ToAchieve', 'c', 5, 50);

    // Achieve one
    engine.recordProgress(1, { c: 5 });
    engine.checkGoals(1);

    // Pause one
    engine.pauseGoal(engine.listGoals('active')[0].id!);

    const status = engine.getStatus();
    expect(status.totalGoals).toBe(3);
    expect(status.activeGoals).toBe(1);
    expect(status.achievedGoals).toBe(1);
    expect(status.pausedGoals).toBe(1);
    expect(status.failedGoals).toBe(0);
    expect(status.recentAchievements).toHaveLength(1);
    expect(status.recentAchievements[0].title).toBe('ToAchieve');
    expect(status.topActive).toHaveLength(1);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  // ── 11. runGoalEngineMigration is idempotent ──────────

  it('migration is idempotent — can run twice without error', () => {
    runGoalEngineMigration(db);
    runGoalEngineMigration(db);

    // Should still work after double-migration
    const engine = new GoalEngine(db, { brainName: 'test' });
    const goal = engine.createGoal('After re-migrate', 'x', 10, 20);
    expect(goal.id).toBeGreaterThan(0);
  });
});
