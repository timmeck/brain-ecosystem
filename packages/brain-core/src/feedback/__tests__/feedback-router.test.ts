import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { FeedbackRouter } from '../feedback-router.js';
import type { FeedbackSource, FeedbackItem, FeedbackAction } from '../feedback-router.js';

describe('FeedbackRouter', () => {
  let db: Database.Database;

  beforeEach(() => { db = new Database(':memory:'); });
  afterEach(() => { db.close(); });

  it('creates with empty state', () => {
    const router = new FeedbackRouter(db);
    const status = router.getStatus();
    expect(status.sources).toBe(0);
    expect(status.totalProcessed).toBe(0);
    expect(status.totalActions).toBe(0);
  });

  it('registers sources', () => {
    const router = new FeedbackRouter(db);
    router.addSource({ name: 'test', fetch: () => [] });
    router.addSource({ name: 'test2', fetch: () => [] });
    expect(router.getStatus().sources).toBe(2);
  });

  it('processes AB test winner', async () => {
    const router = new FeedbackRouter(db);
    const actions: FeedbackAction[] = [];
    router.setActionHandler(async (a) => { actions.push(a); });

    router.addSource({
      name: 'ab-test',
      fetch: () => [{
        source: 'ab-test',
        type: 'ab_winner' as const,
        data: { winner: 'b', metric: 'click_rate', testId: 42 },
        confidence: 0.85,
      }],
    });

    const result = await router.processAll();
    expect(result.items).toBe(1);
    expect(result.actions).toBe(1);
    expect(actions[0].type).toBe('adjust_parameter');
    expect(actions[0].payload.value).toBe('b');
  });

  it('skips low-confidence AB winners', async () => {
    const router = new FeedbackRouter(db);
    const actions: FeedbackAction[] = [];
    router.setActionHandler(async (a) => { actions.push(a); });

    router.addSource({
      name: 'ab-test',
      fetch: () => [{
        source: 'ab-test',
        type: 'ab_winner' as const,
        data: { winner: 'a' },
        confidence: 0.3,
      }],
    });

    await router.processAll();
    expect(actions).toHaveLength(0);
  });

  it('processes competitor insights with topic seed', async () => {
    const router = new FeedbackRouter(db);
    const actions: FeedbackAction[] = [];
    router.setActionHandler(async (a) => { actions.push(a); });

    router.addSource({
      name: 'competitor',
      fetch: () => [{
        source: 'competitor',
        type: 'competitor_insight' as const,
        data: { verdict: 'Competitor posts more frequently', topicSeed: 'AI trends', competitorId: 5 },
        confidence: 0.7,
      }],
    });

    await router.processAll();
    expect(actions).toHaveLength(2); // frequency + topic seed
    expect(actions[0].type).toBe('adjust_parameter');
    expect(actions[1].type).toBe('creative_seed');
  });

  it('processes user patterns', async () => {
    const router = new FeedbackRouter(db);
    const actions: FeedbackAction[] = [];
    router.setActionHandler(async (a) => { actions.push(a); });

    router.addSource({
      name: 'user-model',
      fetch: () => [{
        source: 'user-model',
        type: 'user_pattern' as const,
        data: { activeHours: [9, 10, 14, 15, 16] },
        confidence: 0.6,
      }],
    });

    await router.processAll();
    expect(actions).toHaveLength(1);
    expect(actions[0].payload.parameter).toBe('optimal_posting_hours');
  });

  it('processes engagement feedback', async () => {
    const router = new FeedbackRouter(db);
    const actions: FeedbackAction[] = [];
    router.setActionHandler(async (a) => { actions.push(a); });

    router.addSource({
      name: 'engagement',
      fetch: () => [{
        source: 'engagement',
        type: 'engagement_feedback' as const,
        data: { avgEngagement: 42.5 },
        confidence: 0.9,
      }],
    });

    await router.processAll();
    expect(actions).toHaveLength(1);
    expect(actions[0].payload.value).toBe(42.5);
  });

  it('handles source errors gracefully', async () => {
    const router = new FeedbackRouter(db);
    router.addSource({
      name: 'broken',
      fetch: () => { throw new Error('DB locked'); },
    });

    const result = await router.processAll();
    expect(result.items).toBe(0);
  });

  it('handles action handler errors gracefully', async () => {
    const router = new FeedbackRouter(db);
    router.setActionHandler(async () => { throw new Error('handler fail'); });
    router.addSource({
      name: 'test',
      fetch: () => [{ source: 'test', type: 'engagement_feedback', data: { avgEngagement: 10 }, confidence: 0.9 }],
    });

    const result = await router.processAll();
    expect(result.actions).toBe(1); // action counted even if handler fails
  });

  it('processes multiple sources in one run', async () => {
    const router = new FeedbackRouter(db);
    const actions: FeedbackAction[] = [];
    router.setActionHandler(async (a) => { actions.push(a); });

    router.addSource({ name: 'src1', fetch: () => [{ source: 'src1', type: 'engagement_feedback', data: { avgEngagement: 10 }, confidence: 0.9 }] });
    router.addSource({ name: 'src2', fetch: () => [{ source: 'src2', type: 'user_pattern', data: { activeHours: [8] }, confidence: 0.6 }] });

    const result = await router.processAll();
    expect(result.items).toBe(2);
    expect(result.actions).toBe(2);
  });

  it('logs items without actions', async () => {
    const router = new FeedbackRouter(db);
    router.addSource({
      name: 'test',
      fetch: () => [{ source: 'test', type: 'custom' as const, data: { foo: 'bar' }, confidence: 0.3 }],
    });

    await router.processAll();
    const status = router.getStatus();
    expect(status.totalProcessed).toBe(1);
    expect(status.totalActions).toBe(0);
  });

  it('passes custom items with high confidence and actionType', async () => {
    const router = new FeedbackRouter(db);
    const actions: FeedbackAction[] = [];
    router.setActionHandler(async (a) => { actions.push(a); });

    router.addSource({
      name: 'custom',
      fetch: () => [{ source: 'custom', type: 'custom' as const, data: { actionType: 'special_action', key: 'val' }, confidence: 0.9 }],
    });

    await router.processAll();
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('special_action');
  });

  it('updates status after processing', async () => {
    const router = new FeedbackRouter(db);
    router.addSource({ name: 's', fetch: () => [{ source: 's', type: 'engagement_feedback', data: { avgEngagement: 5 }, confidence: 0.8 }] });
    router.setActionHandler(async () => {});

    await router.processAll();
    const status = router.getStatus();
    expect(status.totalProcessed).toBeGreaterThan(0);
    expect(status.lastRunAt).toBeTruthy();
  });
});
