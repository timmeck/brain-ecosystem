import { describe, it, expect } from 'vitest';
import { encodeMessage, MessageDecoder } from '../protocol.js';
import type { IpcMessage } from '../../types/ipc.types.js';

describe('encodeMessage', () => {
  it('encodes a request message', () => {
    const msg: IpcMessage = { id: 'test-1', type: 'request', method: 'status', params: {} };
    const buffer = encodeMessage(msg);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(4);
  });

  it('includes 4-byte length prefix', () => {
    const msg: IpcMessage = { id: 'test-1', type: 'request', method: 'test' };
    const buffer = encodeMessage(msg);
    const payloadLength = buffer.readUInt32BE(0);
    expect(buffer.length).toBe(4 + payloadLength);
  });
});

describe('MessageDecoder', () => {
  it('decodes a single complete message', () => {
    const msg: IpcMessage = { id: 'x', type: 'response', result: { ok: true } };
    const decoder = new MessageDecoder();
    const messages = decoder.feed(encodeMessage(msg));
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('x');
    expect(messages[0].result).toEqual({ ok: true });
  });

  it('handles multiple messages in one chunk', () => {
    const msg1: IpcMessage = { id: '1', type: 'request', method: 'a' };
    const msg2: IpcMessage = { id: '2', type: 'request', method: 'b' };
    const decoder = new MessageDecoder();
    const combined = Buffer.concat([encodeMessage(msg1), encodeMessage(msg2)]);
    const messages = decoder.feed(combined);
    expect(messages).toHaveLength(2);
  });

  it('handles partial messages across feeds', () => {
    const msg: IpcMessage = { id: 'partial', type: 'response', result: 'data' };
    const buffer = encodeMessage(msg);
    const decoder = new MessageDecoder();

    const mid = Math.floor(buffer.length / 2);
    const part1 = buffer.subarray(0, mid);
    const part2 = buffer.subarray(mid);

    expect(decoder.feed(part1)).toHaveLength(0);
    const messages = decoder.feed(part2);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('partial');
  });

  it('resets buffer state', () => {
    const decoder = new MessageDecoder();
    decoder.feed(Buffer.from([0, 0, 0, 10])); // incomplete
    decoder.reset();

    const msg: IpcMessage = { id: 'after-reset', type: 'response', result: null };
    const messages = decoder.feed(encodeMessage(msg));
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('after-reset');
  });

  it('handles byte-by-byte feeding', () => {
    const msg: IpcMessage = { id: 'byte', type: 'request', method: 'test' };
    const buffer = encodeMessage(msg);
    const decoder = new MessageDecoder();

    let messages: IpcMessage[] = [];
    for (let i = 0; i < buffer.length; i++) {
      messages = decoder.feed(buffer.subarray(i, i + 1));
      if (messages.length > 0) break;
    }
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('byte');
  });
});
