import { describe, it, expect } from 'vitest';
import { ThoughtStream } from '../thought-stream.js';

describe('ThoughtStream', () => {
  it('emits and retrieves thoughts', () => {
    const ts = new ThoughtStream();
    ts.emit('test_engine', 'analyzing', 'Test thought');
    const recent = ts.getRecent(10);
    expect(recent.length).toBe(1);
    expect(recent[0].engine).toBe('test_engine');
  });

  it('registerEngine makes engine appear in getEngineActivity()', () => {
    const ts = new ThoughtStream();
    ts.registerEngine('my_engine');
    const activity = ts.getEngineActivity();
    const names = activity.map(a => a.engine);
    expect(names).toContain('my_engine');
  });

  it('getEngineActivity returns empty array after clear', () => {
    const ts = new ThoughtStream();
    ts.registerEngine('engine_a');
    ts.clear();
    expect(ts.getEngineActivity()).toHaveLength(0);
  });

  it('respects maxThoughts buffer limit', () => {
    const ts = new ThoughtStream(5);
    for (let i = 0; i < 10; i++) {
      ts.emit('engine', 'perceiving', `Thought ${i}`);
    }
    const recent = ts.getRecent(100);
    expect(recent.length).toBe(5);
  });

  it('getStats returns correct counts', () => {
    const ts = new ThoughtStream();
    ts.emit('a', 'analyzing', 'one');
    ts.emit('b', 'discovering', 'two', 'breakthrough');
    const stats = ts.getStats();
    expect(stats.totalThoughts).toBe(2);
    expect(stats.thoughtsPerEngine['a']).toBe(1);
    expect(stats.thoughtsPerEngine['b']).toBe(1);
  });

  it('onThought listener receives new thoughts', () => {
    const ts = new ThoughtStream();
    const received: string[] = [];
    const unsub = ts.onThought(t => received.push(t.content));
    ts.emit('e', 'perceiving', 'hello');
    ts.emit('e', 'perceiving', 'world');
    expect(received).toEqual(['hello', 'world']);
    unsub();
    ts.emit('e', 'perceiving', 'ignored');
    expect(received.length).toBe(2);
  });

  it('getByEngine filters correctly', () => {
    const ts = new ThoughtStream();
    ts.emit('alpha', 'analyzing', 'a1');
    ts.emit('beta', 'analyzing', 'b1');
    ts.emit('alpha', 'analyzing', 'a2');
    const alphaThoughts = ts.getByEngine('alpha');
    expect(alphaThoughts.length).toBe(2);
    expect(alphaThoughts.every(t => t.engine === 'alpha')).toBe(true);
  });
});
