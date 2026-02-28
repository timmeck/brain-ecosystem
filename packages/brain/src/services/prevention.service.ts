import type { RuleRepository, RuleRecord } from '../db/repositories/rule.repository.js';
import type { AntipatternRepository } from '../db/repositories/antipattern.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import { getLogger } from '../utils/logger.js';

export interface RuleCheckResult {
  matched: boolean;
  ruleId: number;
  action: string;
  description: string | null;
  confidence: number;
}

export interface AntipatternCheckResult {
  matched: boolean;
  antipatternId: number;
  pattern: string;
  description: string;
  severity: string;
  suggestion: string | null;
}

export class PreventionService {
  private logger = getLogger();

  constructor(
    private ruleRepo: RuleRepository,
    private antipatternRepo: AntipatternRepository,
    private synapseManager: SynapseManager,
  ) {}

  checkRules(errorType: string, message: string, projectId?: number): RuleCheckResult[] {
    const rules = this.ruleRepo.findActive(projectId);
    const results: RuleCheckResult[] = [];

    for (const rule of rules) {
      try {
        const pattern = new RegExp(rule.pattern, 'i');
        const input = `${errorType}: ${message}`;

        if (pattern.test(input)) {
          results.push({
            matched: true,
            ruleId: rule.id,
            action: rule.action,
            description: rule.description,
            confidence: rule.confidence,
          });

          this.logger.debug(`Rule ${rule.id} matched: ${rule.pattern}`);
        }
      } catch {
        // Invalid regex in rule pattern, skip
        this.logger.warn(`Invalid regex in rule ${rule.id}: ${rule.pattern}`);
      }
    }

    return results.sort((a, b) => b.confidence - a.confidence);
  }

  checkAntipatterns(errorType: string, message: string, projectId?: number): AntipatternCheckResult[] {
    const antipatterns = projectId
      ? [...this.antipatternRepo.findByProject(projectId), ...this.antipatternRepo.findGlobal()]
      : this.antipatternRepo.findGlobal();

    const results: AntipatternCheckResult[] = [];
    const input = `${errorType}: ${message}`;

    for (const ap of antipatterns) {
      try {
        const pattern = new RegExp(ap.pattern, 'i');
        if (pattern.test(input)) {
          results.push({
            matched: true,
            antipatternId: ap.id,
            pattern: ap.pattern,
            description: ap.description,
            severity: ap.severity,
            suggestion: ap.suggestion,
          });
        }
      } catch {
        this.logger.warn(`Invalid regex in antipattern ${ap.id}: ${ap.pattern}`);
      }
    }

    return results;
  }

  createRule(data: {
    pattern: string;
    action: string;
    description?: string;
    confidence?: number;
    projectId?: number;
  }): number {
    return this.ruleRepo.create({
      pattern: data.pattern,
      action: data.action,
      description: data.description ?? null,
      confidence: data.confidence ?? 0.5,
      occurrences: 0,
      active: 1,
      project_id: data.projectId ?? null,
    });
  }

  checkCodeForPatterns(source: string, _filePath?: string): { warnings: Array<{ message: string; severity: string; ruleId?: number }> } {
    const warnings: Array<{ message: string; severity: string; ruleId?: number }> = [];

    // Check antipatterns against the code itself
    const globalAntipatterns = this.antipatternRepo.findGlobal();
    for (const ap of globalAntipatterns) {
      try {
        const pattern = new RegExp(ap.pattern, 'i');
        if (pattern.test(source)) {
          warnings.push({
            message: `Code matches known error pattern: ${ap.description}${ap.suggestion ? `. Suggestion: ${ap.suggestion}` : ''}`,
            severity: ap.severity,
            ruleId: undefined,
          });
        }
      } catch {
        // Invalid regex, skip
      }
    }

    // Check active rules
    const rules = this.ruleRepo.findActive();
    for (const rule of rules) {
      try {
        const pattern = new RegExp(rule.pattern, 'i');
        if (pattern.test(source)) {
          warnings.push({
            message: `Code matches learned rule: ${rule.description ?? rule.pattern}. Action: ${rule.action}`,
            severity: 'warning',
            ruleId: rule.id,
          });
        }
      } catch {
        // Invalid regex, skip
      }
    }

    return { warnings: warnings.slice(0, 5) };
  }

  listRules(): RuleRecord[] {
    return this.ruleRepo.findActive();
  }

  getRule(ruleId: number): RuleRecord | undefined {
    return this.ruleRepo.getById(ruleId);
  }

  updateRule(ruleId: number, data: { confidence?: number; active?: number }): RuleRecord | undefined {
    this.ruleRepo.update(ruleId, data);
    return this.ruleRepo.getById(ruleId);
  }

  reportPrevention(ruleId: number, errorId: number): void {
    const rule = this.ruleRepo.getById(ruleId);
    if (rule) {
      this.ruleRepo.update(ruleId, { occurrences: rule.occurrences + 1 });
      this.synapseManager.strengthen(
        { type: 'rule', id: ruleId },
        { type: 'error', id: errorId },
        'prevents',
      );
    }
  }
}
