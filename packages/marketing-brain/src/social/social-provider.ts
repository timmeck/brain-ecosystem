/**
 * Social Provider Interface — Multi-Platform Social Media
 *
 * ═══════════════════════════════════════════════════════════════
 *  PROVIDER EINRICHTEN
 * ═══════════════════════════════════════════════════════════════
 *
 *  InternalProvider (default):
 *    → Funktioniert out of the box. Posts nur in SQLite.
 *
 *  Bluesky (optional):
 *    1. npm install @atproto/api (bereits installiert)
 *    2. In .env:
 *       BLUESKY_HANDLE=dein.handle.bsky.social
 *       BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
 *       (App Password erstellen: Settings → App Passwords → Add)
 *    → Marketing Brain postet und liest automatisch auf Bluesky.
 *
 *  Reddit (optional):
 *    1. Reddit App erstellen: https://www.reddit.com/prefs/apps
 *       (Typ: "script", redirect: http://localhost)
 *    2. In .env:
 *       REDDIT_CLIENT_ID=...
 *       REDDIT_CLIENT_SECRET=...
 *       REDDIT_USERNAME=...
 *       REDDIT_PASSWORD=...
 *    → Marketing Brain liest Feeds und postet auf Reddit.
 *
 *  Eigenen Provider bauen:
 *    Implementiere SocialProvider, registriere mit
 *    socialService.registerProvider(new MyProvider())
 * ═══════════════════════════════════════════════════════════════
 */

// ── Types ────────────────────────────────────────────────

export interface SocialPost {
  text: string;
  title?: string;
  url?: string;
  images?: string[];
  tags?: string[];
  /** Target subreddit for Reddit, or ignored for other platforms */
  subreddit?: string;
}

export interface PublishResult {
  provider: string;
  postId: string;
  url: string;
  success: boolean;
  error?: string;
}

export interface FeedItem {
  id: string;
  author: string;
  text: string;
  url: string;
  timestamp: number;
  likes: number;
  reposts: number;
  replies: number;
  platform: string;
}

export interface EngagementMetrics {
  likes: number;
  reposts: number;
  replies: number;
  views?: number;
  timestamp: number;
}

export interface FeedOptions {
  limit?: number;
  cursor?: string;
}

export interface SearchResult {
  items: FeedItem[];
  cursor?: string;
}

// ── Provider Interface ───────────────────────────────────

export interface SocialProvider {
  /** Unique provider name (e.g. 'bluesky', 'reddit', 'internal') */
  readonly name: string;

  /** Check if provider is configured and reachable */
  isAvailable(): Promise<boolean>;

  /** Publish a post to the platform */
  publish(post: SocialPost): Promise<PublishResult>;

  /** Read recent feed items */
  readFeed(options?: FeedOptions): Promise<FeedItem[]>;

  /** Get engagement metrics for a specific post */
  getEngagement(postId: string): Promise<EngagementMetrics>;

  /** Search for posts by query */
  search(query: string, options?: FeedOptions): Promise<SearchResult>;

  /** Graceful shutdown */
  shutdown?(): Promise<void>;
}

// ── Status ───────────────────────────────────────────────

export interface SocialProviderStatus {
  name: string;
  available: boolean;
  postsPublished: number;
}
