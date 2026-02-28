import { Buffer } from 'node:buffer';
import type { IpcMessage } from '../types/ipc.types.js';

export function encodeMessage(msg: IpcMessage): Buffer {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, 'utf8');
  const frame = Buffer.alloc(4 + payload.length);
  frame.writeUInt32BE(payload.length, 0);
  payload.copy(frame, 4);
  return frame;
}

export class MessageDecoder {
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
