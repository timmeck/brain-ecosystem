import type { LearningConfig } from '../types/config.types.js';
import type { PostRepository } from '../db/repositories/post.repository.js';
import type { EngagementRepository } from '../db/repositories/engagement.repository.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { StrategyRepository } from '../db/repositories/strategy.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { wilsonScore, engagementScore } from './confidence-scorer.js';
import { BaseLearningEngine } from '@timmeck/brain-core';

export interface LearningCycleResult {
  rulesCreated: number;
  rulesUpdated: number;
  strategiesUpdated: number;
  synapsesDecayed: number;
  synapsesPruned: number;
}

export class LearningEngine extends BaseLearningEngine {
  constructor(
    private config: LearningConfig,
    private postRepo: PostRepository,
    private engagementRepo: EngagementRepository,
    private ruleRepo: RuleRepository,
    private strategyRepo: StrategyRepository,
    private synapseManager: SynapseManager,
  ) {
    super(config);
  }

  runCycle(): LearningCycleResult {
    this.logger.info('Starting learning cycle');
    const result: LearningCycleResult = {
      rulesCreated: 0,
      rulesUpdated: 0,
      strategiesUpdated: 0,
      synapsesDecayed: 0,
      synapsesPruned: 0,
    };

    // 1. Analyze recent posts for patterns
    result.rulesCreated += this.extractTimingPatterns();
    result.rulesCreated += this.extractFormatPatterns();
    result.rulesCreated += this.extractPlatformPatterns();

    // 2. Update strategy confidence based on engagement
    result.strategiesUpdated = this.updateStrategyConfidence();

    // 3. Update rule confidence via Wilson Score
    result.rulesUpdated = this.updateRuleConfidence();

    // 4. Run synapse decay
    const decay = this.synapseManager.runDecay();
    result.synapsesDecayed = decay.decayed;
    result.synapsesPruned = decay.pruned;

    // 5. Wire similar posts
    this.wireSimilarPosts();

    this.logger.info(`Learning cycle complete: ${JSON.stringify(result)}`);
    return result;
  }

  private extractTimingPatterns(): number {
    let created = 0;
    const recentPosts = this.postRepo.listPublished(100);

    // Group by hour of day
    const hourBuckets: Record<number, { total: number; avgScore: number }> = {};

    for (const post of recentPosts) {
      if (!post.published_at) continue;
      const hour = new Date(post.published_at).getHours();
      const eng = this.engagementRepo.getLatestByPost(post.id);
      if (!eng) continue;

      const score = engagementScore(eng);
      if (!hourBuckets[hour]) hourBuckets[hour] = { total: 0, avgScore: 0 };
      hourBuckets[hour].total++;
      hourBuckets[hour].avgScore += score;
    }

    // Find best/worst hours
    for (const [hour, data] of Object.entries(hourBuckets)) {
      if (data.total < this.config.minOccurrences) continue;
      data.avgScore /= data.total;
    }

    const hours = Object.entries(hourBuckets)
      .filter(([, d]) => d.total >= this.config.minOccurrences)
      .sort(([, a], [, b]) => b.avgScore - a.avgScore);

    if (hours.length >= 2) {
      const bestHour = hours[0];
      const worstHour = hours[hours.length - 1];

      if (bestHour && worstHour && bestHour[1].avgScore > worstHour[1].avgScore * 2) {
        this.ruleRepo.create({
          pattern: `best_time_${bestHour[0]}h`,
          recommendation: `Posts around ${bestHour[0]}:00 perform ${(bestHour[1].avgScore / Math.max(1, worstHour[1].avgScore)).toFixed(1)}x better than ${worstHour[0]}:00`,
          confidence: wilsonScore(bestHour[1].total, recentPosts.length),
        });
        created++;
      }
    }

    return created;
  }

  private extractFormatPatterns(): number {
    let created = 0;
    const recentPosts = this.postRepo.listPublished(100);

    const formatBuckets: Record<string, { total: number; avgScore: number }> = {};

    for (const post of recentPosts) {
      const eng = this.engagementRepo.getLatestByPost(post.id);
      if (!eng) continue;

      const score = engagementScore(eng);
      if (!formatBuckets[post.format]) formatBuckets[post.format] = { total: 0, avgScore: 0 };
      formatBuckets[post.format].total++;
      formatBuckets[post.format].avgScore += score;
    }

    for (const [format, data] of Object.entries(formatBuckets)) {
      if (data.total < this.config.minOccurrences) continue;
      data.avgScore /= data.total;
    }

    const formats = Object.entries(formatBuckets)
      .filter(([, d]) => d.total >= this.config.minOccurrences)
      .sort(([, a], [, b]) => b.avgScore - a.avgScore);

    if (formats.length >= 2 && formats[0]) {
      const [bestFormat, bestData] = formats[0];
      this.ruleRepo.create({
        pattern: `best_format_${bestFormat}`,
        recommendation: `${bestFormat} posts average ${bestData.avgScore.toFixed(0)} engagement score (best format)`,
        confidence: wilsonScore(bestData.total, recentPosts.length),
      });
      created++;
    }

    return created;
  }

  private extractPlatformPatterns(): number {
    let created = 0;
    const platformStats = this.engagementRepo.avgByPlatform();

    if (platformStats.length >= 2) {
      const toScore = (p: typeof platformStats[number]) => engagementScore({
        likes: p.avg_likes, comments: p.avg_comments,
        shares: p.avg_shares, impressions: p.avg_impressions, clicks: p.avg_clicks,
      });
      const sorted = [...platformStats].sort((a, b) => toScore(b) - toScore(a));
      const best = sorted[0];
      if (best && best.post_count >= this.config.minOccurrences) {
        this.ruleRepo.create({
          pattern: `best_platform_${best.platform}`,
          recommendation: `${best.platform} is your top-performing platform (${best.post_count} posts, avg ${best.avg_likes.toFixed(0)} likes)`,
          confidence: wilsonScore(best.post_count, platformStats.reduce((s, p) => s + p.post_count, 0)),
        });
        created++;
      }
    }

    return created;
  }

  private updateStrategyConfidence(): number {
    let updated = 0;
    const strategies = this.strategyRepo.listAll(100);

    for (const strategy of strategies) {
      if (!strategy.post_id) continue;
      const eng = this.engagementRepo.getLatestByPost(strategy.post_id);
      if (!eng) continue;

      const score = engagementScore(eng);
      // Normalize: 0-10 → 0.0-1.0 confidence
      const newConfidence = Math.min(1.0, score / 100);

      if (Math.abs(newConfidence - strategy.confidence) > 0.05) {
        this.strategyRepo.update(strategy.id, { confidence: newConfidence });
        updated++;
      }
    }

    return updated;
  }

  private updateRuleConfidence(): number {
    let updated = 0;
    const rules = this.ruleRepo.listAll();

    for (const rule of rules) {
      if (rule.trigger_count < this.config.minOccurrences) continue;

      const newConfidence = wilsonScore(rule.success_count, rule.trigger_count);

      if (newConfidence < this.config.pruneThreshold && rule.active) {
        this.ruleRepo.update(rule.id, { active: 0, confidence: newConfidence });
        updated++;
      } else if (Math.abs(newConfidence - rule.confidence) > 0.05) {
        this.ruleRepo.update(rule.id, { confidence: newConfidence });
        updated++;
      }
    }

    return updated;
  }

  private wireSimilarPosts(): void {
    const posts = this.postRepo.listPublished(50);

    for (let i = 0; i < posts.length; i++) {
      for (let j = i + 1; j < Math.min(i + 5, posts.length); j++) {
        const a = posts[i]!;
        const b = posts[j]!;

        // Simple similarity: same platform, similar content length, similar hashtags
        if (a.platform === b.platform) {
          const lengthRatio = Math.min(a.content.length, b.content.length) / Math.max(a.content.length, b.content.length);
          if (lengthRatio > 0.5) {
            this.synapseManager.strengthen(
              { type: 'post', id: a.id },
              { type: 'post', id: b.id },
              'similar_to',
            );
          }
        }
      }
    }
  }
}
