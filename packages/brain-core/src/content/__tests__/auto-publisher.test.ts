import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { ContentForge } from '../content-forge.js';
import { AutoPublisher } from '../auto-publisher.js';

describe('AutoPublisher', () => {
  let db: Database.Database;
  let forge: ContentForge;

  beforeEach(() => {
    db = new Database(':memory:');
    forge = new ContentForge(db, { brainName: 'test' });
  });
  afterEach(() => { db.close(); });

  it('creates with default config', () => {
    const pub = new AutoPublisher(forge);
    const stats = pub.getStats();
    expect(stats.publishedToday).toBe(0);
    expect(stats.lastPublishAt).toBeNull();
    expect(stats.checksRun).toBe(0);
  });

  it('checkAndPublish returns 0 when no scheduled content', async () => {
    const pub = new AutoPublisher(forge);
    const result = await pub.checkAndPublish();
    expect(result.published).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('publishes scheduled content when due', async () => {
    const mockSocial = { post: vi.fn().mockResolvedValue({ id: 'post-1' }) };
    forge.setSocialService(mockSocial);

    const piece = forge.generateFromInsight({ insight: 'Test insight for publishing', noveltyScore: 0.8 });
    // Schedule for the past so it's due
    forge.schedule(piece.id, '2020-01-01T00:00:00Z');

    const pub = new AutoPublisher(forge);
    const result = await pub.checkAndPublish();
    expect(result.published).toBe(1);
    expect(mockSocial.post).toHaveBeenCalledOnce();
  });

  it('skips future-scheduled content', async () => {
    forge.setSocialService({ post: vi.fn().mockResolvedValue({ id: 'post-1' }) });

    const piece = forge.generateFromInsight({ insight: 'Future content', noveltyScore: 0.8 });
    forge.schedule(piece.id, '2099-12-31T23:59:59Z');

    const pub = new AutoPublisher(forge);
    const result = await pub.checkAndPublish();
    expect(result.published).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('respects rate limit per hour', async () => {
    forge.setSocialService({ post: vi.fn().mockResolvedValue({ id: 'post-1' }) });

    const p1 = forge.generateFromInsight({ insight: 'Content 1', noveltyScore: 0.8 });
    const p2 = forge.generateFromInsight({ insight: 'Content 2', noveltyScore: 0.8 });

    forge.schedule(p1.id, '2020-01-01T00:00:00Z');
    forge.schedule(p2.id, '2020-01-01T00:00:00Z');

    const pub = new AutoPublisher(forge, { maxPublishPerHour: 1, minTimeBetweenPostsMs: 0, engagementCheckDelayMs: 3600000, requireLLMPolish: false });
    const result = await pub.checkAndPublish();
    expect(result.published).toBe(1);
  });

  it('handles publish failures gracefully', async () => {
    forge.setSocialService({ post: vi.fn().mockRejectedValue(new Error('API down')) });

    const piece = forge.generateFromInsight({ insight: 'Will fail', noveltyScore: 0.8 });
    forge.schedule(piece.id, '2020-01-01T00:00:00Z');

    const pub = new AutoPublisher(forge);
    const result = await pub.checkAndPublish();
    expect(result.published).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('auto-schedules drafts at optimal time', async () => {
    forge.setSocialService({ post: vi.fn().mockResolvedValue({ id: 'post-1' }) });

    // Create a draft but don't schedule it
    forge.generateFromInsight({ insight: 'Unscheduled draft content piece', noveltyScore: 0.8 });

    const pub = new AutoPublisher(forge);
    await pub.checkAndPublish();

    // Draft should now be scheduled
    const scheduled = forge.getSchedule();
    expect(scheduled.length).toBeGreaterThanOrEqual(1);
  });

  it('tracks stats correctly', async () => {
    forge.setSocialService({ post: vi.fn().mockResolvedValue({ id: 'post-1' }) });

    const piece = forge.generateFromInsight({ insight: 'Stats test', noveltyScore: 0.8 });
    forge.schedule(piece.id, '2020-01-01T00:00:00Z');

    const pub = new AutoPublisher(forge, { maxPublishPerHour: 5, minTimeBetweenPostsMs: 0, engagementCheckDelayMs: 100, requireLLMPolish: false });
    await pub.checkAndPublish();

    const stats = pub.getStats();
    expect(stats.publishedToday).toBe(1);
    expect(stats.lastPublishAt).not.toBeNull();
    expect(stats.checksRun).toBe(1);
  });

  it('resetDaily clears daily count', async () => {
    forge.setSocialService({ post: vi.fn().mockResolvedValue({ id: 'post-1' }) });
    const piece = forge.generateFromInsight({ insight: 'Reset test', noveltyScore: 0.8 });
    forge.schedule(piece.id, '2020-01-01T00:00:00Z');

    const pub = new AutoPublisher(forge, { maxPublishPerHour: 5, minTimeBetweenPostsMs: 0, engagementCheckDelayMs: 100, requireLLMPolish: false });
    await pub.checkAndPublish();

    expect(pub.getStats().publishedToday).toBe(1);
    pub.resetDaily();
    expect(pub.getStats().publishedToday).toBe(0);
  });

  it('refreshEngagement processes due checks', async () => {
    const pub = new AutoPublisher(forge, { maxPublishPerHour: 5, minTimeBetweenPostsMs: 0, engagementCheckDelayMs: 0, requireLLMPolish: false });

    forge.setSocialService({ post: vi.fn().mockResolvedValue({ id: 'post-1' }) });
    const piece = forge.generateFromInsight({ insight: 'Engagement test', noveltyScore: 0.8 });
    forge.schedule(piece.id, '2020-01-01T00:00:00Z');

    await pub.checkAndPublish();

    // With engagementCheckDelayMs: 0, the check should be due immediately
    const refreshed = await pub.refreshEngagement();
    expect(refreshed).toBeGreaterThanOrEqual(1);
  });

  it('start and stop manage hourly timer', () => {
    const pub = new AutoPublisher(forge);
    pub.start();
    pub.stop();
    // No error = success
  });

  it('handles no social service gracefully', async () => {
    // No social service set → publishNow returns { success: false }
    const piece = forge.generateFromInsight({ insight: 'No social', noveltyScore: 0.8 });
    forge.schedule(piece.id, '2020-01-01T00:00:00Z');

    const pub = new AutoPublisher(forge);
    const result = await pub.checkAndPublish();
    expect(result.published).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
