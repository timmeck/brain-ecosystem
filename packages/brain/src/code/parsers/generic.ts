import type { ExportInfo } from '../../types/code.types.js';

const FUNC_RE = /(?:function|func|fn|def|sub)\s+(\w+)/g;
const CLASS_RE = /(?:class|struct|type)\s+(\w+)/g;

export function extractExports(source: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  let match: RegExpExecArray | null;

  const funcRe = new RegExp(FUNC_RE.source, 'g');
  while ((match = funcRe.exec(source)) !== null) {
    exports.push({ name: match[1]!, type: 'function' });
  }

  const classRe = new RegExp(CLASS_RE.source, 'g');
  while ((match = classRe.exec(source)) !== null) {
    exports.push({ name: match[1]!, type: 'class' });
  }

  return exports;
}

export function extractImports(_source: string): { external: string[]; internal: string[] } {
  return { external: [], internal: [] };
}

export function hasTypeAnnotations(_source: string): boolean {
  return false;
}
