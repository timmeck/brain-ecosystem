import type { TradeRepository, TradeRecord } from '../db/repositories/trade.repository.js';
import type { InsightRepository } from '../db/repositories/insight.repository.js';
import type { ResearchConfig } from '../types/config.types.js';
import { getEventBus } from '../utils/events.js';
import { BaseResearchEngine } from '@timmeck/brain-core';

interface NewInsight {
  type: string;
  severity: string;
  title: string;
  description: string;
  data?: unknown;
}

function mode(arr: string[]): string | null {
  if (arr.length === 0) return null;
  const freq: Record<string, number> = {};
  arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
  let maxCount = 0, maxVal: string | null = null;
  for (const [val, count] of Object.entries(freq)) {
    if (count > maxCount) { maxCount = count; maxVal = val; }
  }
  return maxVal;
}

export class ResearchEngine extends BaseResearchEngine {
  constructor(
    private config: ResearchConfig,
    private tradeRepo: TradeRepository,
    private insightRepo: InsightRepository,
  ) {
    super(config);
  }

  runCycle(): void {
    const bus = getEventBus();
    const trades = this.tradeRepo.getAll();
    if (trades.length < this.config.minTrades) return;

    const now = Date.now();
    const insights: NewInsight[] = [];

    this.detectTrends(trades, now, insights);
    this.detectGaps(trades, insights);
    this.detectSynergies(trades, insights);
    this.detectPerformance(trades, insights);
    this.detectRegimeShifts(trades, now, insights);

    // Save insights
    for (const ins of insights) {
      const id = this.insightRepo.create(ins);
      bus.emit('insight:created', { insightId: id, type: ins.type });
    }

    // Prune old insights
    this.insightRepo.pruneOldest(this.config.maxInsights);

    if (insights.length > 0) {
      this.logger.info(`Research: ${insights.length} new insights`);
    }
  }

  private detectTrends(trades: TradeRecord[], now: number, insights: NewInsight[]): void {
    const recentCutoff = new Date(now - this.config.trendWindowDays * 86400000).toISOString();
    const olderCutoff = new Date(now - 30 * 86400000).toISOString();

    const recent = trades.filter(o => o.created_at > recentCutoff);
    const older = trades.filter(o => o.created_at > olderCutoff && o.created_at <= recentCutoff);

    if (recent.length >= 5 && older.length >= 5) {
      const recentWinRate = recent.filter(o => o.win === 1).length / recent.length;
      const olderWinRate = older.filter(o => o.win === 1).length / older.length;
      const delta = recentWinRate - olderWinRate;

      if (Math.abs(delta) > 0.1) {
        insights.push({
          type: 'trend',
          severity: Math.abs(delta) > 0.2 ? 'high' : 'medium',
          title: delta > 0 ? 'Win-Rate steigt' : 'Win-Rate sinkt',
          description: `Win-Rate ${delta > 0 ? 'gestiegen' : 'gesunken'}: ${(olderWinRate * 100).toFixed(0)}% → ${(recentWinRate * 100).toFixed(0)}% (letzte ${this.config.trendWindowDays} Tage vs. vorher)`,
          data: { recentWinRate, olderWinRate, delta },
        });
      }
    }
  }

  private detectGaps(trades: TradeRecord[], insights: NewInsight[]): void {
    const regimeGroups: Record<string, TradeRecord[]> = {};
    trades.forEach(o => {
      const parts = o.fingerprint.split('|');
      const regime = parts[4] || 'unknown';
      if (!regimeGroups[regime]) regimeGroups[regime] = [];
      regimeGroups[regime]!.push(o);
    });

    for (const [regime, group] of Object.entries(regimeGroups)) {
      if (group.length < 5 && group.length > 0) {
        insights.push({
          type: 'gap',
          severity: 'low',
          title: `Datenlücke: ${regime}`,
          description: `Nur ${group.length} Trades im Regime "${regime}" — Brain braucht mehr Daten für zuverlässige Gewichtung`,
          data: { regime, count: group.length },
        });
      }
    }
  }

  private detectSynergies(trades: TradeRecord[], insights: NewInsight[]): void {
    const botTypeGroups: Record<string, TradeRecord[]> = {};
    trades.forEach(o => {
      if (!botTypeGroups[o.bot_type]) botTypeGroups[o.bot_type] = [];
      botTypeGroups[o.bot_type]!.push(o);
    });

    const botTypes = Object.keys(botTypeGroups);
    if (botTypes.length < 2) return;

    for (let i = 0; i < botTypes.length; i++) {
      for (let j = i + 1; j < botTypes.length; j++) {
        const a = botTypeGroups[botTypes[i]!]!;
        const b = botTypeGroups[botTypes[j]!]!;
        const aFps = new Set(a.map(o => o.fingerprint));
        const bFps = new Set(b.map(o => o.fingerprint));
        let shared = 0;
        aFps.forEach(fp => { if (bFps.has(fp)) shared++; });

        if (shared > 0) {
          insights.push({
            type: 'synergy',
            severity: shared > 3 ? 'high' : 'medium',
            title: `Synergie: ${botTypes[i]} ↔ ${botTypes[j]}`,
            description: `${shared} gemeinsame Signal-Muster — Erfahrungen von ${botTypes[i]} helfen ${botTypes[j]}`,
            data: { botA: botTypes[i], botB: botTypes[j], sharedPatterns: shared },
          });
        }
      }
    }
  }

  private detectPerformance(trades: TradeRecord[], insights: NewInsight[]): void {
    const fpGroups: Record<string, TradeRecord[]> = {};
    trades.forEach(o => {
      if (!fpGroups[o.fingerprint]) fpGroups[o.fingerprint] = [];
      fpGroups[o.fingerprint]!.push(o);
    });

    let bestFp: string | null = null, worstFp: string | null = null;
    let bestWR = 0, worstWR = 1;

    for (const [fp, group] of Object.entries(fpGroups)) {
      if (group.length < 5) continue;
      const wr = group.filter(o => o.win === 1).length / group.length;
      if (wr > bestWR) { bestWR = wr; bestFp = fp; }
      if (wr < worstWR) { worstWR = wr; worstFp = fp; }
    }

    if (bestFp && bestWR > 0.6) {
      insights.push({
        type: 'performance',
        severity: 'high',
        title: 'Stärkstes Signal-Muster',
        description: `"${bestFp.split('|').join(' + ')}" hat ${(bestWR * 100).toFixed(0)}% Win-Rate (n=${fpGroups[bestFp]!.length})`,
        data: { fingerprint: bestFp, winRate: bestWR, count: fpGroups[bestFp]!.length },
      });
    }
    if (worstFp && worstWR < 0.35) {
      insights.push({
        type: 'performance',
        severity: 'high',
        title: 'Schwächstes Signal-Muster',
        description: `"${worstFp.split('|').join(' + ')}" hat nur ${(worstWR * 100).toFixed(0)}% Win-Rate (n=${fpGroups[worstFp]!.length}) — Brain reduziert Gewichtung`,
        data: { fingerprint: worstFp, winRate: worstWR, count: fpGroups[worstFp]!.length },
      });
    }
  }

  private detectRegimeShifts(trades: TradeRecord[], now: number, insights: NewInsight[]): void {
    const recentCutoff = new Date(now - this.config.trendWindowDays * 86400000).toISOString();
    const recent = trades.filter(o => o.created_at > recentCutoff);
    const older = trades.filter(o => o.created_at <= recentCutoff).slice(-10);

    if (recent.length < 3) return;

    const recentRegimes = recent.map(o => o.fingerprint.split('|')[4] || 'unknown');
    const prevRegimes = older.map(o => o.fingerprint.split('|')[4] || 'unknown');
    const recentMode = mode(recentRegimes);
    const prevMode = mode(prevRegimes);

    if (recentMode && prevMode && recentMode !== prevMode) {
      insights.push({
        type: 'regime_shift',
        severity: 'high',
        title: 'Regime-Wechsel erkannt',
        description: `Marktregime hat sich verschoben: "${prevMode}" → "${recentMode}"`,
        data: { from: prevMode, to: recentMode },
      });
    }
  }

  /** Manual trigger */
  runManual(): number {
    this.runCycle();
    return this.insightRepo.count();
  }
}
