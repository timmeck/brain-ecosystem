import { describe, it, expect, vi } from 'vitest';
import { BatchQueue } from '../batch-queue.js';

describe('BatchQueue', () => {
  it('should process items in batches', async () => {
    const processor = vi.fn(async (batch: number[]) => batch.map(n => n * 2));
    const queue = new BatchQueue<number, number>({ processor, batchSize: 3 });

    queue.addMany([1, 2, 3, 4, 5]);
    const results = await queue.flush();

    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(processor).toHaveBeenCalledTimes(2); // 3 + 2
  });

  it('should track pending and processed counts', async () => {
    const queue = new BatchQueue<string, string>({
      processor: async (batch) => batch.map(s => s.toUpperCase()),
      batchSize: 10,
    });

    expect(queue.pending).toBe(0);
    expect(queue.processed).toBe(0);

    queue.add('hello');
    queue.add('world');
    expect(queue.pending).toBe(2);

    await queue.flush();
    expect(queue.pending).toBe(0);
    expect(queue.processed).toBe(2);
  });

  it('should return empty array when nothing to flush', async () => {
    const queue = new BatchQueue<number, number>({
      processor: async (batch) => batch,
    });
    const results = await queue.flush();
    expect(results).toEqual([]);
  });

  it('should respect concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const processor = async (batch: number[]) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
      return batch;
    };

    const queue = new BatchQueue<number, number>({ processor, batchSize: 1, concurrency: 2 });
    queue.addMany([1, 2, 3, 4]);
    await queue.flush();

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('should add single items', async () => {
    const queue = new BatchQueue<string, number>({
      processor: async (batch) => batch.map(s => s.length),
    });

    queue.add('hi');
    queue.add('hello');
    const results = await queue.flush();
    expect(results).toEqual([2, 5]);
  });

  it('should accumulate processed count across multiple flushes', async () => {
    const queue = new BatchQueue<number, number>({
      processor: async (batch) => batch,
      batchSize: 10,
    });

    queue.addMany([1, 2, 3]);
    await queue.flush();
    expect(queue.processed).toBe(3);

    queue.addMany([4, 5]);
    await queue.flush();
    expect(queue.processed).toBe(5);
  });

  it('should default batchSize to 50', async () => {
    const processor = vi.fn(async (batch: number[]) => batch);
    const queue = new BatchQueue<number, number>({ processor });

    const items = Array.from({ length: 100 }, (_, i) => i);
    queue.addMany(items);
    await queue.flush();

    expect(processor).toHaveBeenCalledTimes(2); // 50 + 50
  });

  it('should handle processor errors', async () => {
    const queue = new BatchQueue<number, number>({
      processor: async () => { throw new Error('batch failed'); },
    });
    queue.add(1);
    await expect(queue.flush()).rejects.toThrow('batch failed');
  });
});
