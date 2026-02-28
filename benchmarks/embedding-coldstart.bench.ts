/**
 * Embedding Engine Performance Benchmarks
 *
 * Measures:
 * - Cosine similarity (pure math, no model needed)
 * - Vector serialization / deserialization (Float32Array <-> Buffer)
 * - Embedding model cold-start time (requires @huggingface/transformers)
 * - Single text embedding latency
 * - Batch embedding (10, 100 texts)
 * - Memory usage before/after model load
 *
 * NOTE: Benchmarks that require @huggingface/transformers will gracefully
 * skip if the package is not installed, and only run the pure-math benchmarks.
 */

import {
  bench,
  benchAsync,
  printTable,
  toMarkdownTable,
  type BenchmarkResult,
} from './utils.js';

// ---------------------------------------------------------------------------
// Inline embedding engine math (from brain-core/src/embeddings/engine.ts)
// ---------------------------------------------------------------------------

function cosineSimilarityVec(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return Math.max(0, Math.min(1, dot));
}

function serializeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

function deserializeEmbedding(buffer: Buffer): Float32Array {
  const copy = Buffer.from(buffer);
  return new Float32Array(copy.buffer, copy.byteOffset, copy.length / 4);
}

function generateRandomEmbedding(dims: number = 384): Float32Array {
  const vec = new Float32Array(dims);
  let norm = 0;
  for (let i = 0; i < dims; i++) {
    vec[i] = Math.random() * 2 - 1;
    norm += vec[i]! * vec[i]!;
  }
  // L2-normalize
  norm = Math.sqrt(norm);
  for (let i = 0; i < dims; i++) {
    vec[i] = vec[i]! / norm;
  }
  return vec;
}

// ---------------------------------------------------------------------------
// Benchmarks: Pure math (always runnable)
// ---------------------------------------------------------------------------

console.log('');
console.log('###############################################################');
console.log('#  Embedding Engine Benchmarks                                #');
console.log('###############################################################');

// --- 1. Cosine similarity ---

const results1: BenchmarkResult[] = [];
for (const dims of [128, 384, 768, 1536]) {
  const a = generateRandomEmbedding(dims);
  const b = generateRandomEmbedding(dims);

  results1.push(bench(
    `cosine sim (${dims}d)`,
    () => { cosineSimilarityVec(a, b); },
    100_000,
  ));
}

printTable('Cosine Similarity (L2-normalized vectors)', results1);

// --- 2. Serialization ---

const results2: BenchmarkResult[] = [];
for (const dims of [128, 384, 768]) {
  const embedding = generateRandomEmbedding(dims);
  const bytes = dims * 4;

  results2.push(bench(
    `serialize (${dims}d / ${bytes}B)`,
    () => { serializeEmbedding(embedding); },
    50_000,
  ));
}

printTable('Embedding Serialization (Float32Array -> Buffer)', results2);

// --- 3. Deserialization ---

const results3: BenchmarkResult[] = [];
for (const dims of [128, 384, 768]) {
  const embedding = generateRandomEmbedding(dims);
  const buffer = serializeEmbedding(embedding);
  const bytes = dims * 4;

  results3.push(bench(
    `deserialize (${dims}d / ${bytes}B)`,
    () => { deserializeEmbedding(buffer); },
    50_000,
  ));
}

printTable('Embedding Deserialization (Buffer -> Float32Array)', results3);

// --- 4. Round-trip serialize+deserialize ---

const results4: BenchmarkResult[] = [];
for (const dims of [128, 384, 768]) {
  const embedding = generateRandomEmbedding(dims);

  results4.push(bench(
    `roundtrip (${dims}d)`,
    () => {
      const buf = serializeEmbedding(embedding);
      const vec = deserializeEmbedding(buf);
      // Verify correctness (trivial check)
      if (vec.length !== dims) throw new Error('Length mismatch');
    },
    50_000,
  ));
}

printTable('Serialize + Deserialize Round-Trip', results4);

// --- 5. Nearest neighbor search (brute force, simulated) ---

const results5: BenchmarkResult[] = [];
for (const n of [100, 1_000, 10_000]) {
  const dims = 384;
  const corpus = Array.from({ length: n }, () => generateRandomEmbedding(dims));
  const query = generateRandomEmbedding(dims);

  results5.push(bench(
    `brute-force kNN (${n} vecs, 384d)`,
    () => {
      const scores: Array<{ idx: number; score: number }> = [];
      for (let i = 0; i < corpus.length; i++) {
        scores.push({ idx: i, score: cosineSimilarityVec(query, corpus[i]!) });
      }
      scores.sort((a, b) => b.score - a.score);
      // Top 10
      scores.slice(0, 10);
    },
    n <= 1_000 ? 100 : 10,
  ));
}

printTable('Brute-Force k-NN Search (top-10)', results5);

// --- 6. Batch similarity matrix ---

const results6: BenchmarkResult[] = [];
for (const n of [10, 50, 100]) {
  const dims = 384;
  const vectors = Array.from({ length: n }, () => generateRandomEmbedding(dims));

  results6.push(bench(
    `sim matrix (${n}x${n}, 384d)`,
    () => {
      const matrix: number[][] = [];
      for (let i = 0; i < n; i++) {
        const row: number[] = [];
        for (let j = i + 1; j < n; j++) {
          row.push(cosineSimilarityVec(vectors[i]!, vectors[j]!));
        }
        matrix.push(row);
      }
    },
    n <= 50 ? 100 : 10,
  ));
}

printTable('Pairwise Similarity Matrix', results6);

// ---------------------------------------------------------------------------
// Benchmarks: Model-dependent (requires @huggingface/transformers)
// ---------------------------------------------------------------------------

async function runModelBenchmarks(): Promise<void> {
  let pipelineFn: unknown;
  let env: Record<string, unknown>;

  try {
    const transformers = await import('@huggingface/transformers');
    pipelineFn = transformers.pipeline;
    env = transformers.env as Record<string, unknown>;
  } catch {
    console.log('');
    console.log('  NOTE: @huggingface/transformers is not installed.');
    console.log('  Skipping model-dependent benchmarks (cold-start, embed, batch embed).');
    console.log('  Install with: npm install @huggingface/transformers');
    console.log('');
    return;
  }

  const modelName = 'Xenova/all-MiniLM-L6-v2';

  // --- Cold start ---
  console.log('');
  console.log('  Loading embedding model for cold-start benchmark...');

  const memBefore = process.memoryUsage();
  const coldStartT0 = performance.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pipeline = await (pipelineFn as any)('feature-extraction', modelName, { dtype: 'q8' });
  const coldStartMs = performance.now() - coldStartT0;

  const memAfter = process.memoryUsage();
  const heapDelta = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);
  const rssDelta = (memAfter.rss - memBefore.rss) / (1024 * 1024);

  console.log('');
  console.log('  Embedding Model Cold-Start');
  console.log('  ─────────────────────────');
  console.log(`  Model:       ${modelName}`);
  console.log(`  Cold-start:  ${coldStartMs.toFixed(1)} ms`);
  console.log(`  Heap delta:  ${heapDelta.toFixed(1)} MB`);
  console.log(`  RSS delta:   ${rssDelta.toFixed(1)} MB`);
  console.log(`  Heap total:  ${(memAfter.heapUsed / (1024 * 1024)).toFixed(1)} MB`);
  console.log(`  RSS total:   ${(memAfter.rss / (1024 * 1024)).toFixed(1)} MB`);
  console.log('');

  // --- Single text embed ---
  const embedResults: BenchmarkResult[] = [];
  const sampleTexts = [
    "TypeError: Cannot read properties of undefined",
    "Error: ENOENT: no such file or directory, open '/tmp/config.json'",
    "ReferenceError: process is not defined at server-side rendering of React component tree during build step",
  ];

  for (const text of sampleTexts) {
    const label = text.substring(0, 40) + '...';
    embedResults.push(await benchAsync(
      `embed: ${label}`,
      async () => {
        await pipeline(text, { pooling: 'mean', normalize: true });
      },
      20,
      3,
    ));
  }

  printTable('Single Text Embedding', embedResults);

  // --- Batch embedding ---
  const batchResults: BenchmarkResult[] = [];
  for (const batchSize of [5, 10, 50]) {
    const texts = Array.from(
      { length: batchSize },
      (_, i) => `Error #${i}: some error message about module_${i} at file_${i}.ts line ${i * 10}`,
    );

    batchResults.push(await benchAsync(
      `batch embed (${batchSize} texts)`,
      async () => {
        await pipeline(texts, { pooling: 'mean', normalize: true });
      },
      batchSize <= 10 ? 10 : 3,
      2,
    ));
  }

  printTable('Batch Embedding', batchResults);
}

// Run model benchmarks (async)
await runModelBenchmarks();

// --- Export markdown ---

const allSections = [
  toMarkdownTable('Cosine Similarity (L2-normalized vectors)', results1),
  toMarkdownTable('Embedding Serialization (Float32Array -> Buffer)', results2),
  toMarkdownTable('Embedding Deserialization (Buffer -> Float32Array)', results3),
  toMarkdownTable('Serialize + Deserialize Round-Trip', results4),
  toMarkdownTable('Brute-Force k-NN Search (top-10)', results5),
  toMarkdownTable('Pairwise Similarity Matrix', results6),
];

(globalThis as Record<string, unknown>).__benchmarkMarkdown =
  ((globalThis as Record<string, unknown>).__benchmarkMarkdown as string ?? '') +
  '\n## Embedding Engine Benchmarks\n\n' +
  allSections.join('\n');

console.log('Embedding engine benchmarks complete.');
