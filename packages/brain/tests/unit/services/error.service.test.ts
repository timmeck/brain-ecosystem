import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ErrorService } from '../../../src/services/error.service.js';

// Mock dependencies
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

vi.mock('../../../src/parsing/error-parser.js', () => ({
  parseError: vi.fn((output: string) => {
    if (output.includes('UNPARSEABLE')) return null;
    return {
      errorType: 'TypeError',
      message: output.split('\n')[0] ?? output,
      frames: [],
      sourceFile: 'test.ts',
      sourceLine: 10,
    };
  }),
}));

vi.mock('../../../src/matching/fingerprint.js', () => ({
  generateFingerprint: vi.fn(() => 'fp-mock-123'),
}));

vi.mock('../../../src/matching/error-matcher.js', () => ({
  matchError: vi.fn(() => []),
}));

function createMockErrorRepo() {
  return {
    create: vi.fn().mockReturnValue(1),
    getById: vi.fn().mockReturnValue({
      id: 1,
      project_id: 1,
      terminal_id: null,
      fingerprint: 'fp-mock-123',
      type: 'TypeError',
      message: 'test error',
      raw_output: 'TypeError: test error',
      context: null,
      file_path: 'test.ts',
      line_number: 10,
      column_number: null,
      occurrence_count: 1,
      first_seen: '2025-01-01T00:00:00Z',
      last_seen: '2025-01-01T00:00:00Z',
      resolved: 0,
      resolved_at: null,
    }),
    update: vi.fn(),
    delete: vi.fn(),
    findByFingerprint: vi.fn().mockReturnValue([]),
    findByProject: vi.fn().mockReturnValue([]),
    findUnresolved: vi.fn().mockReturnValue([]),
    countSince: vi.fn().mockReturnValue(0),
    search: vi.fn().mockReturnValue([]),
    incrementOccurrence: vi.fn(),
    createChain: vi.fn(),
    findChainChildren: vi.fn().mockReturnValue([]),
    findChainParents: vi.fn().mockReturnValue([]),
    findRecentByProject: vi.fn().mockReturnValue([]),
    findAll: vi.fn().mockReturnValue([]),
  };
}

function createMockProjectRepo() {
  return {
    findByName: vi.fn().mockReturnValue({ id: 1, name: 'test-project' }),
    create: vi.fn().mockReturnValue(1),
    getById: vi.fn().mockReturnValue({ id: 1, name: 'test-project' }),
    getAll: vi.fn().mockReturnValue([]),
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

describe('ErrorService', () => {
  let service: ErrorService;
  let errorRepo: ReturnType<typeof createMockErrorRepo>;
  let projectRepo: ReturnType<typeof createMockProjectRepo>;
  let synapseManager: ReturnType<typeof createMockSynapseManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    errorRepo = createMockErrorRepo();
    projectRepo = createMockProjectRepo();
    synapseManager = createMockSynapseManager();
    service = new ErrorService(errorRepo as any, projectRepo as any, synapseManager as any);
  });

  it('report creates a new error for unparseable output', () => {
    const result = service.report({
      project: 'test-project',
      errorOutput: 'UNPARSEABLE garbage output',
    });

    expect(result.errorId).toBe(1);
    expect(result.isNew).toBe(true);
    expect(result.matches).toHaveLength(0);
    expect(errorRepo.create).toHaveBeenCalled();
  });

  it('report increments occurrence for existing fingerprint', () => {
    errorRepo.findByFingerprint.mockReturnValue([{
      id: 42,
      project_id: 1,
      fingerprint: 'fp-mock-123',
      type: 'TypeError',
      message: 'old error',
      context: null,
      resolved: 0,
      occurrence_count: 3,
    }]);

    const result = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: old error',
    });

    expect(result.errorId).toBe(42);
    expect(result.isNew).toBe(false);
    expect(errorRepo.incrementOccurrence).toHaveBeenCalledWith(42);
    expect(synapseManager.strengthen).toHaveBeenCalled();
  });

  it('report creates a project if it does not exist', () => {
    projectRepo.findByName.mockReturnValue(undefined);

    service.report({
      project: 'new-project',
      errorOutput: 'TypeError: test',
    });

    expect(projectRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'new-project' })
    );
  });

  it('report creates synapse between error and project', () => {
    const result = service.report({
      project: 'test-project',
      errorOutput: 'TypeError: some error',
    });

    expect(synapseManager.strengthen).toHaveBeenCalledWith(
      { type: 'error', id: result.errorId },
      { type: 'project', id: 1 },
      'co_occurs',
    );
  });

  it('query delegates to search when search term is provided', () => {
    errorRepo.search.mockReturnValue([{ id: 1, type: 'TypeError', message: 'found' }]);

    const results = service.query({ search: 'TypeError' });
    expect(errorRepo.search).toHaveBeenCalledWith('TypeError');
    expect(results).toHaveLength(1);
  });

  it('query returns unresolved errors when resolved=false', () => {
    errorRepo.findUnresolved.mockReturnValue([{ id: 1 }, { id: 2 }]);

    const results = service.query({ resolved: false });
    expect(errorRepo.findUnresolved).toHaveBeenCalled();
    expect(results).toHaveLength(2);
  });

  it('query returns errors by project when projectId is provided', () => {
    errorRepo.findByProject.mockReturnValue([{ id: 5 }]);

    const results = service.query({ projectId: 1 });
    expect(errorRepo.findByProject).toHaveBeenCalledWith(1);
    expect(results).toHaveLength(1);
  });

  it('query returns all errors with default limit', () => {
    service.query({});
    expect(errorRepo.findAll).toHaveBeenCalledWith(100);
  });

  it('resolve updates error as resolved', () => {
    service.resolve(1, 10);
    expect(errorRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({
      resolved: 1,
    }));
  });

  it('getById delegates to repository', () => {
    service.getById(1);
    expect(errorRepo.getById).toHaveBeenCalledWith(1);
  });

  it('getErrorChain returns parents and children', () => {
    errorRepo.findChainParents.mockReturnValue([{ id: 10 }]);
    errorRepo.findChainChildren.mockReturnValue([{ id: 20 }]);

    const chain = service.getErrorChain(1);
    expect(chain.parents).toHaveLength(1);
    expect(chain.children).toHaveLength(1);
  });
});
