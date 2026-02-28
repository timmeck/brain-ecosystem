import type { TerminalRepository } from '../db/repositories/terminal.repository.js';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

export interface RegisterTerminalInput {
  uuid: string;
  projectId?: number;
  pid?: number;
  shell?: string;
  cwd?: string;
}

export class TerminalService {
  private logger = getLogger();
  private eventBus = getEventBus();

  constructor(
    private terminalRepo: TerminalRepository,
    private staleTimeout: number,
  ) {}

  register(input: RegisterTerminalInput): number {
    const existing = this.terminalRepo.findByUuid(input.uuid);
    if (existing) {
      this.terminalRepo.update(existing.id, {
        last_seen: new Date().toISOString(),
        disconnected_at: null,
        project_id: input.projectId ?? existing.project_id,
        cwd: input.cwd ?? existing.cwd,
      });
      this.logger.info(`Terminal reconnected (id=${existing.id}, uuid=${input.uuid})`);
      this.eventBus.emit('terminal:connected', { terminalId: existing.id, uuid: input.uuid });
      return existing.id;
    }

    const id = this.terminalRepo.create({
      uuid: input.uuid,
      project_id: input.projectId ?? null,
      pid: input.pid ?? null,
      shell: input.shell ?? null,
      cwd: input.cwd ?? null,
    });

    this.logger.info(`Terminal registered (id=${id}, uuid=${input.uuid})`);
    this.eventBus.emit('terminal:connected', { terminalId: id, uuid: input.uuid });
    return id;
  }

  heartbeat(uuid: string): void {
    const terminal = this.terminalRepo.findByUuid(uuid);
    if (terminal) {
      this.terminalRepo.update(terminal.id, {
        last_seen: new Date().toISOString(),
      });
    }
  }

  disconnect(uuid: string): void {
    const terminal = this.terminalRepo.findByUuid(uuid);
    if (terminal) {
      this.terminalRepo.update(terminal.id, {
        disconnected_at: new Date().toISOString(),
      });
      this.eventBus.emit('terminal:disconnected', { terminalId: terminal.id });
      this.logger.info(`Terminal disconnected (id=${terminal.id}, uuid=${uuid})`);
    }
  }

  cleanup(): number {
    const cutoff = new Date(Date.now() - this.staleTimeout).toISOString();
    const count = this.terminalRepo.cleanupStale(cutoff);
    if (count > 0) {
      this.logger.info(`Cleaned up ${count} stale terminal(s)`);
    }
    return count;
  }

  getConnected() {
    return this.terminalRepo.findConnected();
  }
}
