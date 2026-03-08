/**
 * Event listener setup — extracted from BrainCore.setupEventListeners + setupCrossBrainSubscriptions.
 * Pure extraction, no logic changes.
 */
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../utils/events.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { CrossBrainNotifier, CrossBrainSubscriptionManager, CrossBrainCorrelator, ResearchOrchestrator, PredictionEngine } from '@timmeck/brain-core';
import type { Services } from '../ipc/router.js';

export function setupEventListeners(
  services: Services,
  synapseManager: SynapseManager,
  notifier: CrossBrainNotifier | null,
  correlator: CrossBrainCorrelator | null,
  orchestrator: ResearchOrchestrator | null,
): void {
  const bus = getEventBus();
  const webhook = services.webhook;
  const causal = services.causal;
  const hypothesis = services.hypothesis;
  const orch = orchestrator;

  bus.on('error:reported', ({ errorId, projectId }) => {
    synapseManager.strengthen(
      { type: 'error', id: errorId },
      { type: 'project', id: projectId },
      'co_occurs',
    );
    notifier?.notify('error:reported', { errorId, projectId });
    correlator?.recordEvent('brain', 'error:reported', { errorId, projectId });
    webhook?.fire('error:reported', { errorId, projectId });
    causal?.recordEvent('brain', 'error:reported', { errorId, projectId });
    hypothesis?.observe({ source: 'brain', type: 'error:reported', value: 1, timestamp: Date.now() });
    orch?.onEvent('error:reported', { errorId, projectId });
  });

  bus.on('solution:applied', ({ errorId, solutionId, success }) => {
    if (success) {
      synapseManager.strengthen(
        { type: 'solution', id: solutionId },
        { type: 'error', id: errorId },
        'solves',
      );
    } else {
      const synapse = synapseManager.find(
        { type: 'solution', id: solutionId },
        { type: 'error', id: errorId },
        'solves',
      );
      if (synapse) synapseManager.weaken(synapse.id, 0.7);
    }
  });

  bus.on('module:registered', ({ moduleId, projectId }) => {
    synapseManager.strengthen(
      { type: 'code_module', id: moduleId },
      { type: 'project', id: projectId },
      'co_occurs',
    );
  });

  bus.on('rule:learned', ({ ruleId, pattern }) => {
    getLogger().info(`New rule #${ruleId} learned: ${pattern}`);
    causal?.recordEvent('brain', 'rule:learned', { ruleId, pattern });
    hypothesis?.observe({ source: 'brain', type: 'rule:learned', value: 1, timestamp: Date.now() });
    orch?.onEvent('rule:learned', { ruleId });
  });

  bus.on('insight:created', ({ insightId, type }) => {
    getLogger().info(`New insight #${insightId} (${type})`);
    notifier?.notifyPeer('marketing-brain', 'insight:created', { insightId, type });
    correlator?.recordEvent('brain', 'insight:created', { insightId, type });
    webhook?.fire('insight:created', { insightId, type });
    causal?.recordEvent('brain', 'insight:created', { insightId, type });
    hypothesis?.observe({ source: 'brain', type: 'insight:created', value: 1, timestamp: Date.now() });
    orch?.onEvent('insight:created', { insightId, type });
  });

  bus.on('solution:applied', ({ errorId, solutionId, success }) => {
    orch?.onEvent('solution:applied', { errorId, solutionId, success: success ? 1 : 0 });
  });

  bus.on('memory:created', ({ memoryId, projectId }) => {
    if (projectId) {
      synapseManager.strengthen(
        { type: 'memory', id: memoryId },
        { type: 'project', id: projectId },
        'co_occurs',
      );
    }
  });

  bus.on('session:ended', ({ sessionId }) => {
    getLogger().info(`Session #${sessionId} ended`);
  });

  bus.on('decision:recorded', ({ decisionId, projectId }) => {
    if (projectId) {
      synapseManager.strengthen(
        { type: 'decision', id: decisionId },
        { type: 'project', id: projectId },
        'co_occurs',
      );
    }
  });

  bus.on('task:created', ({ taskId }) => {
    getLogger().info(`Task #${taskId} created`);
  });

  bus.on('task:completed', ({ taskId }) => {
    getLogger().info(`Task #${taskId} completed`);
  });
}

export function setupCrossBrainSubscriptions(
  subscriptionManager: CrossBrainSubscriptionManager | null,
  correlator: CrossBrainCorrelator | null,
  orchestrator: ResearchOrchestrator | null,
): void {
  if (!subscriptionManager || !correlator) return;
  const logger = getLogger();

  subscriptionManager.subscribe('trading-brain', ['trade:completed'], (event: string, data: unknown) => {
    logger.info(`[cross-brain] Received ${event} from trading-brain`, { data });
    correlator.recordEvent('trading-brain', event, data);
    orchestrator?.onCrossBrainEvent('trading-brain', event, data as Record<string, unknown>);
  });

  subscriptionManager.subscribe('trading-brain', ['trade:outcome'], (event: string, data: unknown) => {
    correlator.recordEvent('trading-brain', event, data);
    orchestrator?.onCrossBrainEvent('trading-brain', event, data as Record<string, unknown>);
    const d = data as Record<string, unknown> | null;
    if (d && d.win === false) {
      const lossCorrelations = correlator.getCorrelations(0.3)
        .filter(c => c.type === 'error-trade-loss');
      if (lossCorrelations.length > 0) {
        logger.warn(`[cross-brain] Trade loss correlated with recent errors (strength: ${lossCorrelations[0].strength.toFixed(2)})`);
      }
    }
  });

  subscriptionManager.subscribe('marketing-brain', ['post:published'], (event: string, data: unknown) => {
    logger.info(`[cross-brain] Received ${event} from marketing-brain`, { data });
    correlator.recordEvent('marketing-brain', event, data);
    orchestrator?.onCrossBrainEvent('marketing-brain', event, data as Record<string, unknown>);
  });

  subscriptionManager.subscribe('marketing-brain', ['campaign:created'], (event: string, data: unknown) => {
    correlator.recordEvent('marketing-brain', event, data);
    orchestrator?.onCrossBrainEvent('marketing-brain', event, data as Record<string, unknown>);
  });
}
