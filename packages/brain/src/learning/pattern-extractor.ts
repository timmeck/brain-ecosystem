import type { ErrorRecord } from '../types/error.types.js';
import { tokenize } from '../matching/tokenizer.js';
import { cosineSimilarity } from '../matching/similarity.js';

export interface ErrorPattern {
  errorType: string;
  messageTemplate: string;
  messageRegex: string;
  filePattern: string | null;
  occurrences: number;
  errorIds: number[];
  solutionIds: number[];
  confidence: number;
  successRate: number;
}

interface Centroid {
  errorType: string;
  tokens: string[];
  errorIds: number[];
  filePattern: string | null;
}

/**
 * Extract patterns from error records using centroid-based clustering.
 */
export function extractPatterns(
  errors: ErrorRecord[],
  similarityThreshold: number = 0.7,
): ErrorPattern[] {
  const centroids: Centroid[] = [];

  for (const error of errors) {
    const tokens = tokenize(`${error.type} ${error.message}`);
    let merged = false;

    for (const centroid of centroids) {
      if (centroid.errorType !== error.type) continue;

      const sim = cosineSimilarity(centroid.tokens, tokens);
      if (sim >= similarityThreshold) {
        // Merge into existing centroid (running average)
        const allTokens = [...centroid.tokens, ...tokens];
        centroid.tokens = [...new Set(allTokens)];
        centroid.errorIds.push(error.id);
        if (!centroid.filePattern && error.file_path) {
          centroid.filePattern = extractFilePattern(error.file_path);
        }
        merged = true;
        break;
      }
    }

    if (!merged) {
      centroids.push({
        errorType: error.type,
        tokens,
        errorIds: [error.id],
        filePattern: error.file_path ? extractFilePattern(error.file_path) : null,
      });
    }
  }

  return centroids
    .filter(c => c.errorIds.length >= 2)
    .map(c => ({
      errorType: c.errorType,
      messageTemplate: c.tokens.join(' '),
      messageRegex: buildRegex(c.tokens),
      filePattern: c.filePattern,
      occurrences: c.errorIds.length,
      errorIds: c.errorIds,
      solutionIds: [],
      confidence: 0,
      successRate: 0,
    }));
}

function extractFilePattern(filePath: string): string {
  // Extract the meaningful part: last directory + extension
  const parts = filePath.replace(/\\/g, '/').split('/');
  const fileName = parts[parts.length - 1] ?? '';
  const ext = fileName.split('.').pop() ?? '';
  return ext ? `*.${ext}` : '*';
}

function buildRegex(tokens: string[]): string {
  const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return escaped.join('.*');
}
