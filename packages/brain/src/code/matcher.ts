import type { CodeModuleRecord } from '../types/code.types.js';
import { fingerprintCode } from './fingerprint.js';
import { tokenize } from '../matching/tokenizer.js';
import { cosineSimilarity } from '../matching/similarity.js';

export interface CodeMatchResult {
  moduleId: number;
  score: number;
  matchType: 'exact' | 'structural' | 'semantic' | 'vector';
}

export function findExactMatches(
  fingerprint: string,
  candidates: CodeModuleRecord[],
): CodeMatchResult[] {
  return candidates
    .filter(c => c.fingerprint === fingerprint)
    .map(c => ({ moduleId: c.id, score: 1.0, matchType: 'exact' as const }));
}

export function findStructuralMatches(
  source: string,
  language: string,
  candidates: CodeModuleRecord[],
  threshold: number = 0.75,
): CodeMatchResult[] {
  const fp = fingerprintCode(source, language);
  const results: CodeMatchResult[] = [];

  for (const candidate of candidates) {
    if (candidate.fingerprint === fp) {
      results.push({ moduleId: candidate.id, score: 1.0, matchType: 'structural' });
      continue;
    }

    const tokensA = tokenize(source);
    const tokensB = tokenize(candidate.name + ' ' + (candidate.description ?? ''));
    const sim = cosineSimilarity(tokensA, tokensB);
    if (sim >= threshold) {
      results.push({ moduleId: candidate.id, score: sim, matchType: 'structural' });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export function findSemanticMatches(
  description: string,
  candidates: CodeModuleRecord[],
  threshold: number = 0.5,
): CodeMatchResult[] {
  const queryTokens = tokenize(description);

  return candidates
    .map(c => {
      const candidateTokens = tokenize(
        [c.name, c.description ?? '', c.file_path].join(' ')
      );
      const score = cosineSimilarity(queryTokens, candidateTokens);
      return { moduleId: c.id, score, matchType: 'semantic' as const };
    })
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
}

/**
 * Find matches using pre-computed vector embeddings.
 * Vector scores are computed externally (by the EmbeddingEngine) and passed in.
 */
export function findVectorMatches(
  vectorScores: Map<number, number>,
  threshold: number = 0.5,
): CodeMatchResult[] {
  const results: CodeMatchResult[] = [];

  for (const [moduleId, score] of vectorScores) {
    if (score >= threshold) {
      results.push({ moduleId, score, matchType: 'vector' });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Hybrid search: combine structural + semantic + vector matches,
 * deduplicating and taking the highest score per module.
 */
export function findHybridMatches(
  source: string,
  language: string,
  description: string,
  candidates: CodeModuleRecord[],
  vectorScores?: Map<number, number>,
): CodeMatchResult[] {
  const scoreMap = new Map<number, CodeMatchResult>();

  // Structural matches (highest priority)
  for (const match of findStructuralMatches(source, language, candidates, 0.5)) {
    const existing = scoreMap.get(match.moduleId);
    if (!existing || match.score > existing.score) {
      scoreMap.set(match.moduleId, match);
    }
  }

  // Semantic matches
  for (const match of findSemanticMatches(description, candidates, 0.3)) {
    const existing = scoreMap.get(match.moduleId);
    if (!existing || match.score > existing.score) {
      scoreMap.set(match.moduleId, match);
    }
  }

  // Vector matches (if available)
  if (vectorScores && vectorScores.size > 0) {
    for (const match of findVectorMatches(vectorScores, 0.4)) {
      const existing = scoreMap.get(match.moduleId);
      if (!existing) {
        scoreMap.set(match.moduleId, match);
      } else {
        // Boost existing matches that also have high vector similarity
        const vectorBoost = match.score * 0.15;
        existing.score = Math.min(1.0, existing.score + vectorBoost);
      }
    }
  }

  return [...scoreMap.values()].sort((a, b) => b.score - a.score);
}
