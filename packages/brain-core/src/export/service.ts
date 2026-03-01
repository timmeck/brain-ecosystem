import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ───────────────────────────────────────────────

export interface ExportOptions {
  table: string;
  format: 'json' | 'csv';
  columns?: string[];          // specific columns, default all
  where?: string;              // WHERE clause (without WHERE keyword)
  orderBy?: string;            // ORDER BY clause
  limit?: number;
  dateColumn?: string;         // column name for date filtering
  dateFrom?: string;           // ISO date string
  dateTo?: string;             // ISO date string
}

export interface ExportResult {
  table: string;
  format: 'json' | 'csv';
  rowCount: number;
  data: string;
}

// ── Service ─────────────────────────────────────────────

export class ExportService {
  private logger = getLogger();

  constructor(private db: Database.Database) {}

  /** Get list of all tables in the database. */
  listTables(): string[] {
    const rows = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    ).all() as { name: string }[];
    return rows.map(r => r.name);
  }

  /** Get column info for a table. */
  getColumns(table: string): { name: string; type: string }[] {
    this.validateTableName(table);
    const rows = this.db.prepare(`PRAGMA table_info("${table}")`).all() as {
      name: string; type: string;
    }[];
    return rows.map(r => ({ name: r.name, type: r.type }));
  }

  /** Export data from a table. */
  export(options: ExportOptions): ExportResult {
    this.validateTableName(options.table);

    const columns = options.columns?.length
      ? options.columns.map(c => `"${c.replace(/"/g, '""')}"`).join(', ')
      : '*';

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.where) {
      conditions.push(`(${options.where})`);
    }

    if (options.dateColumn && options.dateFrom) {
      this.validateColumnName(options.dateColumn);
      conditions.push(`"${options.dateColumn}" >= ?`);
      params.push(options.dateFrom);
    }

    if (options.dateColumn && options.dateTo) {
      this.validateColumnName(options.dateColumn);
      conditions.push(`"${options.dateColumn}" <= ?`);
      params.push(options.dateTo);
    }

    let sql = `SELECT ${columns} FROM "${options.table}"`;
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
    }
    if (options.limit) {
      sql += ` LIMIT ?`;
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];

    const data = options.format === 'csv'
      ? this.toCsv(rows)
      : JSON.stringify(rows, null, 2);

    this.logger.info(`Exported ${rows.length} rows from ${options.table} as ${options.format}`);

    return {
      table: options.table,
      format: options.format,
      rowCount: rows.length,
      data,
    };
  }

  /** Export multiple tables at once (JSON only). */
  exportAll(tables?: string[], format: 'json' | 'csv' = 'json'): Record<string, ExportResult> {
    const tableNames = tables ?? this.listTables();
    const results: Record<string, ExportResult> = {};

    for (const table of tableNames) {
      results[table] = this.export({ table, format });
    }

    return results;
  }

  /** Get row counts for all tables. */
  getStats(): Record<string, number> {
    const tables = this.listTables();
    const stats: Record<string, number> = {};

    for (const table of tables) {
      const row = this.db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).get() as { count: number };
      stats[table] = row.count;
    }

    return stats;
  }

  /** Convert array of objects to CSV string. */
  private toCsv(rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return '';

    const headers = Object.keys(rows[0]!);
    const lines: string[] = [headers.join(',')];

    for (const row of rows) {
      const values = headers.map(h => {
        const val = row[h];
        if (val == null) return '';
        const str = String(val);
        // Escape CSV: quote if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }

  /** Validate table name to prevent SQL injection. */
  private validateTableName(name: string): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid table name: ${name}`);
    }
  }

  /** Validate column name. */
  private validateColumnName(name: string): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      throw new Error(`Invalid column name: ${name}`);
    }
  }
}
