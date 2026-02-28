/**
 * Learning Cycle Performance Benchmarks
 *
 * Measures:
 * - Pattern extraction at different dataset sizes
 * - Rule generation throughput
 * - Confidence scoring (Wilson score + time decay)
 * - Adaptive threshold computation
 * - Full learning cycle simulation (extract -> enrich -> generate -> prune)
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
// Inline core functions to avoid importing compiled packages
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

function generateFingerprint(errorType: string, message: string, frames: string): string {
  const template = templateMessage(message);
  return sha256(`${errorType}::${template}::${frames}`);
}

function wilsonScore(successes: number, total: number, z: number = 1.96): number {
  if (total === 0) return 0;
  const p = successes / total;
  const z2 = z * z;
  const n = total;
  const denominator = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, (centre - spread) / denominator);
}

function timeDecayFactor(lastActivatedAt: string, halfLifeDays: number): number {
  const now = Date.now();
  const activated = new Date(lastActivatedAt).getTime();
  const ageDays = (now - activated) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / halfLifeDays);
}

interface AdaptiveThresholds {
  minOccurrences: number;
  minSuccessRate: number;
  minConfidence: number;
  pruneThreshold: number;
}

function computeAdaptiveThresholds(
  totalErrors: number,
  totalSolutions: number,
  baseConfig: { minOccurrences: number; minSuccessRate: number; minConfidence: number; pruneThreshold: number },
): AdaptiveThresholds {
  const errorScale = Math.min(2.0, Math.max(0.5, totalErrors / 50));
  const solutionScale = Math.min(2.0, Math.max(0.5, totalSolutions / 20));
  const dataScale = (errorScale + solutionScale) / 2;
  return {
    minOccurrences: Math.max(2, Math.round(baseConfig.minOccurrences * dataScale)),
    minSuccessRate: Math.min(0.95, baseConfig.minSuccessRate * (0.85 + dataScale * 0.15)),
    minConfidence: Math.min(0.90, baseConfig.minConfidence * (0.85 + dataScale * 0.15)),
    pruneThreshold: Math.max(0.10, baseConfig.pruneThreshold * (1.1 - dataScale * 0.1)),
  };
}

const STOPWORDS = new Set([
  'the', 'is', 'are', 'a', 'an', 'and', 'or', 'not', 'in', 'at', 'by', 'for',
  'from', 'of', 'on', 'to', 'with', 'as', 'error', 'exception', 'throw', 'catch',
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

// Pattern extraction (from learning/pattern-extractor.ts)
interface ErrorRecord {
  id: number;
  type: string;
  message: string;
  file_path: string | null;
}

interface ErrorPattern {
  errorType: string;
  messageTemplate: string;
  messageRegex: string;
  filePattern: string | null;
  occurrences: number;
  errorIds: number[];
  solutionIds: number[];
  confidence: number;
  successRate: number;
}

function extractPatterns(errors: ErrorRecord[], similarityThreshold: number = 0.7): ErrorPattern[] {
  interface Centroid {
    errorType: string;
    tokens: string[];
    errorIds: number[];
    filePattern: string | null;
  }

  const centroids: Centroid[] = [];

  for (const error of errors) {
    const tokens = tokenize(`${error.type} ${error.message}`);
    let merged = false;

    for (const centroid of centroids) {
      if (centroid.errorType !== error.type) continue;
      const sim = cosineSimilarity(centroid.tokens, tokens);
      if (sim >= similarityThreshold) {
        const allTokens = [...centroid.tokens, ...tokens];
        centroid.tokens = [...new Set(allTokens)];
        centroid.errorIds.push(error.id);
        if (!centroid.filePattern && error.file_path) {
          const ext = error.file_path.split('.').pop() ?? '';
          centroid.filePattern = ext ? `*.${ext}` : '*';
        }
        merged = true;
        break;
      }
    }

    if (!merged) {
      const ext = error.file_path?.split('.').pop() ?? '';
      centroids.push({
        errorType: error.type,
        tokens,
        errorIds: [error.id],
        filePattern: error.file_path ? (ext ? `*.${ext}` : '*') : null,
      });
    }
  }

  return centroids
    .filter(c => c.errorIds.length >= 2)
    .map(c => ({
      errorType: c.errorType,
      messageTemplate: c.tokens.join(' '),
      messageRegex: c.tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'),
      filePattern: c.filePattern,
      occurrences: c.errorIds.length,
      errorIds: c.errorIds,
      solutionIds: [],
      confidence: 0,
      successRate: 0,
    }));
}

// Rule generation (from learning/rule-generator.ts)
interface GeneratedRule {
  pattern: string;
  action: string;
  description: string;
  confidence: number;
  sourceErrorIds: number[];
}

function generateRules(
  patterns: ErrorPattern[],
  config: { minOccurrences: number; minConfidence: number },
): GeneratedRule[] {
  return patterns
    .filter(p => p.occurrences >= config.minOccurrences && p.confidence >= config.minConfidence)
    .map(p => ({
      pattern: p.messageRegex,
      action: p.confidence >= 0.90
        ? `Auto-fix available for ${p.errorType}`
        : `Suggestion: check ${p.errorType} pattern (${p.occurrences} occurrences)`,
      description: `Auto-generated from ${p.occurrences} occurrences of ${p.errorType}`,
      confidence: p.confidence,
      sourceErrorIds: p.errorIds,
    }));
}

// ---------------------------------------------------------------------------
// Setup: in-memory SQLite database with errors + solutions
// ---------------------------------------------------------------------------

function createLearningDb(errorCount: number, solutionCount: number): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL DEFAULT 1,
      fingerprint TEXT NOT NULL,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      raw_output TEXT NOT NULL,
      context TEXT,
      file_path TEXT,
      line_number INTEGER,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      first_seen TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen TEXT NOT NULL DEFAULT (datetime('now')),
      resolved INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      commands TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      confidence REAL NOT NULL DEFAULT 0.5,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE error_solutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      error_id INTEGER NOT NULL,
      solution_id INTEGER NOT NULL,
      applied_at TEXT,
      success INTEGER
    );

    CREATE TABLE rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      action TEXT NOT NULL,
      description TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      occurrences INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      project_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE antipatterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      description TEXT,
      severity TEXT NOT NULL DEFAULT 'warning',
      suggestion TEXT,
      occurrences INTEGER NOT NULL DEFAULT 0,
      project_id INTEGER,
      global INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_errors_fingerprint ON errors(fingerprint);
    CREATE INDEX idx_errors_type ON errors(type);
    CREATE INDEX idx_errors_resolved ON errors(resolved);

    INSERT INTO projects (name) VALUES ('bench-project');
  `);

  const insertError = db.prepare(`
    INSERT INTO errors (project_id, fingerprint, type, message, raw_output, file_path, line_number, occurrence_count)
    VALUES (1, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSolution = db.prepare(`
    INSERT INTO solutions (description, commands, confidence, success_count, fail_count)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertLink = db.prepare(`
    INSERT INTO error_solutions (error_id, solution_id, success)
    VALUES (?, ?, ?)
  `);

  db.transaction(() => {
    for (let i = 0; i < errorCount; i++) {
      const type = randomErrorType(i);
      const message = randomErrorMessage(i);
      const fp = generateFingerprint(type, message, `func_${i}@file_${i}.ts`);
      insertError.run(fp, type, message, randomRawOutput(i), randomFilePath(i), 10 + i, 1 + (i % 8));
    }

    for (let i = 0; i < solutionCount; i++) {
      const successes = Math.floor(Math.random() * 20);
      const fails = Math.floor(Math.random() * 10);
      insertSolution.run(
        `Fix #${i}: Update configuration or refactor module_${i}`,
        `npm run fix-${i}`,
        wilsonScore(successes, successes + fails),
        successes,
        fails,
      );
      // Link to 1-3 random errors
      const numLinks = 1 + (i % 3);
      for (let j = 0; j < numLinks && j < errorCount; j++) {
        const errorId = (i * 3 + j) % errorCount + 1;
        const success = Math.random() > 0.3 ? 1 : 0;
        try {
          insertLink.run(errorId, i + 1, success);
        } catch {
          // Ignore duplicate key
        }
      }
    }
  })();

  return db;
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

console.log('');
console.log('###############################################################');
console.log('#  Learning Cycle Benchmarks                                  #');
console.log('###############################################################');

// --- 1. Pattern extraction ---

const results1: BenchmarkResult[] = [];
for (const n of [10, 100, 500, 1_000]) {
  const errors: ErrorRecord[] = Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    type: randomErrorType(i),
    message: randomErrorMessage(i),
    file_path: randomFilePath(i),
  }));

  results1.push(bench(
    `pattern extract (${n} errors)`,
    () => { extractPatterns(errors, 0.7); },
    n <= 100 ? 200 : (n <= 500 ? 50 : 10),
  ));
}

printTable('Pattern Extraction', results1);

// --- 2. Rule generation ---

const results2: BenchmarkResult[] = [];
for (const n of [5, 20, 100]) {
  const patterns: ErrorPattern[] = Array.from({ length: n }, (_, i) => ({
    errorType: randomErrorType(i),
    messageTemplate: `template_${i}`,
    messageRegex: `regex_${i}.*pattern`,
    filePattern: `*.ts`,
    occurrences: 3 + (i % 10),
    errorIds: [i + 1, i + 2],
    solutionIds: [i + 1],
    confidence: 0.3 + Math.random() * 0.6,
    successRate: 0.4 + Math.random() * 0.5,
  }));

  results2.push(bench(
    `rule generation (${n} patterns)`,
    () => {
      generateRules(patterns, { minOccurrences: 3, minConfidence: 0.5 });
    },
    10_000,
  ));
}

printTable('Rule Generation', results2);

// --- 3. Wilson Score computation ---

const results3: BenchmarkResult[] = [];
const testCases = [
  { label: 'low sample (5 trials)', s: 3, t: 5 },
  { label: 'medium (50 trials)', s: 35, t: 50 },
  { label: 'high (500 trials)', s: 400, t: 500 },
  { label: 'edge: zero trials', s: 0, t: 0 },
  { label: 'edge: all fail', s: 0, t: 100 },
];

for (const tc of testCases) {
  results3.push(bench(
    `wilson: ${tc.label}`,
    () => { wilsonScore(tc.s, tc.t); },
    100_000,
  ));
}

printTable('Wilson Score Computation', results3);

// --- 4. Time decay factor ---

const results4: BenchmarkResult[] = [];
const ages = [
  { label: '1 hour ago', ts: new Date(Date.now() - 3_600_000).toISOString() },
  { label: '1 day ago', ts: new Date(Date.now() - 86_400_000).toISOString() },
  { label: '30 days ago', ts: new Date(Date.now() - 30 * 86_400_000).toISOString() },
  { label: '365 days ago', ts: new Date(Date.now() - 365 * 86_400_000).toISOString() },
];

for (const a of ages) {
  results4.push(bench(
    `decay: ${a.label}`,
    () => { timeDecayFactor(a.ts, 30); },
    100_000,
  ));
}

printTable('Time Decay Factor', results4);

// --- 5. Adaptive threshold computation ---

const results5: BenchmarkResult[] = [];
const baseConfig = { minOccurrences: 3, minSuccessRate: 0.6, minConfidence: 0.5, pruneThreshold: 0.2 };

for (const [errors, solutions] of [[10, 5], [100, 50], [1000, 500], [5000, 2000]]) {
  results5.push(bench(
    `adaptive thresh (${errors}e/${solutions}s)`,
    () => { computeAdaptiveThresholds(errors!, totalSolutions(solutions!), baseConfig); },
    100_000,
  ));
}

function totalSolutions(n: number): number { return n; }

printTable('Adaptive Threshold Computation', results5);

// --- 6. Full learning cycle simulation ---

const results6: BenchmarkResult[] = [];
for (const [nErrors, nSolutions] of [[10, 5], [100, 50], [1_000, 300], [5_000, 1_000]]) {
  const db = createLearningDb(nErrors!, nSolutions!);

  // Pre-compile statements
  const getErrors = db.prepare('SELECT id, type, message, file_path FROM errors WHERE resolved = 0');
  const getSolutions = db.prepare('SELECT * FROM solutions');
  const getLinkedSolutions = db.prepare('SELECT solution_id FROM error_solutions WHERE error_id = ?');
  const getSolutionById = db.prepare('SELECT * FROM solutions WHERE id = ?');
  const getRules = db.prepare('SELECT * FROM rules WHERE active = 1');
  const insertRule = db.prepare(
    'INSERT INTO rules (pattern, action, description, confidence, occurrences, active) VALUES (?, ?, ?, ?, ?, 1)',
  );
  const updateRule = db.prepare('UPDATE rules SET active = 0 WHERE id = ?');

  results6.push(bench(
    `full cycle (${nErrors}e/${nSolutions}s)`,
    () => {
      // Phase 0: Adaptive thresholds
      const allErrors = getErrors.all() as ErrorRecord[];
      const allSolutions = getSolutions.all() as Array<{ id: number; success_count: number; fail_count: number }>;
      const adaptive = computeAdaptiveThresholds(allErrors.length, allSolutions.length, baseConfig);

      // Phase 1: Extract patterns
      const patterns = extractPatterns(allErrors, adaptive.minSuccessRate);

      // Phase 2: Enrich patterns with solution data
      for (const pattern of patterns) {
        let totalSuccess = 0;
        let totalAttempts = 0;

        for (const errorId of pattern.errorIds) {
          const links = getLinkedSolutions.all(errorId) as Array<{ solution_id: number }>;
          for (const link of links) {
            pattern.solutionIds.push(link.solution_id);
            const sol = getSolutionById.get(link.solution_id) as {
              success_count: number;
              fail_count: number;
            } | undefined;
            if (sol) {
              const total = sol.success_count + sol.fail_count;
              totalSuccess += total > 0 ? sol.success_count / total : 0;
              totalAttempts++;
            }
          }
        }

        pattern.successRate = totalAttempts > 0 ? totalSuccess / totalAttempts : 0;
        pattern.confidence = Math.min(
          0.95,
          pattern.successRate * 0.6 + Math.min(1, pattern.occurrences / 10) * 0.4,
        );
      }

      // Phase 3: Generate rules
      const rules = generateRules(patterns, {
        minOccurrences: adaptive.minOccurrences,
        minConfidence: adaptive.minConfidence,
      });

      // Phase 4: Persist rules (simulate)
      for (const rule of rules.slice(0, 5)) {
        insertRule.run(rule.pattern, rule.action, rule.description, rule.confidence, 0);
      }

      // Phase 5: Prune weak rules
      const activeRules = getRules.all() as Array<{ id: number; confidence: number; occurrences: number }>;
      for (const rule of activeRules) {
        if (rule.confidence < adaptive.pruneThreshold) {
          updateRule.run(rule.id);
        }
      }
    },
    nErrors! <= 100 ? 50 : (nErrors! <= 1000 ? 10 : 3),
  ));

  db.close();
}

printTable('Full Learning Cycle Simulation', results6);

// --- Export markdown ---

const allSections = [
  toMarkdownTable('Pattern Extraction', results1),
  toMarkdownTable('Rule Generation', results2),
  toMarkdownTable('Wilson Score Computation', results3),
  toMarkdownTable('Time Decay Factor', results4),
  toMarkdownTable('Adaptive Threshold Computation', results5),
  toMarkdownTable('Full Learning Cycle Simulation', results6),
];

(globalThis as Record<string, unknown>).__benchmarkMarkdown =
  ((globalThis as Record<string, unknown>).__benchmarkMarkdown as string ?? '') +
  '\n## Learning Cycle Benchmarks\n\n' +
  allSections.join('\n');

console.log('Learning cycle benchmarks complete.');
