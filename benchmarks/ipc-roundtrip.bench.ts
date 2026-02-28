/**
 * IPC Message Encoding / Decoding Benchmarks
 *
 * Measures:
 * - encodeMessage throughput at different payload sizes
 * - MessageDecoder.feed() throughput at different payload sizes
 * - Full encode+decode round-trip
 * - Batch decoding (multiple messages in a single buffer)
 * - JSON serialization overhead comparison
 */

import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import {
  bench,
  printTable,
  toMarkdownTable,
  type BenchmarkResult,
} from './utils.js';

// ---------------------------------------------------------------------------
// Inline IPC protocol functions (from brain-core/src/ipc/protocol.ts)
// ---------------------------------------------------------------------------

interface IpcMessage {
  id: string;
  type: 'request' | 'response' | 'notification';
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

function encodeMessage(msg: IpcMessage): Buffer {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, 'utf8');
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

class MessageDecoder {
  private buffer = Buffer.alloc(0);

  feed(chunk: Buffer): IpcMessage[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: IpcMessage[] = [];

    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32BE(0);
      if (this.buffer.length < 4 + length) break;

      const json = this.buffer.subarray(4, 4 + length).toString('utf8');
      this.buffer = this.buffer.subarray(4 + length);
      messages.push(JSON.parse(json) as IpcMessage);
    }

    return messages;
  }

  reset(): void {
    this.buffer = Buffer.alloc(0);
  }
}

// ---------------------------------------------------------------------------
// Helpers: generate IPC messages of various sizes
// ---------------------------------------------------------------------------

function makeRequest(method: string, payloadSize: number): IpcMessage {
  return {
    id: randomUUID(),
    type: 'request',
    method,
    params: {
      data: 'x'.repeat(payloadSize),
      timestamp: Date.now(),
      metadata: { source: 'benchmark', iteration: 0 },
    },
  };
}

function makeResponse(payloadSize: number): IpcMessage {
  return {
    id: randomUUID(),
    type: 'response',
    result: {
      items: Array.from({ length: Math.max(1, payloadSize / 50) }, (_, i) => ({
        id: i,
        name: `item_${i}`,
        value: Math.random(),
      })),
      total: payloadSize,
    },
  };
}

function makeNotification(payloadSize: number): IpcMessage {
  return {
    id: randomUUID(),
    type: 'notification',
    method: 'event.update',
    params: {
      eventType: 'error.detected',
      payload: 'y'.repeat(payloadSize),
    },
  };
}

// Pre-generate UUIDs to separate UUID generation from encoding
const pregenIds = Array.from({ length: 10_000 }, () => randomUUID());
let idIdx = 0;
function nextId(): string {
  const id = pregenIds[idIdx % pregenIds.length]!;
  idIdx++;
  return id;
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

console.log('');
console.log('###############################################################');
console.log('#  IPC Message Encoding / Decoding Benchmarks                 #');
console.log('###############################################################');

// --- 1. Encode throughput by payload size ---

const results1: BenchmarkResult[] = [];
const payloadSizes = [
  { label: 'tiny (100 B)', size: 100 },
  { label: 'small (1 KB)', size: 1_000 },
  { label: 'medium (10 KB)', size: 10_000 },
  { label: 'large (100 KB)', size: 100_000 },
];

for (const ps of payloadSizes) {
  const msg: IpcMessage = {
    id: nextId(),
    type: 'request',
    method: 'error.report',
    params: { data: 'x'.repeat(ps.size) },
  };

  results1.push(bench(
    `encode ${ps.label}`,
    () => { encodeMessage(msg); },
    ps.size <= 10_000 ? 10_000 : 1_000,
  ));
}

printTable('Encode Throughput by Payload Size', results1);

// --- 2. Decode throughput by payload size ---

const results2: BenchmarkResult[] = [];
for (const ps of payloadSizes) {
  const msg: IpcMessage = {
    id: nextId(),
    type: 'request',
    method: 'error.report',
    params: { data: 'x'.repeat(ps.size) },
  };
  const encoded = encodeMessage(msg);
  const decoder = new MessageDecoder();

  results2.push(bench(
    `decode ${ps.label}`,
    () => {
      decoder.feed(Buffer.from(encoded));
    },
    ps.size <= 10_000 ? 10_000 : 1_000,
  ));
}

printTable('Decode Throughput by Payload Size', results2);

// --- 3. Full encode+decode round-trip ---

const results3: BenchmarkResult[] = [];
for (const ps of payloadSizes) {
  const msg: IpcMessage = {
    id: nextId(),
    type: 'request',
    method: 'error.report',
    params: { data: 'x'.repeat(ps.size) },
  };

  results3.push(bench(
    `roundtrip ${ps.label}`,
    () => {
      const encoded = encodeMessage(msg);
      const decoder = new MessageDecoder();
      decoder.feed(encoded);
    },
    ps.size <= 10_000 ? 10_000 : 1_000,
  ));
}

printTable('Full Encode + Decode Round-Trip', results3);

// --- 4. Batch decoding (N messages concatenated in one buffer) ---

const results4: BenchmarkResult[] = [];
for (const batchSize of [1, 10, 50, 100]) {
  const messages: IpcMessage[] = Array.from({ length: batchSize }, (_, i) => ({
    id: nextId(),
    type: 'request' as const,
    method: `method_${i}`,
    params: { index: i, data: `payload_${i}` },
  }));

  const concatenated = Buffer.concat(messages.map(m => encodeMessage(m)));

  results4.push(bench(
    `batch decode (${batchSize} msgs)`,
    () => {
      const decoder = new MessageDecoder();
      const decoded = decoder.feed(Buffer.from(concatenated));
      if (decoded.length !== batchSize) {
        throw new Error(`Expected ${batchSize} messages, got ${decoded.length}`);
      }
    },
    batchSize <= 10 ? 10_000 : 1_000,
  ));
}

printTable('Batch Decoding (Multiple Messages in One Buffer)', results4);

// --- 5. Partial buffer handling (fragmented messages) ---

const results5: BenchmarkResult[] = [];
for (const ps of [
  { label: 'small fragmented', size: 500 },
  { label: 'medium fragmented', size: 5_000 },
  { label: 'large fragmented', size: 50_000 },
]) {
  const msg: IpcMessage = {
    id: nextId(),
    type: 'request',
    method: 'data.sync',
    params: { data: 'z'.repeat(ps.size) },
  };
  const encoded = encodeMessage(msg);

  // Split into chunks of 64 bytes
  const chunks: Buffer[] = [];
  for (let i = 0; i < encoded.length; i += 64) {
    chunks.push(encoded.subarray(i, Math.min(i + 64, encoded.length)));
  }

  results5.push(bench(
    `fragmented ${ps.label}`,
    () => {
      const decoder = new MessageDecoder();
      let decoded: IpcMessage[] = [];
      for (const chunk of chunks) {
        decoded = decoder.feed(Buffer.from(chunk));
      }
      if (decoded.length !== 1) {
        throw new Error(`Expected 1 message from fragments, got ${decoded.length}`);
      }
    },
    ps.size <= 5_000 ? 5_000 : 500,
  ));
}

printTable('Fragmented Buffer Handling', results5);

// --- 6. Message type comparison ---

const results6: BenchmarkResult[] = [];
const msgTypes: Array<{ label: string; msg: IpcMessage }> = [
  { label: 'request (1KB)', msg: makeRequest('error.report', 1_000) },
  { label: 'response (1KB)', msg: makeResponse(1_000) },
  { label: 'notification (1KB)', msg: makeNotification(1_000) },
  { label: 'error response', msg: { id: nextId(), type: 'response', error: { code: -32600, message: 'Method not found: unknown.method' } } },
  { label: 'minimal request', msg: { id: nextId(), type: 'request', method: 'ping' } },
];

for (const { label, msg } of msgTypes) {
  results6.push(bench(
    `encode ${label}`,
    () => { encodeMessage(msg); },
    10_000,
  ));
}

printTable('Encoding by Message Type', results6);

// --- 7. JSON.stringify vs full encode overhead ---

const results7: BenchmarkResult[] = [];
for (const ps of [
  { label: '1 KB payload', size: 1_000 },
  { label: '10 KB payload', size: 10_000 },
  { label: '100 KB payload', size: 100_000 },
]) {
  const msg: IpcMessage = {
    id: nextId(),
    type: 'request',
    method: 'data.sync',
    params: { data: 'w'.repeat(ps.size) },
  };

  results7.push(bench(
    `JSON.stringify ${ps.label}`,
    () => { JSON.stringify(msg); },
    ps.size <= 10_000 ? 10_000 : 1_000,
  ));

  results7.push(bench(
    `full encode ${ps.label}`,
    () => { encodeMessage(msg); },
    ps.size <= 10_000 ? 10_000 : 1_000,
  ));
}

printTable('JSON Stringify vs Full Encode (overhead)', results7);

// --- 8. UUID generation (context: each message needs one) ---

const results8: BenchmarkResult[] = [];
results8.push(bench(
  'crypto.randomUUID()',
  () => { randomUUID(); },
  50_000,
));

printTable('UUID Generation (per-message overhead)', results8);

// --- Export markdown ---

const allSections = [
  toMarkdownTable('Encode Throughput by Payload Size', results1),
  toMarkdownTable('Decode Throughput by Payload Size', results2),
  toMarkdownTable('Full Encode + Decode Round-Trip', results3),
  toMarkdownTable('Batch Decoding (Multiple Messages in One Buffer)', results4),
  toMarkdownTable('Fragmented Buffer Handling', results5),
  toMarkdownTable('Encoding by Message Type', results6),
  toMarkdownTable('JSON Stringify vs Full Encode (overhead)', results7),
  toMarkdownTable('UUID Generation (per-message overhead)', results8),
];

(globalThis as Record<string, unknown>).__benchmarkMarkdown =
  ((globalThis as Record<string, unknown>).__benchmarkMarkdown as string ?? '') +
  '\n## IPC Round-Trip Benchmarks\n\n' +
  allSections.join('\n');

console.log('IPC round-trip benchmarks complete.');
