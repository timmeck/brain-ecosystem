/**
 * Error Matching / Fingerprinting Performance Benchmarks
 *
 * Measures:
 * - Fingerprint generation (templateMessage + sha256)
 * - SHA-256 hash computation throughput
 * - SQLite fingerprint lookups (exact match + LIKE queries)
 * - TF-IDF index build + query
 * - Cosine similarity computation
 * - Full error matching pipeline (multi-signal scoring)
 */

import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import {
  bench,
  printTable,
  toMarkdownTable,
  randomErrorMessage,
  randomErrorType,
  randomFilePath,
  randomRawOutput,
  type BenchmarkResult,
} from './utils.js';

// ---------------------------------------------------------------------------
// Inline the functions we're benchmarking (avoids needing compiled brain pkg)
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function templateMessage(msg: string): string {
  return msg
    .replace(/[A-Z]:\\[\w\-.\\ ]+\.\w+/g, '<PATH>')
    .replace(/\/[\w\-./ ]+\.\w+/g, '<PATH>')
    .replace(/:(\d+):(\d+)/g, ':<LINE>:<COL>')
    .replace(/line \d+/gi, 'line <LINE>')
    .replace(/0x[0-9a-fA-F]+/g, '<ADDR>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/https?:\/\/[^\s]+/g, '<URL>')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/g, '<TIMESTAMP>')
    .replace(/\(reading ['"][^'"]*['"]\)/g, "(reading '<PROP>')")
    .replace(/\(writing ['"][^'"]*['"]\)/g, "(writing '<PROP>')")
    .replace(/['"][a-zA-Z_$][\w$]*['"]/g, "'<IDENT>'");
}

function generateFingerprint(errorType: string, message: string, topFrames: string): string {
  const template = templateMessage(message);
  const input = `${errorType}::${template}::${topFrames}`;
  return sha256(input);
}

// Token-based similarity (from matching/similarity.ts)
const STOPWORDS = new Set([
  'the', 'is', 'are', 'a', 'an', 'and', 'or', 'not', 'in', 'at', 'by', 'for',
  'from', 'of', 'on', 'to', 'with', 'as', 'error', 'exception', 'throw', 'catch',
  'was', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
]);

function tokenize(text: string): string[] {
  const words = text.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 0);
  const tokens: string[] = [];
  for (const word of words) {
    tokens.push(
      ...word
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .split(/\s+/)
        .filter(t => t.length > 0),
    );
  }
  const cleaned = tokens.filter(t => !STOPWORDS.has(t.toLowerCase()));
  return [...new Set(cleaned.map(t => t.toLowerCase()))];
}

function cosineSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;
  const vocab = new Set([...tokensA, ...tokensB]);
  const vecA = new Map<string, number>();
  const vecB = new Map<string, number>();
  for (const t of tokensA) vecA.set(t, (vecA.get(t) ?? 0) + 1);
  for (const t of tokensB) vecB.set(t, (vecB.get(t) ?? 0) + 1);
  let dot = 0, magA = 0, magB = 0;
  for (const word of vocab) {
    const a = vecA.get(word) ?? 0;
    const b = vecB.get(word) ?? 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// TF-IDF index (from matching/tfidf.ts)
class TfIdfIndex {
  private documents = new Map<number, string[]>();
  private df = new Map<string, number>();
  private idf = new Map<string, number>();
  private documentCount = 0;

  addDocument(id: number, tokens: string[]): void {
    const unique = new Set(tokens);
    for (const token of unique) {
      this.df.set(token, (this.df.get(token) ?? 0) + 1);
    }
    this.documents.set(id, tokens);
    this.documentCount++;
    for (const term of unique) {
      const dfVal = this.df.get(term) ?? 0;
      if (dfVal > 0 && this.documentCount > 0) {
        this.idf.set(term, Math.log(this.documentCount / dfVal));
      }
    }
  }

  query(tokens: string[], topK: number = 10): Array<{ id: number; score: number }> {
    const scores = new Map<number, number>();
    for (const token of tokens) {
      const idfVal = this.idf.get(token) ?? 0;
      if (idfVal === 0) continue;
      for (const [docId, docTokens] of this.documents) {
        const tf = docTokens.filter(t => t === token).length / docTokens.length;
        const score = (scores.get(docId) ?? 0) + tf * idfVal;
        scores.set(docId, score);
      }
    }
    return Array.from(scores.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

// ---------------------------------------------------------------------------
// Setup: in-memory SQLite database
// ---------------------------------------------------------------------------

function createBenchDb(errorCount: number): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL DEFAULT 1,
      terminal_id INTEGER,
      fingerprint TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      raw_output TEXT NOT NULL,
      context TEXT,
      file_path TEXT,
      line_number INTEGER,
      column_number INTEGER,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT
    );

    CREATE INDEX idx_errors_fingerprint ON errors(fingerprint);
    CREATE INDEX idx_errors_type ON errors(type);
    CREATE INDEX idx_errors_resolved ON errors(resolved);
  `);

  const insert = db.prepare(`
    INSERT INTO errors (project_id, fingerprint, type, message, raw_output, file_path, line_number, occurrence_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    for (let i = 0; i < errorCount; i++) {
      const type = randomErrorType(i);
      const message = randomErrorMessage(i);
      const fingerprint = generateFingerprint(type, message, `func_${i}@file_${i}.ts`);
      insert.run(
        1,
        fingerprint,
        type,
        message,
        randomRawOutput(i),
        randomFilePath(i),
        10 + i,
        1 + (i % 5),
      );
    }
  });

  insertMany();
  return db;
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

console.log('');
console.log('###############################################################');
console.log('#  Error Matching / Fingerprinting Benchmarks                 #');
console.log('###############################################################');

// --- 1. Fingerprint generation ---

const results1: BenchmarkResult[] = [];
for (const n of [100, 1_000, 10_000]) {
  const messages = Array.from({ length: n }, (_, i) => ({
    type: randomErrorType(i),
    message: randomErrorMessage(i),
    frames: `func_${i}@file_${i}.ts|init@main.ts|run@cli.ts`,
  }));

  results1.push(bench(
    `fingerprint gen (${n})`,
    () => {
      for (const m of messages) {
        generateFingerprint(m.type, m.message, m.frames);
      }
    },
    n <= 1000 ? 100 : 20,
  ));
}

printTable('Fingerprint Generation (N errors per iteration)', results1);

// --- 2. SHA-256 throughput ---

const results2: BenchmarkResult[] = [];
for (const size of [64, 256, 1024, 4096]) {
  const payload = 'x'.repeat(size);
  results2.push(bench(
    `sha256 (${size} bytes)`,
    () => { sha256(payload); },
    10_000,
  ));
}

printTable('SHA-256 Hash Computation', results2);

// --- 3. Template message normalization ---

const results3: BenchmarkResult[] = [];
const sampleMessages = [
  "TypeError: Cannot read properties of undefined (reading 'map') at /home/user/project/src/app.tsx:42:10",
  "Error: ENOENT: no such file or directory, open 'C:\\Users\\dev\\project\\config.json'",
  "ReferenceError: process is not defined at https://example.com/bundle.js:1234:56 (2024-01-15T10:30:00)",
  "TypeError: fetch is not a function at /usr/local/lib/node_modules/pkg/index.js:100:5 reading 'data' a]b UUID: 550e8400-e29b-41d4-a716-446655440000",
];

for (const msg of sampleMessages) {
  const label = msg.substring(0, 35).replace(/[^\w ]/g, '') + '...';
  results3.push(bench(
    `template (${label})`,
    () => { templateMessage(msg); },
    50_000,
  ));
}

printTable('Template Message Normalization', results3);

// --- 4. SQLite fingerprint lookups ---

const results4: BenchmarkResult[] = [];
for (const n of [100, 1_000, 10_000]) {
  const db = createBenchDb(n);
  const lookupStmt = db.prepare('SELECT * FROM errors WHERE fingerprint = ?');
  const likeStmt = db.prepare("SELECT * FROM errors WHERE message LIKE ?");
  const typeStmt = db.prepare('SELECT * FROM errors WHERE type = ? AND resolved = 0');

  // Generate a fingerprint that exists in the DB
  const knownFp = generateFingerprint(
    randomErrorType(0),
    randomErrorMessage(0),
    'func_0@file_0.ts',
  );

  results4.push(bench(
    `exact lookup (${n} rows)`,
    () => { lookupStmt.get(knownFp); },
    5_000,
  ));

  results4.push(bench(
    `LIKE query (${n} rows)`,
    () => { likeStmt.all('%TypeError%'); },
    1_000,
  ));

  results4.push(bench(
    `type+resolved (${n} rows)`,
    () => { typeStmt.all('TypeError'); },
    1_000,
  ));

  db.close();
}

printTable('SQLite Fingerprint / Error Lookups', results4);

// --- 5. Cosine similarity ---

const results5: BenchmarkResult[] = [];
const tokensShort = tokenize("TypeError: Cannot read properties of undefined");
const tokensMedium = tokenize("TypeError: Cannot read properties of undefined (reading 'map') at component.tsx line 42 in function renderList");
const tokensLong = tokenize(
  "TypeError: Cannot read properties of undefined (reading 'map') at component.tsx:42:10 " +
  "This error occurred during server-side rendering of the React component tree " +
  "Check the render method of UserList and ensure all props are properly passed " +
  "from the parent PageContainer component"
);

for (const [label, a, b] of [
  ['short vs short (5 tok)', tokensShort, tokenize("TypeError: Cannot read undefined property")],
  ['medium vs medium (15 tok)', tokensMedium, tokenize("TypeError: Cannot read properties of null (reading 'forEach') at list.tsx line 88 in function processItems")],
  ['long vs long (30+ tok)', tokensLong, tokenize(
    "ReferenceError: process is not defined during client-side rendering " +
    "of React component tree This happened when accessing environment variables " +
    "in the browser Check the bundler configuration for proper polyfills"
  )],
] as const) {
  results5.push(bench(
    `cosine sim: ${label}`,
    () => { cosineSimilarity(a as string[], b as string[]); },
    50_000,
  ));
}

printTable('Cosine Similarity Computation', results5);

// --- 6. TF-IDF index build + query ---

const results6: BenchmarkResult[] = [];
for (const n of [100, 1_000, 5_000]) {
  // Build
  results6.push(bench(
    `tfidf build (${n} docs)`,
    () => {
      const index = new TfIdfIndex();
      for (let i = 0; i < n; i++) {
        index.addDocument(i, tokenize(randomErrorMessage(i)));
      }
    },
    n <= 1000 ? 50 : 10,
  ));

  // Query (pre-built index)
  const index = new TfIdfIndex();
  for (let i = 0; i < n; i++) {
    index.addDocument(i, tokenize(randomErrorMessage(i)));
  }
  const queryTokens = tokenize("TypeError: Cannot read properties of undefined");

  results6.push(bench(
    `tfidf query (${n} docs)`,
    () => { index.query(queryTokens, 10); },
    n <= 1000 ? 1_000 : 200,
  ));
}

printTable('TF-IDF Index Build & Query', results6);

// --- 7. Full error matching pipeline ---

const results7: BenchmarkResult[] = [];
for (const n of [10, 50, 200]) {
  interface FakeError {
    id: number;
    type: string;
    message: string;
    fingerprint: string;
    raw_output: string;
    file_path: string;
    context: string;
  }

  const candidates: FakeError[] = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    type: randomErrorType(i),
    message: randomErrorMessage(i),
    fingerprint: generateFingerprint(randomErrorType(i), randomErrorMessage(i), `func_${i}@file_${i}.ts`),
    raw_output: randomRawOutput(i),
    file_path: randomFilePath(i),
    context: `Building feature_${i} for project_${i % 5}`,
  }));

  const incoming: FakeError = {
    id: 0,
    type: 'TypeError',
    message: "Cannot read properties of undefined (reading 'map') at component.tsx:42:10",
    fingerprint: generateFingerprint('TypeError', "Cannot read properties of undefined (reading 'map')", 'renderList@component.tsx'),
    raw_output: "TypeError: Cannot read properties of undefined (reading 'map')\n    at renderList (component.tsx:42:10)",
    file_path: 'src/component.tsx',
    context: 'Building user dashboard',
  };

  results7.push(bench(
    `match pipeline (${n} candidates)`,
    () => {
      const incomingTokens = tokenize(incoming.message);
      const results: Array<{ id: number; score: number }> = [];

      for (const cand of candidates) {
        // Signal 1: fingerprint exact match
        const fpScore = incoming.fingerprint === cand.fingerprint ? 1.0 : 0.0;

        // Signal 2: message cosine similarity
        const candTokens = tokenize(cand.message);
        const msgScore = cosineSimilarity(incomingTokens, candTokens);

        // Signal 3: type match
        const typeScore = incoming.type === cand.type ? 1.0 : 0.0;

        // Weighted combination
        const total = fpScore * 0.20 + msgScore * 0.25 + typeScore * 0.15 + 0.4 * 0.5;

        if (total >= 0.55) {
          results.push({ id: cand.id, score: total });
        }
      }

      results.sort((a, b) => b.score - a.score);
    },
    n <= 50 ? 500 : 100,
  ));
}

printTable('Full Error Matching Pipeline', results7);

// --- Export markdown for RESULTS.md ---

const allSections = [
  toMarkdownTable('Fingerprint Generation (N errors per iteration)', results1),
  toMarkdownTable('SHA-256 Hash Computation', results2),
  toMarkdownTable('Template Message Normalization', results3),
  toMarkdownTable('SQLite Fingerprint / Error Lookups', results4),
  toMarkdownTable('Cosine Similarity Computation', results5),
  toMarkdownTable('TF-IDF Index Build & Query', results6),
  toMarkdownTable('Full Error Matching Pipeline', results7),
];

// Write to global for runner to collect
(globalThis as Record<string, unknown>).__benchmarkMarkdown =
  ((globalThis as Record<string, unknown>).__benchmarkMarkdown as string ?? '') +
  '\n## Error Matching Benchmarks\n\n' +
  allSections.join('\n');

console.log('Error matching benchmarks complete.');
