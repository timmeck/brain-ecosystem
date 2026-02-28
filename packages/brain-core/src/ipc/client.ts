import net from 'node:net';
import { randomUUID } from 'node:crypto';
import type { IpcMessage } from '../types/ipc.types.js';
import { encodeMessage, MessageDecoder } from './protocol.js';
import { getPipeName } from '../utils/paths.js';

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class IpcClient {
  private socket: net.Socket | null = null;
  private decoder = new MessageDecoder();
  private pending = new Map<string, PendingRequest>();
  private onNotification?: (msg: IpcMessage) => void;

  constructor(
    private pipeName: string = getPipeName(),
    private timeout: number = 5000,
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(this.pipeName, () => {
        resolve();
      });

      this.socket.on('data', (chunk) => {
        const messages = this.decoder.feed(chunk);
        for (const msg of messages) {
          this.handleMessage(msg);
        }
      });

      this.socket.on('error', (err) => {
        reject(err);
        for (const [id, req] of this.pending) {
          clearTimeout(req.timer);
          req.reject(new Error(`Connection error: ${err.message}`));
          this.pending.delete(id);
        }
      });

      this.socket.on('close', () => {
        for (const [id, req] of this.pending) {
          clearTimeout(req.timer);
          req.reject(new Error('Connection closed'));
          this.pending.delete(id);
        }
        this.socket = null;
      });
    });
  }

  request(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        return reject(new Error('Not connected'));
      }

      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method} (${this.timeout}ms)`));
      }, this.timeout);

      this.pending.set(id, { resolve, reject, timer });

      const msg: IpcMessage = {
        id,
        type: 'request',
        method,
        params,
      };
      this.socket.write(encodeMessage(msg));
    });
  }

  setNotificationHandler(handler: (msg: IpcMessage) => void): void {
    this.onNotification = handler;
  }

  disconnect(): void {
    for (const [id, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error('Client disconnecting'));
      this.pending.delete(id);
    }
    this.socket?.destroy();
    this.socket = null;
    this.decoder.reset();
  }

  get connected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  private handleMessage(msg: IpcMessage): void {
    if (msg.type === 'response') {
      const req = this.pending.get(msg.id);
      if (!req) return;

      clearTimeout(req.timer);
      this.pending.delete(msg.id);

      if (msg.error) {
        req.reject(new Error(msg.error.message));
      } else {
        req.resolve(msg.result);
      }
    } else if (msg.type === 'notification') {
      this.onNotification?.(msg);
    }
  }
}
