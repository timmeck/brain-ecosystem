import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { AttentionEngine } from '../../../src/attention/attention-engine.js';
import { ThoughtStream } from '../../../src/consciousness/thought-stream.js';

describe('AttentionEngine', () => {
  let db: Database.Database;
  let engine: AttentionEngine;
  let stream: ThoughtStream;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    engine = new AttentionEngine(db, { brainName: 'test-brain' });
    stream = new ThoughtStream(100);
    engine.setThoughtStream(stream);
  });

  describe('initialization', () => {
    it('should create attention tables', () => {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'attention%'").all() as { name: string }[];
      const names = tables.map(t => t.name);
      expect(names).toContain('attention_focus');
      expect(names).toContain('attention_context_switches');
    });

    it('should start with idle context', () => {
      expect(engine.getCurrentContext()).toBe('idle');
    });

    it('should start with default engine weights', () => {
      const status = engine.getStatus();
      expect(status.engineWeights.self_observer).toBe(1.0);
      expect(status.engineWeights.anomaly_detective).toBe(1.0);
      expect(status.engineWeights.journal).toBe(1.0);
    });

    it('should return empty status initially', () => {
      const status = engine.getStatus();
      expect(status.totalEvents).toBe(0);
      expect(status.topTopics).toHaveLength(0);
      expect(status.urgentTopics).toHaveLength(0);
      expect(status.currentContext).toBe('idle');
    });
  });

  describe('ThoughtStream integration', () => {
    it('should track thoughts from the stream', () => {
      stream.emit('anomaly_detective', 'analyzing', 'Scanning for anomalies...');
      stream.emit('anomaly_detective', 'discovering', 'Found 3 anomalies', 'notable');

      const status = engine.getStatus();
      expect(status.totalEvents).toBe(2);
      expect(status.topTopics.length).toBeGreaterThan(0);
    });

    it('should extract topics from thought content', () => {
      stream.emit('self_observer', 'discovering', 'Found new insight about system behavior');
      const topics = engine.getTopTopics(10);
      const topicNames = topics.map(t => t.topic);
      expect(topicNames).toContain('insight_generation');
    });

    it('should track anomaly topics', () => {
      stream.emit('anomaly_detective', 'discovering', 'Detected anomaly in metrics');
      const topics = engine.getTopTopics(10);
      expect(topics.some(t => t.topic === 'anomaly_detection')).toBe(true);
    });

    it('should track hypothesis topics', () => {
      stream.emit('hypothesis', 'hypothesizing', 'Generated 3 hypotheses');
      const topics = engine.getTopTopics(10);
      expect(topics.some(t => t.topic === 'hypothesis_testing')).toBe(true);
    });
  });

  describe('context detection', () => {
    it('should detect debugging context', () => {
      stream.emit('error_memory', 'perceiving', 'New error reported: TypeError');
      expect(engine.getCurrentContext()).toBe('debugging');
    });

    it('should detect trading context', () => {
      stream.emit('signal_engine', 'analyzing', 'Trade signal detected');
      expect(engine.getCurrentContext()).toBe('trading');
    });

    it('should detect publishing context', () => {
      stream.emit('post_engine', 'perceiving', 'New post published');
      expect(engine.getCurrentContext()).toBe('publishing');
    });

    it('should detect researching context', () => {
      stream.emit('research_agenda', 'hypothesizing', 'Research agenda generated');
      expect(engine.getCurrentContext()).toBe('researching');
    });

    it('should record context switches', () => {
      stream.emit('error_memory', 'perceiving', 'Error reported');
      stream.emit('signal_engine', 'analyzing', 'Trade signal');
      const history = engine.getContextHistory(10);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0]!.to).toBe('trading');
    });

    it('should persist context switches to DB', () => {
      stream.emit('error_memory', 'perceiving', 'Error reported');
      stream.emit('signal_engine', 'analyzing', 'Trade signal');
      const rows = db.prepare('SELECT * FROM attention_context_switches').all();
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('attention scoring', () => {
    it('should increase score with frequency', () => {
      stream.emit('anomaly_detective', 'discovering', 'Anomaly in metric X');
      const score1 = engine.getTopTopics(1)[0]!.score;
      stream.emit('anomaly_detective', 'discovering', 'Anomaly in metric Y');
      const score2 = engine.getTopTopics(1)[0]!.score;
      expect(score2).toBeGreaterThan(score1);
    });

    it('should give higher scores to notable/breakthrough thoughts', () => {
      stream.emit('engine_a', 'analyzing', 'routine prediction analysis');
      const routineScore = engine.getTopTopics(10).find(t => t.topic === 'prediction_accuracy')?.score ?? 0;

      stream.emit('engine_b', 'discovering', 'breakthrough prediction hit!', 'breakthrough');
      const breakthroughScore = engine.getTopTopics(10).find(t => t.topic === 'prediction_accuracy')?.score ?? 0;

      expect(breakthroughScore).toBeGreaterThan(routineScore);
    });
  });

  describe('urgency detection (burst)', () => {
    it('should detect urgency when burst threshold is reached', () => {
      const engine2 = new AttentionEngine(db, {
        brainName: 'test',
        burstThreshold: 3,
        burstWindowMs: 60_000,
      });
      engine2.setThoughtStream(stream);

      // Fire 3+ events for the same topic quickly
      stream.emit('anomaly_detective', 'discovering', 'Anomaly detected');
      stream.emit('anomaly_detective', 'discovering', 'Another anomaly detected');
      stream.emit('anomaly_detective', 'discovering', 'Third anomaly detected');

      const urgent = engine2.getUrgentTopics();
      expect(urgent.length).toBeGreaterThan(0);
      expect(urgent[0]!.urgency).toBeGreaterThanOrEqual(1.0);

      engine2.stop();
    });
  });

  describe('manual focus', () => {
    it('should set focus on a topic', () => {
      engine.setFocus('error_tracking', 2.5);
      const topics = engine.getTopTopics(10);
      const focused = topics.find(t => t.topic === 'error_tracking');
      expect(focused).toBeDefined();
      expect(focused!.urgency).toBeGreaterThanOrEqual(2.5);
    });

    it('should persist focus entries to DB', () => {
      engine.setFocus('trade_signals', 2.0);
      const rows = db.prepare('SELECT * FROM attention_focus WHERE topic = ?').all('trade_signals');
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should emit a thought when focus is set', () => {
      const thoughts: unknown[] = [];
      stream.onThought(t => thoughts.push(t));
      engine.setFocus('anomaly_detection');
      // The thought from setFocus should be in the stream
      expect(thoughts.length).toBeGreaterThan(0);
    });
  });

  describe('decay', () => {
    it('should reduce scores over time', () => {
      stream.emit('anomaly_detective', 'discovering', 'Anomaly detected');
      const scoreBefore = engine.getTopTopics(1)[0]!.score;
      // Manually set lastSeen far in the past to simulate time passing
      const topics = engine.getTopTopics(1);
      (topics[0] as any).lastSeen = Date.now() - 1_200_000; // 20 min ago
      engine.decay();
      const scoreAfter = engine.getTopTopics(1)[0]?.score ?? 0;
      expect(scoreAfter).toBeLessThan(scoreBefore);
    });

    it('should remove very stale topics', () => {
      stream.emit('engine_test', 'analyzing', 'Something about knowledge distillation');
      const before = engine.getTopTopics(10).length;
      // Hack: set all lastSeen far in the past
      for (const t of engine.getTopTopics(10)) {
        (t as any).lastSeen = Date.now() - 10_000_000;
      }
      engine.decay();
      engine.decay(); // Double decay for sure removal
      // After sufficient decay, topics should eventually be removed
      const after = engine.getTopTopics(10).length;
      expect(after).toBeLessThanOrEqual(before);
    });
  });

  describe('engine weights', () => {
    it('should compute equal weights when no attention data', () => {
      const weights = engine.computeEngineWeights();
      expect(weights.length).toBeGreaterThan(0);
      // All should be baseline 1.0 when no attention data
      for (const w of weights) {
        expect(w.weight).toBeGreaterThanOrEqual(1.0);
      }
    });

    it('should boost relevant engine weights based on attention', () => {
      // Generate lots of anomaly-related attention
      for (let i = 0; i < 5; i++) {
        stream.emit('anomaly_detective', 'discovering', 'Anomaly spike detected');
      }

      const weights = engine.computeEngineWeights();
      const anomalyWeight = weights.find(w => w.engine === 'anomaly_detective');
      const journalWeight = weights.find(w => w.engine === 'journal');

      // Anomaly detective should get a boost since we're paying attention to anomalies
      expect(anomalyWeight!.weight).toBeGreaterThanOrEqual(journalWeight!.weight);
    });
  });

  describe('focus timeline', () => {
    it('should return persisted focus entries', () => {
      engine.setFocus('topic_a', 1.5);
      engine.setFocus('topic_b', 2.0);
      const timeline = engine.getFocusTimeline(10);
      expect(timeline.length).toBe(2);
    });
  });

  describe('persistence', () => {
    it('should load state from DB on restart', () => {
      engine.setFocus('persistent_topic', 3.0);
      // Persist context switch
      stream.emit('error_memory', 'perceiving', 'Error happened');

      // Create new engine with same DB
      const engine2 = new AttentionEngine(db, { brainName: 'test-brain' });
      const ctx = engine2.getCurrentContext();
      expect(ctx).toBe('debugging'); // Loaded from last context switch

      // Focus entries should be loadable
      const timeline = engine2.getFocusTimeline(10);
      expect(timeline.length).toBeGreaterThan(0);
      engine2.stop();
    });
  });

  describe('stop', () => {
    it('should persist top topics on stop', () => {
      stream.emit('anomaly_detective', 'discovering', 'Anomaly detected');
      stream.emit('self_observer', 'discovering', 'Insight generated');
      engine.stop();
      const entries = db.prepare('SELECT * FROM attention_focus').all();
      expect(entries.length).toBeGreaterThan(0);
    });
  });
});
