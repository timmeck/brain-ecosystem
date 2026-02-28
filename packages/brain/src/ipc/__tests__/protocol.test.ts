import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { encodeMessage, MessageDecoder } from '../protocol.js';
import type { IpcMessage } from '../../types/ipc.types.js';

function makeMessage(overrides: Partial<IpcMessage> = {}): IpcMessage {
  return { id: '1', type: 'request', method: 'test', ...overrides };
}

describe('encodeMessage', () => {
  it('returns a Buffer', () => {
    const buf = encodeMessage(makeMessage());
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('starts with a 4-byte length prefix', () => {
    const msg = makeMessage();
    const buf = encodeMessage(msg);
    const payloadLength = buf.readUInt32BE(0);
    expect(buf.length).toBe(4 + payloadLength);
  });

  it('payload is valid JSON matching the input message', () => {
    const msg = makeMessage({ id: 'abc', type: 'notification', method: 'ping' });
    const buf = encodeMessage(msg);
    const payloadLength = buf.readUInt32BE(0);
    const json = buf.subarray(4, 4 + payloadLength).toString('utf8');
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(msg);
  });

  it('handles message with error field', () => {
    const msg = makeMessage({
      type: 'response',
      error: { code: -1, message: 'fail' },
    });
    const buf = encodeMessage(msg);
    const payloadLength = buf.readUInt32BE(0);
    const json = buf.subarray(4, 4 + payloadLength).toString('utf8');
    expect(JSON.parse(json).error.code).toBe(-1);
  });

  it('handles message with unicode content', () => {
    const msg = makeMessage({ method: '\u00fc\u00f6\u00e4\u00df' });
    const buf = encodeMessage(msg);
    const payloadLength = buf.readUInt32BE(0);
    const json = buf.subarray(4, 4 + payloadLength).toString('utf8');
    expect(JSON.parse(json).method).toBe('\u00fc\u00f6\u00e4\u00df');
  });
});

describe('MessageDecoder', () => {
  it('decodes a single complete message', () => {
    const decoder = new MessageDecoder();
    const msg = makeMessage({ id: '42' });
    const encoded = encodeMessage(msg);
    const messages = decoder.feed(encoded);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg);
  });

  it('decodes multiple messages fed at once', () => {
    const decoder = new MessageDecoder();
    const msg1 = makeMessage({ id: '1' });
    const msg2 = makeMessage({ id: '2' });
    const combined = Buffer.concat([encodeMessage(msg1), encodeMessage(msg2)]);
    const messages = decoder.feed(combined);
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual(msg1);
    expect(messages[1]).toEqual(msg2);
  });

  it('handles partial messages across multiple feeds', () => {
    const decoder = new MessageDecoder();
    const msg = makeMessage({ id: 'split' });
    const encoded = encodeMessage(msg);

    // Split the buffer in the middle
    const mid = Math.floor(encoded.length / 2);
    const part1 = encoded.subarray(0, mid);
    const part2 = encoded.subarray(mid);

    const result1 = decoder.feed(part1);
    expect(result1).toHaveLength(0);

    const result2 = decoder.feed(part2);
    expect(result2).toHaveLength(1);
    expect(result2[0]).toEqual(msg);
  });

  it('handles byte-by-byte feeding', () => {
    const decoder = new MessageDecoder();
    const msg = makeMessage({ id: 'byte' });
    const encoded = encodeMessage(msg);

    const messages: IpcMessage[] = [];
    for (let i = 0; i < encoded.length; i++) {
      const result = decoder.feed(encoded.subarray(i, i + 1));
      messages.push(...result);
    }

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg);
  });

  it('handles incomplete length header', () => {
    const decoder = new MessageDecoder();
    // Feed only 2 bytes (less than the 4-byte header)
    const partial = Buffer.alloc(2);
    partial.writeUInt16BE(0, 0);
    const result = decoder.feed(partial);
    expect(result).toHaveLength(0);
  });

  it('reset clears internal buffer', () => {
    const decoder = new MessageDecoder();
    const msg = makeMessage({ id: 'reset-test' });
    const encoded = encodeMessage(msg);

    // Feed partial data
    decoder.feed(encoded.subarray(0, 3));
    // Reset
    decoder.reset();

    // Feed a complete message — should decode cleanly
    const msg2 = makeMessage({ id: 'after-reset' });
    const result = decoder.feed(encodeMessage(msg2));
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(msg2);
  });

  it('handles empty buffer', () => {
    const decoder = new MessageDecoder();
    const result = decoder.feed(Buffer.alloc(0));
    expect(result).toHaveLength(0);
  });
});
