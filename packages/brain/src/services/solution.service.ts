import type { SolutionRecord } from '../types/solution.types.js';
import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

export interface ReportSolutionInput {
  errorId: number;
  description: string;
  commands?: string;
  codeChange?: string;
  source?: string;
}

export interface RateOutcomeInput {
  errorId: number;
  solutionId: number;
  success: boolean;
  terminalId?: number;
  output?: string;
  durationMs?: number;
}

export class SolutionService {
  private logger = getLogger();
  private eventBus = getEventBus();

  constructor(
    private solutionRepo: SolutionRepository,
    private synapseManager: SynapseManager,
  ) {}

  report(input: ReportSolutionInput): number {
    const solutionId = this.solutionRepo.create({
      description: input.description,
      commands: input.commands ?? null,
      code_change: input.codeChange ?? null,
      source: input.source ?? 'manual',
      confidence: 0.5,
    });

    this.solutionRepo.linkToError(input.errorId, solutionId);

    // Create synapse: solution solves error
    this.synapseManager.strengthen(
      { type: 'solution', id: solutionId },
      { type: 'error', id: input.errorId },
      'solves',
    );

    this.eventBus.emit('solution:created', { solutionId });
    this.logger.info(`Solution reported (id=${solutionId}) for error ${input.errorId}`);

    return solutionId;
  }

  rateOutcome(input: RateOutcomeInput): void {
    // Record the attempt
    const errorSolutions = this.solutionRepo.findForError(input.errorId);
    const link = errorSolutions.find(s => s.id === input.solutionId);
    if (!link) {
      this.solutionRepo.linkToError(input.errorId, input.solutionId);
    }

    // Find the error_solution link id via DB
    this.solutionRepo.recordAttempt({
      errorSolutionId: input.errorId, // will be resolved via link
      terminalId: input.terminalId,
      success: input.success ? 1 : 0,
      output: input.output,
      durationMs: input.durationMs,
    });

    // Update synapse
    if (input.success) {
      this.synapseManager.strengthen(
        { type: 'solution', id: input.solutionId },
        { type: 'error', id: input.errorId },
        'solves',
        { outcome: 'success' },
      );
      // Update solution confidence based on success rate
      const rate = this.solutionRepo.successRate(input.solutionId);
      this.solutionRepo.update(input.solutionId, { confidence: rate });
    } else {
      const synapse = this.synapseManager.find(
        { type: 'solution', id: input.solutionId },
        { type: 'error', id: input.errorId },
        'solves',
      );
      if (synapse) {
        this.synapseManager.weaken(synapse.id, 0.7);
      }
      const rate = this.solutionRepo.successRate(input.solutionId);
      this.solutionRepo.update(input.solutionId, { confidence: rate });
    }

    this.eventBus.emit('solution:applied', {
      errorId: input.errorId,
      solutionId: input.solutionId,
      success: input.success,
    });
  }

  findForError(errorId: number): SolutionRecord[] {
    return this.solutionRepo.findForError(errorId);
  }

  getById(id: number): SolutionRecord | undefined {
    return this.solutionRepo.getById(id);
  }

  successRate(solutionId: number): number {
    return this.solutionRepo.successRate(solutionId);
  }

  analyzeEfficiency(): {
    avgDurationMs: number;
    slowSolutions: Array<{ solutionId: number; avgDuration: number; description: string }>;
    successRateOverall: number;
    totalAttempts: number;
  } {
    const allSolutions = this.solutionRepo.getAll();
    let totalDuration = 0;
    let totalAttempts = 0;
    let totalSuccessRate = 0;
    let solutionCount = 0;
    const solutionDurations: Array<{ solutionId: number; avgDuration: number; description: string }> = [];

    for (const solution of allSolutions) {
      const rate = this.solutionRepo.successRate(solution.id);
      if (solution.success_count + solution.fail_count > 0) {
        totalSuccessRate += rate;
        solutionCount++;
      }

      // Check attempts for duration data
      const attempts = this.solutionRepo.getAttempts(solution.id);
      if (attempts.length > 0) {
        let solDuration = 0;
        let solAttemptCount = 0;
        for (const attempt of attempts) {
          if (attempt.duration_ms && attempt.duration_ms > 0) {
            solDuration += attempt.duration_ms;
            solAttemptCount++;
            totalDuration += attempt.duration_ms;
            totalAttempts++;
          }
        }
        if (solAttemptCount > 0) {
          solutionDurations.push({
            solutionId: solution.id,
            avgDuration: solDuration / solAttemptCount,
            description: solution.description,
          });
        }
      }
    }

    // Find slow solutions (above 2x average)
    const avgDurationMs = totalAttempts > 0 ? totalDuration / totalAttempts : 0;
    const slowSolutions = solutionDurations
      .filter(s => s.avgDuration > avgDurationMs * 2)
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, 10);

    return {
      avgDurationMs,
      slowSolutions,
      successRateOverall: solutionCount > 0 ? totalSuccessRate / solutionCount : 0,
      totalAttempts,
    };
  }
}
