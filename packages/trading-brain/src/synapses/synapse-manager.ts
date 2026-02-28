import type { SynapseRepository, SynapseRecord } from '../db/repositories/synapse.repository.js';
import type { CalibrationConfig } from '../types/config.types.js';
import { strengthen, weaken } from './hebbian.js';
import { decaySynapse } from './decay.js';
import { getLogger } from '../utils/logger.js';

export class SynapseManager {
  private cache: Map<string, Omit<SynapseRecord, 'created_at'>> = new Map();
  private logger = getLogger();

  constructor(
    private repo: SynapseRepository,
    private cal: CalibrationConfig,
  ) {
    this.loadCache();
  }

  private loadCache(): void {
    const all = this.repo.getAll();
    for (const syn of all) {
      this.cache.set(syn.id, syn);
    }
    this.logger.info(`Synapse cache loaded: ${this.cache.size} synapses`);
  }

  updateCalibration(cal: CalibrationConfig): void {
    this.cal = cal;
  }

  getOrCreate(fingerprint: string): Omit<SynapseRecord, 'created_at'> {
    const id = `syn_${fingerprint}`;
    let synapse = this.cache.get(id);
    if (!synapse) {
      synapse = {
        id,
        fingerprint,
        weight: 0.5,
        wins: 0,
        losses: 0,
        activations: 0,
        total_profit: 0,
        last_activated: new Date().toISOString(),
      };
      this.cache.set(id, synapse);
    }
    return synapse;
  }

  get(id: string): Omit<SynapseRecord, 'created_at'> | undefined {
    return this.cache.get(id);
  }

  getByFingerprint(fingerprint: string): Omit<SynapseRecord, 'created_at'> | undefined {
    return this.cache.get(`syn_${fingerprint}`);
  }

  recordWin(fingerprint: string, profitPct: number): Omit<SynapseRecord, 'created_at'> {
    const synapse = this.getOrCreate(fingerprint);
    synapse.total_profit += profitPct;
    strengthen(synapse, this.cal.learningRate);
    this.repo.upsert(synapse);
    return synapse;
  }

  recordLoss(fingerprint: string, profitPct: number): Omit<SynapseRecord, 'created_at'> {
    const synapse = this.getOrCreate(fingerprint);
    synapse.total_profit += profitPct;
    weaken(synapse, this.cal.weakenPenalty);
    this.repo.upsert(synapse);
    return synapse;
  }

  runDecay(): number {
    const halfLifeMs = this.cal.decayHalfLifeDays * 86400000;
    let decayed = 0;
    for (const synapse of this.cache.values()) {
      if (decaySynapse(synapse, halfLifeMs)) {
        this.repo.upsert(synapse);
        decayed++;
      }
    }
    if (decayed > 0) {
      this.logger.info(`Decayed ${decayed} synapses`);
    }
    return decayed;
  }

  getAll(): Omit<SynapseRecord, 'created_at'>[] {
    return Array.from(this.cache.values());
  }

  count(): number {
    return this.cache.size;
  }

  getStrongest(limit: number = 20): Omit<SynapseRecord, 'created_at'>[] {
    return Array.from(this.cache.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, limit);
  }

  getAvgWeight(): number {
    if (this.cache.size === 0) return 0;
    let sum = 0;
    for (const syn of this.cache.values()) sum += syn.weight;
    return sum / this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}
