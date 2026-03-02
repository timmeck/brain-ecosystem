import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { GoalEngine } from '../../../src/goals/goal-engine.js';

describe('GoalEngine', () => {
  let db: Database.Database;
  let engine: GoalEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    engine = new GoalEngine(db, { brainName: 'test-brain' });
  });

  it('should create tables on construction', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('goals', 'goal_progress')").all() as { name: string }[];
    const names = tables.map(t => t.name).sort();
    expect(names).toContain('goals');
    expect(names).toContain('goal_progress');
  });

  it('should create a goal with defaults', () => {
    const goal = engine.createGoal('Test Goal', 'accuracy', 0.9, 50);
    expect(goal.id).toBeGreaterThan(0);
    expect(goal.title).toBe('Test Goal');
    expect(goal.metricName).toBe('accuracy');
    expect(goal.targetValue).toBe(0.9);
    expect(goal.deadlineCycles).toBe(50);
    expect(goal.status).toBe('active');
    expect(goal.currentValue).toBe(0);
    expect(goal.baselineValue).toBe(0);
    expect(goal.type).toBe('metric_target');
  });

  it('should record progress and update current_value', () => {
    const goal = engine.createGoal('Accuracy', 'accuracy', 0.9, 50);
    engine.recordProgress(1, { accuracy: 0.5 });

    const updated = engine.getGoal(goal.id!)!;
    expect(updated.currentValue).toBe(0.5);
  });

  it('should mark goal as achieved when target reached', () => {
    engine.createGoal('Principles', 'principleCount', 10, 50, { currentCycle: 0 });
    engine.recordProgress(1, { principleCount: 12 });
    const { achieved } = engine.checkGoals(1);

    expect(achieved).toHaveLength(1);
    expect(achieved[0].status).toBe('achieved');
    expect(achieved[0].achievedAt).not.toBeNull();
  });

  it('should mark goal as failed past deadline', () => {
    engine.createGoal('Experiments', 'experimentCount', 20, 10, { currentCycle: 0 });
    engine.recordProgress(11, { experimentCount: 5 });
    const { failed } = engine.checkGoals(11);

    expect(failed).toHaveLength(1);
    expect(failed[0].status).toBe('failed');
  });

  it('should forecast completion with linear regression', () => {
    const goal = engine.createGoal('Accuracy', 'accuracy', 1.0, 100, { currentCycle: 0 });

    // Simulate linear progress: 0.1 per cycle
    for (let cycle = 1; cycle <= 5; cycle++) {
      engine.recordProgress(cycle, { accuracy: cycle * 0.1 });
    }

    const forecast = engine.forecastCompletion(goal.id!);
    expect(forecast).not.toBeNull();
    expect(forecast!.slope).toBeGreaterThan(0);
    expect(forecast!.estimatedCycle).not.toBeNull();
    expect(forecast!.estimatedCycle!).toBeGreaterThan(5);
    expect(forecast!.confidence).toBeGreaterThan(0.5);
    expect(forecast!.willComplete).toBe(true);
  });

  it('should return null forecast with insufficient data', () => {
    const goal = engine.createGoal('Test', 'metric', 1.0, 50);
    engine.recordProgress(1, { metric: 0.1 });

    const forecast = engine.forecastCompletion(goal.id!);
    expect(forecast).not.toBeNull();
    expect(forecast!.estimatedCycle).toBeNull();
    expect(forecast!.confidence).toBe(0);
  });

  it('should pause and resume goals', () => {
    const goal = engine.createGoal('Test', 'metric', 1.0, 50);
    expect(engine.pauseGoal(goal.id!)).toBe(true);
    expect(engine.getGoal(goal.id!)!.status).toBe('paused');

    expect(engine.resumeGoal(goal.id!, 5)).toBe(true);
    expect(engine.getGoal(goal.id!)!.status).toBe('active');
  });

  it('should list goals filtered by status', () => {
    engine.createGoal('Active 1', 'a', 1.0, 50);
    engine.createGoal('Active 2', 'b', 1.0, 50);
    const g3 = engine.createGoal('To Pause', 'c', 1.0, 50);
    engine.pauseGoal(g3.id!);

    const active = engine.listGoals('active');
    expect(active).toHaveLength(2);

    const paused = engine.listGoals('paused');
    expect(paused).toHaveLength(1);
    expect(paused[0].title).toBe('To Pause');

    const all = engine.listGoals();
    expect(all).toHaveLength(3);
  });

  it('should suggest goals based on weaknesses', () => {
    engine.setDataSources({
      getPredictionAccuracy: () => 0.3,
      getActiveGaps: () => 15,
      getPrincipleCount: () => 3,
    });

    const suggestions = engine.suggestGoals(1);
    expect(suggestions.length).toBeGreaterThan(0);

    const metricNames = suggestions.map(s => s.metricName);
    expect(metricNames).toContain('predictionAccuracy');
    expect(metricNames).toContain('activeGaps');
    expect(metricNames).toContain('principleCount');
  });

  it('should gather metrics from data sources', () => {
    engine.setDataSources({
      getPredictionAccuracy: () => 0.75,
      getPrincipleCount: () => 12,
    });

    const metrics = engine.gatherMetrics();
    expect(metrics.predictionAccuracy).toBe(0.75);
    expect(metrics.principleCount).toBe(12);
  });

  it('should return status with counts', () => {
    engine.createGoal('G1', 'a', 1.0, 50);
    engine.createGoal('G2', 'b', 1.0, 50);
    engine.recordProgress(1, { a: 2.0 });
    engine.checkGoals(1); // G1 achieved

    const status = engine.getStatus();
    expect(status.totalGoals).toBe(2);
    expect(status.achievedGoals).toBe(1);
    expect(status.activeGoals).toBe(1);
    expect(status.recentAchievements).toHaveLength(1);
    expect(status.topActive).toHaveLength(1);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });
});
