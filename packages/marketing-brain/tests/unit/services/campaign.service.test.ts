import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignService } from '../../../src/services/campaign.service.js';
import type { CampaignRepository } from '../../../src/db/repositories/campaign.repository.js';
import type { PostRepository } from '../../../src/db/repositories/post.repository.js';
import type { EngagementRepository } from '../../../src/db/repositories/engagement.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { Campaign, CampaignCreate, Post, Engagement } from '../../../src/types/post.types.js';

// Mock the event bus
vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({ emit: vi.fn() }),
}));

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    name: 'Test Campaign',
    brand: null,
    goal: null,
    platform: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    campaign_id: 1,
    platform: 'x',
    content: 'Test post',
    format: 'text',
    hashtags: null,
    url: null,
    published_at: null,
    fingerprint: 'abc123',
    status: 'published',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeEngagement(overrides: Partial<Engagement> = {}): Engagement {
  return {
    id: 1,
    post_id: 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    likes: 10,
    comments: 5,
    shares: 3,
    impressions: 1000,
    clicks: 50,
    saves: 2,
    reach: 800,
    ...overrides,
  };
}

describe('CampaignService', () => {
  let service: CampaignService;
  let campaignRepo: {
    getByName: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    listAll: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let postRepo: {
    listByCampaign: ReturnType<typeof vi.fn>;
  };
  let engagementRepo: {
    getLatestByPost: ReturnType<typeof vi.fn>;
  };
  let synapseManager: {
    strengthen: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    campaignRepo = {
      getByName: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      listAll: vi.fn(),
      update: vi.fn(),
    };

    postRepo = {
      listByCampaign: vi.fn(),
    };

    engagementRepo = {
      getLatestByPost: vi.fn(),
    };

    synapseManager = {
      strengthen: vi.fn(),
    };

    service = new CampaignService(
      campaignRepo as unknown as CampaignRepository,
      postRepo as unknown as PostRepository,
      engagementRepo as unknown as EngagementRepository,
      synapseManager as unknown as SynapseManager,
    );
  });

  describe('create', () => {
    it('should create a new campaign and return it', () => {
      const data: CampaignCreate = { name: 'Launch Campaign', brand: 'Acme' };
      const campaign = makeCampaign({ id: 5, name: 'Launch Campaign', brand: 'Acme' });

      campaignRepo.getByName.mockReturnValue(undefined);
      campaignRepo.create.mockReturnValue(5);
      campaignRepo.getById.mockReturnValue(campaign);

      const result = service.create(data);

      expect(result).toEqual(campaign);
      expect(campaignRepo.create).toHaveBeenCalledWith(data);
      expect(campaignRepo.getById).toHaveBeenCalledWith(5);
    });

    it('should return existing campaign when name already exists', () => {
      const existing = makeCampaign({ id: 3, name: 'Existing' });
      campaignRepo.getByName.mockReturnValue(existing);

      const result = service.create({ name: 'Existing' });

      expect(result).toEqual(existing);
      expect(campaignRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('should return a campaign by id', () => {
      const campaign = makeCampaign({ id: 7 });
      campaignRepo.getById.mockReturnValue(campaign);

      expect(service.getById(7)).toEqual(campaign);
      expect(campaignRepo.getById).toHaveBeenCalledWith(7);
    });

    it('should return undefined for non-existent campaign', () => {
      campaignRepo.getById.mockReturnValue(undefined);

      expect(service.getById(999)).toBeUndefined();
    });
  });

  describe('getByName', () => {
    it('should return a campaign by name', () => {
      const campaign = makeCampaign({ name: 'Product Launch' });
      campaignRepo.getByName.mockReturnValue(campaign);

      expect(service.getByName('Product Launch')).toEqual(campaign);
      expect(campaignRepo.getByName).toHaveBeenCalledWith('Product Launch');
    });

    it('should return undefined when name does not exist', () => {
      campaignRepo.getByName.mockReturnValue(undefined);

      expect(service.getByName('Nonexistent')).toBeUndefined();
    });
  });

  describe('listCampaigns', () => {
    it('should return all campaigns', () => {
      const campaigns = [makeCampaign({ id: 1 }), makeCampaign({ id: 2 })];
      campaignRepo.listAll.mockReturnValue(campaigns);

      expect(service.listCampaigns()).toEqual(campaigns);
      expect(campaignRepo.listAll).toHaveBeenCalled();
    });

    it('should return empty array when no campaigns exist', () => {
      campaignRepo.listAll.mockReturnValue([]);

      expect(service.listCampaigns()).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return null when campaign does not exist', () => {
      campaignRepo.getById.mockReturnValue(undefined);

      expect(service.getStats(999)).toBeNull();
    });

    it('should calculate aggregate stats for a campaign with posts', () => {
      const campaign = makeCampaign({ id: 1 });
      const posts = [
        makePost({ id: 10 }),
        makePost({ id: 20 }),
      ];
      const eng1 = makeEngagement({ post_id: 10, likes: 100, comments: 10, shares: 5, impressions: 5000 });
      const eng2 = makeEngagement({ post_id: 20, likes: 200, comments: 20, shares: 10, impressions: 10000 });

      campaignRepo.getById.mockReturnValue(campaign);
      postRepo.listByCampaign.mockReturnValue(posts);
      engagementRepo.getLatestByPost.mockImplementation((postId: number) => {
        if (postId === 10) return eng1;
        if (postId === 20) return eng2;
        return undefined;
      });

      const stats = service.getStats(1);

      expect(stats).not.toBeNull();
      expect(stats!.campaign).toEqual(campaign);
      expect(stats!.postCount).toBe(2);
      expect(stats!.totalLikes).toBe(300);
      expect(stats!.totalComments).toBe(30);
      expect(stats!.totalShares).toBe(15);
      expect(stats!.totalImpressions).toBe(15000);
      // avgEngagement = (likes + comments*3 + shares*5) / postCount
      // = (300 + 30*3 + 15*5) / 2 = (300 + 90 + 75) / 2 = 232.5
      expect(stats!.avgEngagement).toBe(232.5);
    });

    it('should handle campaign with no posts', () => {
      const campaign = makeCampaign({ id: 1 });

      campaignRepo.getById.mockReturnValue(campaign);
      postRepo.listByCampaign.mockReturnValue([]);

      const stats = service.getStats(1);

      expect(stats!.postCount).toBe(0);
      expect(stats!.totalLikes).toBe(0);
      expect(stats!.avgEngagement).toBe(0);
    });

    it('should handle posts without engagement data', () => {
      const campaign = makeCampaign({ id: 1 });
      const posts = [makePost({ id: 10 })];

      campaignRepo.getById.mockReturnValue(campaign);
      postRepo.listByCampaign.mockReturnValue(posts);
      engagementRepo.getLatestByPost.mockReturnValue(undefined);

      const stats = service.getStats(1);

      expect(stats!.postCount).toBe(1);
      expect(stats!.totalLikes).toBe(0);
      expect(stats!.totalComments).toBe(0);
      expect(stats!.totalShares).toBe(0);
      expect(stats!.totalImpressions).toBe(0);
      // avgEngagement = (0 + 0 + 0) / 1 = 0
      expect(stats!.avgEngagement).toBe(0);
    });
  });

  describe('update', () => {
    it('should delegate to campaignRepo.update', () => {
      campaignRepo.update.mockReturnValue(true);

      const result = service.update(1, { name: 'Updated Name' });

      expect(result).toBe(true);
      expect(campaignRepo.update).toHaveBeenCalledWith(1, { name: 'Updated Name' });
    });

    it('should return false when campaign does not exist', () => {
      campaignRepo.update.mockReturnValue(false);

      const result = service.update(999, { name: 'Nope' });

      expect(result).toBe(false);
    });
  });

  describe('crossPromote', () => {
    it('should strengthen a synapse between two campaigns', () => {
      service.crossPromote(1, 2);

      expect(synapseManager.strengthen).toHaveBeenCalledWith(
        { type: 'campaign', id: 1 },
        { type: 'campaign', id: 2 },
        'cross_promotes',
      );
    });
  });
});
