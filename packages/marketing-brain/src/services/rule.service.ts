import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { MarketingRule, RuleCreate } from '../types/post.types.js';
import { getEventBus } from '../utils/events.js';

export interface RuleCheckResult {
  passed: boolean;
  violations: Array<{
    rule: MarketingRule;
    reason: string;
  }>;
  recommendations: Array<{
    rule: MarketingRule;
    suggestion: string;
  }>;
}

export class RuleService {
  constructor(
    private ruleRepo: RuleRepository,
    private synapseManager: SynapseManager,
  ) {}

  create(data: RuleCreate): MarketingRule {
    const id = this.ruleRepo.create(data);
    const rule = this.ruleRepo.getById(id)!;

    getEventBus().emit('rule:learned', { ruleId: id, pattern: data.pattern });
    return rule;
  }

  check(content: string, platform: string): RuleCheckResult {
    const rules = this.ruleRepo.listActive();
    const violations: RuleCheckResult['violations'] = [];
    const recommendations: RuleCheckResult['recommendations'] = [];

    for (const rule of rules) {
      const pattern = rule.pattern.toLowerCase();
      const contentLower = content.toLowerCase();
      const platformLower = platform.toLowerCase();

      // Check if rule pattern matches
      if (pattern.includes('platform:')) {
        const rulePlatform = pattern.split('platform:')[1]?.split(' ')[0] ?? '';
        if (rulePlatform && rulePlatform !== platformLower) continue;
      }

      if (pattern.includes('no_') || pattern.includes('avoid_') || pattern.includes('never_')) {
        // Preventive rules
        const keywords = pattern.replace(/no_|avoid_|never_/g, '').split('_');
        const matches = keywords.some(kw => contentLower.includes(kw));
        if (matches) {
          violations.push({ rule, reason: rule.recommendation });
        }
      } else {
        // Recommendation rules
        recommendations.push({ rule, suggestion: rule.recommendation });
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      recommendations: recommendations.slice(0, 5),
    };
  }

  listRules(): MarketingRule[] {
    return this.ruleRepo.listActive();
  }

  listAllRules(): MarketingRule[] {
    return this.ruleRepo.listAll();
  }

  recordTrigger(ruleId: number, success: boolean): void {
    this.ruleRepo.incrementTrigger(ruleId, success);
  }

  getById(id: number): MarketingRule | undefined {
    return this.ruleRepo.getById(id);
  }

  getStats() {
    return {
      total: this.ruleRepo.countAll(),
      active: this.ruleRepo.countActive(),
    };
  }
}
