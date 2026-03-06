export interface PaperConfig {
  enabled: boolean;
  intervalMs: number;
  startingBalance: number;
  maxPositionPct: number;
  maxPositions: number;
  stopLossPct: number;
  takeProfitPct: number;
  trailingStopActivation: number;
  trailingStopDistance: number;
  confidenceThreshold: number;
  scoreThreshold: number;
  timeExitHours: number;
  cryptoIds: string[];
  stockSymbols: string[];
}

export interface OHLCVCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorResult {
  rsi14: number;
  macd: { line: number; signal: number; histogram: number };
  trendScore: number;
  volatility: number;
}

export interface PaperPosition {
  id?: number;
  symbol: string;
  side: 'long';
  entryPrice: number;
  quantity: number;
  usdtAmount: number;
  currentPrice: number;
  pnlPct: number;
  highWaterMark: number;
  signalsJson: string;
  fingerprint: string;
  confidence: number;
  regime: string;
  openedAt: string;
}

export interface PaperClosedTrade {
  id?: number;
  symbol: string;
  side: 'long';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  usdtAmount: number;
  pnlUsdt: number;
  pnlPct: number;
  exitReason: string;
  signalsJson: string;
  fingerprint: string;
  confidence: number;
  regime: string;
  openedAt: string;
  closedAt: string;
}

export interface PaperStatus {
  enabled: boolean;
  running: boolean;
  paused: boolean;
  cycleCount: number;
  lastCycleAt: string | null;
  balance: number;
  equity: number;
  startingBalance: number;
  openPositions: number;
  closedTrades: number;
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  symbols: number;
}
