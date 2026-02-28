import { TypedEventBus as GenericEventBus } from '@timmeck/brain-core';

export type BrainEvents = {
  'error:reported': { errorId: number; projectId: number; fingerprint: string };
  'error:resolved': { errorId: number; solutionId: number };
  'solution:applied': { errorId: number; solutionId: number; success: boolean };
  'solution:created': { solutionId: number };
  'module:registered': { moduleId: number; projectId: number };
  'module:updated': { moduleId: number };
  'synapse:created': { synapseId: number; sourceType: string; targetType: string };
  'synapse:strengthened': { synapseId: number; newWeight: number };
  'insight:created': { insightId: number; type: string };
  'rule:learned': { ruleId: number; pattern: string };
  'terminal:connected': { terminalId: number; uuid: string };
  'terminal:disconnected': { terminalId: number };
  // Memory & Session events
  'memory:created': { memoryId: number; projectId: number | null; category: string };
  'memory:recalled': { memoryId: number; query: string };
  'memory:superseded': { oldId: number; newId: number };
  'session:started': { sessionId: number; projectId: number | null };
  'session:ended': { sessionId: number; summary: string };
  // Decision & Changelog events
  'decision:recorded': { decisionId: number; projectId: number | null; category: string };
  'decision:superseded': { oldId: number; newId: number };
  'changelog:recorded': { changeId: number; projectId: number; filePath: string };
  // Task events
  'task:created': { taskId: number; projectId: number | null };
  'task:completed': { taskId: number };
  // Doc events
  'doc:indexed': { docId: number; projectId: number; docType: string };
};

export type BrainEventName = keyof BrainEvents;

export class TypedEventBus extends GenericEventBus<BrainEvents> {}

let busInstance: TypedEventBus | null = null;

export function getEventBus(): TypedEventBus {
  if (!busInstance) {
    busInstance = new TypedEventBus();
  }
  return busInstance;
}
