import type { TradeService, RecordOutcomeInput } from './trade.service.js';
import type { SignalInput } from '../signals/fingerprint.js';
import { getLogger } from '../utils/logger.js';

export interface ImportTradeRow {
  pair: string;
  botType: string;
  profitPct: number;
  win: boolean;
  signals: SignalInput;
  regime?: string;
  timeframe?: string;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
}

export class ImportService {
  private logger = getLogger();

  constructor(private tradeService: TradeService) {}

  importTrades(trades: ImportTradeRow[]): ImportResult {
    let imported = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < trades.length; i++) {
      const row = trades[i]!;
      try {
        const input: RecordOutcomeInput = {
          pair: row.pair,
          botType: row.botType,
          profitPct: row.profitPct,
          win: row.win,
          signals: row.signals,
          regime: row.regime,
        };
        this.tradeService.recordOutcome(input);
        imported++;
      } catch (err) {
        failed++;
        const msg = `Row ${i}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        this.logger.info(`Import error at row ${i}: ${msg}`);
      }
    }

    this.logger.info(`Import complete: ${imported} imported, ${failed} failed`);
    return { imported, failed, errors };
  }

  importFromJson(jsonString: string): ImportResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch (err) {
      const msg = `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`;
      this.logger.info(`Import failed: ${msg}`);
      return { imported: 0, failed: 0, errors: [msg] };
    }

    if (!Array.isArray(parsed)) {
      const msg = 'Expected a JSON array of trade objects';
      this.logger.info(`Import failed: ${msg}`);
      return { imported: 0, failed: 0, errors: [msg] };
    }

    const validationErrors: string[] = [];
    const validRows: ImportTradeRow[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i] as Record<string, unknown>;
      const rowErrors = this.validateRow(item, i);
      if (rowErrors.length > 0) {
        validationErrors.push(...rowErrors);
      } else {
        validRows.push({
          pair: item['pair'] as string,
          botType: item['botType'] as string,
          profitPct: item['profitPct'] as number,
          win: item['win'] as boolean,
          signals: item['signals'] as SignalInput,
          regime: item['regime'] as string | undefined,
          timeframe: item['timeframe'] as string | undefined,
        });
      }
    }

    if (validRows.length === 0 && validationErrors.length > 0) {
      return { imported: 0, failed: parsed.length, errors: validationErrors };
    }

    const result = this.importTrades(validRows);
    result.failed += validationErrors.length;
    result.errors.push(...validationErrors);
    return result;
  }

  private validateRow(item: Record<string, unknown>, index: number): string[] {
    const errors: string[] = [];
    if (typeof item['pair'] !== 'string') errors.push(`Row ${index}: missing or invalid "pair"`);
    if (typeof item['botType'] !== 'string') errors.push(`Row ${index}: missing or invalid "botType"`);
    if (typeof item['profitPct'] !== 'number') errors.push(`Row ${index}: missing or invalid "profitPct"`);
    if (typeof item['win'] !== 'boolean') errors.push(`Row ${index}: missing or invalid "win"`);
    if (typeof item['signals'] !== 'object' || item['signals'] === null) errors.push(`Row ${index}: missing or invalid "signals"`);
    return errors;
  }
}
