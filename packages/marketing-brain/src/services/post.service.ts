import type { PostRepository } from '../db/repositories/post.repository.js';
import type { EngagementRepository } from '../db/repositories/engagement.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { Post, PostCreate, EngagementCreate } from '../types/post.types.js';
import { getEventBus } from '../utils/events.js';
import { sha256 } from '../utils/hash.js';

export class PostService {
  constructor(
    private postRepo: PostRepository,
    private engagementRepo: EngagementRepository,
    private synapseManager: SynapseManager,
  ) {}

  report(data: PostCreate): { post: Post; isNew: boolean } {
    const fingerprint = sha256(`${data.platform}:${data.content}`);
    const existing = this.postRepo.getByFingerprint(fingerprint);

    if (existing) {
      if (data.url && !existing.url) {
        this.postRepo.update(existing.id, { url: data.url, status: 'published', published_at: data.published_at ?? new Date().toISOString() });
      }
      return { post: this.postRepo.getById(existing.id)!, isNew: false };
    }

    const id = this.postRepo.create(data);
    const post = this.postRepo.getById(id)!;

    if (post.campaign_id) {
      this.synapseManager.strengthen(
        { type: 'post', id: post.id },
        { type: 'campaign', id: post.campaign_id },
        'belongs_to',
      );
    }

    getEventBus().emit('post:created', {
      postId: post.id,
      campaignId: post.campaign_id,
      platform: post.platform,
    });

    return { post, isNew: true };
  }

  publish(postId: number, url?: string): Post | undefined {
    const post = this.postRepo.getById(postId);
    if (!post) return undefined;

    this.postRepo.update(postId, {
      status: 'published',
      url: url ?? post.url,
      published_at: new Date().toISOString(),
    });

    getEventBus().emit('post:published', { postId, platform: post.platform });
    return this.postRepo.getById(postId);
  }

  updateEngagement(data: EngagementCreate): { engagementId: number; postId: number } {
    const engagementId = this.engagementRepo.create(data);

    getEventBus().emit('engagement:updated', { postId: data.post_id, engagementId });
    return { engagementId, postId: data.post_id };
  }

  getById(id: number): Post | undefined {
    return this.postRepo.getById(id);
  }

  listPosts(opts?: { platform?: string; campaignId?: number; limit?: number }): Post[] {
    if (opts?.campaignId) return this.postRepo.listByCampaign(opts.campaignId, opts?.limit);
    if (opts?.platform) return this.postRepo.listByPlatform(opts.platform, opts?.limit);
    return this.postRepo.listAll(opts?.limit);
  }

  searchPosts(query: string, limit?: number): Post[] {
    return this.postRepo.search(query, limit);
  }

  findSimilar(postId: number): Post[] {
    const activated = this.synapseManager.activate({ type: 'post', id: postId });
    const similarPostIds = activated
      .filter(a => a.node.type === 'post' && a.node.id !== postId)
      .slice(0, 10)
      .map(a => a.node.id);

    return similarPostIds
      .map(id => this.postRepo.getById(id))
      .filter((p): p is Post => p !== undefined);
  }

  getTopPosts(limit: number = 10) {
    return this.engagementRepo.topPosts(limit);
  }

  getEngagement(postId: number) {
    return this.engagementRepo.getLatestByPost(postId);
  }

  getEngagementHistory(postId: number) {
    return this.engagementRepo.listByPost(postId);
  }

  getPlatformStats() {
    return this.engagementRepo.avgByPlatform();
  }

  getPostStats() {
    return {
      total: this.postRepo.countAll(),
      byPlatform: this.postRepo.countByPlatform(),
      byStatus: this.postRepo.countByStatus(),
    };
  }
}
