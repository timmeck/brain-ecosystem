import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';
import { IpcClient } from '../ipc/client.js';
import { getPipeName } from '../utils/paths.js';

export interface DaemonConfig {
  name: string;
  entryPoint: string;
  args: string[];
  pidPath: string;
  pipeName: string;
  healthCheckIntervalMs?: number;
}

export interface DaemonStatus {
  name: string;
  pid: number | null;
  running: boolean;
  healthy: boolean;
  uptime: number | null;
  restarts: number;
  lastCrash: string | null;
}

export interface WatchdogConfig {
  daemons: DaemonConfig[];
  maxRestarts?: number;
  restartWindowMs?: number;
  baseBackoffMs?: number;
  healthCheckIntervalMs?: number;
}

interface DaemonState {
  config: DaemonConfig;
  process: ChildProcess | null;
  pid: number | null;
  running: boolean;
  healthy: boolean;
  startedAt: number | null;
  restarts: number;
  restartTimes: number[];
  lastCrash: string | null;
}

/**
 * WatchdogService — monitors and auto-restarts multiple Brain daemons.
 * Provides health checks via IPC ping, exponential backoff on crashes,
 * and unified status reporting.
 */
export class WatchdogService {
  private daemons: Map<string, DaemonState> = new Map();
  private healthTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private monitorOnly = false;
  private logger = getLogger();

  private maxRestarts: number;
  private restartWindowMs: number;
  private baseBackoffMs: number;
  private healthCheckIntervalMs: number;

  constructor(config: WatchdogConfig) {
    this.maxRestarts = config.maxRestarts ?? 5;
    this.restartWindowMs = config.restartWindowMs ?? 5 * 60 * 1000;
    this.baseBackoffMs = config.baseBackoffMs ?? 1000;
    this.healthCheckIntervalMs = config.healthCheckIntervalMs ?? 30_000;

    for (const d of config.daemons) {
      this.daemons.set(d.name, {
        config: d,
        process: null,
        pid: null,
        running: false,
        healthy: false,
        startedAt: null,
        restarts: 0,
        restartTimes: [],
        lastCrash: null,
      });
    }
  }

  /** Start all configured daemons and begin health monitoring. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.info(`Watchdog starting (${this.daemons.size} daemons)`);

    for (const [name] of this.daemons) {
      this.launchDaemon(name);
    }

    this.healthTimer = setInterval(() => {
      this.checkHealth().catch(err =>
        this.logger.error(`Health check error: ${err}`),
      );
    }, this.healthCheckIntervalMs);
  }

  /** Monitor-only mode: detect already-running daemons via PID files and run health checks,
   *  but do NOT spawn new daemons. Use this when the Brain process itself is one of the daemons. */
  startMonitoring(): void {
    if (this.running) return;
    this.running = true;
    this.monitorOnly = true;
    this.logger.info(`Watchdog monitoring mode (${this.daemons.size} daemons)`);

    // Detect already-running daemons via PID files
    for (const [name, state] of this.daemons) {
      const existingPid = this.readPid(state.config.pidPath);
      if (existingPid && this.isProcessAlive(existingPid)) {
        state.pid = existingPid;
        state.running = true;
        state.startedAt = Date.now();
        this.logger.info(`${name} detected (PID: ${existingPid})`);
      }
    }

    // Start health check loop
    this.healthTimer = setInterval(() => {
      this.checkHealth().catch(err =>
        this.logger.error(`Health check error: ${err}`),
      );
    }, this.healthCheckIntervalMs);

    // Run first health check immediately
    this.checkHealth().catch(err =>
      this.logger.error(`Initial health check error: ${err}`),
    );
  }

  /** Stop all daemons and health monitoring. */
  stop(): void {
    this.running = false;

    if (this.healthTimer) {
      clearInterval(this.healthTimer);
      this.healthTimer = null;
    }

    for (const [name, state] of this.daemons) {
      if (state.pid) {
        try {
          process.kill(state.pid, 'SIGTERM');
          this.logger.info(`Sent SIGTERM to ${name} (PID: ${state.pid})`);
        } catch {
          // Already dead
        }
      }
      state.running = false;
      state.process = null;
    }

    this.logger.info('Watchdog stopped');
  }

  /** Get status of all daemons. */
  getStatus(): DaemonStatus[] {
    const result: DaemonStatus[] = [];
    for (const [, state] of this.daemons) {
      result.push({
        name: state.config.name,
        pid: state.pid,
        running: state.running,
        healthy: state.healthy,
        uptime: state.startedAt ? Date.now() - state.startedAt : null,
        restarts: state.restarts,
        lastCrash: state.lastCrash,
      });
    }
    return result;
  }

  /** Get status of a single daemon. */
  getDaemonStatus(name: string): DaemonStatus | null {
    const state = this.daemons.get(name);
    if (!state) return null;
    return {
      name: state.config.name,
      pid: state.pid,
      running: state.running,
      healthy: state.healthy,
      uptime: state.startedAt ? Date.now() - state.startedAt : null,
      restarts: state.restarts,
      lastCrash: state.lastCrash,
    };
  }

  /** Restart a specific daemon. */
  restartDaemon(name: string): boolean {
    const state = this.daemons.get(name);
    if (!state) return false;

    if (state.pid) {
      try { process.kill(state.pid, 'SIGTERM'); } catch { /* already dead */ }
    }
    state.running = false;
    state.process = null;

    this.launchDaemon(name);
    return true;
  }

  private launchDaemon(name: string): void {
    const state = this.daemons.get(name);
    if (!state) return;

    const { config } = state;

    // Check if already running via PID file
    const existingPid = this.readPid(config.pidPath);
    if (existingPid && this.isProcessAlive(existingPid)) {
      this.logger.info(`${name} already running (PID: ${existingPid})`);
      state.pid = existingPid;
      state.running = true;
      state.startedAt = Date.now();
      return;
    }

    // Clean stale PID
    try { fs.unlinkSync(config.pidPath); } catch { /* ignore */ }

    // Spawn
    const isTsSource = !fs.existsSync(config.entryPoint);
    let cmdArgs: string[];
    if (isTsSource) {
      const tsEntry = config.entryPoint.replace(/\.js$/, '.ts');
      cmdArgs = ['--import', 'tsx', tsEntry, ...config.args];
    } else {
      cmdArgs = [config.entryPoint, ...config.args];
    }

    const child = spawn(process.execPath, cmdArgs, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    state.process = child;
    state.pid = child.pid ?? null;
    state.running = true;
    state.startedAt = Date.now();

    this.logger.info(`${name} launched (PID: ${child.pid})`);

    child.on('exit', (code) => {
      if (!this.running) return; // watchdog stopped, don't restart

      state.running = false;
      state.healthy = false;
      state.process = null;

      if (code === 0 || code === null) {
        this.logger.info(`${name} stopped normally`);
        return;
      }

      state.lastCrash = new Date().toISOString();
      state.restarts++;
      this.logger.warn(`${name} crashed (code ${code})`);

      // Rate limit restarts
      const now = Date.now();
      state.restartTimes.push(now);
      const recent = state.restartTimes.filter(t => now - t < this.restartWindowMs);
      state.restartTimes = recent;

      if (recent.length > this.maxRestarts) {
        this.logger.error(`${name} crashed ${this.maxRestarts} times in ${this.restartWindowMs / 1000}s — giving up`);
        try { fs.unlinkSync(config.pidPath); } catch { /* ignore */ }
        return;
      }

      const backoff = this.baseBackoffMs * Math.pow(2, recent.length - 1);
      this.logger.info(`${name} restarting in ${backoff}ms (attempt ${recent.length}/${this.maxRestarts})`);
      setTimeout(() => {
        if (this.running) this.launchDaemon(name);
      }, backoff);
    });
  }

  /** Health check — ping each daemon via IPC. */
  private async checkHealth(): Promise<void> {
    for (const [name, state] of this.daemons) {
      // In monitor mode, try to detect newly-started daemons via PID file
      if ((!state.running || !state.pid) && this.monitorOnly) {
        const pid = this.readPid(state.config.pidPath);
        if (pid && this.isProcessAlive(pid)) {
          state.pid = pid;
          state.running = true;
          state.startedAt = state.startedAt ?? Date.now();
          this.logger.info(`${name} detected (PID: ${pid})`);
        } else {
          state.healthy = false;
          continue;
        }
      } else if (!state.running || !state.pid) {
        state.healthy = false;
        continue;
      }

      // First check if process is alive
      if (!this.isProcessAlive(state.pid)) {
        state.healthy = false;
        state.running = false;
        this.logger.warn(`${name} PID ${state.pid} no longer alive`);
        if (this.running && !this.monitorOnly) this.launchDaemon(name);
        continue;
      }

      // IPC health ping
      const client = new IpcClient(state.config.pipeName, 3000);
      try {
        await client.connect();
        await client.request('status');
        state.healthy = true;
      } catch {
        state.healthy = false;
        this.logger.debug(`${name} IPC health check failed (process alive but IPC unreachable)`);
      } finally {
        client.disconnect();
      }
    }
  }

  private readPid(pidPath: string): number | null {
    try {
      const content = fs.readFileSync(pidPath, 'utf-8').trim();
      const pid = parseInt(content, 10);
      return isNaN(pid) ? null : pid;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a default WatchdogConfig for the Brain Ecosystem.
 * Discovers installed brains by checking for their entry points.
 */
export function createDefaultWatchdogConfig(): WatchdogConfig {
  const daemons: DaemonConfig[] = [];

  // Try to discover brain packages relative to brain-core
  const coreDir = path.resolve(import.meta.dirname, '../..');
  const packagesDir = path.resolve(coreDir, '..');

  const brainDefs = [
    { name: 'brain', pkg: 'brain', dataDir: '.brain', pipeSuffix: 'brain' },
    { name: 'trading-brain', pkg: 'trading-brain', dataDir: '.trading-brain', pipeSuffix: 'trading-brain' },
    { name: 'marketing-brain', pkg: 'marketing-brain', dataDir: '.marketing-brain', pipeSuffix: 'marketing-brain' },
  ];

  for (const def of brainDefs) {
    const entryPoint = path.join(packagesDir, def.pkg, 'dist', 'index.js');
    const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '';
    const pidPath = path.join(homeDir, def.dataDir, `${def.name}.pid`);

    daemons.push({
      name: def.name,
      entryPoint,
      args: ['daemon'],
      pidPath,
      pipeName: getPipeName(def.pipeSuffix),
    });
  }

  return { daemons };
}
