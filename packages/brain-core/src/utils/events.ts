import { EventEmitter } from 'node:events';

/**
 * Generic typed event bus. Each brain defines its own events interface:
 *
 * ```ts
 * interface MyEvents {
 *   'trade:recorded': { tradeId: number; win: boolean };
 *   'rule:learned': { ruleId: number; pattern: string };
 * }
 * const bus = new TypedEventBus<MyEvents>();
 * ```
 */
export class TypedEventBus<T extends Record<string, unknown>> extends EventEmitter {
  emit<K extends keyof T & string>(event: K, data: T[K]): boolean {
    return super.emit(event, data);
  }

  on<K extends keyof T & string>(event: K, listener: (data: T[K]) => void): this {
    return super.on(event, listener);
  }

  once<K extends keyof T & string>(event: K, listener: (data: T[K]) => void): this {
    return super.once(event, listener);
  }

  off<K extends keyof T & string>(event: K, listener: (data: T[K]) => void): this {
    return super.off(event, listener);
  }
}
