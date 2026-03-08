import { getLogger } from '../../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface TradeActionPayload {
  symbol: string;
  action: 'buy' | 'sell';
  reason: string;
  strategyId: number;
  ruleCondition: string;
  confidence: number;
}

export interface TradeHandlerDeps {
  runCycle: () => Promise<{ entries: number; exits: number }>;
  getPortfolio?: () => { balance: number; equity: number; positions: Array<{ symbol: string; side: string; pnlPct: number }> };
}

export interface TradeHandlerResult {
  triggered: boolean;
  action: 'buy' | 'sell';
  symbol: string;
  strategyId: number;
  cycleResult: { entries: number; exits: number };
  portfolioSnapshot?: { balance: number; equity: number; positionCount: number };
}

// ── Handler Factory ──────────────────────────────────────────

const log = getLogger();

/**
 * Creates an ActionBridge handler for `execute_trade` actions.
 * Translates trade proposals from StrategyForge into PaperEngine cycles.
 */
export function createTradeHandler(deps: TradeHandlerDeps): (payload: Record<string, unknown>) => Promise<TradeHandlerResult> {
  return async (payload: Record<string, unknown>): Promise<TradeHandlerResult> => {
    const symbol = (payload.symbol as string) ?? 'UNKNOWN';
    const action = (payload.action as 'buy' | 'sell') ?? 'buy';
    const strategyId = (payload.strategyId as number) ?? 0;
    const reason = (payload.reason as string) ?? '';
    const confidence = (payload.confidence as number) ?? 0;

    log.info(`[trade-handler] Executing trade: ${action} ${symbol} (strategy #${strategyId}, conf=${confidence.toFixed(2)}, reason=${reason})`);

    // Trigger a paper trading cycle — the PaperEngine's DecisionEngine
    // will evaluate market conditions and decide entry/exit
    const cycleResult = await deps.runCycle();

    log.info(`[trade-handler] Cycle result: ${cycleResult.entries} entries, ${cycleResult.exits} exits`);

    // Snapshot portfolio state after trade
    let portfolioSnapshot: TradeHandlerResult['portfolioSnapshot'];
    if (deps.getPortfolio) {
      try {
        const portfolio = deps.getPortfolio();
        portfolioSnapshot = {
          balance: portfolio.balance,
          equity: portfolio.equity,
          positionCount: portfolio.positions.length,
        };
      } catch { /* best effort */ }
    }

    return {
      triggered: true,
      action,
      symbol,
      strategyId,
      cycleResult,
      portfolioSnapshot,
    };
  };
}
