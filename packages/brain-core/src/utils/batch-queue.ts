// ── Generic Batch Queue ─────────────────────────────────

export interface BatchQueueOptions<T, R> {
  /** Process a batch of items, returning results in the same order. */
  processor: (batch: T[]) => Promise<R[]>;
  /** Maximum items per batch. Default: 50 */
  batchSize?: number;
  /** Maximum concurrent batch calls. Default: 1 */
  concurrency?: number;
}

/**
 * Collects items and processes them in batches for efficiency.
 *
 * ```ts
 * const queue = new BatchQueue<string, boolean>({
 *   processor: async (batch) => batch.map(s => s.length > 3),
 *   batchSize: 10,
 * });
 * queue.add('hello');
 * queue.addMany(['world', 'hi']);
 * const results = await queue.flush();
 * ```
 */
export class BatchQueue<T, R> {
  private readonly processor: (batch: T[]) => Promise<R[]>;
  private readonly batchSize: number;
  private readonly concurrency: number;
  private items: T[] = [];
  private processedCount = 0;

  constructor(options: BatchQueueOptions<T, R>) {
    this.processor = options.processor;
    this.batchSize = options.batchSize ?? 50;
    this.concurrency = options.concurrency ?? 1;
  }

  /** Add a single item to the queue. */
  add(item: T): void {
    this.items.push(item);
  }

  /** Add multiple items to the queue. */
  addMany(items: T[]): void {
    this.items.push(...items);
  }

  /** Number of items waiting to be processed. */
  get pending(): number {
    return this.items.length;
  }

  /** Total items processed so far across all flush() calls. */
  get processed(): number {
    return this.processedCount;
  }

  /**
   * Process all pending items in batches and return results.
   * Respects concurrency limit for parallel batch processing.
   */
  async flush(): Promise<R[]> {
    if (this.items.length === 0) return [];

    const toProcess = this.items.splice(0);
    const allResults: R[] = [];

    // Split into batches
    const batches: T[][] = [];
    for (let i = 0; i < toProcess.length; i += this.batchSize) {
      batches.push(toProcess.slice(i, i + this.batchSize));
    }

    // Process batches with concurrency limit
    for (let i = 0; i < batches.length; i += this.concurrency) {
      const chunk = batches.slice(i, i + this.concurrency);
      const results = await Promise.all(chunk.map(batch => this.processor(batch)));
      for (const r of results) {
        allResults.push(...r);
      }
    }

    this.processedCount += toProcess.length;
    return allResults;
  }
}
