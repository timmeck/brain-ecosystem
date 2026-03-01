import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SolutionService } from '../../../src/services/solution.service.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({
    emit: vi.fn(),
  }),
}));

function createMockSolutionRepo() {
  return {
    create: vi.fn().mockReturnValue(1),
    getById: vi.fn().mockReturnValue({
      id: 1,
      description: 'Test solution',
      commands: null,
      code_change: null,
      source: 'manual',
      confidence: 0.5,
      success_count: 0,
      fail_count: 0,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    }),
    update: vi.fn(),
    delete: vi.fn(),
    findForError: vi.fn().mockReturnValue([]),
    linkToError: vi.fn(),
    recordAttempt: vi.fn().mockReturnValue(1),
    getAttempts: vi.fn().mockReturnValue([]),
    getAll: vi.fn().mockReturnValue([]),
    successRate: vi.fn().mockReturnValue(0),
  };
}

function createMockSynapseManager() {
  return {
    strengthen: vi.fn(),
    weaken: vi.fn(),
    find: vi.fn(),
    activate: vi.fn(),
    runDecay: vi.fn(),
  };
}

describe('SolutionService', () => {
  let service: SolutionService;
  let solutionRepo: ReturnType<typeof createMockSolutionRepo>;
  let synapseManager: ReturnType<typeof createMockSynapseManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    solutionRepo = createMockSolutionRepo();
    synapseManager = createMockSynapseManager();
    service = new SolutionService(solutionRepo as any, synapseManager as any);
  });

  it('report creates a solution and links it to error', () => {
    const id = service.report({
      errorId: 10,
      description: 'Run npm install',
      commands: 'npm install',
    });

    expect(id).toBe(1);
    expect(solutionRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Run npm install',
      commands: 'npm install',
      source: 'manual',
      confidence: 0.5,
    }));
    expect(solutionRepo.linkToError).toHaveBeenCalledWith(10, 1);
  });

  it('report creates synapse between solution and error', () => {
    service.report({
      errorId: 10,
      description: 'Fix it',
    });

    expect(synapseManager.strengthen).toHaveBeenCalledWith(
      { type: 'solution', id: 1 },
      { type: 'error', id: 10 },
      'solves',
    );
  });

  it('report uses custom source', () => {
    service.report({
      errorId: 10,
      description: 'AI suggestion',
      source: 'ai',
    });

    expect(solutionRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      source: 'ai',
    }));
  });

  it('rateOutcome records attempt and strengthens synapse on success', () => {
    solutionRepo.findForError.mockReturnValue([{ id: 1 }]);
    solutionRepo.successRate.mockReturnValue(0.75);

    service.rateOutcome({
      errorId: 10,
      solutionId: 1,
      success: true,
      output: 'worked',
      durationMs: 500,
    });

    expect(solutionRepo.recordAttempt).toHaveBeenCalled();
    expect(synapseManager.strengthen).toHaveBeenCalledWith(
      { type: 'solution', id: 1 },
      { type: 'error', id: 10 },
      'solves',
      { outcome: 'success' },
    );
    expect(solutionRepo.update).toHaveBeenCalledWith(1, { confidence: 0.75 });
  });

  it('rateOutcome weakens synapse on failure', () => {
    solutionRepo.findForError.mockReturnValue([{ id: 1 }]);
    synapseManager.find.mockReturnValue({ id: 42, weight: 0.8 });
    solutionRepo.successRate.mockReturnValue(0.25);

    service.rateOutcome({
      errorId: 10,
      solutionId: 1,
      success: false,
    });

    expect(synapseManager.weaken).toHaveBeenCalledWith(42, 0.7);
    expect(solutionRepo.update).toHaveBeenCalledWith(1, { confidence: 0.25 });
  });

  it('rateOutcome links solution to error if not already linked', () => {
    // findForError returns no match for this solutionId
    solutionRepo.findForError.mockReturnValue([{ id: 99 }]);

    service.rateOutcome({
      errorId: 10,
      solutionId: 1,
      success: true,
    });

    expect(solutionRepo.linkToError).toHaveBeenCalledWith(10, 1);
  });

  it('findForError delegates to repository', () => {
    solutionRepo.findForError.mockReturnValue([{ id: 1 }, { id: 2 }]);

    const result = service.findForError(10);
    expect(solutionRepo.findForError).toHaveBeenCalledWith(10);
    expect(result).toHaveLength(2);
  });

  it('getById delegates to repository', () => {
    const result = service.getById(1);
    expect(solutionRepo.getById).toHaveBeenCalledWith(1);
    expect(result).toBeDefined();
  });

  it('successRate delegates to repository', () => {
    solutionRepo.successRate.mockReturnValue(0.85);
    expect(service.successRate(1)).toBe(0.85);
  });

  it('analyzeEfficiency returns aggregated stats', () => {
    solutionRepo.getAll.mockReturnValue([
      { id: 1, description: 'Sol A', success_count: 3, fail_count: 1 },
      { id: 2, description: 'Sol B', success_count: 0, fail_count: 0 },
    ]);
    solutionRepo.successRate.mockReturnValue(0.75);
    solutionRepo.getAttempts.mockReturnValue([]);

    const analysis = service.analyzeEfficiency();
    expect(analysis.successRateOverall).toBeGreaterThanOrEqual(0);
    expect(analysis.avgDurationMs).toBe(0);
    expect(analysis.totalAttempts).toBe(0);
    expect(analysis.slowSolutions).toHaveLength(0);
  });
});
