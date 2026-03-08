import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { TeachingProtocol, runTeachingMigration } from '../teaching-protocol.js';
import { Curriculum, runCurriculumMigration } from '../curriculum.js';

vi.mock('../../utils/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

describe('TeachingProtocol', () => {
  let db: Database.Database;
  let protocol: TeachingProtocol;

  beforeEach(() => {
    db = new Database(':memory:');
    protocol = new TeachingProtocol(db, { brainName: 'brain' });
  });

  afterEach(() => {
    db.close();
  });

  it('teach creates a sent lesson', () => {
    const lesson = protocol.teach('trading-brain', {
      domain: 'error-handling',
      principle: 'Always validate input before processing',
      evidence: 'Observed 30% fewer crashes after validation',
      applicability: 0.8,
    });

    expect(lesson.id).toBeDefined();
    expect(lesson.direction).toBe('sent');
    expect(lesson.targetBrain).toBe('trading-brain');
    expect(lesson.sourceBrain).toBe('brain');
    expect(lesson.domain).toBe('error-handling');
    expect(lesson.principle).toBe('Always validate input before processing');
    expect(lesson.applicability).toBe(0.8);
  });

  it('learn accepts relevant lesson', () => {
    const result = protocol.learn({
      sourceBrain: 'trading-brain',
      domain: 'code patterns',
      principle: 'Error handling reduces code bugs significantly',
      evidence: 'Proven in production for 6 months',
      applicability: 0.9,
    });

    // Contains keywords matching 'brain' domain ('error', 'code', 'bug')
    expect(result.relevanceScore).toBeGreaterThan(0);
    expect(result.accepted).toBe(true);
  });

  it('learn rejects irrelevant lesson', () => {
    const result = protocol.learn({
      sourceBrain: 'marketing-brain',
      domain: 'astronomy',
      principle: 'Stars rotate around galactic center',
      applicability: 0.1,
    });

    // No keyword overlap with 'brain' domain
    expect(result.relevanceScore).toBeLessThan(0.3);
    expect(result.accepted).toBe(false);
  });

  it('requestLesson creates a request record', () => {
    const request = protocol.requestLesson('trading-brain', 'market signals');

    expect(request.id).toBeDefined();
    expect(request.direction).toBe('sent');
    expect(request.targetBrain).toBe('trading-brain');
    expect(request.domain).toBe('market signals');
    expect(request.principle).toContain('REQUEST');
  });

  it('getHistory returns lessons in order', () => {
    protocol.teach('trading-brain', { domain: 'a', principle: 'First' });
    protocol.teach('marketing-brain', { domain: 'b', principle: 'Second' });
    protocol.learn({ sourceBrain: 'trading-brain', domain: 'c', principle: 'Third about error code' });

    const all = protocol.getHistory();
    expect(all.length).toBe(3);
    // Most recent first
    expect(all[0].principle).toContain('Third');

    const sent = protocol.getHistory('sent');
    expect(sent.length).toBe(2);

    const received = protocol.getHistory('received');
    expect(received.length).toBe(1);
  });

  it('getStatus returns correct counts', () => {
    protocol.teach('trading-brain', { domain: 'x', principle: 'A' });
    protocol.teach('marketing-brain', { domain: 'y', principle: 'B' });
    protocol.learn({ sourceBrain: 'trading-brain', domain: 'z', principle: 'Error code bug fix', applicability: 0.9 });

    const status = protocol.getStatus();
    expect(status.totalSent).toBe(2);
    expect(status.totalReceived).toBe(1);
    expect(status.acceptedCount).toBeGreaterThanOrEqual(1);
    expect(typeof status.avgRelevance).toBe('number');
  });

  it('teach() calls notifier.notifyPeer when notifier is set', async () => {
    const mockNotifier = { notifyPeer: vi.fn().mockResolvedValue(undefined) };
    protocol.setNotifier(mockNotifier);

    protocol.teach('trading-brain', {
      domain: 'error-handling',
      principle: 'Validate inputs early',
      evidence: 'Reduces crashes by 30%',
      applicability: 0.8,
    });

    // notifyPeer is called asynchronously — give it a tick
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockNotifier.notifyPeer).toHaveBeenCalledWith(
      'trading-brain',
      'teaching.learn',
      expect.objectContaining({
        sourceBrain: 'brain',
        domain: 'error-handling',
        principle: 'Validate inputs early',
      }),
    );
  });

  it('teach() works without notifier (backward compat)', () => {
    // No notifier set — should not throw
    const lesson = protocol.teach('trading-brain', {
      domain: 'testing',
      principle: 'Test everything',
    });
    expect(lesson.id).toBeDefined();
    expect(lesson.direction).toBe('sent');
  });

  it('learn() receives incoming lesson and stores as received', () => {
    const result = protocol.learn({
      sourceBrain: 'trading-brain',
      domain: 'error patterns',
      principle: 'Error handling with retry logic improves code stability',
      applicability: 0.7,
    });
    expect(typeof result.relevanceScore).toBe('number');

    // Verify stored as received
    const history = protocol.getHistory('received');
    expect(history.length).toBe(1);
    expect(history[0].sourceBrain).toBe('trading-brain');
    expect(history[0].direction).toBe('received');
  });

  it('full roundtrip: teach on brain A → learn on brain B', async () => {
    // Simulate brain B
    const dbB = new Database(':memory:');
    const brainB = new TeachingProtocol(dbB, { brainName: 'trading-brain' });

    // Brain A's notifier delivers to brain B's learn()
    const mockNotifier = {
      notifyPeer: vi.fn().mockImplementation(async (_peer: string, _event: string, data: unknown) => {
        brainB.learn(data as any);
      }),
    };
    protocol.setNotifier(mockNotifier);

    protocol.teach('trading-brain', {
      domain: 'error-handling',
      principle: 'Always validate inputs before processing code',
      evidence: '30% fewer bugs',
      applicability: 0.9,
    });

    await new Promise(resolve => setTimeout(resolve, 10));

    // Brain A: 1 sent
    expect(protocol.getStatus().totalSent).toBe(1);
    // Brain B: 1 received
    expect(brainB.getStatus().totalReceived).toBe(1);

    dbB.close();
  });

  it('migration is idempotent (teaching)', () => {
    runTeachingMigration(db);
    runTeachingMigration(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='teaching_lessons'")
      .all();
    expect(tables.length).toBe(1);
  });
});

describe('Curriculum', () => {
  let db: Database.Database;
  let curriculum: Curriculum;

  beforeEach(() => {
    db = new Database(':memory:');
    curriculum = new Curriculum(db);
  });

  afterEach(() => {
    db.close();
  });

  it('registerPrinciple stores item', () => {
    const item = curriculum.registerPrinciple('brain', 'error-handling', 'Always validate input', 0.8);
    expect(item.id).toBeDefined();
    expect(item.brainName).toBe('brain');
    expect(item.domain).toBe('error-handling');
    expect(item.strength).toBe(0.8);
    expect(item.teachable).toBe(false);
  });

  it('getTeachable returns only teachable items', () => {
    const item1 = curriculum.registerPrinciple('brain', 'd1', 'P1', 0.9);
    curriculum.registerPrinciple('brain', 'd2', 'P2', 0.7);

    // Nothing teachable yet
    expect(curriculum.getTeachable('brain').length).toBe(0);

    // Mark one as teachable
    curriculum.markTeachable(item1.id!);

    const teachable = curriculum.getTeachable('brain');
    expect(teachable.length).toBe(1);
    expect(teachable[0].principle).toBe('P1');
    expect(teachable[0].teachable).toBe(true);
  });

  it('getStatus returns summary', () => {
    curriculum.registerPrinciple('brain', 'd1', 'P1', 0.9);
    curriculum.registerPrinciple('trading-brain', 'd2', 'P2', 0.7);
    const item3 = curriculum.registerPrinciple('brain', 'd3', 'P3', 0.6);
    curriculum.markTeachable(item3.id!);

    const status = curriculum.getStatus();
    expect(status.totalPrinciples).toBe(3);
    expect(status.teachableCount).toBe(1);
    expect(status.byBrain['brain']).toBe(2);
    expect(status.byBrain['trading-brain']).toBe(1);
  });

  it('migration is idempotent (curriculum)', () => {
    runCurriculumMigration(db);
    runCurriculumMigration(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='curriculum_items'")
      .all();
    expect(tables.length).toBe(1);
  });
});
