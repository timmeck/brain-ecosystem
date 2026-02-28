/**
 * Shared benchmark utilities for timing, statistics, and output formatting.
 */

export interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  opsPerSec: number;
}

/**
 * Run a benchmark function N times and collect timing statistics.
 */
export function bench(
  name: string,
  fn: () => void,
  iterations: number = 100,
  warmup: number = 5,
): BenchmarkResult {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const timings: number[] = [];
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    timings.push(t1 - t0);
  }

  const totalMs = performance.now() - start;
  timings.sort((a, b) => a - b);

  return {
    name,
    iterations,
    totalMs,
    avgMs: timings.reduce((a, b) => a + b, 0) / timings.length,
    minMs: timings[0]!,
    maxMs: timings[timings.length - 1]!,
    p50Ms: percentile(timings, 50),
    p95Ms: percentile(timings, 95),
    p99Ms: percentile(timings, 99),
    opsPerSec: (iterations / totalMs) * 1000,
  };
}

/**
 * Run an async benchmark function N times and collect timing statistics.
 */
export async function benchAsync(
  name: string,
  fn: () => Promise<void>,
  iterations: number = 100,
  warmup: number = 5,
): Promise<BenchmarkResult> {
  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const timings: number[] = [];
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    await fn();
    const t1 = performance.now();
    timings.push(t1 - t0);
  }

  const totalMs = performance.now() - start;
  timings.sort((a, b) => a - b);

  return {
    name,
    iterations,
    totalMs,
    avgMs: timings.reduce((a, b) => a + b, 0) / timings.length,
    minMs: timings[0]!,
    maxMs: timings[timings.length - 1]!,
    p50Ms: percentile(timings, 50),
    p95Ms: percentile(timings, 95),
    p99Ms: percentile(timings, 99),
    opsPerSec: (iterations / totalMs) * 1000,
  };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

/**
 * Format a number to a fixed width with units.
 */
function fmt(value: number, decimals: number = 3): string {
  if (value < 0.001) return `${(value * 1_000_000).toFixed(1)} ns`;
  if (value < 1) return `${(value * 1000).toFixed(1)} us`;
  if (value < 1000) return `${value.toFixed(decimals)} ms`;
  return `${(value / 1000).toFixed(decimals)} s`;
}

function fmtOps(ops: number): string {
  if (ops >= 1_000_000) return `${(ops / 1_000_000).toFixed(2)}M`;
  if (ops >= 1_000) return `${(ops / 1_000).toFixed(2)}K`;
  return ops.toFixed(2);
}

/**
 * Print a formatted table of benchmark results.
 */
export function printTable(title: string, results: BenchmarkResult[]): void {
  const sep = '='.repeat(100);
  const thinSep = '-'.repeat(100);

  console.log('');
  console.log(sep);
  console.log(`  ${title}`);
  console.log(sep);
  console.log('');

  // Header
  const header = [
    pad('Benchmark', 40),
    pad('ops/sec', 12),
    pad('avg', 12),
    pad('p50', 12),
    pad('p95', 12),
    pad('p99', 12),
  ].join('');
  console.log(header);
  console.log(thinSep);

  for (const r of results) {
    const row = [
      pad(r.name, 40),
      pad(fmtOps(r.opsPerSec), 12),
      pad(fmt(r.avgMs), 12),
      pad(fmt(r.p50Ms), 12),
      pad(fmt(r.p95Ms), 12),
      pad(fmt(r.p99Ms), 12),
    ].join('');
    console.log(row);
  }

  console.log(thinSep);
  console.log('');
}

function pad(str: string, width: number): string {
  return str.padEnd(width);
}

/**
 * Format benchmark results as a Markdown table.
 */
export function toMarkdownTable(title: string, results: BenchmarkResult[]): string {
  const lines: string[] = [];
  lines.push(`### ${title}`);
  lines.push('');
  lines.push('| Benchmark | ops/sec | avg | p50 | p95 | p99 |');
  lines.push('|-----------|---------|-----|-----|-----|-----|');

  for (const r of results) {
    lines.push(
      `| ${r.name} | ${fmtOps(r.opsPerSec)} | ${fmt(r.avgMs)} | ${fmt(r.p50Ms)} | ${fmt(r.p95Ms)} | ${fmt(r.p99Ms)} |`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Generate a random error message for benchmarks.
 */
export function randomErrorMessage(index: number): string {
  const templates = [
    `TypeError: Cannot read properties of undefined (reading 'map') at component_${index}.tsx:${10 + index}:5`,
    `ReferenceError: process is not defined at utils/config_${index}.ts:${20 + index}:10`,
    `SyntaxError: Unexpected token '<' at parser_${index}.js:${30 + index}:15`,
    `Error: ENOENT: no such file or directory, open '/tmp/file_${index}.json'`,
    `TypeError: fetch_${index} is not a function at api/client_${index}.ts:${40 + index}:3`,
    `RangeError: Maximum call stack size exceeded at recursive_${index}.ts:${50 + index}:1`,
    `Error: connect ECONNREFUSED 127.0.0.1:${3000 + (index % 100)} at net_${index}.ts:${60 + index}:8`,
    `TypeError: Cannot convert undefined or null to object at Object.keys at utils_${index}.ts:${70 + index}:12`,
    `Error: EPERM: operation not permitted, unlink '/var/lock/file_${index}.lock'`,
    `SyntaxError: missing ) after argument list at script_${index}.js:${80 + index}:20`,
  ];
  return templates[index % templates.length]!;
}

/**
 * Generate a random error type for benchmarks.
 */
export function randomErrorType(index: number): string {
  const types = [
    'TypeError',
    'ReferenceError',
    'SyntaxError',
    'Error',
    'TypeError',
    'RangeError',
    'Error',
    'TypeError',
    'Error',
    'SyntaxError',
  ];
  return types[index % types.length]!;
}

/**
 * Generate a random file path for benchmarks.
 */
export function randomFilePath(index: number): string {
  const dirs = ['src', 'lib', 'utils', 'components', 'api', 'services', 'hooks', 'db'];
  const exts = ['.ts', '.tsx', '.js', '.jsx'];
  const dir = dirs[index % dirs.length]!;
  const ext = exts[index % exts.length]!;
  return `${dir}/module_${index}${ext}`;
}

/**
 * Generate random raw output (stack trace) for benchmarks.
 */
export function randomRawOutput(index: number): string {
  const type = randomErrorType(index);
  const msg = randomErrorMessage(index);
  return [
    `${type}: ${msg}`,
    `    at Object.<anonymous> (/project/src/file_${index}.ts:${10 + index}:5)`,
    `    at Module._compile (node:internal/modules/cjs/loader:1369:14)`,
    `    at Module._extensions..js (node:internal/modules/cjs/loader:1427:10)`,
    `    at Module.load (node:internal/modules/cjs/loader:1206:32)`,
    `    at Module._resolveFilename (node:internal/modules/cjs/loader:1178:15)`,
  ].join('\n');
}
