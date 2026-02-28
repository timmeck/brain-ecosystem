import type { ErrorParser, ParsedError, StackFrame } from '../types.js';
import path from 'node:path';

const GCC_RE = /^(.+?):(\d+):(\d+): (error|warning|fatal error): (.+)/m;
const JAVAC_RE = /^(.+\.java):(\d+): error: (.+)/m;
const GENERIC_COMPILER_RE = /^(.+?):(\d+)(?::(\d+))?: (?:error|fatal): (.+)/m;

export const compilerParser: ErrorParser = {
  name: 'compiler',
  priority: 7,

  canParse(input: string): boolean {
    return (
      GCC_RE.test(input) ||
      JAVAC_RE.test(input) ||
      /compilation failed|fatal error:/.test(input)
    );
  },

  parse(input: string): ParsedError | null {
    const gccMatch = GCC_RE.exec(input);
    if (gccMatch) {
      const filePath = gccMatch[1]!;
      const frame: StackFrame = {
        function_name: null,
        file_path: filePath,
        line_number: parseInt(gccMatch[2]!, 10),
        column_number: parseInt(gccMatch[3]!, 10),
        normalized: `<compiler>@${path.basename(filePath)}`,
      };
      return {
        errorType: gccMatch[4] === 'warning' ? 'CompilerWarning' : 'CompilerError',
        message: gccMatch[5]!,
        stackTrace: input,
        frames: [frame],
        sourceFile: filePath,
        sourceLine: frame.line_number,
        language: detectLanguage(filePath),
      };
    }

    const javacMatch = JAVAC_RE.exec(input);
    if (javacMatch) {
      const filePath = javacMatch[1]!;
      return {
        errorType: 'CompilerError',
        message: javacMatch[3]!,
        stackTrace: input,
        frames: [{
          function_name: null,
          file_path: filePath,
          line_number: parseInt(javacMatch[2]!, 10),
          column_number: null,
          normalized: `<compiler>@${path.basename(filePath)}`,
        }],
        sourceFile: filePath,
        sourceLine: parseInt(javacMatch[2]!, 10),
        language: 'java',
      };
    }

    const genericMatch = GENERIC_COMPILER_RE.exec(input);
    if (genericMatch) {
      const filePath = genericMatch[1]!;
      return {
        errorType: 'CompilerError',
        message: genericMatch[4]!,
        stackTrace: input,
        frames: [{
          function_name: null,
          file_path: filePath,
          line_number: parseInt(genericMatch[2]!, 10),
          column_number: genericMatch[3] ? parseInt(genericMatch[3], 10) : null,
          normalized: `<compiler>@${path.basename(filePath)}`,
        }],
        sourceFile: filePath,
        sourceLine: parseInt(genericMatch[2]!, 10),
        language: detectLanguage(filePath),
      };
    }

    return null;
  },
};

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
    '.java': 'java', '.rs': 'rust', '.go': 'go', '.swift': 'swift',
  };
  return map[ext] ?? 'unknown';
}
