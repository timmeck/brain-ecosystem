import net from 'node:net';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getLogger } from '../utils/logger.js';
import type { IpcMessage } from '../types/ipc.types.js';
import { encodeMessage, MessageDecoder } from './protocol.js';
import { IpcClient } from './client.js';
import { getPipeName } from '../utils/paths.js';

export interface IpcRouter {
  handle(method: string, params: unknown): unknown;
  listMethods(): string[];
}

export class IpcServer {
  private server: net.Server | null = null;
  private clients = new Map<string, net.Socket>();
  private subscribers: Map<string, { pipeName: string; events: string[] }> = new Map();
  private logger = getLogger();

  constructor(
    private router: IpcRouter,
    private pipeName: string,
    private daemonName: string = 'brain',
    private selfName: string = 'brain',
  ) {}

  start(): void {
    this.createServer();
    this.listen();
  }

  private createServer(): void {
    this.server = net.createServer((socket) => {
      const clientId = randomUUID();
      this.clients.set(clientId, socket);
      const decoder = new MessageDecoder();

      this.logger.info(`IPC client connected: ${clientId}`);

      socket.on('data', (chunk) => {
        const messages = decoder.feed(chunk);
        for (const msg of messages) {
          this.handleMessage(clientId, msg, socket);
        }
      });

      socket.on('close', () => {
        this.logger.info(`IPC client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      socket.on('error', (err) => {
        this.logger.error(`IPC client ${clientId} error:`, err);
        this.clients.delete(clientId);
      });
    });
  }

  private listen(retried = false): void {
    if (!this.server) return;

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && !retried) {
        this.logger.warn(`IPC pipe in use, attempting to recover stale pipe: ${this.pipeName}`);
        this.recoverStalePipe();
      } else {
        this.logger.error('IPC server error:', err);
      }
    });

    this.server.listen(this.pipeName, () => {
      this.logger.info(`IPC server listening on ${this.pipeName}`);
    });
  }

  private recoverStalePipe(): void {
    const probe = net.createConnection(this.pipeName);

    probe.on('connect', () => {
      probe.destroy();
      this.logger.error(`IPC pipe is held by another running daemon. Stop it first with: ${this.daemonName} stop`);
    });

    probe.on('error', () => {
      probe.destroy();
      this.logger.info('Stale IPC pipe detected, reclaiming...');

      if (process.platform !== 'win32') {
        try { fs.unlinkSync(this.pipeName); } catch { /* ignore */ }
      }

      this.createServer();
      this.server!.on('error', (err) => {
        this.logger.error('IPC server error after recovery:', err);
      });
      this.server!.listen(this.pipeName, () => {
        this.logger.info(`IPC server recovered and listening on ${this.pipeName}`);
      });
    });

    probe.setTimeout(2000, () => {
      probe.destroy();
      this.logger.warn('IPC pipe probe timed out, treating as stale');
      if (process.platform !== 'win32') {
        try { fs.unlinkSync(this.pipeName); } catch { /* ignore */ }
      }
      this.createServer();
      this.server!.on('error', (err) => {
        this.logger.error('IPC server error after timeout recovery:', err);
      });
      this.server!.listen(this.pipeName, () => {
        this.logger.info(`IPC server recovered (timeout) and listening on ${this.pipeName}`);
      });
    });
  }

  private handleMessage(_clientId: string, msg: IpcMessage, socket: net.Socket): void {
    if (msg.type !== 'request' || !msg.method) return;

    try {
      const result = this.router.handle(msg.method, msg.params);
      const response: IpcMessage = {
        id: msg.id,
        type: 'response',
        result,
      };
      socket.write(encodeMessage(response));
    } catch (err) {
      const response: IpcMessage = {
        id: msg.id,
        type: 'response',
        error: { code: -1, message: err instanceof Error ? err.message : String(err) },
      };
      socket.write(encodeMessage(response));
    }
  }

  notify(clientId: string | null, notification: Omit<IpcMessage, 'id' | 'type'>): void {
    const msg: IpcMessage = {
      id: randomUUID(),
      type: 'notification',
      ...notification,
    };
    const encoded = encodeMessage(msg);

    if (clientId) {
      const socket = this.clients.get(clientId);
      if (socket && !socket.destroyed) {
        socket.write(encoded);
      }
    } else {
      for (const socket of this.clients.values()) {
        if (!socket.destroyed) {
          socket.write(encoded);
        }
      }
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Register a peer brain as a subscriber for specific events.
   */
  addSubscriber(subscriber: string, events: string[]): void {
    this.subscribers.set(subscriber, {
      pipeName: getPipeName(subscriber),
      events,
    });
    this.logger.info(`Subscriber registered: ${subscriber} for events: ${events.join(', ')}`);
  }

  /**
   * Remove a peer brain from the subscriber list.
   */
  removeSubscriber(subscriber: string): void {
    this.subscribers.delete(subscriber);
    this.logger.info(`Subscriber removed: ${subscriber}`);
  }

  /**
   * Notify all subscribed peers when an event occurs.
   * Fire-and-forget — does not block if a subscriber is offline.
   */
  notifySubscribers(event: string, data: unknown): void {
    for (const [, sub] of this.subscribers) {
      if (sub.events.includes(event)) {
        const client = new IpcClient(sub.pipeName, 3000);
        client.connect()
          .then(() => client.request('cross-brain.event', { source: this.selfName, event, data }))
          .catch(() => { /* subscriber offline */ })
          .finally(() => client.disconnect());
      }
    }
  }

  /**
   * Get all current subscribers.
   */
  getSubscribers(): Map<string, { pipeName: string; events: string[] }> {
    return this.subscribers;
  }

  stop(): void {
    for (const socket of this.clients.values()) {
      socket.destroy();
    }
    this.clients.clear();
    this.server?.close();
    this.server = null;
    this.logger.info('IPC server stopped');
  }
}
