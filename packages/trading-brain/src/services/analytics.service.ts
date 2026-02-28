import type { TradeRepository } from '../db/repositories/trade.repository.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { ChainRepository } from '../db/repositories/chain.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import type { MemoryRepository } from '../db/repositories/memory.repository.js';
import type { SessionRepository } from '../db/repositories/session.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { WeightedGraph } from '../graph/weighted-graph.js';

export class AnalyticsService {
  constructor(
    private tradeRepo: TradeRepository,
    private ruleRepo: RuleRepository,
    private chainRepo: ChainRepository,
    private insightRepo: InsightRepository,
    private synapseManager: SynapseManager,
    private graph: WeightedGraph,
    private memoryRepo?: MemoryRepository,
    private sessionRepo?: SessionRepository,
  ) {}

  getSummary(): Record<string, unknown> {
    const tradeCount = this.tradeRepo.count();
    const recentTrades = this.tradeRepo.getRecent(10);
    const rules = this.ruleRepo.getAll();
    const chains = this.chainRepo.getRecent(5);
    const insights = this.insightRepo.getRecent(5);

    const wins = recentTrades.filter(t => t.win === 1).length;
    const recentWinRate = recentTrades.length > 0 ? wins / recentTrades.length : 0;

    const topRule = rules.length > 0 ? {
      pattern: rules[0]!.pattern,
      winRate: Math.round(rules[0]!.win_rate * 100),
      confidence: Math.round(rules[0]!.confidence * 100),
      sampleCount: rules[0]!.sample_count,
    } : null;

    return {
      trades: {
        total: tradeCount,
        recentWinRate: Math.round(recentWinRate * 100),
      },
      rules: {
        total: rules.length,
        topRule,
      },
      chains: {
        total: this.chainRepo.count(),
        recent: chains.map(c => ({
          pair: c.pair,
          type: c.type,
          length: c.length,
        })),
      },
      insights: {
        total: this.insightRepo.count(),
        recent: insights.map(i => ({
          type: i.type,
          severity: i.severity,
          title: i.title,
        })),
      },
      network: {
        synapses: this.synapseManager.count(),
        avgWeight: Number(this.synapseManager.getAvgWeight().toFixed(3)),
        graphNodes: this.graph.getNodeCount(),
        graphEdges: this.graph.getEdgeCount(),
      },
      memory: {
        active: this.memoryRepo?.countActive() ?? 0,
        byCategory: this.memoryRepo?.countByCategory() ?? {},
        sessions: this.sessionRepo?.countAll() ?? 0,
      },
    };
  }
}
