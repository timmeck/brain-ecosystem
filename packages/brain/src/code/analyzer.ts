import type { ExportInfo } from '../types/code.types.js';
import * as tsParser from './parsers/typescript.js';
import * as pyParser from './parsers/python.js';
import * as genericParser from './parsers/generic.js';

export interface AnalysisResult {
  exports: ExportInfo[];
  externalDeps: string[];
  internalDeps: string[];
  isPure: boolean;
  hasTypeAnnotations: boolean;
  linesOfCode: number;
  complexity: number;
}

const SIDE_EFFECT_PATTERNS = [
  'fs.', 'process.exit', 'process.env', 'console.', 'fetch(',
  'XMLHttpRequest', 'document.', 'window.',
  'global.', 'require(',
];

function getParser(language: string) {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return tsParser;
    case 'python':
      return pyParser;
    default:
      return genericParser;
  }
}

export function analyzeCode(source: string, language: string): AnalysisResult {
  const parser = getParser(language);
  const exports = parser.extractExports(source);
  const { external, internal } = parser.extractImports(source);
  const isPure = checkPurity(source);
  const typed = parser.hasTypeAnnotations(source);
  const linesOfCode = source.split('\n').filter(l => l.trim().length > 0).length;
  const complexity = computeCyclomaticComplexity(source, language);

  return {
    exports,
    externalDeps: external,
    internalDeps: internal,
    isPure,
    hasTypeAnnotations: typed,
    linesOfCode,
    complexity,
  };
}

/**
 * Computes cyclomatic complexity: counts decision points in the code.
 * CC = 1 + number of decision points (if, else if, for, while, case, catch, &&, ||, ?:)
 */
export function computeCyclomaticComplexity(source: string, _language: string): number {
  // Remove comments and strings to avoid false positives
  const cleaned = source
    .replace(/\/\/.*$/gm, '')           // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')   // multi-line comments
    .replace(/#.*$/gm, '')              // Python comments
    .replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '""'); // strings

  let complexity = 1; // Base complexity

  // Language-agnostic decision point patterns
  const patterns = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\belif\b/g,
    /\bfor\b/g,
    /\bwhile\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\bexcept\b/g,
    /&&/g,
    /\|\|/g,
    /\?\s*[^:]/g, // ternary operator (not type annotations)
  ];

  for (const pattern of patterns) {
    const matches = cleaned.match(pattern);
    if (matches) complexity += matches.length;
  }

  return complexity;
}

export function checkPurity(source: string): boolean {
  return !SIDE_EFFECT_PATTERNS.some(p => source.includes(p));
}

export function measureCohesion(exports: ExportInfo[]): number {
  if (exports.length <= 1) return 1.0;

  const names = exports.map(e =>
    e.name
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/\s+/)
  );

  const vocab = new Set<string>();
  names.forEach(tokens => tokens.forEach(t => vocab.add(t)));

  let sharedTokens = 0;
  for (const token of vocab) {
    const count = names.filter(n => n.includes(token)).length;
    if (count > 1) sharedTokens += count;
  }

  const maxPossible = names.length * vocab.size;
  return maxPossible === 0 ? 0 : sharedTokens / maxPossible;
}
