import type { CampaignRepository } from '../db/repositories/campaign.repository.js';
import type { PostRepository } from '../db/repositories/post.repository.js';
import type { EngagementRepository } from '../db/repositories/engagement.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { Campaign, CampaignCreate } from '../types/post.types.js';
import { getEventBus } from '../utils/events.js';

export class CampaignService {
  constructor(
    private campaignRepo: CampaignRepository,
    private postRepo: PostRepository,
    private engagementRepo: EngagementRepository,
    private synapseManager: SynapseManager,
  ) {}

  create(data: CampaignCreate): Campaign {
    const existing = this.campaignRepo.getByName(data.name);
    if (existing) return existing;

    const id = this.campaignRepo.create(data);
    const campaign = this.campaignRepo.getById(id)!;

    getEventBus().emit('campaign:created', { campaignId: id, name: data.name });
    return campaign;
  }

  getById(id: number): Campaign | undefined {
    return this.campaignRepo.getById(id);
  }

  getByName(name: string): Campaign | undefined {
    return this.campaignRepo.getByName(name);
  }

  listCampaigns(): Campaign[] {
    return this.campaignRepo.listAll();
  }

  getStats(campaignId: number) {
    const campaign = this.campaignRepo.getById(campaignId);
    if (!campaign) return null;

    const posts = this.postRepo.listByCampaign(campaignId, 1000);
    let totalLikes = 0, totalComments = 0, totalShares = 0, totalImpressions = 0;

    for (const post of posts) {
      const eng = this.engagementRepo.getLatestByPost(post.id);
      if (eng) {
        totalLikes += eng.likes;
        totalComments += eng.comments;
        totalShares += eng.shares;
        totalImpressions += eng.impressions;
      }
    }

    return {
      campaign,
      postCount: posts.length,
      totalLikes,
      totalComments,
      totalShares,
      totalImpressions,
      avgEngagement: posts.length > 0
        ? (totalLikes + totalComments * 3 + totalShares * 5) / posts.length
        : 0,
    };
  }

  update(id: number, data: Partial<Campaign>): boolean {
    return this.campaignRepo.update(id, data);
  }

  crossPromote(campaignA: number, campaignB: number): void {
    this.synapseManager.strengthen(
      { type: 'campaign', id: campaignA },
      { type: 'campaign', id: campaignB },
      'cross_promotes',
    );
  }
}
