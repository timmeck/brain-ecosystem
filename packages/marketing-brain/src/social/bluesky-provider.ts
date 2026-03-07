/**
 * Bluesky Provider — AT Protocol Social Media
 *
 * Einrichten:
 *   1. In .env:
 *      BLUESKY_HANDLE=dein.handle.bsky.social
 *      BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
 *   2. App Password: Bluesky → Settings → App Passwords → Add
 *      (NICHT das Haupt-Passwort verwenden!)
 */

import { getLogger } from '../utils/logger.js';
import type { SocialProvider, SocialPost, PublishResult, FeedItem, FeedOptions, EngagementMetrics, SearchResult } from './social-provider.js';

export interface BlueskyProviderConfig {
  handle?: string;
  appPassword?: string;
  service?: string;
}

export class BlueskyProvider implements SocialProvider {
  readonly name = 'bluesky';

  private readonly handle: string | null;
  private readonly appPassword: string | null;
  private readonly service: string;
  private readonly log = getLogger();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agent: any = null;
  private postsPublished = 0;

  constructor(config: BlueskyProviderConfig = {}) {
    this.handle = config.handle ?? process.env.BLUESKY_HANDLE ?? null;
    this.appPassword = config.appPassword ?? process.env.BLUESKY_APP_PASSWORD ?? null;
    this.service = config.service ?? 'https://bsky.social';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.handle || !this.appPassword) return false;
    try {
      await this.getAgent();
      return true;
    } catch {
      return false;
    }
  }

  async publish(post: SocialPost): Promise<PublishResult> {
    try {
      const agent = await this.getAgent();

      const record = await agent.post({
        text: post.text,
        createdAt: new Date().toISOString(),
      });

      this.postsPublished++;
      const uri = record?.uri ?? '';
      const rkey = uri.split('/').pop() ?? '';

      return {
        provider: this.name,
        postId: uri,
        url: `https://bsky.app/profile/${this.handle}/post/${rkey}`,
        success: true,
      };
    } catch (err) {
      return {
        provider: this.name,
        postId: '',
        url: '',
        success: false,
        error: (err as Error).message,
      };
    }
  }

  async readFeed(options?: FeedOptions): Promise<FeedItem[]> {
    try {
      const agent = await this.getAgent();
      const response = await agent.getTimeline({
        limit: options?.limit ?? 25,
        cursor: options?.cursor,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (response.data.feed ?? []).map((item: any) => ({
        id: item.post?.uri ?? '',
        author: item.post?.author?.handle ?? '',
        text: item.post?.record?.text ?? '',
        url: `https://bsky.app/profile/${item.post?.author?.handle}/post/${(item.post?.uri ?? '').split('/').pop()}`,
        timestamp: new Date(item.post?.record?.createdAt ?? 0).getTime(),
        likes: item.post?.likeCount ?? 0,
        reposts: item.post?.repostCount ?? 0,
        replies: item.post?.replyCount ?? 0,
        platform: 'bluesky',
      }));
    } catch (err) {
      this.log.warn(`Bluesky readFeed error: ${(err as Error).message}`);
      return [];
    }
  }

  async getEngagement(postId: string): Promise<EngagementMetrics> {
    try {
      const agent = await this.getAgent();
      const response = await agent.getPostThread({ uri: postId, depth: 0 });
      const post = response.data.thread?.post;

      return {
        likes: post?.likeCount ?? 0,
        reposts: post?.repostCount ?? 0,
        replies: post?.replyCount ?? 0,
        timestamp: Date.now(),
      };
    } catch {
      return { likes: 0, reposts: 0, replies: 0, timestamp: Date.now() };
    }
  }

  async search(query: string, options?: FeedOptions): Promise<SearchResult> {
    try {
      const agent = await this.getAgent();
      const response = await agent.app.bsky.feed.searchPosts({
        q: query,
        limit: options?.limit ?? 25,
        cursor: options?.cursor,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: FeedItem[] = (response.data.posts ?? []).map((post: any) => ({
        id: post.uri ?? '',
        author: post.author?.handle ?? '',
        text: post.record?.text ?? '',
        url: `https://bsky.app/profile/${post.author?.handle}/post/${(post.uri ?? '').split('/').pop()}`,
        timestamp: new Date(post.record?.createdAt ?? 0).getTime(),
        likes: post.likeCount ?? 0,
        reposts: post.repostCount ?? 0,
        replies: post.replyCount ?? 0,
        platform: 'bluesky',
      }));

      return { items, cursor: response.data.cursor };
    } catch (err) {
      this.log.warn(`Bluesky search error: ${(err as Error).message}`);
      return { items: [] };
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getAgent(): Promise<any> {
    if (this.agent) return this.agent;

    // Dynamic import — @atproto/api is optional
    const { BskyAgent } = await import('@atproto/api');

    this.agent = new BskyAgent({ service: this.service });
    await this.agent.login({
      identifier: this.handle!,
      password: this.appPassword!,
    });

    return this.agent;
  }
}
