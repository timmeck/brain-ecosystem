import type { ExportInfo } from '../../types/code.types.js';

const FUNC_DEF_RE = /^def\s+(\w+)\s*\(/gm;
const CLASS_DEF_RE = /^class\s+(\w+)/gm;
const IMPORT_RE = /^(?:from\s+(\S+)\s+)?import\s+(.+)/gm;
const TOP_LEVEL_ASSIGN_RE = /^([A-Z_][A-Z_\d]*)\s*=/gm;

export function extractExports(source: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  let match: RegExpExecArray | null;

  const funcRe = new RegExp(FUNC_DEF_RE.source, 'gm');
  while ((match = funcRe.exec(source)) !== null) {
    if (!match[1]!.startsWith('_')) {
      exports.push({ name: match[1]!, type: 'function' });
    }
  }

  const classRe = new RegExp(CLASS_DEF_RE.source, 'gm');
  while ((match = classRe.exec(source)) !== null) {
    if (!match[1]!.startsWith('_')) {
      exports.push({ name: match[1]!, type: 'class' });
    }
  }

  const constRe = new RegExp(TOP_LEVEL_ASSIGN_RE.source, 'gm');
  while ((match = constRe.exec(source)) !== null) {
    exports.push({ name: match[1]!, type: 'constant' });
  }

  return exports;
}

export function extractImports(source: string): { external: string[]; internal: string[] } {
  const external: string[] = [];
  const internal: string[] = [];
  let match: RegExpExecArray | null;

  const importRe = new RegExp(IMPORT_RE.source, 'gm');
  while ((match = importRe.exec(source)) !== null) {
    const module = match[1] ?? match[2]!.trim().split(/\s*,\s*/)[0]!;
    if (module.startsWith('.')) {
      internal.push(module);
    } else {
      external.push(module);
    }
  }

  return { external, internal };
}

export function hasTypeAnnotations(source: string): boolean {
  return /:\s*\w+/.test(source) && /->/.test(source);
}
