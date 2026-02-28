import type { TemplateRepository } from '../db/repositories/template.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { ContentTemplate, ContentTemplateCreate } from '../types/post.types.js';
import { getEventBus } from '../utils/events.js';

export class TemplateService {
  constructor(
    private templateRepo: TemplateRepository,
    private synapseManager: SynapseManager,
  ) {}

  create(data: ContentTemplateCreate): ContentTemplate {
    const id = this.templateRepo.create(data);
    const template = this.templateRepo.getById(id)!;

    getEventBus().emit('template:created', { templateId: id, platform: data.platform ?? 'any' });
    return template;
  }

  find(query: string, limit: number = 5): ContentTemplate[] {
    return this.templateRepo.search(query, limit);
  }

  findByPlatform(platform: string, limit: number = 10): ContentTemplate[] {
    return this.templateRepo.listByPlatform(platform, limit);
  }

  useTemplate(templateId: number, postId: number): void {
    this.templateRepo.incrementUseCount(templateId);
    this.synapseManager.strengthen(
      { type: 'template', id: templateId },
      { type: 'post', id: postId },
      'generated_from',
    );
  }

  getById(id: number): ContentTemplate | undefined {
    return this.templateRepo.getById(id);
  }

  listAll(limit?: number): ContentTemplate[] {
    return this.templateRepo.listAll(limit);
  }

  getStats() {
    return {
      total: this.templateRepo.countAll(),
    };
  }
}
