export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const dp: number[][] = Array(b.length + 1)
    .fill(0)
    .map(() => Array(a.length + 1).fill(0) as number[]);

  for (let i = 0; i <= a.length; i++) dp[0]![i] = i;
  for (let j = 0; j <= b.length; j++) dp[j]![0] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }

  return 1 - dp[b.length]![a.length]! / Math.max(a.length, b.length);
}

export function cosineSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

  const vocab = new Set([...tokensA, ...tokensB]);
  const vecA = new Map<string, number>();
  const vecB = new Map<string, number>();

  for (const t of tokensA) vecA.set(t, (vecA.get(t) ?? 0) + 1);
  for (const t of tokensB) vecB.set(t, (vecB.get(t) ?? 0) + 1);

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const word of vocab) {
    const a = vecA.get(word) ?? 0;
    const b = vecB.get(word) ?? 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export function jaccardSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 0.0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  return union.size === 0 ? 0 : intersection.size / union.size;
}
