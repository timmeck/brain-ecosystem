import type { ErrorRecord } from '../types/error.types.js';
import { tokenize } from './tokenizer.js';
import { cosineSimilarity, jaccardSimilarity, levenshteinDistance } from './similarity.js';

export interface SignalScore {
  signal: string;
  score: number;
  weighted: number;
}

export interface MatchResult {
  errorId: number;
  score: number;
  signals: SignalScore[];
  isStrong: boolean;
}

interface MatchSignal {
  name: string;
  weight: number;
  compute: (a: ErrorRecord, b: ErrorRecord) => number;
}

// Base signals (used when vector search is NOT available)
const SIGNALS_BASE: MatchSignal[] = [
  { name: 'fingerprint', weight: 0.20, compute: fingerprintMatch },
  { name: 'message_similarity', weight: 0.25, compute: messageSimilarity },
  { name: 'type_match', weight: 0.15, compute: typeMatch },
  { name: 'stack_similarity', weight: 0.15, compute: stackSimilarity },
  { name: 'file_similarity', weight: 0.12, compute: fileSimilarity },
  { name: 'context_similarity', weight: 0.13, compute: contextSimilarity },
];

// Hybrid signals (used when vector search IS available — vector gets 20% weight)
const SIGNALS_HYBRID: MatchSignal[] = [
  { name: 'fingerprint', weight: 0.25, compute: fingerprintMatch },
  { name: 'message_similarity', weight: 0.15, compute: messageSimilarity },
  { name: 'type_match', weight: 0.12, compute: typeMatch },
  { name: 'stack_similarity', weight: 0.12, compute: stackSimilarity },
  { name: 'file_similarity', weight: 0.08, compute: fileSimilarity },
  { name: 'context_similarity', weight: 0.08, compute: contextSimilarity },
];

const VECTOR_WEIGHT = 0.20;
const MATCH_THRESHOLD = 0.55;
const STRONG_MATCH_THRESHOLD = 0.90;

/**
 * Hybrid error matching: TF-IDF signals + optional vector similarity + synapse boost.
 *
 * @param incoming - The error to match
 * @param candidates - Candidate errors to compare against
 * @param vectorScores - Pre-computed vector similarity scores (errorId → score)
 * @param synapseScores - Pre-computed synapse proximity scores (errorId → score)
 */
export function matchError(
  incoming: ErrorRecord,
  candidates: ErrorRecord[],
  vectorScores?: Map<number, number>,
  synapseScores?: Map<number, number>,
): MatchResult[] {
  const useHybrid = vectorScores && vectorScores.size > 0;
  const useSynapse = synapseScores && synapseScores.size > 0;
  const signals = useHybrid ? SIGNALS_HYBRID : SIGNALS_BASE;

  return candidates
    .map(candidate => {
      const signalResults = signals.map(signal => {
        const score = signal.compute(incoming, candidate);
        return {
          signal: signal.name,
          score,
          weighted: score * signal.weight,
        };
      });

      // Add vector similarity signal (if available)
      if (useHybrid) {
        const vectorScore = vectorScores.get(candidate.id) ?? 0;
        signalResults.push({
          signal: 'vector_similarity',
          score: vectorScore,
          weighted: vectorScore * VECTOR_WEIGHT,
        });
      }

      let totalScore = signalResults.reduce((sum, s) => sum + s.weighted, 0);

      // Synapse boost: if errors are already connected in the synapse network,
      // give up to 5% bonus (doesn't create false positives, only reinforces)
      if (useSynapse) {
        const synapseScore = synapseScores.get(candidate.id) ?? 0;
        if (synapseScore > 0) {
          const bonus = Math.min(synapseScore * 0.05, 0.05);
          totalScore = Math.min(1.0, totalScore + bonus);
          signalResults.push({
            signal: 'synapse_boost',
            score: synapseScore,
            weighted: bonus,
          });
        }
      }

      return {
        errorId: candidate.id,
        score: totalScore,
        signals: signalResults,
        isStrong: totalScore >= STRONG_MATCH_THRESHOLD,
      };
    })
    .filter(result => result.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);
}

function fingerprintMatch(a: ErrorRecord, b: ErrorRecord): number {
  return a.fingerprint === b.fingerprint ? 1.0 : 0.0;
}

function messageSimilarity(a: ErrorRecord, b: ErrorRecord): number {
  const tokensA = tokenize(a.message);
  const tokensB = tokenize(b.message);
  return cosineSimilarity(tokensA, tokensB);
}

function typeMatch(a: ErrorRecord, b: ErrorRecord): number {
  return a.type === b.type ? 1.0 : 0.0;
}

function stackSimilarity(a: ErrorRecord, b: ErrorRecord): number {
  const rawA = a.raw_output ?? '';
  const rawB = b.raw_output ?? '';

  const frameRe = /at (?:(.+?) )?\(/g;
  const extractFuncs = (raw: string) => {
    const funcs: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(frameRe.source, 'g');
    while ((m = re.exec(raw)) !== null) {
      if (m[1]) funcs.push(m[1]);
    }
    return funcs;
  };

  const funcsA = extractFuncs(rawA);
  const funcsB = extractFuncs(rawB);

  if (funcsA.length === 0 && funcsB.length === 0) return 0.5;
  return jaccardSimilarity(funcsA, funcsB);
}

function fileSimilarity(a: ErrorRecord, b: ErrorRecord): number {
  const pathA = a.file_path ?? '';
  const pathB = b.file_path ?? '';
  if (!pathA || !pathB) return 0.0;
  if (pathA === pathB) return 1.0;
  return levenshteinDistance(pathA, pathB);
}

function contextSimilarity(a: ErrorRecord, b: ErrorRecord): number {
  const ctxA = a.context ?? '';
  const ctxB = b.context ?? '';
  if (!ctxA || !ctxB) return 0.0;
  const tokensA = tokenize(ctxA);
  const tokensB = tokenize(ctxB);
  return cosineSimilarity(tokensA, tokensB);
}
