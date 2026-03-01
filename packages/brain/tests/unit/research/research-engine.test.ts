import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResearchEngine } from '../../../src/research/research-engine.js';
import type { ResearchConfig } from '../../../src/types/config.types.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock all sub-analyzers
vi.mock('../../../src/research/trend-analyzer.js', () => ({
  TrendAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockReturnValue(2),
  })),
}));

vi.mock('../../../src/research/gap-analyzer.js', () => ({
  GapAnalyzer: vi.fn().mockImplementation(() => ({
    analyze: vi.fn().mockReturnValue(1),
  })),
}));

vi.mock('../../../src/research/synergy-detector.js', () => ({
  SynergyDetector: vi.fn().mockImplementation(() => ({
    detect: vi.fn().mockReturnValue(3),
  })),
}));

vi.mock('../../../src/research/template-extractor.js', () => ({
  TemplateExtractor: vi.fn().mockImplementation(() => ({
    extract: vi.fn().mockReturnValue(1),
  })),
}));

vi.mock('../../../src/research/insight-generator.js', () => ({
  InsightGenerator: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockReturnValue(2),
  })),
}));

function createMockConfig(): ResearchConfig {
  return {
    intervalMs: 60000,
    initialDelayMs: 0,
    minDataPoints: 5,
    trendWindowDays: 7,
    gapMinOccurrences: 3,
    synergyMinWeight: 0.7,
    templateMinAdaptations: 2,
    insightExpiryDays: 14,
  };
}

function createMockInsightRepo() {
  return {
    create: vi.fn().mockReturnValue(1),
    getById: vi.fn(),
    findActive: vi.fn().mockReturnValue([]),
    findByType: vi.fn().mockReturnValue([]),
    expire: vi.fn().mockReturnValue(0),
  };
}

function createMockSynapseManager() {
  return {
    runDecay: vi.fn().mockReturnValue({ decayed: 0, pruned: 0 }),
    strengthen: vi.fn(),
    weaken: vi.fn(),
  };
}

describe('ResearchEngine', () => {
  let engine: ResearchEngine;
  let config: ResearchConfig;
  let insightRepo: ReturnType<typeof createMockInsightRepo>;
  let synapseManager: ReturnType<typeof createMockSynapseManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    config = createMockConfig();
    insightRepo = createMockInsightRepo();
    synapseManager = createMockSynapseManager();

    engine = new ResearchEngine(
      config,
      {} as any, // errorRepo
      {} as any, // solutionRepo
      {} as any, // projectRepo
      {} as any, // codeModuleRepo
      {} as any, // synapseRepo
      insightRepo as any,
      synapseManager as any,
    );
  });

  it('runCycle returns a valid result structure', () => {
    const result = engine.runCycle();

    expect(result).toHaveProperty('insightsGenerated');
    expect(result).toHaveProperty('patternsFound');
    expect(result).toHaveProperty('correlationsFound');
    expect(result).toHaveProperty('duration');
  });

  it('runCycle aggregates insights from all phases', () => {
    const result = engine.runCycle();

    // trends: 2 insights + 2 patterns, gaps: 1 insight, synergies: 3 insights + 3 correlations
    // templates: 1 insight + 1 pattern, generator: 2 insights
    expect(result.insightsGenerated).toBe(2 + 1 + 3 + 1 + 2);
    expect(result.patternsFound).toBe(2 + 1); // trends + templates
    expect(result.correlationsFound).toBe(3); // synergies
  });

  it('runCycle runs synapse decay', () => {
    engine.runCycle();
    expect(synapseManager.runDecay).toHaveBeenCalled();
  });

  it('runCycle expires old insights', () => {
    engine.runCycle();
    expect(insightRepo.expire).toHaveBeenCalled();
  });

  it('runCycle reports expired insights when there are some', () => {
    insightRepo.expire.mockReturnValue(5);
    engine.runCycle();
    expect(insightRepo.expire).toHaveBeenCalled();
  });

  it('runCycle has a non-negative duration', () => {
    const result = engine.runCycle();
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('runCycle can be called multiple times', () => {
    const result1 = engine.runCycle();
    const result2 = engine.runCycle();

    expect(result1.insightsGenerated).toBe(result2.insightsGenerated);
  });
});
