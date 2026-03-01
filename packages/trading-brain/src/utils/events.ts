import { TypedEventBus as GenericEventBus } from '@timmeck/brain-core';

export type TradingBrainEvents = {
  'trade:recorded': { tradeId: number; fingerprint: string; win: boolean };
  'synapse:updated': { synapseId: string; weight: number };
  'rule:learned': { ruleId: number; pattern: string; confidence: number };
  'chain:detected': { pair: string; type: string; length: number };
  'insight:created': { insightId: number; type: string };
  'calibration:updated': { outcomeCount: number; learningRate: number };
  'decay:applied': { synapseCount: number; edgeCount: number };
  'patterns:extracted': { ruleCount: number };
  'research:completed': { insightCount: number };
  'memory:created': { memoryId: number; category: string };
  'memory:superseded': { oldId: number; newId: number };
  'session:started': { sessionId: number };
  'session:ended': { sessionId: number; summary: string };
  'alert:triggered': { alertId: number; name: string; conditionType: string };
};

export type TradingBrainEventName = keyof TradingBrainEvents;

export class TypedEventBus extends GenericEventBus<TradingBrainEvents> {}

let busInstance: TypedEventBus | null = null;

export function getEventBus(): TypedEventBus {
  if (!busInstance) {
    busInstance = new TypedEventBus();
  }
  return busInstance;
}
