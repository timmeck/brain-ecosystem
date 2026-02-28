import type { TradeRepository, TradeRecord } from '../db/repositories/trade.repository.js';
import type { SignalRepository } from '../db/repositories/signal.repository.js';
import type { ChainRepository } from '../db/repositories/chain.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { WeightedGraph } from '../graph/weighted-graph.js';
import type { CalibrationConfig, LearningConfig } from '../types/config.types.js';
import { fingerprint, decomposeFingerprint, type SignalInput } from '../signals/fingerprint.js';
import { NODE_TYPES } from '../graph/weighted-graph.js';
import { detectChain } from '../learning/chain-detector.js';
import { getLogger } from '../utils/logger.js';
import { getEventBus } from '../utils/events.js';

export interface RecordOutcomeInput {
  signals: SignalInput;
  regime?: string;
  profitPct: number;
  win: boolean;
  botType: string;
  pair: string;
}

export class TradeService {
  private recentTrades: TradeRecord[] = [];
  private logger = getLogger();

  constructor(
    private tradeRepo: TradeRepository,
    private signalRepo: SignalRepository,
    private chainRepo: ChainRepository,
    private synapseManager: SynapseManager,
    private graph: WeightedGraph,
    private cal: CalibrationConfig,
    private learningConfig: LearningConfig,
  ) {
    // Seed recent trades for chain detection
    this.recentTrades = this.tradeRepo.getRecent(10);
  }

  updateCalibration(cal: CalibrationConfig): void {
    this.cal = cal;
  }

  recordOutcome(input: RecordOutcomeInput): { tradeId: number; fingerprint: string; synapseWeight: number } {
    const bus = getEventBus();
    const fp = fingerprint({ ...input.signals, regime: input.regime });

    // 1. Store signal combo
    this.signalRepo.create(fp, JSON.stringify(input.signals), input.regime);

    // 2. Store trade
    const tradeId = this.tradeRepo.create({
      fingerprint: fp,
      pair: input.pair,
      bot_type: input.botType,
      regime: input.regime,
      profit_pct: input.profitPct,
      win: input.win,
      signals_json: JSON.stringify(input.signals),
    });

    // 3. Hebbian synapse update
    const synapse = input.win
      ? this.synapseManager.recordWin(fp, input.profitPct)
      : this.synapseManager.recordLoss(fp, input.profitPct);

    // 4. Update weighted graph
    const graphNodes = decomposeFingerprint(fp, input.regime, input.pair, input.botType);
    const outcomeNodeId = input.win ? 'outcome_win' : 'outcome_loss';

    for (const gn of graphNodes) {
      this.graph.addNode(gn.id, gn.type, gn.label);
    }
    this.graph.addNode(outcomeNodeId, NODE_TYPES.OUTCOME, input.win ? 'win' : 'loss');

    const comboNodeId = `combo_${fp}`;
    for (const gn of graphNodes) {
      if (gn.id !== comboNodeId) {
        this.graph.addEdge(gn.id, comboNodeId, 0.5);
        if (input.win) {
          this.graph.strengthenEdge(gn.id, comboNodeId, this.cal.learningRate);
        } else {
          this.graph.weakenEdge(gn.id, comboNodeId, this.cal.weakenPenalty);
        }
      }
    }

    this.graph.addEdge(comboNodeId, outcomeNodeId, 0.5);
    if (input.win) {
      this.graph.strengthenEdge(comboNodeId, outcomeNodeId, this.cal.learningRate);
    } else {
      this.graph.weakenEdge(comboNodeId, outcomeNodeId, this.cal.weakenPenalty);
    }

    // Cross-connect co-occurring signals (Hebbian)
    for (let i = 0; i < graphNodes.length; i++) {
      for (let j = i + 1; j < graphNodes.length; j++) {
        if (graphNodes[i]!.id !== comboNodeId && graphNodes[j]!.id !== comboNodeId) {
          this.graph.addEdge(graphNodes[i]!.id, graphNodes[j]!.id, 0.3);
          if (input.win) {
            this.graph.strengthenEdge(graphNodes[i]!.id, graphNodes[j]!.id, this.cal.learningRate * 0.5);
          }
        }
      }
    }

    // 5. Chain detection
    const trade = this.tradeRepo.getById(tradeId)!;
    this.recentTrades.push(trade);
    if (this.recentTrades.length > 10) this.recentTrades.shift();

    const chain = detectChain(this.recentTrades, trade, this.learningConfig.chainMinLength);
    if (chain) {
      this.chainRepo.create(chain);
      bus.emit('chain:detected', { pair: chain.pair, type: chain.type, length: chain.length });
      this.logger.info(`Chain detected: ${chain.type} (${chain.length}x) on ${chain.pair}`);
    }

    bus.emit('trade:recorded', { tradeId, fingerprint: fp, win: input.win });
    this.logger.info(`Recorded: ${fp} → ${input.win ? 'WIN' : 'LOSS'} (${input.profitPct.toFixed(2)}%) | weight: ${synapse.weight.toFixed(3)} | graph: ${this.graph.getNodeCount()}N/${this.graph.getEdgeCount()}E`);

    return { tradeId, fingerprint: fp, synapseWeight: synapse.weight };
  }

  query(search: string, limit: number = 50): TradeRecord[] {
    return this.tradeRepo.search(search, limit);
  }

  getRecent(limit: number = 10): TradeRecord[] {
    return this.tradeRepo.getRecent(limit);
  }

  getByPair(pair: string): TradeRecord[] {
    return this.tradeRepo.getByPair(pair);
  }

  count(): number {
    return this.tradeRepo.count();
  }
}
