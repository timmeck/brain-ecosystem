import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getLogger } from '../utils/logger.js';

export interface ServiceConfig {
  name: string;
  displayName: string;
  description: string;
  entryPoint: string;
  args: string[];
}

export interface ServiceStatus {
  name: string;
  installed: boolean;
  state: 'running' | 'stopped' | 'pending' | 'unknown';
}

/**
 * WindowsServiceManager — installs/manages Brain daemons as Windows services.
 * Uses NSSM (Non-Sucking Service Manager) or SC.exe for service management.
 * Optional: only works on Windows, graceful no-op on other platforms.
 */
export class WindowsServiceManager {
  private logger = getLogger();
  private nssmPath: string | null = null;

  constructor() {
    if (process.platform === 'win32') {
      this.nssmPath = this.findNssm();
    }
  }

  /** Check if we're on Windows and can manage services. */
  isAvailable(): boolean {
    return process.platform === 'win32';
  }

  /** Install a Brain daemon as a Windows service. */
  install(config: ServiceConfig): boolean {
    if (!this.isAvailable()) {
      this.logger.warn('Windows service management only available on Windows');
      return false;
    }

    const serviceName = `BrainEcosystem_${config.name}`;

    // Create a wrapper script that node can execute
    const wrapperPath = this.createWrapperScript(config);

    try {
      if (this.nssmPath) {
        // NSSM approach (preferred — proper service lifecycle)
        execSync(`"${this.nssmPath}" install "${serviceName}" "${process.execPath}" "${wrapperPath}"`, { stdio: 'pipe' });
        execSync(`"${this.nssmPath}" set "${serviceName}" DisplayName "${config.displayName}"`, { stdio: 'pipe' });
        execSync(`"${this.nssmPath}" set "${serviceName}" Description "${config.description}"`, { stdio: 'pipe' });
        execSync(`"${this.nssmPath}" set "${serviceName}" AppStdout "${this.getLogPath(config.name)}"`, { stdio: 'pipe' });
        execSync(`"${this.nssmPath}" set "${serviceName}" AppStderr "${this.getLogPath(config.name)}"`, { stdio: 'pipe' });
        execSync(`"${this.nssmPath}" set "${serviceName}" Start SERVICE_AUTO_START`, { stdio: 'pipe' });
      } else {
        // SC.exe fallback
        const binPath = `"${process.execPath}" "${wrapperPath}"`;
        execSync(`sc create "${serviceName}" binPath= ${binPath} DisplayName= "${config.displayName}" start= auto`, { stdio: 'pipe' });
        execSync(`sc description "${serviceName}" "${config.description}"`, { stdio: 'pipe' });
      }

      this.logger.info(`Service ${serviceName} installed`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to install service: ${(err as Error).message}`);
      return false;
    }
  }

  /** Uninstall a Brain service. */
  uninstall(name: string): boolean {
    if (!this.isAvailable()) return false;

    const serviceName = `BrainEcosystem_${name}`;
    try {
      this.stopService(name);
      if (this.nssmPath) {
        execSync(`"${this.nssmPath}" remove "${serviceName}" confirm`, { stdio: 'pipe' });
      } else {
        execSync(`sc delete "${serviceName}"`, { stdio: 'pipe' });
      }
      this.logger.info(`Service ${serviceName} uninstalled`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to uninstall service: ${(err as Error).message}`);
      return false;
    }
  }

  /** Start a service. */
  startService(name: string): boolean {
    if (!this.isAvailable()) return false;
    const serviceName = `BrainEcosystem_${name}`;
    try {
      execSync(`sc start "${serviceName}"`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /** Stop a service. */
  stopService(name: string): boolean {
    if (!this.isAvailable()) return false;
    const serviceName = `BrainEcosystem_${name}`;
    try {
      execSync(`sc stop "${serviceName}"`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /** Query service status. */
  queryStatus(name: string): ServiceStatus {
    const serviceName = `BrainEcosystem_${name}`;
    const result: ServiceStatus = { name, installed: false, state: 'unknown' };

    if (!this.isAvailable()) return result;

    try {
      const output = execSync(`sc query "${serviceName}"`, { stdio: 'pipe', encoding: 'utf-8' });
      result.installed = true;

      if (output.includes('RUNNING')) result.state = 'running';
      else if (output.includes('STOPPED')) result.state = 'stopped';
      else if (output.includes('PENDING')) result.state = 'pending';
    } catch {
      result.installed = false;
      result.state = 'unknown';
    }

    return result;
  }

  /** Query status of all Brain services. */
  queryAll(): ServiceStatus[] {
    return ['brain', 'trading-brain', 'marketing-brain'].map(name => this.queryStatus(name));
  }

  private findNssm(): string | null {
    try {
      execSync('nssm version', { stdio: 'pipe' });
      return 'nssm';
    } catch {
      // Check common install locations
      const paths = [
        'C:\\nssm\\nssm.exe',
        'C:\\tools\\nssm\\nssm.exe',
        path.join(process.env['PROGRAMFILES'] ?? '', 'nssm', 'nssm.exe'),
      ];
      for (const p of paths) {
        if (fs.existsSync(p)) return p;
      }
      return null;
    }
  }

  private createWrapperScript(config: ServiceConfig): string {
    const homeDir = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
    const wrapperDir = path.join(homeDir, '.brain', 'services');
    fs.mkdirSync(wrapperDir, { recursive: true });

    const wrapperPath = path.join(wrapperDir, `${config.name}-service.js`);
    const content = `
// Auto-generated Windows service wrapper for ${config.name}
const { spawn } = require('child_process');
const path = require('path');

const child = spawn(process.execPath, ${JSON.stringify([config.entryPoint, ...config.args])}, {
  stdio: 'inherit',
  cwd: path.dirname(${JSON.stringify(config.entryPoint)}),
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
`;
    fs.writeFileSync(wrapperPath, content, 'utf-8');
    return wrapperPath;
  }

  private getLogPath(name: string): string {
    const homeDir = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
    const logDir = path.join(homeDir, '.brain', 'services', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    return path.join(logDir, `${name}-service.log`);
  }
}
