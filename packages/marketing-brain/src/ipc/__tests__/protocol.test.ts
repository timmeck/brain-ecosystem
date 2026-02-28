import { describe, it, expect } from 'vitest';
import { Buffer } from 'node:buffer';
import { encodeMessage, MessageDecoder } from '../protocol.js';
import type { IpcMessage } from '../../types/ipc.types.js';

const makeMessage = (overrides: Partial<IpcMessage> = {}): IpcMessage => ({
  id: '1',
  type: 'request',
  method: 'ping',
  ...overrides,
});

describe('encodeMessage', () => {
  it('returns a Buffer', () => {
    const buf = encodeMessage(makeMessage());
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it('prefixes payload with 4-byte big-endian length', () => {
    const msg = makeMessage();
    const buf = encodeMessage(msg);
    const payloadLength = buf.readUInt32BE(0);
    expect(buf.length).toBe(4 + payloadLength);
  });

  it('contains the JSON payload after the length prefix', () => {
    const msg = makeMessage({ id: 'test-42', method: 'hello' });
    const buf = encodeMessage(msg);
    const payloadLength = buf.readUInt32BE(0);
    const json = buf.subarray(4, 4 + payloadLength).toString('utf8');
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe('test-42');
    expect(parsed.method).toBe('hello');
    expect(parsed.type).toBe('request');
  });
});

describe('MessageDecoder', () => {
  it('decodes a single complete message', () => {
    const decoder = new MessageDecoder();
    const msg = makeMessage({ id: 'a' });
    const encoded = encodeMessage(msg);

    const messages = decoder.feed(encoded);
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('a');
  });

  it('decodes multiple messages fed at once', () => {
    const decoder = new MessageDecoder();
    const buf = Buffer.concat([
      encodeMessage(makeMessage({ id: '1' })),
      encodeMessage(makeMessage({ id: '2' })),
      encodeMessage(makeMessage({ id: '3' })),
    ]);

    const messages = decoder.feed(buf);
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.id)).toEqual(['1', '2', '3']);
  });

  it('handles partial messages across multiple feeds', () => {
    const decoder = new MessageDecoder();
    const encoded = encodeMessage(makeMessage({ id: 'split' }));

    // Split in the middle of the payload
    const mid = Math.floor(encoded.length / 2);
    const part1 = encoded.subarray(0, mid);
    const part2 = encoded.subarray(mid);

    const first = decoder.feed(part1);
    expect(first).toHaveLength(0);

    const second = decoder.feed(part2);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe('split');
  });

  it('handles chunk split inside the 4-byte length header', () => {
    const decoder = new MessageDecoder();
    const encoded = encodeMessage(makeMessage({ id: 'header-split' }));

    // Only send 2 bytes of the 4-byte header
    const first = decoder.feed(encoded.subarray(0, 2));
    expect(first).toHaveLength(0);

    const second = decoder.feed(encoded.subarray(2));
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe('header-split');
  });

  it('returns empty array when buffer has incomplete data', () => {
    const decoder = new MessageDecoder();
    // Just 3 bytes -- not even enough for the length header
    const partial = Buffer.from([0x00, 0x00, 0x00]);
    expect(decoder.feed(partial)).toHaveLength(0);
  });

  it('reset clears internal buffer', () => {
    const decoder = new MessageDecoder();
    const encoded = encodeMessage(makeMessage({ id: 'before-reset' }));

    // Feed partial data, then reset
    decoder.feed(encoded.subarray(0, 5));
    decoder.reset();

    // Now feed a fresh complete message
    const messages = decoder.feed(encodeMessage(makeMessage({ id: 'after-reset' })));
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('after-reset');
  });

  it('preserves leftover bytes for next feed', () => {
    const decoder = new MessageDecoder();
    const msg1 = encodeMessage(makeMessage({ id: 'first' }));
    const msg2 = encodeMessage(makeMessage({ id: 'second' }));

    // Feed first message + partial second message
    const combined = Buffer.concat([msg1, msg2.subarray(0, 6)]);
    const first = decoder.feed(combined);
    expect(first).toHaveLength(1);
    expect(first[0].id).toBe('first');

    // Feed rest of second message
    const second = decoder.feed(msg2.subarray(6));
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe('second');
  });

  it('round-trips all IpcMessage fields', () => {
    const decoder = new MessageDecoder();
    const msg: IpcMessage = {
      id: 'rt-1',
      type: 'response',
      result: { status: 'ok', data: [1, 2, 3] },
    };
    const messages = decoder.feed(encodeMessage(msg));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg);
  });

  it('round-trips error messages', () => {
    const decoder = new MessageDecoder();
    const msg: IpcMessage = {
      id: 'err-1',
      type: 'response',
      error: { code: -1, message: 'something went wrong' },
    };
    const messages = decoder.feed(encodeMessage(msg));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg);
  });
});
