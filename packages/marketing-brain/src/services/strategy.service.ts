import type { StrategyRepository } from '../db/repositories/strategy.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { Strategy, StrategyCreate } from '../types/post.types.js';
import { getEventBus } from '../utils/events.js';

export class StrategyService {
  constructor(
    private strategyRepo: StrategyRepository,
    private synapseManager: SynapseManager,
  ) {}

  report(data: StrategyCreate): Strategy {
    const id = this.strategyRepo.create(data);
    const strategy = this.strategyRepo.getById(id)!;

    if (data.post_id) {
      this.synapseManager.strengthen(
        { type: 'strategy', id },
        { type: 'post', id: data.post_id },
        'improves',
      );
      getEventBus().emit('strategy:reported', { strategyId: id, postId: data.post_id });
    }

    return strategy;
  }

  suggest(query: string, limit: number = 5): Strategy[] {
    return this.strategyRepo.search(query, limit);
  }

  getTopStrategies(minConfidence: number = 0.7, limit: number = 10): Strategy[] {
    return this.strategyRepo.topByConfidence(minConfidence, limit);
  }

  getById(id: number): Strategy | undefined {
    return this.strategyRepo.getById(id);
  }

  listAll(limit?: number): Strategy[] {
    return this.strategyRepo.listAll(limit);
  }

  updateConfidence(id: number, confidence: number): void {
    this.strategyRepo.update(id, { confidence });
  }

  getStats() {
    return {
      total: this.strategyRepo.countAll(),
    };
  }
}
