import type { TradeRepository } from '../db/repositories/trade.repository.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { ChainRepository } from '../db/repositories/chain.repository.js';
import type { CalibrationRepository } from '../db/repositories/calibration.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { WeightedGraph } from '../graph/weighted-graph.js';
import type { CalibrationConfig, LearningConfig } from '../types/config.types.js';
import { extractPatterns } from './pattern-extractor.js';
import { calibrate } from './calibrator.js';
import { getEventBus } from '../utils/events.js';
import { BaseLearningEngine } from '@timmeck/brain-core';

export class LearningEngine extends BaseLearningEngine {
  private lastPatternExtraction = 0;
  private lastDecay = 0;

  constructor(
    private learningConfig: LearningConfig,
    private cal: CalibrationConfig,
    private tradeRepo: TradeRepository,
    private ruleRepo: RuleRepository,
    private chainRepo: ChainRepository,
    private calRepo: CalibrationRepository,
    private synapseManager: SynapseManager,
    private graph: WeightedGraph,
  ) {
    super(learningConfig);
  }

  getCalibration(): CalibrationConfig {
    return { ...this.cal };
  }

  runCycle(): void {
    const bus = getEventBus();
    const outcomeCount = this.tradeRepo.count();

    // Pattern extraction
    if (outcomeCount - this.lastPatternExtraction >= this.cal.patternExtractionInterval) {
      const trades = this.tradeRepo.getAll();
      const rules = extractPatterns(trades, this.cal);
      if (rules.length > 0) {
        this.ruleRepo.replaceAll(rules);
        this.lastPatternExtraction = outcomeCount;
        this.logger.info(`Extracted ${rules.length} rules from ${trades.length} trades`);
        bus.emit('patterns:extracted', { ruleCount: rules.length });
      }
    }

    // Recalibrate every 25 trades
    if (outcomeCount > 0 && outcomeCount % 25 === 0) {
      const newCal = calibrate(this.cal, outcomeCount, this.synapseManager.count());
      this.cal = newCal;
      this.synapseManager.updateCalibration(newCal);
      this.calRepo.save(newCal);
      this.logger.info(`Recalibrated — lr: ${newCal.learningRate}, z: ${newCal.wilsonZ}, halfLife: ${newCal.decayHalfLifeDays}d`);
      bus.emit('calibration:updated', { outcomeCount, learningRate: newCal.learningRate });
    }

    // Daily decay
    const now = Date.now();
    const dayMs = 86400000;
    if (now - this.lastDecay > dayMs) {
      const halfLifeMs = this.cal.decayHalfLifeDays * dayMs;
      const synDecayed = this.synapseManager.runDecay();
      this.graph.decayEdges(halfLifeMs);
      this.lastDecay = now;
      this.logger.info(`Decay applied — ${synDecayed} synapses, ${this.graph.getEdgeCount()} edges`);
      bus.emit('decay:applied', { synapseCount: synDecayed, edgeCount: this.graph.getEdgeCount() });
    }

    // Prune old chains
    this.chainRepo.pruneOldest(this.learningConfig.maxChains);
  }

  /** Manual trigger for a full learning cycle */
  runManual(): { rules: number; calibration: CalibrationConfig } {
    this.runCycle();
    const rules = this.ruleRepo.getAll();
    return { rules: rules.length, calibration: this.getCalibration() };
  }
}
