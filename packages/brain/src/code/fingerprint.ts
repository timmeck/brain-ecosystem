import { sha256 } from '@timmeck/brain-core';

export function fingerprintCode(source: string, language: string): string {
  let normalized = stripComments(source, language);
  normalized = normalized.replace(/\s+/g, ' ').trim();
  normalized = normalizeIdentifiers(normalized, language);
  normalized = normalized.replace(/'[^']*'/g, "'<STR>'");
  normalized = normalized.replace(/"[^"]*"/g, '"<STR>"');
  normalized = normalized.replace(/`[^`]*`/g, '`<STR>`');
  normalized = normalized.replace(/\b\d+\b/g, '<NUM>');
  return sha256(normalized);
}

export function stripComments(source: string, language: string): string {
  switch (language) {
    case 'typescript':
    case 'javascript':
    case 'java':
    case 'go':
    case 'rust':
    case 'c':
    case 'cpp':
      return source
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    case 'python':
      return source
        .replace(/#.*$/gm, '')
        .replace(/"""[\s\S]*?"""/g, '')
        .replace(/'''[\s\S]*?'''/g, '');
    default:
      return source
        .replace(/\/\/.*$/gm, '')
        .replace(/#.*$/gm, '');
  }
}

function normalizeIdentifiers(source: string, language: string): string {
  const importNames = extractImportNames(source, language);
  const keywords = getLanguageKeywords(language);
  const preserve = new Set([...importNames, ...keywords]);

  return source.replace(/\b[a-zA-Z_]\w*\b/g, (match) => {
    if (preserve.has(match)) return match;
    if (match[0] === match[0]!.toUpperCase() && match[0] !== match[0]!.toLowerCase()) return '<CLASS>';
    return '<VAR>';
  });
}

function extractImportNames(source: string, language: string): string[] {
  const names: string[] = [];

  if (language === 'typescript' || language === 'javascript') {
    const re = /import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      if (m[1]) names.push(...m[1].split(',').map(s => s.trim().split(/\s+as\s+/).pop()!));
      if (m[2]) names.push(m[2]);
      if (m[3]) names.push(m[3]);
    }
  } else if (language === 'python') {
    const re = /(?:from\s+\S+\s+)?import\s+(.+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      names.push(...m[1]!.split(',').map(s => {
        const parts = s.trim().split(/\s+as\s+/);
        return parts[parts.length - 1]!;
      }));
    }
  }

  return names.filter(Boolean);
}

function getLanguageKeywords(language: string): string[] {
  const common = ['if', 'else', 'for', 'while', 'return', 'break', 'continue', 'switch', 'case', 'default', 'try', 'catch', 'throw', 'new', 'delete', 'true', 'false', 'null', 'undefined', 'void'];

  const langKeywords: Record<string, string[]> = {
    typescript: [...common, 'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum', 'import', 'export', 'from', 'async', 'await', 'extends', 'implements', 'readonly', 'private', 'public', 'protected', 'static', 'abstract', 'as', 'is', 'in', 'of', 'typeof', 'keyof', 'infer', 'never', 'unknown', 'any', 'string', 'number', 'boolean', 'symbol', 'object'],
    javascript: [...common, 'const', 'let', 'var', 'function', 'class', 'import', 'export', 'from', 'async', 'await', 'extends', 'typeof', 'instanceof', 'in', 'of', 'this', 'super', 'yield'],
    python: ['def', 'class', 'import', 'from', 'if', 'elif', 'else', 'for', 'while', 'return', 'yield', 'break', 'continue', 'try', 'except', 'finally', 'raise', 'with', 'as', 'pass', 'lambda', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is', 'global', 'nonlocal', 'assert', 'async', 'await', 'self'],
    rust: [...common, 'fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'trait', 'use', 'mod', 'crate', 'self', 'super', 'match', 'loop', 'move', 'ref', 'where', 'async', 'await', 'dyn', 'Box', 'Vec', 'String', 'Option', 'Result', 'Some', 'None', 'Ok', 'Err'],
    go: [...common, 'func', 'package', 'import', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'select', 'range', 'var', 'const', 'nil', 'make', 'len', 'append', 'cap', 'copy', 'close'],
  };

  return langKeywords[language] ?? common;
}
