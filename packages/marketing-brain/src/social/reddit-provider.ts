/**
 * Reddit Provider — OAuth2 + REST API
 *
 * Einrichten:
 *   1. Reddit App erstellen: https://www.reddit.com/prefs/apps
 *      → "create another app" → Typ: "script"
 *      → redirect uri: http://localhost
 *   2. In .env:
 *      REDDIT_CLIENT_ID=...         (unter dem App-Namen)
 *      REDDIT_CLIENT_SECRET=...     (secret)
 *      REDDIT_USERNAME=...          (dein Reddit Username)
 *      REDDIT_PASSWORD=...          (dein Reddit Passwort)
 */

import { getLogger } from '../utils/logger.js';
import type { SocialProvider, SocialPost, PublishResult, FeedItem, FeedOptions, EngagementMetrics, SearchResult } from './social-provider.js';

export interface RedditProviderConfig {
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  userAgent?: string;
}

export class RedditProvider implements SocialProvider {
  readonly name = 'reddit';

  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly username: string | null;
  private readonly password: string | null;
  private readonly userAgent: string;
  private readonly log = getLogger();

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private postsPublished = 0;

  constructor(config: RedditProviderConfig = {}) {
    this.clientId = config.clientId ?? process.env.REDDIT_CLIENT_ID ?? null;
    this.clientSecret = config.clientSecret ?? process.env.REDDIT_CLIENT_SECRET ?? null;
    this.username = config.username ?? process.env.REDDIT_USERNAME ?? null;
    this.password = config.password ?? process.env.REDDIT_PASSWORD ?? null;
    this.userAgent = config.userAgent ?? 'BrainEcosystem/1.0';
  }

  async isAvailable(): Promise<boolean> {
    if (!this.clientId || !this.clientSecret || !this.username || !this.password) return false;
    try {
      await this.getToken();
      return true;
    } catch {
      return false;
    }
  }

  async publish(post: SocialPost): Promise<PublishResult> {
    try {
      const token = await this.getToken();
      const subreddit = post.subreddit ?? 'test';
      const kind = post.url ? 'link' : 'self';

      const body = new URLSearchParams({
        sr: subreddit,
        kind,
        title: post.title ?? post.text.substring(0, 300),
        ...(kind === 'self' ? { text: post.text } : { url: post.url! }),
      });

      const response = await fetch('https://oauth.reddit.com/api/submit', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json() as any;

      if (data?.json?.errors?.length > 0) {
        return {
          provider: this.name,
          postId: '',
          url: '',
          success: false,
          error: data.json.errors.map((e: string[]) => e.join(': ')).join('; '),
        };
      }

      const postUrl = data?.json?.data?.url ?? '';
      const postId = data?.json?.data?.name ?? '';

      this.postsPublished++;
      return { provider: this.name, postId, url: postUrl, success: true };
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
      const token = await this.getToken();
      const limit = options?.limit ?? 25;
      const url = `https://oauth.reddit.com/hot?limit=${limit}${options?.cursor ? `&after=${options.cursor}` : ''}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': this.userAgent,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json() as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data?.data?.children ?? []).map((child: any) => {
        const p = child.data;
        return {
          id: p.name ?? '',
          author: p.author ?? '',
          text: p.selftext ?? p.title ?? '',
          url: `https://reddit.com${p.permalink ?? ''}`,
          timestamp: (p.created_utc ?? 0) * 1000,
          likes: p.ups ?? 0,
          reposts: 0,
          replies: p.num_comments ?? 0,
          platform: 'reddit',
        };
      });
    } catch (err) {
      this.log.warn(`Reddit readFeed error: ${(err as Error).message}`);
      return [];
    }
  }

  async getEngagement(postId: string): Promise<EngagementMetrics> {
    try {
      const token = await this.getToken();
      const response = await fetch(`https://oauth.reddit.com/api/info?id=${postId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': this.userAgent,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json() as any;
      const post = data?.data?.children?.[0]?.data;

      return {
        likes: post?.ups ?? 0,
        reposts: 0,
        replies: post?.num_comments ?? 0,
        views: post?.view_count ?? undefined,
        timestamp: Date.now(),
      };
    } catch {
      return { likes: 0, reposts: 0, replies: 0, timestamp: Date.now() };
    }
  }

  async search(query: string, options?: FeedOptions): Promise<SearchResult> {
    try {
      const token = await this.getToken();
      const limit = options?.limit ?? 25;
      const url = `https://oauth.reddit.com/search?q=${encodeURIComponent(query)}&limit=${limit}&sort=relevance`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': this.userAgent,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await response.json() as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const items: FeedItem[] = (data?.data?.children ?? []).map((child: any) => {
        const p = child.data;
        return {
          id: p.name ?? '',
          author: p.author ?? '',
          text: p.selftext ?? p.title ?? '',
          url: `https://reddit.com${p.permalink ?? ''}`,
          timestamp: (p.created_utc ?? 0) * 1000,
          likes: p.ups ?? 0,
          reposts: 0,
          replies: p.num_comments ?? 0,
          platform: 'reddit',
        };
      });

      return { items, cursor: data?.data?.after };
    } catch (err) {
      this.log.warn(`Reddit search error: ${(err as Error).message}`);
      return { items: [] };
    }
  }

  private async getToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'password',
      username: this.username!,
      password: this.password!,
    });

    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'User-Agent': this.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Reddit OAuth error: ${response.status}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

    return this.accessToken;
  }
}
