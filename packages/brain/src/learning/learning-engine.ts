import type { LearningConfig } from '../types/config.types.js';
import type { ErrorRepository } from '../db/repositories/error.repository.js';
import type { SolutionRepository } from '../db/repositories/solution.repository.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { AntipatternRepository } from '../db/repositories/antipattern.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { extractPatterns } from './pattern-extractor.js';
import { generateRules, persistRules } from './rule-generator.js';
import { shouldPruneRule } from './decay.js';
import { computeAdaptiveThresholds } from './confidence-scorer.js';
import { BaseLearningEngine } from '@timmeck/brain-core';

export interface LearningCycleResult {
  newPatterns: number;
  updatedRules: number;
  prunedRules: number;
  newAntipatterns: number;
  duration: number;
}

export class LearningEngine extends BaseLearningEngine {
  private lastCycleAt: string | null = null;

  constructor(
    private config: LearningConfig,
    private errorRepo: ErrorRepository,
    private solutionRepo: SolutionRepository,
    private ruleRepo: RuleRepository,
    private antipatternRepo: AntipatternRepository,
    private synapseManager: SynapseManager,
  ) {
    super(config);
  }

  runCycle(): LearningCycleResult {
    const start = Date.now();
    this.logger.info('Learning cycle starting');

    const result: LearningCycleResult = {
      newPatterns: 0,
      updatedRules: 0,
      prunedRules: 0,
      newAntipatterns: 0,
      duration: 0,
    };

    // Phase 0: Compute adaptive thresholds
    const totalErrors = this.errorRepo.findUnresolved().length + this.errorRepo.countSince(new Date(0).toISOString());
    const totalSolutions = this.solutionRepo.getAll().length;
    const adaptive = computeAdaptiveThresholds(totalErrors, totalSolutions, this.config);
    this.logger.debug(`Adaptive thresholds: minOcc=${adaptive.minOccurrences}, minSuccess=${adaptive.minSuccessRate.toFixed(2)}, minConf=${adaptive.minConfidence.toFixed(2)}`);

    // Phase 1: Collect recent errors
    const recentErrors = this.errorRepo.findUnresolved();

    // Phase 2: Extract patterns
    const patterns = extractPatterns(recentErrors, adaptive.minSuccessRate);
    result.newPatterns = patterns.length;

    // Phase 3: Enrich patterns with solution data
    for (const pattern of patterns) {
      let totalSuccess = 0;
      let totalAttempts = 0;

      for (const errorId of pattern.errorIds) {
        const solutions = this.solutionRepo.findForError(errorId);
        pattern.solutionIds.push(...solutions.map(s => s.id));

        for (const sol of solutions) {
          const rate = this.solutionRepo.successRate(sol.id);
          totalSuccess += rate;
          totalAttempts++;
        }
      }

      pattern.successRate = totalAttempts > 0 ? totalSuccess / totalAttempts : 0;
      pattern.confidence = Math.min(
        0.95,
        pattern.successRate * 0.6 + Math.min(1, pattern.occurrences / 10) * 0.4,
      );
    }

    // Phase 4: Generate rules from patterns (using adaptive thresholds)
    const adaptiveConfig = { ...this.config, ...adaptive };
    const rules = generateRules(patterns, adaptiveConfig);
    result.updatedRules = persistRules(rules, this.ruleRepo);

    // Phase 5: Prune weak rules (using adaptive thresholds)
    const activeRules = this.ruleRepo.findActive();
    for (const rule of activeRules) {
      if (shouldPruneRule(
        rule.confidence,
        0, // rejection count not tracked yet
        rule.occurrences,
        adaptive.pruneThreshold,
        this.config.maxRejectionRate,
      )) {
        this.ruleRepo.update(rule.id, { active: 0 });
        result.prunedRules++;
      }
    }

    // Phase 6: Detect antipatterns
    result.newAntipatterns = this.detectAntipatterns();

    // Phase 7: Run synapse decay
    this.synapseManager.runDecay();

    this.lastCycleAt = new Date().toISOString();
    result.duration = Date.now() - start;
    this.logger.info(`Learning cycle complete: ${result.newPatterns} patterns, ${result.updatedRules} rules, ${result.prunedRules} pruned, ${result.newAntipatterns} antipatterns (${result.duration}ms)`);

    return result;
  }

  private detectAntipatterns(): number {
    const unresolvedErrors = this.errorRepo.findUnresolved();
    const recurring = unresolvedErrors.filter(e => e.occurrence_count >= this.config.minOccurrences);
    let count = 0;

    for (const error of recurring) {
      const solutions = this.solutionRepo.findForError(error.id);
      const allFailed = solutions.length > 0 && solutions.every(s => {
        const rate = this.solutionRepo.successRate(s.id);
        return rate < 0.3;
      });

      if (solutions.length >= 2 && allFailed) {
        // Check if antipattern already exists
        const existing = this.antipatternRepo.findByProject(error.project_id);
        const alreadyDetected = existing.some(ap =>
          ap.pattern.includes(error.type) && ap.description.includes(error.message.substring(0, 30))
        );

        if (!alreadyDetected) {
          this.antipatternRepo.create({
            pattern: `${error.type}.*${error.message.substring(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
            description: `Recurring error without solution: ${error.type}: ${error.message}`,
            severity: solutions.length >= 4 ? 'critical' : 'warning',
            suggestion: null,
            occurrences: error.occurrence_count,
            project_id: error.project_id,
            global: 0,
          });
          count++;
        }
      }
    }

    return count;
  }

  getLastCycleAt(): string | null {
    return this.lastCycleAt;
  }
}
