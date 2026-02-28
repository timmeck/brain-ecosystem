export type Platform = 'x' | 'reddit' | 'linkedin' | 'bluesky' | 'mastodon' | 'threads' | 'other';
export type PostFormat = 'text' | 'image' | 'video' | 'carousel' | 'thread' | 'article' | 'poll';
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface Post {
  id: number;
  campaign_id: number | null;
  platform: Platform;
  content: string;
  format: PostFormat;
  hashtags: string | null;
  url: string | null;
  published_at: string | null;
  fingerprint: string;
  status: PostStatus;
  created_at: string;
  updated_at: string;
}

export interface PostCreate {
  campaign_id?: number | null;
  platform: Platform;
  content: string;
  format?: PostFormat;
  hashtags?: string;
  url?: string;
  published_at?: string;
  status?: PostStatus;
}

export interface Engagement {
  id: number;
  post_id: number;
  timestamp: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  clicks: number;
  saves: number;
  reach: number;
}

export interface EngagementCreate {
  post_id: number;
  likes?: number;
  comments?: number;
  shares?: number;
  impressions?: number;
  clicks?: number;
  saves?: number;
  reach?: number;
}

export interface Campaign {
  id: number;
  name: string;
  brand: string | null;
  goal: string | null;
  platform: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignCreate {
  name: string;
  brand?: string;
  goal?: string;
  platform?: string;
}

export interface Audience {
  id: number;
  name: string;
  platform: Platform | null;
  demographics: string | null;
  interests: string | null;
  created_at: string;
}

export interface Strategy {
  id: number;
  post_id: number | null;
  description: string;
  approach: string | null;
  outcome: string | null;
  confidence: number;
  created_at: string;
}

export interface StrategyCreate {
  post_id?: number;
  description: string;
  approach?: string;
  outcome?: string;
}

export interface ContentTemplate {
  id: number;
  name: string;
  structure: string;
  example: string | null;
  platform: Platform | null;
  avg_engagement: number;
  use_count: number;
  created_at: string;
}

export interface ContentTemplateCreate {
  name: string;
  structure: string;
  example?: string;
  platform?: Platform;
}

export interface MarketingRule {
  id: number;
  pattern: string;
  recommendation: string;
  confidence: number;
  trigger_count: number;
  success_count: number;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface RuleCreate {
  pattern: string;
  recommendation: string;
  confidence?: number;
}

export interface Insight {
  id: number;
  type: string;
  title: string;
  description: string;
  confidence: number;
  priority: number;
  campaign_id: number | null;
  active: number;
  expires_at: string | null;
  created_at: string;
}

export interface InsightCreate {
  type: string;
  title: string;
  description: string;
  confidence?: number;
  priority?: number;
  campaign_id?: number | null;
  expires_at?: string;
}
