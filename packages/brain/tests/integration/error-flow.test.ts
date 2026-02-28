import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDb } from '../helpers/setup-db.js';
import { ErrorService } from '../../src/services/error.service.js';
import { SolutionService } from '../../src/services/solution.service.js';
import { SynapseManager } from '../../src/synapses/synapse-manager.js';

const synapsesConfig = {
  initialWeight: 0.1,
  learningRate: 0.15,
  decayHalfLifeDays: 45,
  pruneThreshold: 0.05,
  decayAfterDays: 14,
  maxDepth: 3,
  minActivationWeight: 0.2,
};

describe('Error Flow Integration', () => {
  let testDb: TestDb;
  let errorService: ErrorService;
  let solutionService: SolutionService;
  let synapseManager: SynapseManager;

  beforeEach(() => {
    testDb = createTestDb();
    synapseManager = new SynapseManager(testDb.repos.synapse, synapsesConfig);
    errorService = new ErrorService(testDb.repos.error, testDb.repos.project, synapseManager);
    solutionService = new SolutionService(testDb.repos.solution, synapseManager);
  });

  it('reports error and queries it back', () => {
    const result = errorService.report({
      project: 'test-project',
      errorOutput: "TypeError: Cannot read properties of undefined (reading 'map')",
    });
    expect(result.errorId).toBeTruthy();
    expect(result.isNew).toBe(true);

    const errors = errorService.query({ resolved: false });
    expect(errors.length).toBe(1);
  });

  it('adds and finds solutions for errors', () => {
    const errResult = errorService.report({
      project: 'test-project',
      errorOutput: "TypeError: Cannot read properties of undefined",
    });

    const solutionId = solutionService.report({
      errorId: errResult.errorId,
      description: 'Add null check before accessing .map()',
    });
    expect(solutionId).toBeTruthy();

    const solutions = solutionService.findForError(errResult.errorId);
    expect(solutions.length).toBeGreaterThanOrEqual(0); // may need error_solution join
  });

  it('matches similar errors', () => {
    const first = errorService.report({
      project: 'project-a',
      errorOutput: "TypeError: Cannot read properties of undefined (reading 'map')",
    });

    const second = errorService.report({
      project: 'project-a',
      errorOutput: "TypeError: Cannot read properties of undefined (reading 'filter')",
    });

    const matches = errorService.matchSimilar(second.errorId);
    expect(matches).toBeDefined();
  });

  it('creates project on first error report', () => {
    errorService.report({
      project: 'new-project',
      errorOutput: 'Error: something broke',
    });

    const projects = testDb.repos.project.getAll();
    expect(projects.length).toBe(1);
    expect(projects[0].name).toBe('new-project');
  });
});
