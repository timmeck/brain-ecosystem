import type { LearningConfig } from '../types/config.types.js';
import type { RuleRepository } from '../db/repositories/rule.repository.js';
import type { ErrorPattern } from './pattern-extractor.js';
import { getLogger } from '../utils/logger.js';

export interface GeneratedRule {
  pattern: string;
  action: string;
  description: string;
  confidence: number;
  sourceErrorIds: number[];
}

/**
 * Generate prevention rules from extracted patterns.
 */
export function generateRules(
  patterns: ErrorPattern[],
  config: LearningConfig,
): GeneratedRule[] {
  return patterns
    .filter(p =>
      p.occurrences >= config.minOccurrences &&
      p.confidence >= config.minConfidence,
    )
    .map(pattern => ({
      pattern: pattern.messageRegex,
      action: pattern.confidence >= 0.90
        ? `Auto-fix available for ${pattern.errorType}`
        : `Suggestion: check ${pattern.errorType} pattern (${pattern.occurrences} occurrences)`,
      description: `Auto-generated from ${pattern.occurrences} occurrences of ${pattern.errorType}`,
      confidence: pattern.confidence,
      sourceErrorIds: pattern.errorIds,
    }));
}

/**
 * Persist generated rules to the database.
 */
export function persistRules(
  rules: GeneratedRule[],
  ruleRepo: RuleRepository,
  projectId?: number,
): number {
  const logger = getLogger();
  let created = 0;

  for (const rule of rules) {
    // Check if similar rule already exists
    const existing = ruleRepo.findByPattern(rule.pattern);
    if (existing.length > 0) {
      // Update confidence of existing rule
      const best = existing[0]!;
      if (rule.confidence > best.confidence) {
        ruleRepo.update(best.id, { confidence: rule.confidence });
      }
      continue;
    }

    ruleRepo.create({
      pattern: rule.pattern,
      action: rule.action,
      description: rule.description,
      confidence: rule.confidence,
      occurrences: 0,
      active: 1,
      project_id: projectId ?? null,
    });
    created++;
    logger.info(`New rule generated: ${rule.pattern.substring(0, 50)}...`);
  }

  return created;
}
