import { describe, it, expect, vi } from 'vitest';
import { TypedEventBus } from '../events.js';

type TestEvents = {
  'test:fired': { value: number };
  'test:other': { name: string };
};

describe('TypedEventBus', () => {
  it('emits and receives events', () => {
    const bus = new TypedEventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('test:fired', handler);
    bus.emit('test:fired', { value: 42 });
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('supports once listener', () => {
    const bus = new TypedEventBus<TestEvents>();
    const handler = vi.fn();
    bus.once('test:fired', handler);
    bus.emit('test:fired', { value: 1 });
    bus.emit('test:fired', { value: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports off to remove listener', () => {
    const bus = new TypedEventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('test:fired', handler);
    bus.off('test:fired', handler);
    bus.emit('test:fired', { value: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles multiple event types independently', () => {
    const bus = new TypedEventBus<TestEvents>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    bus.on('test:fired', handler1);
    bus.on('test:other', handler2);
    bus.emit('test:fired', { value: 10 });
    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).not.toHaveBeenCalled();
  });
});
