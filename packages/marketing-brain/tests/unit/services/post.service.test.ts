import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostService } from '../../../src/services/post.service.js';
import type { PostRepository } from '../../../src/db/repositories/post.repository.js';
import type { EngagementRepository } from '../../../src/db/repositories/engagement.repository.js';
import type { SynapseManager } from '../../../src/synapses/synapse-manager.js';
import type { Post, PostCreate, EngagementCreate } from '../../../src/types/post.types.js';

// Mock the event bus
vi.mock('../../../src/utils/events.js', () => ({
  getEventBus: () => ({ emit: vi.fn() }),
}));

// Mock sha256 to return a predictable fingerprint
vi.mock('../../../src/utils/hash.js', () => ({
  sha256: (input: string) => `hash_${input}`,
}));

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    campaign_id: null,
    platform: 'x',
    content: 'Test post content',
    format: 'text',
    hashtags: null,
    url: null,
    published_at: null,
    fingerprint: 'hash_x:Test post content',
    status: 'draft',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('PostService', () => {
  let service: PostService;
  let postRepo: {
    getByFingerprint: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    listAll: ReturnType<typeof vi.fn>;
    listByPlatform: ReturnType<typeof vi.fn>;
    listByCampaign: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    countAll: ReturnType<typeof vi.fn>;
    countByPlatform: ReturnType<typeof vi.fn>;
    countByStatus: ReturnType<typeof vi.fn>;
  };
  let engagementRepo: {
    create: ReturnType<typeof vi.fn>;
    topPosts: ReturnType<typeof vi.fn>;
    getLatestByPost: ReturnType<typeof vi.fn>;
    listByPost: ReturnType<typeof vi.fn>;
    avgByPlatform: ReturnType<typeof vi.fn>;
  };
  let synapseManager: {
    strengthen: ReturnType<typeof vi.fn>;
    activate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    postRepo = {
      getByFingerprint: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      listAll: vi.fn(),
      listByPlatform: vi.fn(),
      listByCampaign: vi.fn(),
      search: vi.fn(),
      countAll: vi.fn(),
      countByPlatform: vi.fn(),
      countByStatus: vi.fn(),
    };

    engagementRepo = {
      create: vi.fn(),
      topPosts: vi.fn(),
      getLatestByPost: vi.fn(),
      listByPost: vi.fn(),
      avgByPlatform: vi.fn(),
    };

    synapseManager = {
      strengthen: vi.fn(),
      activate: vi.fn(),
    };

    service = new PostService(
      postRepo as unknown as PostRepository,
      engagementRepo as unknown as EngagementRepository,
      synapseManager as unknown as SynapseManager,
    );
  });

  describe('report', () => {
    it('should create a new post when no existing fingerprint matches', () => {
      const data: PostCreate = { platform: 'x', content: 'Test post content' };
      const post = makePost();

      postRepo.getByFingerprint.mockReturnValue(undefined);
      postRepo.create.mockReturnValue(1);
      postRepo.getById.mockReturnValue(post);

      const result = service.report(data);

      expect(result.isNew).toBe(true);
      expect(result.post).toEqual(post);
      expect(postRepo.create).toHaveBeenCalledWith(data);
      expect(postRepo.getById).toHaveBeenCalledWith(1);
    });

    it('should return existing post when fingerprint already exists', () => {
      const data: PostCreate = { platform: 'x', content: 'Test post content' };
      const existingPost = makePost({ id: 5, url: 'https://x.com/1' });

      postRepo.getByFingerprint.mockReturnValue(existingPost);
      postRepo.getById.mockReturnValue(existingPost);

      const result = service.report(data);

      expect(result.isNew).toBe(false);
      expect(result.post.id).toBe(5);
      expect(postRepo.create).not.toHaveBeenCalled();
    });

    it('should update existing post with url when existing has no url', () => {
      const data: PostCreate = { platform: 'x', content: 'Test post content', url: 'https://x.com/new' };
      const existingPost = makePost({ id: 5, url: null });

      postRepo.getByFingerprint.mockReturnValue(existingPost);
      postRepo.getById.mockReturnValue({ ...existingPost, url: 'https://x.com/new' });

      service.report(data);

      expect(postRepo.update).toHaveBeenCalledWith(5, expect.objectContaining({
        url: 'https://x.com/new',
        status: 'published',
      }));
    });

    it('should not update existing post url when it already has one', () => {
      const data: PostCreate = { platform: 'x', content: 'Test post content', url: 'https://x.com/new' };
      const existingPost = makePost({ id: 5, url: 'https://x.com/old' });

      postRepo.getByFingerprint.mockReturnValue(existingPost);
      postRepo.getById.mockReturnValue(existingPost);

      service.report(data);

      expect(postRepo.update).not.toHaveBeenCalled();
    });

    it('should strengthen synapse when post has a campaign_id', () => {
      const data: PostCreate = { platform: 'x', content: 'Campaign post', campaign_id: 10 };
      const post = makePost({ id: 1, campaign_id: 10 });

      postRepo.getByFingerprint.mockReturnValue(undefined);
      postRepo.create.mockReturnValue(1);
      postRepo.getById.mockReturnValue(post);

      service.report(data);

      expect(synapseManager.strengthen).toHaveBeenCalledWith(
        { type: 'post', id: 1 },
        { type: 'campaign', id: 10 },
        'belongs_to',
      );
    });

    it('should not strengthen synapse when post has no campaign_id', () => {
      const data: PostCreate = { platform: 'x', content: 'No campaign post' };
      const post = makePost({ campaign_id: null });

      postRepo.getByFingerprint.mockReturnValue(undefined);
      postRepo.create.mockReturnValue(1);
      postRepo.getById.mockReturnValue(post);

      service.report(data);

      expect(synapseManager.strengthen).not.toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('should update post status to published and return updated post', () => {
      const post = makePost({ id: 3, status: 'draft' });
      const publishedPost = makePost({ id: 3, status: 'published', published_at: '2026-01-02T00:00:00.000Z' });

      postRepo.getById.mockReturnValueOnce(post).mockReturnValueOnce(publishedPost);

      const result = service.publish(3);

      expect(postRepo.update).toHaveBeenCalledWith(3, expect.objectContaining({
        status: 'published',
      }));
      expect(result).toEqual(publishedPost);
    });

    it('should use provided url when publishing', () => {
      const post = makePost({ id: 3 });
      postRepo.getById.mockReturnValueOnce(post).mockReturnValueOnce(post);

      service.publish(3, 'https://x.com/published');

      expect(postRepo.update).toHaveBeenCalledWith(3, expect.objectContaining({
        url: 'https://x.com/published',
      }));
    });

    it('should return undefined when post does not exist', () => {
      postRepo.getById.mockReturnValue(undefined);

      const result = service.publish(999);

      expect(result).toBeUndefined();
      expect(postRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('updateEngagement', () => {
    it('should create engagement and return ids', () => {
      const data: EngagementCreate = { post_id: 1, likes: 10, comments: 5 };
      engagementRepo.create.mockReturnValue(42);

      const result = service.updateEngagement(data);

      expect(result).toEqual({ engagementId: 42, postId: 1 });
      expect(engagementRepo.create).toHaveBeenCalledWith(data);
    });
  });

  describe('getById', () => {
    it('should return a post by id', () => {
      const post = makePost({ id: 7 });
      postRepo.getById.mockReturnValue(post);

      expect(service.getById(7)).toEqual(post);
      expect(postRepo.getById).toHaveBeenCalledWith(7);
    });

    it('should return undefined for non-existent post', () => {
      postRepo.getById.mockReturnValue(undefined);

      expect(service.getById(999)).toBeUndefined();
    });
  });

  describe('listPosts', () => {
    it('should list posts by campaign when campaignId is provided', () => {
      const posts = [makePost({ id: 1 }), makePost({ id: 2 })];
      postRepo.listByCampaign.mockReturnValue(posts);

      const result = service.listPosts({ campaignId: 5, limit: 10 });

      expect(result).toEqual(posts);
      expect(postRepo.listByCampaign).toHaveBeenCalledWith(5, 10);
    });

    it('should list posts by platform when platform is provided', () => {
      const posts = [makePost()];
      postRepo.listByPlatform.mockReturnValue(posts);

      const result = service.listPosts({ platform: 'reddit' });

      expect(result).toEqual(posts);
      expect(postRepo.listByPlatform).toHaveBeenCalledWith('reddit', undefined);
    });

    it('should list all posts when no filters are provided', () => {
      const posts = [makePost()];
      postRepo.listAll.mockReturnValue(posts);

      const result = service.listPosts();

      expect(result).toEqual(posts);
      expect(postRepo.listAll).toHaveBeenCalledWith(undefined);
    });

    it('should prioritize campaignId over platform filter', () => {
      postRepo.listByCampaign.mockReturnValue([]);

      service.listPosts({ campaignId: 1, platform: 'x' });

      expect(postRepo.listByCampaign).toHaveBeenCalled();
      expect(postRepo.listByPlatform).not.toHaveBeenCalled();
    });
  });

  describe('searchPosts', () => {
    it('should delegate to postRepo.search', () => {
      const posts = [makePost()];
      postRepo.search.mockReturnValue(posts);

      const result = service.searchPosts('marketing', 5);

      expect(result).toEqual(posts);
      expect(postRepo.search).toHaveBeenCalledWith('marketing', 5);
    });
  });

  describe('findSimilar', () => {
    it('should find similar posts via synapse activation', () => {
      const activations = [
        { node: { type: 'post', id: 2 }, weight: 0.9 },
        { node: { type: 'campaign', id: 1 }, weight: 0.8 },
        { node: { type: 'post', id: 3 }, weight: 0.7 },
        { node: { type: 'post', id: 1 }, weight: 0.6 }, // same post, should be filtered
      ];
      synapseManager.activate.mockReturnValue(activations);

      const post2 = makePost({ id: 2 });
      const post3 = makePost({ id: 3 });
      postRepo.getById.mockImplementation((id: number) => {
        if (id === 2) return post2;
        if (id === 3) return post3;
        return undefined;
      });

      const result = service.findSimilar(1);

      expect(synapseManager.activate).toHaveBeenCalledWith({ type: 'post', id: 1 });
      expect(result).toEqual([post2, post3]);
    });

    it('should filter out undefined posts from results', () => {
      synapseManager.activate.mockReturnValue([
        { node: { type: 'post', id: 99 }, weight: 0.9 },
      ]);
      postRepo.getById.mockReturnValue(undefined);

      const result = service.findSimilar(1);

      expect(result).toEqual([]);
    });
  });

  describe('getTopPosts', () => {
    it('should delegate to engagementRepo.topPosts with default limit', () => {
      engagementRepo.topPosts.mockReturnValue([]);

      service.getTopPosts();

      expect(engagementRepo.topPosts).toHaveBeenCalledWith(10);
    });

    it('should pass custom limit', () => {
      engagementRepo.topPosts.mockReturnValue([]);

      service.getTopPosts(5);

      expect(engagementRepo.topPosts).toHaveBeenCalledWith(5);
    });
  });

  describe('getEngagement', () => {
    it('should return latest engagement for a post', () => {
      const engagement = { id: 1, post_id: 5, likes: 42 };
      engagementRepo.getLatestByPost.mockReturnValue(engagement);

      expect(service.getEngagement(5)).toEqual(engagement);
    });
  });

  describe('getEngagementHistory', () => {
    it('should return all engagement records for a post', () => {
      const history = [
        { id: 1, post_id: 5, likes: 10 },
        { id: 2, post_id: 5, likes: 20 },
      ];
      engagementRepo.listByPost.mockReturnValue(history);

      expect(service.getEngagementHistory(5)).toEqual(history);
    });
  });

  describe('getPlatformStats', () => {
    it('should delegate to engagementRepo.avgByPlatform', () => {
      const stats = [{ platform: 'x', avg_likes: 10, post_count: 5 }];
      engagementRepo.avgByPlatform.mockReturnValue(stats);

      expect(service.getPlatformStats()).toEqual(stats);
    });
  });

  describe('getPostStats', () => {
    it('should return aggregated post statistics', () => {
      postRepo.countAll.mockReturnValue(100);
      postRepo.countByPlatform.mockReturnValue({ x: 50, reddit: 30, linkedin: 20 });
      postRepo.countByStatus.mockReturnValue({ draft: 40, published: 60 });

      const stats = service.getPostStats();

      expect(stats).toEqual({
        total: 100,
        byPlatform: { x: 50, reddit: 30, linkedin: 20 },
        byStatus: { draft: 40, published: 60 },
      });
    });
  });
});
