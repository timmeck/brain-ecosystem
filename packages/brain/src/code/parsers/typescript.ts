import type { ExportInfo } from '../../types/code.types.js';

const NAMED_EXPORT_RE = /export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/g;
const DEFAULT_EXPORT_RE = /export\s+default\s+(?:(?:async\s+)?(?:function|class)\s+)?(\w+)?/g;
const IMPORT_RE = /import\s+(?:(?:type\s+)?(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?['"]([^'"]+)['"]/g;

export function extractExports(source: string): ExportInfo[] {
  const exports: ExportInfo[] = [];
  let match: RegExpExecArray | null;

  const namedRe = new RegExp(NAMED_EXPORT_RE.source, 'g');
  while ((match = namedRe.exec(source)) !== null) {
    const line = source.substring(
      source.lastIndexOf('\n', match.index) + 1,
      source.indexOf('\n', match.index),
    );
    exports.push({
      name: match[1]!,
      type: detectExportType(line),
    });
  }

  const defaultRe = new RegExp(DEFAULT_EXPORT_RE.source, 'g');
  while ((match = defaultRe.exec(source)) !== null) {
    exports.push({
      name: match[1] ?? 'default',
      type: 'function',
    });
  }

  return exports;
}

export function extractImports(source: string): { external: string[]; internal: string[] } {
  const external: string[] = [];
  const internal: string[] = [];
  let match: RegExpExecArray | null;

  const importRe = new RegExp(IMPORT_RE.source, 'g');
  while ((match = importRe.exec(source)) !== null) {
    const specifier = match[1]!;
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      internal.push(specifier);
    } else {
      external.push(specifier);
    }
  }

  return { external, internal };
}

export function hasTypeAnnotations(source: string): boolean {
  return /:\s*\w+[\[\]<>|&]*\s*[=;,)\n{]/.test(source) ||
    /interface\s+\w+/.test(source) ||
    /type\s+\w+\s*=/.test(source);
}

function detectExportType(line: string): ExportInfo['type'] {
  if (/\bfunction\b/.test(line)) return 'function';
  if (/\bclass\b/.test(line)) return 'class';
  if (/\binterface\b/.test(line)) return 'interface';
  if (/\btype\b/.test(line)) return 'type';
  if (/\bconst\b/.test(line)) return 'constant';
  return 'variable';
}
