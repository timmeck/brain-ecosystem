import type { ResearchConfig } from '../types/config.types.js';
import type { PostRepository } from '../db/repositories/post.repository.js';
import type { EngagementRepository } from '../db/repositories/engagement.repository.js';
import type { CampaignRepository } from '../db/repositories/campaign.repository.js';
import type { TemplateRepository } from '../db/repositories/template.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { engagementScore } from '../learning/confidence-scorer.js';
import { BaseResearchEngine } from '@timmeck/brain-core';

export class ResearchEngine extends BaseResearchEngine {
  constructor(
    private config: ResearchConfig,
    private postRepo: PostRepository,
    private engagementRepo: EngagementRepository,
    private campaignRepo: CampaignRepository,
    private templateRepo: TemplateRepository,
    private insightRepo: InsightRepository,
    private synapseManager: SynapseManager,
  ) {
    super(config);
  }

  runCycle(): void {
    this.logger.info('Starting research cycle');

    // Expire old insights
    const expired = this.insightRepo.expireOld();
    if (expired > 0) this.logger.info(`Expired ${expired} old insights`);

    // Generate new insights
    this.detectTrends();
    this.detectGaps();
    this.detectSynergies();
    this.suggestTemplates();
    this.suggestOptimizations();

    this.logger.info('Research cycle complete');
  }

  private detectTrends(): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.trendWindowDays);
    const recentPosts = this.postRepo.recentPublished(cutoff.toISOString());

    if (recentPosts.length < this.config.minDataPoints) return;

    // Detect platform engagement trends
    const platformScores: Record<string, number[]> = {};
    for (const post of recentPosts) {
      const eng = this.engagementRepo.getLatestByPost(post.id);
      if (!eng) continue;
      const score = engagementScore(eng);
      if (!platformScores[post.platform]) platformScores[post.platform] = [];
      platformScores[post.platform].push(score);
    }

    for (const [platform, scores] of Object.entries(platformScores)) {
      if (scores.length < 3) continue;
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      const recentAvg = scores.slice(0, Math.ceil(scores.length / 2)).reduce((a, b) => a + b, 0) / Math.ceil(scores.length / 2);
      const olderAvg = scores.slice(Math.ceil(scores.length / 2)).reduce((a, b) => a + b, 0) / Math.floor(scores.length / 2);

      if (olderAvg > 0 && Math.abs(recentAvg - olderAvg) / olderAvg > 0.2) {
        const direction = recentAvg > olderAvg ? 'up' : 'down';
        const pct = Math.round(Math.abs(recentAvg - olderAvg) / olderAvg * 100);

        this.insightRepo.create({
          type: 'trend',
          title: `${platform} engagement trending ${direction}`,
          description: `Engagement on ${platform} is ${direction} ${pct}% over the last ${this.config.trendWindowDays} days (avg score: ${avg.toFixed(0)})`,
          confidence: Math.min(0.9, scores.length / 20),
          priority: pct > 30 ? 8 : 5,
          expires_at: this.expiresAt(),
        });
      }
    }
  }

  private detectGaps(): void {
    const platforms = ['x', 'reddit', 'linkedin', 'bluesky'];
    const postsByPlatform = this.postRepo.countByPlatform();

    for (const platform of platforms) {
      if (!postsByPlatform[platform] || postsByPlatform[platform] === 0) {
        this.insightRepo.create({
          type: 'gap',
          title: `No posts on ${platform}`,
          description: `You haven't posted on ${platform} yet. Consider expanding your reach to this platform.`,
          confidence: 0.8,
          priority: 4,
          expires_at: this.expiresAt(),
        });
      } else if (postsByPlatform[platform] < 3) {
        this.insightRepo.create({
          type: 'gap',
          title: `Low activity on ${platform}`,
          description: `Only ${postsByPlatform[platform]} posts on ${platform}. Increasing frequency could improve visibility.`,
          confidence: 0.6,
          priority: 3,
          expires_at: this.expiresAt(),
        });
      }
    }
  }

  private detectSynergies(): void {
    const topPosts = this.engagementRepo.topPosts(20);

    // Look for patterns in top posts
    const platformFormat: Record<string, Record<string, number>> = {};
    for (const post of topPosts) {
      const fullPost = this.postRepo.getById(post.post_id);
      if (!fullPost) continue;

      const key = fullPost.platform;
      if (!platformFormat[key]) platformFormat[key] = {};
      const format = fullPost.format;
      platformFormat[key][format] = (platformFormat[key][format] ?? 0) + 1;
    }

    for (const [platform, formats] of Object.entries(platformFormat)) {
      const sorted = Object.entries(formats).sort(([, a], [, b]) => b - a);
      if (sorted[0] && sorted[0][1] >= 3) {
        this.insightRepo.create({
          type: 'synergy',
          title: `${sorted[0][0]} works best on ${platform}`,
          description: `${sorted[0][1]} of your top posts on ${platform} use the ${sorted[0][0]} format. This combination consistently performs well.`,
          confidence: sorted[0][1] / topPosts.length,
          priority: 6,
          expires_at: this.expiresAt(),
        });
      }
    }
  }

  private suggestTemplates(): void {
    const topPosts = this.engagementRepo.topPosts(10);

    for (const post of topPosts) {
      const fullPost = this.postRepo.getById(post.post_id);
      if (!fullPost) continue;

      // Check if a template already exists for similar structure
      const existing = this.templateRepo.search(fullPost.format, 1);
      if (existing.length > 0) continue;

      // If top post has no matching template, suggest creating one
      this.insightRepo.create({
        type: 'template',
        title: `Create template from top ${fullPost.platform} post`,
        description: `Post #${fullPost.id} (${fullPost.format}) has high engagement. Consider extracting its structure as a reusable template.`,
        confidence: 0.7,
        priority: 5,
        expires_at: this.expiresAt(),
      });
    }
  }

  private suggestOptimizations(): void {
    const campaigns = this.campaignRepo.listActive();

    for (const campaign of campaigns) {
      const posts = this.postRepo.listByCampaign(campaign.id, 50);
      if (posts.length < 3) continue;

      let totalScore = 0;
      let postCount = 0;
      for (const post of posts) {
        const eng = this.engagementRepo.getLatestByPost(post.id);
        if (!eng) continue;
        totalScore += engagementScore(eng);
        postCount++;
      }

      if (postCount === 0) continue;
      const avgScore = totalScore / postCount;

      // Suggest cross-posting top content
      const topPost = this.engagementRepo.topPosts(1);
      if (topPost.length > 0 && topPost[0]) {
        const top = topPost[0];
        const topFullPost = this.postRepo.getById(top.post_id);
        if (topFullPost && topFullPost.campaign_id === campaign.id) {
          this.insightRepo.create({
            type: 'optimization',
            title: `Cross-post top content from "${campaign.name}"`,
            description: `Your top post in "${campaign.name}" (score: ${engagementScore(top).toFixed(0)}) could be adapted for other platforms. Campaign avg: ${avgScore.toFixed(0)}.`,
            confidence: 0.6,
            priority: 4,
            campaign_id: campaign.id,
            expires_at: this.expiresAt(),
          });
        }
      }
    }
  }

  private expiresAt(): string {
    const d = new Date();
    d.setDate(d.getDate() + this.config.insightExpiryDays);
    return d.toISOString();
  }
}
