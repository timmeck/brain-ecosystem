import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudienceService } from '../../../src/services/audience.service.js';
import type { AudienceRepository } from '../../../src/db/repositories/audience.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { Audience } from '../../../src/types/post.types.js';

function makeAudience(overrides: Partial<Audience> = {}): Audience {
  return {
    id: 1,
    name: 'Tech Enthusiasts',
    platform: 'x',
    demographics: '25-35',
    interests: 'technology',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AudienceService', () => {
  let service: AudienceService;
  let audienceRepo: {
    create: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    getByName: ReturnType<typeof vi.fn>;
    listAll: ReturnType<typeof vi.fn>;
    countAll: ReturnType<typeof vi.fn>;
  };
  let synapseManager: {
    strengthen: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    audienceRepo = {
      create: vi.fn().mockReturnValue(1),
      getById: vi.fn(),
      getByName: vi.fn(),
      listAll: vi.fn().mockReturnValue([]),
      countAll: vi.fn().mockReturnValue(0),
    };

    synapseManager = {
      strengthen: vi.fn(),
    };

    service = new AudienceService(
      audienceRepo as unknown as AudienceRepository,
      synapseManager as unknown as SynapseManager,
    );
  });

  describe('create', () => {
    it('should create a new audience when name does not exist', () => {
      const audience = makeAudience();
      audienceRepo.getByName.mockReturnValue(undefined);
      audienceRepo.getById.mockReturnValue(audience);

      const result = service.create({ name: 'Tech Enthusiasts', platform: 'x' });

      expect(audienceRepo.create).toHaveBeenCalled();
      expect(result).toEqual(audience);
    });

    it('should return existing audience when name already exists', () => {
      const existing = makeAudience({ id: 5, name: 'Existing' });
      audienceRepo.getByName.mockReturnValue(existing);

      const result = service.create({ name: 'Existing' });

      expect(audienceRepo.create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });
  });

  describe('linkToPost', () => {
    it('should create a synapse between post and audience', () => {
      service.linkToPost(10, 20);

      expect(synapseManager.strengthen).toHaveBeenCalledWith(
        { type: 'post', id: 20 },
        { type: 'audience', id: 10 },
        'engages_with',
      );
    });
  });

  describe('getById', () => {
    it('should return an audience by id', () => {
      const audience = makeAudience({ id: 7 });
      audienceRepo.getById.mockReturnValue(audience);

      expect(service.getById(7)).toEqual(audience);
    });

    it('should return undefined for non-existent audience', () => {
      audienceRepo.getById.mockReturnValue(undefined);
      expect(service.getById(999)).toBeUndefined();
    });
  });

  describe('listAll', () => {
    it('should return all audiences', () => {
      const audiences = [makeAudience({ id: 1 }), makeAudience({ id: 2, name: 'Other' })];
      audienceRepo.listAll.mockReturnValue(audiences);

      expect(service.listAll()).toEqual(audiences);
    });
  });

  describe('getStats', () => {
    it('should return audience statistics', () => {
      audienceRepo.countAll.mockReturnValue(42);

      const stats = service.getStats();
      expect(stats).toEqual({ total: 42 });
    });
  });
});
