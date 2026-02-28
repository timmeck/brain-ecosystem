import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { encodeMessage, MessageDecoder } from '../protocol.js';
import type { IpcMessage } from '../../types/ipc.types.js';

const sampleMessage: IpcMessage = {
  id: '1',
  type: 'request',
  method: 'ping',
  params: { ts: 123 },
};

describe('encodeMessage', () => {
  it('produces a buffer starting with a 4-byte big-endian length prefix', () => {
    const buf = encodeMessage(sampleMessage);
    const payloadLength = buf.readUInt32BE(0);
    expect(buf.length).toBe(4 + payloadLength);
  });

  it('payload is valid JSON matching the original message', () => {
    const buf = encodeMessage(sampleMessage);
    const payloadLength = buf.readUInt32BE(0);
    const json = buf.subarray(4, 4 + payloadLength).toString('utf8');
    expect(JSON.parse(json)).toEqual(sampleMessage);
  });

  it('encodes a minimal notification message', () => {
    const msg: IpcMessage = { id: '2', type: 'notification' };
    const buf = encodeMessage(msg);
    const payloadLength = buf.readUInt32BE(0);
    const decoded = JSON.parse(buf.subarray(4, 4 + payloadLength).toString('utf8'));
    expect(decoded).toEqual(msg);
  });
});

describe('MessageDecoder', () => {
  it('decodes a single complete frame', () => {
    const decoder = new MessageDecoder();
    const frame = encodeMessage(sampleMessage);
    const messages = decoder.feed(frame);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(sampleMessage);
  });

  it('decodes multiple frames fed at once', () => {
    const decoder = new MessageDecoder();
    const msg1: IpcMessage = { id: '1', type: 'request', method: 'a' };
    const msg2: IpcMessage = { id: '2', type: 'response', result: 42 };
    const combined = Buffer.concat([encodeMessage(msg1), encodeMessage(msg2)]);
    const messages = decoder.feed(combined);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(msg1);
    expect(messages[1]).toEqual(msg2);
  });

  it('handles partial frames across multiple feed() calls', () => {
    const decoder = new MessageDecoder();
    const frame = encodeMessage(sampleMessage);

    // Split the frame in the middle
    const splitPoint = Math.floor(frame.length / 2);
    const part1 = frame.subarray(0, splitPoint);
    const part2 = frame.subarray(splitPoint);

    const firstResult = decoder.feed(part1);
    expect(firstResult).toHaveLength(0);

    const secondResult = decoder.feed(part2);
    expect(secondResult).toHaveLength(1);
    expect(secondResult[0]).toEqual(sampleMessage);
  });

  it('handles byte-by-byte feeding', () => {
    const decoder = new MessageDecoder();
    const frame = encodeMessage(sampleMessage);

    const messages: IpcMessage[] = [];
    for (let i = 0; i < frame.length; i++) {
      const result = decoder.feed(Buffer.from([frame[i]!]));
      messages.push(...result);
    }
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(sampleMessage);
  });

  it('reset() clears internal buffer', () => {
    const decoder = new MessageDecoder();
    const frame = encodeMessage(sampleMessage);

    // Feed a partial frame then reset
    decoder.feed(frame.subarray(0, 3));
    decoder.reset();

    // Feed a complete frame after reset
    const messages = decoder.feed(frame);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(sampleMessage);
  });

  it('returns empty array when fed an empty buffer', () => {
    const decoder = new MessageDecoder();
    const messages = decoder.feed(Buffer.alloc(0));
    expect(messages).toHaveLength(0);
  });
});
