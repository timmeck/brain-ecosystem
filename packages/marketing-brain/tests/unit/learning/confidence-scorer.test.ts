import { describe, it, expect } from 'vitest';
import { engagementScore } from '../../../src/learning/confidence-scorer.js';

describe('engagementScore', () => {
  it('should compute weighted score from all metrics', () => {
    const score = engagementScore({
      likes: 10,     // 10 * 1 = 10
      comments: 5,   // 5 * 3 = 15
      shares: 2,     // 2 * 5 = 10
      clicks: 8,     // 8 * 2 = 16
      saves: 3,      // 3 * 4 = 12
      impressions: 1000, // 1000 * 0.01 = 10
    });
    expect(score).toBe(73);
  });

  it('should weight shares highest among single-unit metrics', () => {
    const sharesOnly = engagementScore({ shares: 1 });
    const likesOnly = engagementScore({ likes: 1 });
    const commentsOnly = engagementScore({ comments: 1 });
    const clicksOnly = engagementScore({ clicks: 1 });
    const savesOnly = engagementScore({ saves: 1 });

    expect(sharesOnly).toBe(5);
    expect(savesOnly).toBe(4);
    expect(commentsOnly).toBe(3);
    expect(clicksOnly).toBe(2);
    expect(likesOnly).toBe(1);
  });

  it('should handle all zeros', () => {
    const score = engagementScore({
      likes: 0, comments: 0, shares: 0,
      impressions: 0, clicks: 0, saves: 0,
    });
    expect(score).toBe(0);
  });

  it('should handle missing (undefined) metrics gracefully', () => {
    const score = engagementScore({});
    expect(score).toBe(0);
  });

  it('should handle partial metrics', () => {
    const score = engagementScore({ likes: 100, comments: 20 });
    // 100 * 1 + 20 * 3 = 160
    expect(score).toBe(160);
  });

  it('should weight impressions very low', () => {
    const impressionsOnly = engagementScore({ impressions: 10000 });
    // 10000 * 0.01 = 100
    expect(impressionsOnly).toBe(100);
  });

  it('should compute correctly for a high-engagement post', () => {
    const score = engagementScore({
      likes: 500, comments: 100, shares: 50,
      clicks: 200, saves: 30, impressions: 50000,
    });
    // 500*1 + 100*3 + 50*5 + 200*2 + 30*4 + 50000*0.01
    // = 500 + 300 + 250 + 400 + 120 + 500 = 2070
    expect(score).toBe(2070);
  });
});
