import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

const require = createRequire(import.meta.url);

// ── Types ───────────────────────────────────────────────

export interface BackupConfig {
  backupDir?: string;        // default: same dir as DB + /backups
  maxBackups?: number;       // auto-cleanup oldest, default 10
  compress?: boolean;        // future: gzip compression
}

export interface BackupRecord {
  filename: string;
  path: string;
  size: number;              // bytes
  created: string;           // ISO timestamp
}

export interface RestoreResult {
  success: boolean;
  filename: string;
  integrityOk: boolean;
}

// ── Service ─────────────────────────────────────────────

export class BackupService {
  private logger = getLogger();
  private backupDir: string;
  private maxBackups: number;

  constructor(
    private db: Database.Database,
    private dbPath: string,
    config?: BackupConfig,
  ) {
    this.backupDir = config?.backupDir ?? path.join(path.dirname(dbPath), 'backups');
    this.maxBackups = config?.maxBackups ?? 10;
    fs.mkdirSync(this.backupDir, { recursive: true });
  }

  /** Create a backup of the current database. */
  create(label?: string): BackupRecord {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = label ? `-${label.replace(/[^a-zA-Z0-9-_]/g, '')}` : '';
    const filename = `backup-${timestamp}${suffix}.db`;
    const backupPath = path.join(this.backupDir, filename);

    // Checkpoint WAL before copying for a consistent snapshot
    this.db.pragma('wal_checkpoint(TRUNCATE)');

    // Copy DB file synchronously
    fs.copyFileSync(this.dbPath, backupPath);

    // Verify integrity
    const integrityOk = this.checkIntegrity(backupPath);
    if (!integrityOk) {
      this.logger.warn(`Backup integrity check failed: ${filename}`);
      fs.unlinkSync(backupPath);
      throw new Error('Backup integrity check failed');
    }

    this.logger.info(`Backup created: ${filename} (${this.formatSize(fs.statSync(backupPath).size)})`);

    // Auto-cleanup old backups
    this.autoCleanup();

    const stat = fs.statSync(backupPath);
    return {
      filename,
      path: backupPath,
      size: stat.size,
      created: stat.mtime.toISOString(),
    };
  }

  /** List all available backups (newest first). */
  list(): BackupRecord[] {
    if (!fs.existsSync(this.backupDir)) return [];

    const files = fs.readdirSync(this.backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
      .sort()
      .reverse();

    return files.map(filename => {
      const filePath = path.join(this.backupDir, filename);
      const stat = fs.statSync(filePath);
      return {
        filename,
        path: filePath,
        size: stat.size,
        created: stat.mtime.toISOString(),
      };
    });
  }

  /**
   * Restore a database from a backup.
   * CAUTION: This replaces the current database. The caller must close and reopen the DB connection.
   */
  restore(filename: string): RestoreResult {
    const backupPath = path.join(this.backupDir, filename);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${filename}`);
    }

    // Verify backup integrity before restore
    const integrityOk = this.checkIntegrity(backupPath);
    if (!integrityOk) {
      throw new Error(`Backup integrity check failed: ${filename}`);
    }

    // Create a safety backup of current DB before overwriting
    const safetyName = `pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
    const safetyPath = path.join(this.backupDir, safetyName);
    this.db.pragma('wal_checkpoint(TRUNCATE)');
    fs.copyFileSync(this.dbPath, safetyPath);
    this.logger.info(`Safety backup created: ${safetyName}`);

    // Close current DB, copy backup over, caller must reopen
    this.db.close();
    fs.copyFileSync(backupPath, this.dbPath);

    // Clean up WAL/SHM files if they exist
    try { fs.unlinkSync(this.dbPath + '-wal'); } catch { /* may not exist */ }
    try { fs.unlinkSync(this.dbPath + '-shm'); } catch { /* may not exist */ }

    this.logger.info(`Database restored from: ${filename}`);

    return { success: true, filename, integrityOk };
  }

  /** Check integrity of a database file. */
  checkIntegrity(dbFilePath?: string): boolean {
    const filePath = dbFilePath ?? this.dbPath;
    try {
      const BetterSqlite3 = require('better-sqlite3');
      const testDb = new BetterSqlite3(filePath, { readonly: true }) as Database.Database;
      const result = testDb.pragma('integrity_check') as { integrity_check: string }[];
      testDb.close();
      return result.length === 1 && result[0]!.integrity_check === 'ok';
    } catch {
      return false;
    }
  }

  /** Get current database size info. */
  getInfo(): { dbSize: number; walSize: number; backupCount: number; backupTotalSize: number } {
    const dbSize = fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0;
    const walPath = this.dbPath + '-wal';
    const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

    const backups = this.list();
    const backupTotalSize = backups.reduce((sum, b) => sum + b.size, 0);

    return { dbSize, walSize, backupCount: backups.length, backupTotalSize };
  }

  /** Delete a specific backup. */
  delete(filename: string): boolean {
    const filePath = path.join(this.backupDir, filename);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    this.logger.info(`Backup deleted: ${filename}`);
    return true;
  }

  /** Auto-cleanup oldest backups beyond maxBackups. */
  private autoCleanup(): void {
    const backups = this.list(); // sorted newest first
    if (backups.length <= this.maxBackups) return;

    const toDelete = backups.slice(this.maxBackups);
    for (const backup of toDelete) {
      this.delete(backup.filename);
    }
    this.logger.info(`Auto-cleaned ${toDelete.length} old backup(s)`);
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }
}
