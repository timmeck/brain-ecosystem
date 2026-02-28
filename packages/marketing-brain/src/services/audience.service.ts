import type { AudienceRepository } from '../db/repositories/audience.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { Audience } from '../types/post.types.js';

export class AudienceService {
  constructor(
    private audienceRepo: AudienceRepository,
    private synapseManager: SynapseManager,
  ) {}

  create(data: { name: string; platform?: string; demographics?: string; interests?: string }): Audience {
    const existing = this.audienceRepo.getByName(data.name);
    if (existing) return existing;

    const id = this.audienceRepo.create(data);
    return this.audienceRepo.getById(id)!;
  }

  linkToPost(audienceId: number, postId: number): void {
    this.synapseManager.strengthen(
      { type: 'post', id: postId },
      { type: 'audience', id: audienceId },
      'engages_with',
    );
  }

  getById(id: number): Audience | undefined {
    return this.audienceRepo.getById(id);
  }

  listAll(): Audience[] {
    return this.audienceRepo.listAll();
  }

  getStats() {
    return {
      total: this.audienceRepo.countAll(),
    };
  }
}
