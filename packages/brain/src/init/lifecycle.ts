/**
 * Lifecycle helpers — extracted from BrainCore.logCrash, runRetentionCleanup, cleanup, restart, stop.
 * Pure extraction, no logic changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { BrainConfig } from '../types/config.types.js';

// ── Standalone helpers (no BrainCore refs needed) ──────────

export function logCrash(config: BrainConfig | null, type: string, err: Error): void {
  if (!config) return;
  const crashLog = path.join(path.dirname(config.dbPath), 'crashes.log');
  const entry = `[${new Date().toISOString()}] ${type}: ${err.message}\n${err.stack ?? ''}\n\n`;
  try {
    // Rotate crash log if > 5MB (max 1 rotation = 10MB total)
    try {
      const stat = fs.statSync(crashLog);
      if (stat.size > 5 * 1024 * 1024) {
        const rotated = crashLog.replace('.log', '.1.log');
        try { fs.unlinkSync(rotated); } catch { /* no previous rotation */ }
        fs.renameSync(crashLog, rotated);
      }
    } catch { /* file doesn't exist yet */ }
    fs.appendFileSync(crashLog, entry);
  } catch { /* best effort */ }
}

/** Track last VACUUM time to avoid running too often */
let lastVacuumTime = 0;
const VACUUM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 1 week

export function runRetentionCleanup(db: Database.Database, config: BrainConfig): void {
  const logger = getLogger();
  try {
    const now = Date.now();
    const errorCutoff = new Date(now - config.retention.errorDays * 86_400_000).toISOString();
    const insightCutoff = new Date(now - config.retention.insightDays * 2 * 86_400_000).toISOString();

    // Delete resolved errors older than retention period
    const errResult = db.prepare("DELETE FROM errors WHERE status = 'resolved' AND created_at < ?").run(errorCutoff);
    // Delete inactive insights older than 2× insightDays
    const insResult = db.prepare("DELETE FROM insights WHERE status = 'inactive' AND created_at < ?").run(insightCutoff);

    if (Number(errResult.changes) > 0 || Number(insResult.changes) > 0) {
      logger.info(`[retention] Cleaned up ${errResult.changes} old errors, ${insResult.changes} old insights`);
    }

    // Optimize DB
    db.pragma('optimize');

    // VACUUM weekly to reclaim disk space
    if (now - lastVacuumTime > VACUUM_INTERVAL_MS) {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.exec('VACUUM');
      lastVacuumTime = now;
      logger.info('[retention] DB vacuumed');
    }

    logger.debug('[retention] DB optimized');
  } catch (err) {
    logger.warn(`[retention] Cleanup failed (non-critical): ${(err as Error).message}`);
  }
}

// ── Cleanup: stop all engines + release resources ──────────

export interface CleanupRefs {
  cleanupTimer: ReturnType<typeof setInterval> | null;
  retentionTimer: ReturnType<typeof setInterval> | null;
  borgSync: { stop(): void } | null;
  telegramBot: { stop(): Promise<void> } | null;
  discordBot: { stop(): Promise<void> } | null;
  peerNetwork: { stopDiscovery(): void } | null;
  pluginRegistry: { size: number; list(): Array<{ name: string }>; unloadPlugin(name: string): Promise<boolean> } | null;
  subscriptionManager: { disconnectAll(): void } | null;
  attentionEngine: { stop(): void } | null;
  commandCenter: { stop(): void } | null;
  orchestrator: { stop(): void } | null;
  researchScheduler: { stop(): void } | null;
  researchEngine: { stop(): void } | null;
  embeddingEngine: { stop(): void } | null;
  learningEngine: { stop(): void } | null;
  mcpHttpServer: { stop(): void } | null;
  apiServer: { stop(): void } | null;
  ipcServer: { stop(): void } | null;
  db: { close(): void } | null;
}

export function cleanup(refs: CleanupRefs): void {
  if (refs.cleanupTimer) {
    clearInterval(refs.cleanupTimer);
    refs.cleanupTimer = null;
  }
  if (refs.retentionTimer) {
    clearInterval(refs.retentionTimer);
    refs.retentionTimer = null;
  }

  refs.borgSync?.stop();
  // Stop messaging bots
  refs.telegramBot?.stop().catch(() => {});
  refs.discordBot?.stop().catch(() => {});
  refs.peerNetwork?.stopDiscovery();
  // Unload all plugins gracefully
  if (refs.pluginRegistry?.size) {
    for (const p of refs.pluginRegistry.list()) {
      refs.pluginRegistry.unloadPlugin(p.name).catch(() => {});
    }
  }
  refs.subscriptionManager?.disconnectAll();
  refs.attentionEngine?.stop();
  refs.commandCenter?.stop();
  refs.orchestrator?.stop();
  refs.researchScheduler?.stop();
  refs.researchEngine?.stop();
  refs.embeddingEngine?.stop();
  refs.learningEngine?.stop();
  refs.mcpHttpServer?.stop();
  refs.apiServer?.stop();
  refs.ipcServer?.stop();
  refs.db?.close();
}

// ── Crash recovery: process-level error handlers ──────────

export function setupCrashRecovery(
  config: BrainConfig | null,
  onRestart: () => void,
): void {
  const logger = getLogger();

  process.on('uncaughtException', (err) => {
    // EPIPE = writing to closed stdout/stderr (daemon mode) — ignore silently
    if ((err as NodeJS.ErrnoException).code === 'EPIPE') return;
    try { logger.error('Uncaught exception', { error: err.message, stack: err.stack }); } catch { /* logger may be broken */ }
    logCrash(config, 'uncaughtException', err);
    // Don't restart on port conflicts — it will just loop
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      try { logger.error('Port conflict during restart — stopping to prevent crash loop'); } catch { /* ignore */ }
      return;
    }
    onRestart();
  });

  process.on('unhandledRejection', (reason) => {
    try { logger.error('Unhandled rejection', { reason: String(reason) }); } catch { /* logger may be broken */ }
    logCrash(config, 'unhandledRejection', reason instanceof Error ? reason : new Error(String(reason)));
    onRestart();
  });
}
