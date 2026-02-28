import type { ExportInfo } from '../types/code.types.js';

export interface CodeUnitForScoring {
  source: string;
  filePath: string;
  exports: ExportInfo[];
  internalDeps: string[];
  hasTypeAnnotations: boolean;
  complexity?: number;
}

interface ReusabilitySignal {
  name: string;
  weight: number;
  check: (code: CodeUnitForScoring) => number;
}

const REUSABILITY_SIGNALS: ReusabilitySignal[] = [
  {
    name: 'single_responsibility',
    weight: 0.20,
    check: (code) => {
      const count = code.exports.length;
      if (count === 0) return 0;
      if (count <= 3) return 1.0;
      if (count <= 6) return 0.6;
      return 0.3;
    },
  },
  {
    name: 'pure_function',
    weight: 0.20,
    check: (code) => {
      const sideEffects = [
        'fs.', 'process.', 'console.', 'fetch(',
        'XMLHttpRequest', 'document.', 'window.',
        'global.', 'require(',
      ];
      const found = sideEffects.filter(se => code.source.includes(se));
      return found.length === 0 ? 1.0 : Math.max(0, 1 - found.length * 0.3);
    },
  },
  {
    name: 'clear_interface',
    weight: 0.20,
    check: (code) => {
      let score = 0.5;
      if (code.hasTypeAnnotations) score += 0.3;
      if (!code.source.includes(': any')) score += 0.2;
      return Math.min(1.0, score);
    },
  },
  {
    name: 'cohesion',
    weight: 0.15,
    check: (code) => {
      const internalImports = code.internalDeps.length;
      const exportCount = code.exports.length;
      if (exportCount === 0) return 0;
      const ratio = internalImports / exportCount;
      if (ratio === 0) return 1.0;
      if (ratio < 0.5) return 0.8;
      if (ratio < 1.0) return 0.5;
      return 0.2;
    },
  },
  {
    name: 'generic_utility',
    weight: 0.10,
    check: (code) => {
      const utilPaths = ['utils/', 'helpers/', 'lib/', 'shared/', 'common/'];
      const isUtilPath = utilPaths.some(p => code.filePath.includes(p));
      const hasGenerics = /<[A-Z]\w*>/.test(code.source);
      let score = 0;
      if (isUtilPath) score += 0.6;
      if (hasGenerics) score += 0.4;
      return Math.min(1.0, score || 0.2);
    },
  },
  {
    name: 'documentation',
    weight: 0.10,
    check: (code) => {
      const hasJsdoc = /\/\*\*[\s\S]*?\*\//.test(code.source);
      const hasDocstring = /"""[\s\S]*?"""/.test(code.source) || /'''[\s\S]*?'''/.test(code.source);
      const hasInlineComments = (code.source.match(/\/\/ /g) ?? []).length >= 2;
      if (hasJsdoc || hasDocstring) return 1.0;
      if (hasInlineComments) return 0.5;
      return 0.1;
    },
  },
  {
    name: 'low_complexity',
    weight: 0.10,
    check: (code) => {
      const cc = code.complexity ?? 1;
      if (cc <= 5) return 1.0;
      if (cc <= 10) return 0.7;
      if (cc <= 20) return 0.4;
      return 0.1;
    },
  },
];

export const MODULE_THRESHOLD = 0.60;

export function computeReusabilityScore(code: CodeUnitForScoring): number {
  let totalScore = 0;
  for (const signal of REUSABILITY_SIGNALS) {
    totalScore += signal.check(code) * signal.weight;
  }
  return Math.min(1.0, totalScore);
}

export function getSignalBreakdown(code: CodeUnitForScoring): Array<{ name: string; score: number; weighted: number }> {
  return REUSABILITY_SIGNALS.map(signal => {
    const score = signal.check(code);
    return { name: signal.name, score, weighted: score * signal.weight };
  });
}
