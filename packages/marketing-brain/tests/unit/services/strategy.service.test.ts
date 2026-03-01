import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StrategyService } from '../../../src/services/strategy.service.js';
import type { StrategyRepository } from '../../../src/db/repositories/strategy.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { Strategy } from '../../../src/types/post.types.js';

// Mock the event bus
vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({ emit: vi.fn() }),
}));

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: 1,
    post_id: null,
    description: 'Use short-form video content',
    approach: 'Focus on TikTok-style videos',
    outcome: 'Increased engagement',
    confidence: 0.5,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('StrategyService', () => {
  let service: StrategyService;
  let strategyRepo: {
    create: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    topByConfidence: ReturnType<typeof vi.fn>;
    listAll: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    countAll: ReturnType<typeof vi.fn>;
  };
  let synapseManager: {
    strengthen: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    strategyRepo = {
      create: vi.fn().mockReturnValue(1),
      getById: vi.fn(),
      search: vi.fn().mockReturnValue([]),
      topByConfidence: vi.fn().mockReturnValue([]),
      listAll: vi.fn().mockReturnValue([]),
      update: vi.fn(),
      countAll: vi.fn().mockReturnValue(0),
    };

    synapseManager = {
      strengthen: vi.fn(),
    };

    service = new StrategyService(
      strategyRepo as unknown as StrategyRepository,
      synapseManager as unknown as SynapseManager,
    );
  });

  describe('report', () => {
    it('should create a strategy and return it', () => {
      const strategy = makeStrategy();
      strategyRepo.getById.mockReturnValue(strategy);

      const result = service.report({ description: 'Use short-form video content' });

      expect(strategyRepo.create).toHaveBeenCalled();
      expect(result).toEqual(strategy);
    });

    it('should create synapse when strategy has a post_id', () => {
      const strategy = makeStrategy({ post_id: 10 });
      strategyRepo.getById.mockReturnValue(strategy);

      service.report({ description: 'Post strategy', post_id: 10 });

      expect(synapseManager.strengthen).toHaveBeenCalledWith(
        { type: 'strategy', id: 1 },
        { type: 'post', id: 10 },
        'improves',
      );
    });

    it('should not create synapse when strategy has no post_id', () => {
      const strategy = makeStrategy({ post_id: null });
      strategyRepo.getById.mockReturnValue(strategy);

      service.report({ description: 'General strategy' });

      expect(synapseManager.strengthen).not.toHaveBeenCalled();
    });
  });

  describe('suggest', () => {
    it('should search strategies by query', () => {
      const strategies = [makeStrategy()];
      strategyRepo.search.mockReturnValue(strategies);

      const result = service.suggest('video');

      expect(strategyRepo.search).toHaveBeenCalledWith('video', 5);
      expect(result).toEqual(strategies);
    });

    it('should use custom limit', () => {
      service.suggest('engagement', 20);
      expect(strategyRepo.search).toHaveBeenCalledWith('engagement', 20);
    });
  });

  describe('getTopStrategies', () => {
    it('should return top strategies by confidence', () => {
      const strategies = [makeStrategy({ confidence: 0.9 })];
      strategyRepo.topByConfidence.mockReturnValue(strategies);

      const result = service.getTopStrategies();

      expect(strategyRepo.topByConfidence).toHaveBeenCalledWith(0.7, 10);
      expect(result).toEqual(strategies);
    });

    it('should use custom parameters', () => {
      service.getTopStrategies(0.5, 5);
      expect(strategyRepo.topByConfidence).toHaveBeenCalledWith(0.5, 5);
    });
  });

  describe('getById', () => {
    it('should return a strategy by id', () => {
      const strategy = makeStrategy({ id: 5 });
      strategyRepo.getById.mockReturnValue(strategy);

      expect(service.getById(5)).toEqual(strategy);
    });

    it('should return undefined for non-existent strategy', () => {
      strategyRepo.getById.mockReturnValue(undefined);
      expect(service.getById(999)).toBeUndefined();
    });
  });

  describe('listAll', () => {
    it('should list all strategies', () => {
      const strategies = [makeStrategy()];
      strategyRepo.listAll.mockReturnValue(strategies);

      expect(service.listAll()).toEqual(strategies);
    });
  });

  describe('updateConfidence', () => {
    it('should update strategy confidence', () => {
      service.updateConfidence(1, 0.85);

      expect(strategyRepo.update).toHaveBeenCalledWith(1, { confidence: 0.85 });
    });
  });

  describe('getStats', () => {
    it('should return strategy statistics', () => {
      strategyRepo.countAll.mockReturnValue(25);

      expect(service.getStats()).toEqual({ total: 25 });
    });
  });
});
