import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import { engagementScore } from './confidence-scorer.js';

export interface ContentPattern {
  pattern: string;
  category: 'timing' | 'format' | 'content' | 'platform';
  confidence: number;
  sampleSize: number;
  avgEngagement: number;
  baselineEngagement: number;
  multiplier: number;
}

interface PostWithEngagement {
  id: number;
  platform: string;
  content: string;
  format: string;
  hashtags: string | null;
  published_at: string | null;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  clicks: number;
  saves: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export class PatternExtractor {
  private logger = getLogger();

  constructor(private db: Database.Database) {}

  extractPatterns(): ContentPattern[] {
    const patterns: ContentPattern[] = [];

    const rows = this.getPostsWithEngagement();
    if (rows.length < 3) {
      this.logger.info('PatternExtractor: not enough posts with engagement data');
      return [];
    }

    const baseline = this.computeBaseline(rows);

    patterns.push(...this.extractTimingPatterns(rows, baseline));
    patterns.push(...this.extractFormatPatterns(rows, baseline));
    patterns.push(...this.extractPlatformPatterns(rows, baseline));
    patterns.push(...this.extractContentPatterns(rows, baseline));

    const filtered = patterns.filter(p => p.sampleSize >= 3 && p.confidence >= 0.5);
    this.logger.info(`PatternExtractor: extracted ${filtered.length} patterns from ${rows.length} posts`);
    return filtered;
  }

  private getPostsWithEngagement(): PostWithEngagement[] {
    const stmt = this.db.prepare(`
      SELECT p.id, p.platform, p.content, p.format, p.hashtags, p.published_at,
             e.likes, e.comments, e.shares, e.impressions, e.clicks, e.saves
      FROM posts p
      INNER JOIN (
        SELECT post_id, MAX(timestamp) as max_ts FROM engagement GROUP BY post_id
      ) latest ON latest.post_id = p.id
      INNER JOIN engagement e ON e.post_id = p.id AND e.timestamp = latest.max_ts
      WHERE p.status = 'published'
      ORDER BY p.published_at DESC
      LIMIT 500
    `);
    return stmt.all() as PostWithEngagement[];
  }

  private computeBaseline(rows: PostWithEngagement[]): number {
    if (rows.length === 0) return 0;
    const total = rows.reduce((sum, r) => sum + engagementScore(r), 0);
    return total / rows.length;
  }

  private extractTimingPatterns(rows: PostWithEngagement[], baseline: number): ContentPattern[] {
    const patterns: ContentPattern[] = [];

    // Day-of-week analysis
    const dayBuckets: Record<number, { scores: number[]; total: number }> = {};
    // Hour-of-day analysis
    const hourBuckets: Record<number, { scores: number[]; total: number }> = {};

    for (const row of rows) {
      if (!row.published_at) continue;
      const date = new Date(row.published_at);
      const day = date.getDay();
      const hour = date.getHours();
      const score = engagementScore(row);

      if (!dayBuckets[day]) dayBuckets[day] = { scores: [], total: 0 };
      dayBuckets[day].scores.push(score);
      dayBuckets[day].total++;

      if (!hourBuckets[hour]) hourBuckets[hour] = { scores: [], total: 0 };
      hourBuckets[hour].scores.push(score);
      hourBuckets[hour].total++;
    }

    // Day-of-week patterns
    for (const [dayStr, data] of Object.entries(dayBuckets)) {
      const day = Number(dayStr);
      const avg = data.scores.reduce((s, v) => s + v, 0) / data.total;
      const multiplier = baseline > 0 ? avg / baseline : 1;

      if (multiplier >= 1.3 && data.total >= 3) {
        patterns.push({
          pattern: `Posts on ${DAY_NAMES[day]} get ${multiplier.toFixed(1)}x engagement`,
          category: 'timing',
          confidence: this.computeConfidence(data.total, rows.length, multiplier),
          sampleSize: data.total,
          avgEngagement: avg,
          baselineEngagement: baseline,
          multiplier,
        });
      }
    }

    // Hour-of-day patterns: group into morning/afternoon/evening
    const timeBlocks: Record<string, { scores: number[]; total: number }> = {
      'early morning (6-9am)': { scores: [], total: 0 },
      'morning (9am-12pm)': { scores: [], total: 0 },
      'afternoon (12-5pm)': { scores: [], total: 0 },
      'evening (5-9pm)': { scores: [], total: 0 },
      'night (9pm-12am)': { scores: [], total: 0 },
    };

    for (const [hourStr, data] of Object.entries(hourBuckets)) {
      const hour = Number(hourStr);
      let block: string;
      if (hour >= 6 && hour < 9) block = 'early morning (6-9am)';
      else if (hour >= 9 && hour < 12) block = 'morning (9am-12pm)';
      else if (hour >= 12 && hour < 17) block = 'afternoon (12-5pm)';
      else if (hour >= 17 && hour < 21) block = 'evening (5-9pm)';
      else block = 'night (9pm-12am)';

      timeBlocks[block]!.scores.push(...data.scores);
      timeBlocks[block]!.total += data.total;
    }

    for (const [block, data] of Object.entries(timeBlocks)) {
      if (data.total < 3) continue;
      const avg = data.scores.reduce((s, v) => s + v, 0) / data.total;
      const multiplier = baseline > 0 ? avg / baseline : 1;

      if (multiplier >= 1.3) {
        patterns.push({
          pattern: `Posts in the ${block} get ${multiplier.toFixed(1)}x engagement`,
          category: 'timing',
          confidence: this.computeConfidence(data.total, rows.length, multiplier),
          sampleSize: data.total,
          avgEngagement: avg,
          baselineEngagement: baseline,
          multiplier,
        });
      }
    }

    return patterns;
  }

  private extractFormatPatterns(rows: PostWithEngagement[], baseline: number): ContentPattern[] {
    const patterns: ContentPattern[] = [];

    // Content length analysis
    const shortPosts: number[] = [];
    const mediumPosts: number[] = [];
    const longPosts: number[] = [];

    // Format type analysis
    const formatBuckets: Record<string, number[]> = {};

    for (const row of rows) {
      const score = engagementScore(row);

      // Length buckets
      if (row.content.length < 280) shortPosts.push(score);
      else if (row.content.length < 1000) mediumPosts.push(score);
      else longPosts.push(score);

      // Format type
      if (!formatBuckets[row.format]) formatBuckets[row.format] = [];
      formatBuckets[row.format].push(score);
    }

    // Length patterns
    const lengthBuckets = [
      { name: 'Short posts (<280 chars)', scores: shortPosts },
      { name: 'Medium posts (280-1000 chars)', scores: mediumPosts },
      { name: 'Long posts (>1000 chars)', scores: longPosts },
    ];

    for (const bucket of lengthBuckets) {
      if (bucket.scores.length < 3) continue;
      const avg = bucket.scores.reduce((s, v) => s + v, 0) / bucket.scores.length;
      const multiplier = baseline > 0 ? avg / baseline : 1;

      if (multiplier >= 1.2) {
        patterns.push({
          pattern: `${bucket.name} outperform average by ${multiplier.toFixed(1)}x`,
          category: 'format',
          confidence: this.computeConfidence(bucket.scores.length, rows.length, multiplier),
          sampleSize: bucket.scores.length,
          avgEngagement: avg,
          baselineEngagement: baseline,
          multiplier,
        });
      }
    }

    // Format type patterns
    for (const [format, scores] of Object.entries(formatBuckets)) {
      if (scores.length < 3) continue;
      const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
      const multiplier = baseline > 0 ? avg / baseline : 1;

      if (multiplier >= 1.2) {
        patterns.push({
          pattern: `${format} posts outperform average by ${multiplier.toFixed(1)}x`,
          category: 'format',
          confidence: this.computeConfidence(scores.length, rows.length, multiplier),
          sampleSize: scores.length,
          avgEngagement: avg,
          baselineEngagement: baseline,
          multiplier,
        });
      }
    }

    return patterns;
  }

  private extractPlatformPatterns(rows: PostWithEngagement[], baseline: number): ContentPattern[] {
    const patterns: ContentPattern[] = [];

    const platformBuckets: Record<string, number[]> = {};
    for (const row of rows) {
      if (!platformBuckets[row.platform]) platformBuckets[row.platform] = [];
      platformBuckets[row.platform].push(engagementScore(row));
    }

    // Compare platforms against each other
    const platformAvgs = Object.entries(platformBuckets)
      .filter(([, scores]) => scores.length >= 3)
      .map(([platform, scores]) => ({
        platform,
        avg: scores.reduce((s, v) => s + v, 0) / scores.length,
        count: scores.length,
      }))
      .sort((a, b) => b.avg - a.avg);

    for (const pdata of platformAvgs) {
      const multiplier = baseline > 0 ? pdata.avg / baseline : 1;

      if (multiplier >= 1.2) {
        patterns.push({
          pattern: `${pdata.platform} outperforms average by ${multiplier.toFixed(1)}x`,
          category: 'platform',
          confidence: this.computeConfidence(pdata.count, rows.length, multiplier),
          sampleSize: pdata.count,
          avgEngagement: pdata.avg,
          baselineEngagement: baseline,
          multiplier,
        });
      }
    }

    // Cross-platform comparison (best vs worst)
    if (platformAvgs.length >= 2) {
      const best = platformAvgs[0]!;
      const worst = platformAvgs[platformAvgs.length - 1]!;
      if (worst.avg > 0) {
        const crossMultiplier = best.avg / worst.avg;
        if (crossMultiplier >= 1.5) {
          patterns.push({
            pattern: `${best.platform} outperforms ${worst.platform} by ${crossMultiplier.toFixed(1)}x`,
            category: 'platform',
            confidence: this.computeConfidence(
              Math.min(best.count, worst.count), rows.length, crossMultiplier,
            ),
            sampleSize: best.count + worst.count,
            avgEngagement: best.avg,
            baselineEngagement: worst.avg,
            multiplier: crossMultiplier,
          });
        }
      }
    }

    return patterns;
  }

  private extractContentPatterns(rows: PostWithEngagement[], baseline: number): ContentPattern[] {
    const patterns: ContentPattern[] = [];

    const questionPosts: number[] = [];
    const nonQuestionPosts: number[] = [];
    const hashtagPosts: number[] = [];
    const noHashtagPosts: number[] = [];
    const ctaPosts: number[] = [];
    const nonCtaPosts: number[] = [];

    const ctaPatterns = /\b(check out|click|subscribe|follow|join|sign up|learn more|get started|try|grab|download)\b/i;

    for (const row of rows) {
      const score = engagementScore(row);

      // Questions
      if (row.content.includes('?')) {
        questionPosts.push(score);
      } else {
        nonQuestionPosts.push(score);
      }

      // Hashtags
      if (row.hashtags && row.hashtags.trim().length > 0) {
        hashtagPosts.push(score);
      } else {
        noHashtagPosts.push(score);
      }

      // Call-to-action
      if (ctaPatterns.test(row.content)) {
        ctaPosts.push(score);
      } else {
        nonCtaPosts.push(score);
      }
    }

    // Question pattern
    if (questionPosts.length >= 3 && nonQuestionPosts.length >= 3) {
      const qAvg = questionPosts.reduce((s, v) => s + v, 0) / questionPosts.length;
      const nqAvg = nonQuestionPosts.reduce((s, v) => s + v, 0) / nonQuestionPosts.length;
      const multiplier = nqAvg > 0 ? qAvg / nqAvg : 1;

      if (multiplier >= 1.2) {
        patterns.push({
          pattern: `Posts with questions get ${multiplier.toFixed(1)}x more engagement`,
          category: 'content',
          confidence: this.computeConfidence(questionPosts.length, rows.length, multiplier),
          sampleSize: questionPosts.length,
          avgEngagement: qAvg,
          baselineEngagement: baseline,
          multiplier,
        });
      }
    }

    // Hashtag pattern
    if (hashtagPosts.length >= 3 && noHashtagPosts.length >= 3) {
      const hAvg = hashtagPosts.reduce((s, v) => s + v, 0) / hashtagPosts.length;
      const nhAvg = noHashtagPosts.reduce((s, v) => s + v, 0) / noHashtagPosts.length;
      const multiplier = nhAvg > 0 ? hAvg / nhAvg : 1;

      if (multiplier >= 1.2) {
        patterns.push({
          pattern: `Posts with hashtags get ${multiplier.toFixed(1)}x more engagement`,
          category: 'content',
          confidence: this.computeConfidence(hashtagPosts.length, rows.length, multiplier),
          sampleSize: hashtagPosts.length,
          avgEngagement: hAvg,
          baselineEngagement: baseline,
          multiplier,
        });
      }
    }

    // CTA pattern
    if (ctaPosts.length >= 3 && nonCtaPosts.length >= 3) {
      const cAvg = ctaPosts.reduce((s, v) => s + v, 0) / ctaPosts.length;
      const ncAvg = nonCtaPosts.reduce((s, v) => s + v, 0) / nonCtaPosts.length;
      const multiplier = ncAvg > 0 ? cAvg / ncAvg : 1;

      if (multiplier >= 1.2) {
        patterns.push({
          pattern: `Posts with calls-to-action get ${multiplier.toFixed(1)}x more engagement`,
          category: 'content',
          confidence: this.computeConfidence(ctaPosts.length, rows.length, multiplier),
          sampleSize: ctaPosts.length,
          avgEngagement: cAvg,
          baselineEngagement: baseline,
          multiplier,
        });
      }
    }

    return patterns;
  }

  /**
   * Compute confidence based on sample size relative to total, and effect magnitude.
   * Higher sample sizes and larger effects yield higher confidence.
   */
  private computeConfidence(sampleSize: number, totalSize: number, multiplier: number): number {
    // Sample coverage factor (0-1): more data → higher confidence
    const coverage = Math.min(1, sampleSize / Math.max(1, totalSize));

    // Sample size factor: minimum 3, scales up to ~30
    const sizeFactor = Math.min(1, Math.log(sampleSize + 1) / Math.log(30));

    // Effect factor: larger effects are more likely real
    const effectFactor = Math.min(1, (multiplier - 1) / 2);

    return Math.min(1, (coverage * 0.3 + sizeFactor * 0.4 + effectFactor * 0.3));
  }
}
