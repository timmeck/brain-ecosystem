import type { ExportInfo } from '../types/code.types.js';
import { analyzeCode, measureCohesion } from './analyzer.js';

export type ModuleType = 'file' | 'class' | 'function';

export function detectGranularity(
  source: string,
  language: string,
): ModuleType {
  const { exports } = analyzeCode(source, language);

  const hasDefault = exports.some(e => e.name === 'default');
  if (hasDefault && exports.length <= 3) return 'file';

  const classes = exports.filter(e => e.type === 'class');
  if (classes.length === 1 && exports.length <= 3) return 'class';

  if (exports.length > 3) {
    const cohesion = measureCohesion(exports);
    if (cohesion < 0.5) return 'function';
  }

  return 'file';
}

export interface ModuleRegistration {
  name: string;
  filePath: string;
  language: string;
  source: string;
  description?: string;
  projectId: number;
}

export interface RegisteredModule {
  name: string;
  moduleType: ModuleType;
  exports: ExportInfo[];
  externalDeps: string[];
  internalDeps: string[];
  isPure: boolean;
  hasTypeAnnotations: boolean;
  linesOfCode: number;
}

export function prepareModule(reg: ModuleRegistration): RegisteredModule {
  const analysis = analyzeCode(reg.source, reg.language);
  const moduleType = detectGranularity(reg.source, reg.language);

  return {
    name: reg.name,
    moduleType,
    exports: analysis.exports,
    externalDeps: analysis.externalDeps,
    internalDeps: analysis.internalDeps,
    isPure: analysis.isPure,
    hasTypeAnnotations: analysis.hasTypeAnnotations,
    linesOfCode: analysis.linesOfCode,
  };
}
