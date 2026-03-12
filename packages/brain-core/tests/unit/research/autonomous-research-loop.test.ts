import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { AutonomousResearchLoop } from '../../../src/research/autonomous-research-loop.js';

vi.mock('../../../src/utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
  }),
}));

describe('AutonomousResearchLoop', () => {
  let db: Database.Database;
  let loop: AutonomousResearchLoop;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    loop = new AutonomousResearchLoop(db, { enabled: true });
  });

  afterEach(() => {
    loop.stop();
    db.close();
  });

  // ── Construction ────────────────────────────────────────

  it('should create tables on construction', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='autonomous_research_log'").all();
    expect(tables.length).toBe(1);
  });

  it('should use default config values', () => {
    const config = loop.getConfig();
    expect(config.maxMissionsPerDay).toBe(5);
    expect(config.cycleCooldownMs).toBe(30 * 60_000);
    expect(config.minGapScore).toBe(0.5);
    expect(config.minDesirePriority).toBe(5);
    expect(config.missionDepth).toBe('standard');
    expect(config.enabled).toBe(true);
  });

  // ── Disabled ────────────────────────────────────────────

  it('should skip cycle when disabled', async () => {
    loop.updateConfig({ enabled: false });
    const result = await loop.cycle();
    expect(result.action).toBe('skipped_disabled');
  });

  // ── No targets ──────────────────────────────────────────

  it('should skip when no gaps or desires available', async () => {
    const result = await loop.cycle();
    expect(result.action).toBe('skipped_no_target');
  });

  it('should skip when gaps are below threshold', async () => {
    loop.setSources({
      getCuriosityGaps: () => [{ topic: 'weak topic', gapScore: 0.3, gapType: 'shallow', questions: [] }],
    });
    const result = await loop.cycle();
    expect(result.action).toBe('skipped_no_target');
  });

  // ── Mission launch ──────────────────────────────────────

  it('should launch mission from curiosity gap', async () => {
    const createMission = vi.fn().mockReturnValue({ id: 42, topic: 'AI reasoning', status: 'pending' });
    loop.setSources({
      getCuriosityGaps: () => [
        { topic: 'AI reasoning', gapScore: 0.8, gapType: 'unexplored', questions: ['How does AI reason about causality?'] },
      ],
      createMission,
    });

    const result = await loop.cycle();
    expect(result.action).toBe('mission_launched');
    expect(result.topic).toBe('How does AI reason about causality?');
    expect(result.missionId).toBe(42);
    expect(createMission).toHaveBeenCalledWith('How does AI reason about causality?', 'standard');
  });

  it('should launch mission from desire when no gaps', async () => {
    const createMission = vi.fn().mockReturnValue({ id: 7, topic: 'prediction accuracy', status: 'pending' });
    loop.setSources({
      getCuriosityGaps: () => [],
      getDesires: () => [{ key: 'low_accuracy', suggestion: 'Improve "prediction accuracy" methods', priority: 7 }],
      createMission,
    });

    const result = await loop.cycle();
    expect(result.action).toBe('mission_launched');
    expect(result.topic).toBe('prediction accuracy');
  });

  it('should prefer higher score candidates', async () => {
    const createMission = vi.fn().mockReturnValue({ id: 1, topic: 'test', status: 'pending' });
    loop.setSources({
      getCuriosityGaps: () => [
        { topic: 'low gap', gapScore: 0.5, gapType: 'shallow', questions: ['low?'] },
        { topic: 'high gap', gapScore: 0.95, gapType: 'dark_zone', questions: ['high?'] },
      ],
      createMission,
    });

    const result = await loop.cycle();
    expect(result.topic).toBe('high?');
  });

  // ── Budget guards ───────────────────────────────────────

  it('should respect daily mission limit', async () => {
    let callCount = 0;
    const createMission = vi.fn().mockImplementation((topic: string) => {
      callCount++;
      return { id: callCount, topic, status: 'pending' };
    });
    // Each cycle returns a unique topic to avoid dedup
    let gapIndex = 0;
    const topics = ['alpha research', 'beta analysis', 'gamma theory'];
    loop.setSources({
      getCuriosityGaps: () => {
        const t = topics[gapIndex % topics.length]!;
        gapIndex++;
        return [{ topic: t, gapScore: 0.9, gapType: 'unexplored', questions: [t] }];
      },
      createMission,
    });
    loop.updateConfig({ maxMissionsPerDay: 2, cycleCooldownMs: 0 });

    // Launch 2 missions (at limit)
    await loop.cycle();
    await loop.cycle();
    expect(createMission).toHaveBeenCalledTimes(2);

    // Third should be blocked
    const result = await loop.cycle();
    expect(result.action).toBe('skipped_budget');
  });

  it('should respect token budget check', async () => {
    loop.setSources({
      getCuriosityGaps: () => [{ topic: 'test', gapScore: 0.9, gapType: 'unexplored', questions: ['test?'] }],
      createMission: () => ({ id: 1, topic: 'test', status: 'pending' }),
      checkBudget: () => ({ allowed: false, reason: 'hourly limit reached' }),
    });

    const result = await loop.cycle();
    expect(result.action).toBe('skipped_budget');
    expect(result.reason).toContain('hourly limit');
  });

  // ── Dedup ───────────────────────────────────────────────

  it('should skip topics similar to recent research', async () => {
    const createMission = vi.fn().mockReturnValue({ id: 1, topic: 'test', status: 'pending' });
    loop.setSources({
      getCuriosityGaps: () => [{ topic: 'AI reasoning systems', gapScore: 0.9, gapType: 'unexplored', questions: ['AI reasoning systems'] }],
      createMission,
    });
    loop.updateConfig({ cycleCooldownMs: 0 });

    // First launch succeeds
    const r1 = await loop.cycle();
    expect(r1.action).toBe('mission_launched');

    // Same topic → skipped
    const r2 = await loop.cycle();
    expect(r2.action).toBe('skipped_no_target');
  });

  // ── Observation hook ────────────────────────────────────

  it('should call observeHypothesis on mission launch', async () => {
    const observe = vi.fn();
    loop.setSources({
      getCuriosityGaps: () => [{ topic: 'test', gapScore: 0.9, gapType: 'unexplored', questions: ['test?'] }],
      createMission: () => ({ id: 1, topic: 'test', status: 'pending' }),
      observeHypothesis: observe,
    });

    await loop.cycle();
    expect(observe).toHaveBeenCalledWith(expect.objectContaining({
      source: 'autonomous_research',
      type: 'mission_launched',
      value: 1,
    }));
  });

  // ── Status ──────────────────────────────────────────────

  it('should report accurate status', async () => {
    const createMission = vi.fn().mockReturnValue({ id: 1, topic: 'test', status: 'pending' });
    loop.setSources({
      getCuriosityGaps: () => [{ topic: 'test', gapScore: 0.9, gapType: 'unexplored', questions: ['test?'] }],
      createMission,
    });

    const before = loop.getStatus();
    expect(before.enabled).toBe(true);
    expect(before.cyclesCompleted).toBe(0);
    expect(before.missionsLaunchedToday).toBe(0);

    await loop.cycle();

    const after = loop.getStatus();
    expect(after.cyclesCompleted).toBe(1);
    expect(after.missionsLaunchedToday).toBe(1);
    expect(after.lastTopic).toBe('test?');
    expect(after.recentTopics).toContain('test?');
  });

  // ── Config update ───────────────────────────────────────

  it('should update config at runtime', () => {
    loop.updateConfig({ maxMissionsPerDay: 10, missionDepth: 'deep' });
    const config = loop.getConfig();
    expect(config.maxMissionsPerDay).toBe(10);
    expect(config.missionDepth).toBe('deep');
  });

  // ── Journal integration ─────────────────────────────────

  it('should record journal entry on mission launch', async () => {
    const recordDiscovery = vi.fn();
    loop.setJournal({ recordDiscovery } as never);
    loop.setSources({
      getCuriosityGaps: () => [{ topic: 'quantum computing', gapScore: 0.9, gapType: 'dark_zone', questions: ['quantum?'] }],
      createMission: () => ({ id: 5, topic: 'quantum?', status: 'pending' }),
    });

    await loop.cycle();
    expect(recordDiscovery).toHaveBeenCalledWith(
      expect.stringContaining('quantum'),
      expect.stringContaining('Self-directed'),
      expect.objectContaining({ mission_id: 5 }),
      'routine',
    );
  });
});
