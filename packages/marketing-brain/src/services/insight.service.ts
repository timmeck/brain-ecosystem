import type { InsightRepository } from '../db/repositories/insight.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { Insight, InsightCreate } from '../types/post.types.js';
import { getEventBus } from '../utils/events.js';

export class InsightService {
  constructor(
    private insightRepo: InsightRepository,
    private synapseManager: SynapseManager,
  ) {}

  create(data: InsightCreate): Insight {
    const id = this.insightRepo.create(data);
    const insight = this.insightRepo.getById(id)!;

    if (data.campaign_id) {
      this.synapseManager.strengthen(
        { type: 'insight', id },
        { type: 'campaign', id: data.campaign_id },
        'informs',
      );
    }

    getEventBus().emit('insight:created', { insightId: id, type: data.type });
    return insight;
  }

  listActive(limit?: number): Insight[] {
    return this.insightRepo.listActive(limit);
  }

  listByType(type: string, limit?: number): Insight[] {
    return this.insightRepo.listByType(type, limit);
  }

  listByCampaign(campaignId: number): Insight[] {
    return this.insightRepo.listByCampaign(campaignId);
  }

  deactivate(id: number): void {
    this.insightRepo.deactivate(id);
  }

  expireOld(): number {
    return this.insightRepo.expireOld();
  }

  getStats() {
    return {
      active: this.insightRepo.countActive(),
      total: this.insightRepo.countAll(),
    };
  }
}
