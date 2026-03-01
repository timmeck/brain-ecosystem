import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { SynapseRepository, SynapseRecord } from '../../../src/db/repositories/synapse.repository.js';
import type { CalibrationConfig } from '../../../src/types/config.types.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeCal(overrides: Partial<CalibrationConfig> = {}): CalibrationConfig {
  return {
    learningRate: 0.1,
    weakenPenalty: 0.8,
    decayHalfLifeDays: 30,
    patternExtractionInterval: 60000,
    patternMinSamples: 5,
    patternWilsonThreshold: 0.55,
    wilsonZ: 1.96,
    spreadingActivationDecay: 0.6,
    spreadingActivationThreshold: 0.05,
    minActivationsForWeight: 3,
    minOutcomesForWeights: 10,
    ...overrides,
  };
}

function createMockRepo(existingSynapses: SynapseRecord[] = []): Record<string, ReturnType<typeof vi.fn>> {
  return {
    getAll: vi.fn().mockReturnValue(existingSynapses),
    upsert: vi.fn(),
    getById: vi.fn(),
    count: vi.fn().mockReturnValue(existingSynapses.length),
    updateWeight: vi.fn(),
    delete: vi.fn(),
    getByMinWeight: vi.fn(),
    getStrongest: vi.fn(),
  };
}

describe('SynapseManager', () => {
  let manager: SynapseManager;
  let mockRepo: Record<string, ReturnType<typeof vi.fn>>;
  let cal: CalibrationConfig;

  beforeEach(() => {
    cal = makeCal();
    mockRepo = createMockRepo();
    manager = new SynapseManager(mockRepo as unknown as SynapseRepository, cal);
  });

  describe('constructor', () => {
    it('should load existing synapses into cache', () => {
      const existing: SynapseRecord[] = [
        { id: 'syn_fp1', fingerprint: 'fp1', weight: 0.7, wins: 5, losses: 2, activations: 7, total_profit: 3.5, last_activated: '2026-01-01', created_at: '2026-01-01' },
      ];
      const repo = createMockRepo(existing);
      const mgr = new SynapseManager(repo as unknown as SynapseRepository, cal);

      expect(repo.getAll).toHaveBeenCalled();
      expect(mgr.count()).toBe(1);
    });
  });

  describe('getOrCreate', () => {
    it('should create a new synapse with default values', () => {
      const syn = manager.getOrCreate('neutral|neutral|flat|low');

      expect(syn.id).toBe('syn_neutral|neutral|flat|low');
      expect(syn.fingerprint).toBe('neutral|neutral|flat|low');
      expect(syn.weight).toBe(0.5);
      expect(syn.wins).toBe(0);
      expect(syn.losses).toBe(0);
    });

    it('should return existing synapse if already cached', () => {
      const first = manager.getOrCreate('fp1');
      first.weight = 0.9;

      const second = manager.getOrCreate('fp1');
      expect(second.weight).toBe(0.9);
    });
  });

  describe('get / getByFingerprint', () => {
    it('should return undefined for unknown id', () => {
      expect(manager.get('unknown')).toBeUndefined();
    });

    it('should return synapse by id', () => {
      manager.getOrCreate('fp1');
      const syn = manager.get('syn_fp1');
      expect(syn).toBeDefined();
      expect(syn!.fingerprint).toBe('fp1');
    });

    it('should return synapse by fingerprint', () => {
      manager.getOrCreate('fp1');
      const syn = manager.getByFingerprint('fp1');
      expect(syn).toBeDefined();
      expect(syn!.id).toBe('syn_fp1');
    });
  });

  describe('recordWin', () => {
    it('should strengthen synapse and persist', () => {
      const syn = manager.recordWin('fp1', 2.5);

      expect(syn.wins).toBe(1);
      expect(syn.weight).toBeGreaterThan(0.5);
      expect(syn.total_profit).toBeCloseTo(2.5);
      expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
    });

    it('should accumulate profit across wins', () => {
      manager.recordWin('fp1', 2.0);
      const syn = manager.recordWin('fp1', 3.0);

      expect(syn.total_profit).toBeCloseTo(5.0);
      expect(syn.wins).toBe(2);
    });
  });

  describe('recordLoss', () => {
    it('should weaken synapse and persist', () => {
      const syn = manager.recordLoss('fp1', -1.5);

      expect(syn.losses).toBe(1);
      expect(syn.weight).toBeLessThan(0.5);
      expect(syn.total_profit).toBeCloseTo(-1.5);
      expect(mockRepo.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('runDecay', () => {
    it('should decay old synapses and persist changes', () => {
      // Create a synapse with old last_activated
      const syn = manager.getOrCreate('old_fp');
      syn.last_activated = new Date(Date.now() - 60 * 86400000).toISOString(); // 60 days ago
      syn.weight = 0.8;

      const decayed = manager.runDecay();

      expect(decayed).toBe(1);
      expect(syn.weight).toBeLessThan(0.8);
      expect(mockRepo.upsert).toHaveBeenCalled();
    });

    it('should not decay recently activated synapses', () => {
      manager.getOrCreate('recent_fp'); // Just created, last_activated is now

      const decayed = manager.runDecay();

      expect(decayed).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return all cached synapses', () => {
      manager.getOrCreate('fp1');
      manager.getOrCreate('fp2');

      const all = manager.getAll();
      expect(all).toHaveLength(2);
    });
  });

  describe('count', () => {
    it('should return the cache size', () => {
      expect(manager.count()).toBe(0);
      manager.getOrCreate('fp1');
      expect(manager.count()).toBe(1);
    });
  });

  describe('getStrongest', () => {
    it('should return synapses sorted by weight descending', () => {
      const s1 = manager.getOrCreate('weak');
      s1.weight = 0.2;
      const s2 = manager.getOrCreate('strong');
      s2.weight = 0.9;
      const s3 = manager.getOrCreate('mid');
      s3.weight = 0.5;

      const strongest = manager.getStrongest(2);
      expect(strongest).toHaveLength(2);
      expect(strongest[0].weight).toBe(0.9);
      expect(strongest[1].weight).toBe(0.5);
    });
  });

  describe('getAvgWeight', () => {
    it('should return 0 when cache is empty', () => {
      expect(manager.getAvgWeight()).toBe(0);
    });

    it('should calculate average weight correctly', () => {
      const s1 = manager.getOrCreate('a');
      s1.weight = 0.4;
      const s2 = manager.getOrCreate('b');
      s2.weight = 0.6;

      expect(manager.getAvgWeight()).toBeCloseTo(0.5);
    });
  });

  describe('updateCalibration', () => {
    it('should update calibration config used for subsequent operations', () => {
      const newCal = makeCal({ learningRate: 0.2 });
      manager.updateCalibration(newCal);

      // recordWin should use the new learning rate
      const syn = manager.recordWin('fp1', 1.0);

      // With lr 0.2: weight += (1.0 - 0.5) * 0.2 = 0.6
      expect(syn.weight).toBeCloseTo(0.6);
    });
  });

  describe('clear', () => {
    it('should empty the cache', () => {
      manager.getOrCreate('fp1');
      manager.getOrCreate('fp2');
      expect(manager.count()).toBe(2);

      manager.clear();
      expect(manager.count()).toBe(0);
    });
  });
});
