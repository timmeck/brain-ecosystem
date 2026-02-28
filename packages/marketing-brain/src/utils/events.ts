import { TypedEventBus as GenericEventBus } from '@timmeck/brain-core';

export type MarketingEvents = {
  'post:created': { postId: number; campaignId: number | null; platform: string };
  'post:published': { postId: number; platform: string };
  'engagement:updated': { postId: number; engagementId: number };
  'strategy:reported': { strategyId: number; postId: number };
  'rule:learned': { ruleId: number; pattern: string };
  'rule:triggered': { ruleId: number; postId: number };
  'template:created': { templateId: number; platform: string };
  'campaign:created': { campaignId: number; name: string };
  'insight:created': { insightId: number; type: string };
  'synapse:created': { synapseId: number; sourceType: string; targetType: string };
  'synapse:strengthened': { synapseId: number; newWeight: number };
  'memory:created': { memoryId: number; category: string };
  'memory:superseded': { oldId: number; newId: number };
  'session:started': { sessionId: number };
  'session:ended': { sessionId: number; summary: string };
};

export type MarketingEventName = keyof MarketingEvents;

export class TypedEventBus extends GenericEventBus<MarketingEvents> {}

let busInstance: TypedEventBus | null = null;

export function getEventBus(): TypedEventBus {
  if (!busInstance) {
    busInstance = new TypedEventBus();
  }
  return busInstance;
}
