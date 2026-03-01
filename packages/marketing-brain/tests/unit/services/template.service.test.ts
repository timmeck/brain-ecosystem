import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TemplateService } from '../../../src/services/template.service.js';
import type { TemplateRepository } from '../../../src/db/repositories/template.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { ContentTemplate } from '../../../src/types/post.types.js';

// Mock the event bus
vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({ emit: vi.fn() }),
}));

function makeTemplate(overrides: Partial<ContentTemplate> = {}): ContentTemplate {
  return {
    id: 1,
    name: 'Thread Template',
    structure: 'Hook -> Body -> CTA',
    example: 'Example thread content',
    platform: 'x',
    avg_engagement: 0,
    use_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('TemplateService', () => {
  let service: TemplateService;
  let templateRepo: {
    create: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    listByPlatform: ReturnType<typeof vi.fn>;
    listAll: ReturnType<typeof vi.fn>;
    incrementUseCount: ReturnType<typeof vi.fn>;
    countAll: ReturnType<typeof vi.fn>;
  };
  let synapseManager: {
    strengthen: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    templateRepo = {
      create: vi.fn().mockReturnValue(1),
      getById: vi.fn(),
      search: vi.fn().mockReturnValue([]),
      listByPlatform: vi.fn().mockReturnValue([]),
      listAll: vi.fn().mockReturnValue([]),
      incrementUseCount: vi.fn(),
      countAll: vi.fn().mockReturnValue(0),
    };

    synapseManager = {
      strengthen: vi.fn(),
    };

    service = new TemplateService(
      templateRepo as unknown as TemplateRepository,
      synapseManager as unknown as SynapseManager,
    );
  });

  describe('create', () => {
    it('should create a template and return it', () => {
      const template = makeTemplate();
      templateRepo.getById.mockReturnValue(template);

      const result = service.create({ name: 'Thread Template', structure: 'Hook -> Body -> CTA' });

      expect(templateRepo.create).toHaveBeenCalled();
      expect(result).toEqual(template);
    });
  });

  describe('find', () => {
    it('should search templates by query', () => {
      const templates = [makeTemplate()];
      templateRepo.search.mockReturnValue(templates);

      const result = service.find('thread');

      expect(templateRepo.search).toHaveBeenCalledWith('thread', 5);
      expect(result).toEqual(templates);
    });

    it('should use custom limit', () => {
      service.find('video', 10);
      expect(templateRepo.search).toHaveBeenCalledWith('video', 10);
    });
  });

  describe('findByPlatform', () => {
    it('should list templates for a specific platform', () => {
      const templates = [makeTemplate()];
      templateRepo.listByPlatform.mockReturnValue(templates);

      const result = service.findByPlatform('x');

      expect(templateRepo.listByPlatform).toHaveBeenCalledWith('x', 10);
      expect(result).toEqual(templates);
    });
  });

  describe('useTemplate', () => {
    it('should increment use count and create synapse', () => {
      service.useTemplate(1, 10);

      expect(templateRepo.incrementUseCount).toHaveBeenCalledWith(1);
      expect(synapseManager.strengthen).toHaveBeenCalledWith(
        { type: 'template', id: 1 },
        { type: 'post', id: 10 },
        'generated_from',
      );
    });
  });

  describe('getById', () => {
    it('should return a template by id', () => {
      const template = makeTemplate({ id: 5 });
      templateRepo.getById.mockReturnValue(template);

      expect(service.getById(5)).toEqual(template);
    });

    it('should return undefined for non-existent template', () => {
      templateRepo.getById.mockReturnValue(undefined);
      expect(service.getById(999)).toBeUndefined();
    });
  });

  describe('listAll', () => {
    it('should list all templates', () => {
      const templates = [makeTemplate()];
      templateRepo.listAll.mockReturnValue(templates);

      expect(service.listAll()).toEqual(templates);
    });

    it('should pass limit to repository', () => {
      service.listAll(5);
      expect(templateRepo.listAll).toHaveBeenCalledWith(5);
    });
  });

  describe('getStats', () => {
    it('should return template statistics', () => {
      templateRepo.countAll.mockReturnValue(15);

      expect(service.getStats()).toEqual({ total: 15 });
    });
  });
});
