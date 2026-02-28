import type {
  NodeRef, SynapseRecord, ActivationResult, SynapsePath,
  NetworkStats, SynapseRepoInterface,
} from './types.js';
import type { HebbianConfig, DecayConfig } from './types.js';
import { strengthen, weaken } from './hebbian.js';
import { decayAll } from './decay.js';
import { spreadingActivation } from './activation.js';
import { findPath } from './pathfinder.js';
import { getLogger } from '../utils/logger.js';

export interface SynapseManagerConfig {
  initialWeight: number;
  learningRate: number;
  pruneThreshold: number;
  decayHalfLifeDays: number;
  decayAfterDays: number;
  maxDepth: number;
  minActivationWeight: number;
}

/**
 * Base synapse manager shared across all brains.
 * Each brain extends this with domain-specific context methods
 * (e.g. getErrorContext, getPostContext, getTradeContext).
 */
export class BaseSynapseManager {
  protected logger = getLogger();

  constructor(
    protected repo: SynapseRepoInterface,
    protected config: SynapseManagerConfig,
  ) {}

  strengthen(
    source: NodeRef,
    target: NodeRef,
    synapseType: string,
    context?: Record<string, unknown>,
  ): SynapseRecord {
    this.logger.debug(`Strengthening synapse ${source.type}:${source.id} --${synapseType}--> ${target.type}:${target.id}`);
    return strengthen(this.repo, source, target, synapseType, this.hebbianConfig(), context);
  }

  weaken(synapseId: number, factor: number = 0.5): void {
    this.logger.debug(`Weakening synapse ${synapseId} by factor ${factor}`);
    weaken(this.repo, synapseId, this.hebbianConfig(), factor);
  }

  find(
    source: NodeRef,
    target: NodeRef,
    synapseType: string,
  ): SynapseRecord | undefined {
    return this.repo.findBySourceTarget(
      source.type, source.id, target.type, target.id, synapseType,
    );
  }

  activate(
    startNode: NodeRef,
    maxDepth?: number,
    minWeight?: number,
  ): ActivationResult[] {
    return spreadingActivation(
      this.repo,
      startNode,
      maxDepth ?? this.config.maxDepth,
      minWeight ?? this.config.minActivationWeight,
    );
  }

  findPath(from: NodeRef, to: NodeRef, maxDepth?: number): SynapsePath | null {
    return findPath(this.repo, from, to, maxDepth ?? this.config.maxDepth + 2);
  }

  runDecay(): { decayed: number; pruned: number } {
    this.logger.info('Running synapse decay cycle');
    const result = decayAll(this.repo, this.decayConfig());
    this.logger.info(`Decay complete: ${result.decayed} decayed, ${result.pruned} pruned`);
    return result;
  }

  getStrongestSynapses(limit: number = 20): SynapseRecord[] {
    return this.repo.topByWeight(limit);
  }

  getDiverseSynapses(perType: number = 25): SynapseRecord[] {
    return this.repo.topDiverse(perType);
  }

  getNetworkStats(): NetworkStats {
    return {
      totalNodes: this.repo.countNodes(),
      totalSynapses: this.repo.totalCount(),
      avgWeight: this.repo.avgWeight(),
      nodesByType: {} as Record<string, number>,
      synapsesByType: this.repo.countByType(),
    };
  }

  private hebbianConfig(): HebbianConfig {
    return {
      initialWeight: this.config.initialWeight,
      learningRate: this.config.learningRate,
      pruneThreshold: this.config.pruneThreshold,
    };
  }

  private decayConfig(): DecayConfig {
    return {
      decayHalfLifeDays: this.config.decayHalfLifeDays,
      decayAfterDays: this.config.decayAfterDays,
      pruneThreshold: this.config.pruneThreshold,
    };
  }
}
