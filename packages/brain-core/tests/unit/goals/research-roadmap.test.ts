import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { GoalEngine, runGoalEngineMigration } from '../../../src/goals/goal-engine.js';
import { ResearchRoadmap, runRoadmapMigration } from '../../../src/goals/research-roadmap.js';

describe('ResearchRoadmap', () => {
  let db: Database.Database;
  let goalEngine: GoalEngine;
  let roadmap: ResearchRoadmap;

  beforeEach(() => {
    db = new Database(':memory:');
    runGoalEngineMigration(db);
    goalEngine = new GoalEngine(db, { brainName: 'test' });
    runRoadmapMigration(db);
    roadmap = new ResearchRoadmap(db, goalEngine);
  });

  describe('createRoadmap', () => {
    it('creates a roadmap with a final goal', () => {
      const goal = goalEngine.createGoal('Test Goal', 'accuracy', 0.9, 50);
      const rm = roadmap.createRoadmap('Test Roadmap', goal.id!);
      expect(rm.id).toBeGreaterThan(0);
      expect(rm.title).toBe('Test Roadmap');
      expect(rm.finalGoalId).toBe(goal.id);
      expect(rm.status).toBe('active');
    });
  });

  describe('listRoadmaps', () => {
    it('lists all roadmaps', () => {
      const g1 = goalEngine.createGoal('G1', 'm1', 1, 10);
      const g2 = goalEngine.createGoal('G2', 'm2', 2, 20);
      roadmap.createRoadmap('RM1', g1.id!);
      roadmap.createRoadmap('RM2', g2.id!);
      const list = roadmap.listRoadmaps();
      expect(list.length).toBe(2);
    });

    it('filters by status', () => {
      const g = goalEngine.createGoal('G', 'm', 1, 10);
      roadmap.createRoadmap('Active', g.id!);
      const active = roadmap.listRoadmaps('active');
      expect(active.length).toBe(1);
      const completed = roadmap.listRoadmaps('completed');
      expect(completed.length).toBe(0);
    });
  });

  describe('goal dependencies', () => {
    it('sets and gets dependencies', () => {
      const g1 = goalEngine.createGoal('G1', 'm1', 1, 10);
      const g2 = goalEngine.createGoal('G2', 'm2', 2, 20);
      roadmap.setDependencies(g2.id!, [g1.id!]);
      const deps = roadmap.getDependencies(g2.id!);
      expect(deps).toEqual([g1.id!]);
    });

    it('canStart returns true for goals with no dependencies', () => {
      const g = goalEngine.createGoal('G', 'm', 1, 10);
      expect(roadmap.canStart(g.id!)).toBe(true);
    });

    it('canStart returns false when dependency not achieved', () => {
      const g1 = goalEngine.createGoal('G1', 'm1', 1, 10);
      const g2 = goalEngine.createGoal('G2', 'm2', 2, 20);
      roadmap.setDependencies(g2.id!, [g1.id!]);
      expect(roadmap.canStart(g2.id!)).toBe(false);
    });

    it('canStart returns true when dependency achieved', () => {
      const g1 = goalEngine.createGoal('G1', 'm1', 1, 10);
      const g2 = goalEngine.createGoal('G2', 'm2', 2, 20);
      roadmap.setDependencies(g2.id!, [g1.id!]);

      // Mark g1 as achieved
      db.prepare("UPDATE goals SET status = 'achieved' WHERE id = ?").run(g1.id!);
      expect(roadmap.canStart(g2.id!)).toBe(true);
    });
  });

  describe('getReadyGoals', () => {
    it('returns only goals with met dependencies', () => {
      const g1 = goalEngine.createGoal('G1', 'm1', 1, 10);
      const g2 = goalEngine.createGoal('G2', 'm2', 2, 20);
      const g3 = goalEngine.createGoal('G3', 'm3', 3, 30);
      roadmap.setDependencies(g2.id!, [g1.id!]);
      roadmap.setDependencies(g3.id!, [g2.id!]);

      const ready = roadmap.getReadyGoals();
      const readyIds = ready.map(g => g.id);
      expect(readyIds).toContain(g1.id);
      expect(readyIds).not.toContain(g2.id);
      expect(readyIds).not.toContain(g3.id);
    });
  });

  describe('decompose', () => {
    it('decomposes a goal into sub-goals', () => {
      const goal = goalEngine.createGoal('Big Goal', 'accuracy', 0.95, 60);
      const subGoals = roadmap.decompose(goal, 0);
      expect(subGoals.length).toBe(3); // data + hypotheses + target
      expect(subGoals[0].title).toContain('Daten sammeln');
      expect(subGoals[1].title).toContain('Hypothesen');
      expect(subGoals[2].title).toContain('Ziel erreichen');
    });

    it('creates dependencies between phases', () => {
      const goal = goalEngine.createGoal('Big Goal', 'metric', 1.0, 60);
      const subGoals = roadmap.decompose(goal, 0);

      // Phase 2 depends on Phase 1
      const phase2Deps = roadmap.getDependencies(subGoals[1].id!);
      expect(phase2Deps).toContain(subGoals[0].id);

      // Phase 3 depends on Phase 2
      const phase3Deps = roadmap.getDependencies(subGoals[2].id!);
      expect(phase3Deps).toContain(subGoals[1].id);
    });
  });

  describe('toDAG', () => {
    it('builds a DAG with nodes and edges', () => {
      const goal = goalEngine.createGoal('Main', 'metric', 1.0, 60);
      roadmap.decompose(goal, 0);
      const rms = roadmap.listRoadmaps();
      const dag = roadmap.toDAG(rms[0].id);
      expect(dag.nodes.length).toBeGreaterThan(0);
      expect(dag.edges.length).toBeGreaterThan(0);
    });
  });

  describe('getProgress', () => {
    it('reports roadmap progress', () => {
      const goal = goalEngine.createGoal('Main', 'metric', 1.0, 60);
      roadmap.decompose(goal, 0);
      const rms = roadmap.listRoadmaps();
      const progress = roadmap.getProgress(rms[0].id);
      expect(progress.totalGoals).toBe(4); // 1 parent + 3 sub-goals
      expect(progress.progressPercent).toBe(0);
      expect(progress.status).toBe('active');
    });

    it('returns 0 progress for unknown roadmap', () => {
      const progress = roadmap.getProgress(999);
      expect(progress.totalGoals).toBe(0);
      expect(progress.progressPercent).toBe(0);
    });
  });

  describe('Roadmap Bootstrap (Step 57)', () => {
    it('creates roadmap when none exist but goals do', () => {
      // Verify no roadmaps initially
      expect(roadmap.listRoadmaps()).toHaveLength(0);

      // Create a goal
      const goal = goalEngine.createGoal('Improve accuracy', 'accuracy', 0.9, 100);
      expect(goal.id).toBeDefined();

      // Bootstrap: create roadmap from top goal
      const activeGoals = goalEngine.listGoals('active', 5);
      expect(activeGoals.length).toBeGreaterThan(0);

      const topGoal = activeGoals[0];
      const rm = roadmap.createRoadmap(`Auto-Roadmap: ${topGoal.title}`, topGoal.id!);
      expect(rm.id).toBeGreaterThan(0);
      expect(rm.title).toContain('Improve accuracy');
      expect(rm.status).toBe('active');

      // Now list shows 1
      expect(roadmap.listRoadmaps()).toHaveLength(1);
    });

    it('does not create duplicate roadmaps (guard flag pattern)', () => {
      const goal = goalEngine.createGoal('Goal A', 'metric', 1.0, 50);

      // First creation
      roadmap.createRoadmap('Auto-Roadmap: Goal A', goal.id!);
      expect(roadmap.listRoadmaps()).toHaveLength(1);

      // Guard: check before creating again
      const existing = roadmap.listRoadmaps();
      if (existing.length === 0) {
        roadmap.createRoadmap('Should not happen', goal.id!);
      }

      // Still only 1
      expect(roadmap.listRoadmaps()).toHaveLength(1);
    });
  });
});
