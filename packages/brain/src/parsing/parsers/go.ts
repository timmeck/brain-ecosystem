import type { ErrorParser, ParsedError, StackFrame } from '../types.js';
import path from 'node:path';

const GO_FILE_ERROR_RE = /^\.?\/?(.+\.go):(\d+):(\d+): (.+)/m;
const GO_PANIC_RE = /^panic: (.+)/m;
// Reserved for future goroutine stack trace parsing
// const GO_GOROUTINE_RE = /^goroutine \d+ \[.+\]:/m;
// const GO_STACK_RE = /^\t(.+\.go):(\d+)/gm;
// const GO_FUNC_RE = /^(.+)\(.*\)$/gm;

export const goParser: ErrorParser = {
  name: 'go',
  priority: 10,

  canParse(input: string): boolean {
    return (
      GO_FILE_ERROR_RE.test(input) ||
      GO_PANIC_RE.test(input) ||
      /^fatal error:/.test(input)
    );
  },

  parse(input: string): ParsedError | null {
    const panicMatch = GO_PANIC_RE.exec(input);
    if (panicMatch) {
      return parsePanic(input, panicMatch[1]!);
    }

    const fileMatch = GO_FILE_ERROR_RE.exec(input);
    if (fileMatch) {
      return {
        errorType: 'CompilerError',
        message: fileMatch[4]!,
        stackTrace: input,
        frames: [{
          function_name: null,
          file_path: fileMatch[1]!,
          line_number: parseInt(fileMatch[2]!, 10),
          column_number: parseInt(fileMatch[3]!, 10),
          normalized: `<compiler>@${path.basename(fileMatch[1]!)}`,
        }],
        sourceFile: fileMatch[1]!,
        sourceLine: parseInt(fileMatch[2]!, 10),
        language: 'go',
      };
    }

    const fatalMatch = /^fatal error: (.+)/m.exec(input);
    if (fatalMatch) {
      return {
        errorType: 'FatalError',
        message: fatalMatch[1]!,
        stackTrace: input,
        frames: [],
        sourceFile: null,
        sourceLine: null,
        language: 'go',
      };
    }

    return null;
  },
};

function parsePanic(input: string, message: string): ParsedError {
  const frames: StackFrame[] = [];
  const lines = input.split('\n');
  let i = 0;

  while (i < lines.length) {
    if (lines[i]!.startsWith('\t')) {
      const stackMatch = /^\t(.+\.go):(\d+)/.exec(lines[i]!);
      if (stackMatch) {
        const funcLine = i > 0 ? lines[i - 1]!.trim() : null;
        const funcName = funcLine?.replace(/\(.*\)$/, '') ?? null;
        frames.push({
          function_name: funcName,
          file_path: stackMatch[1]!,
          line_number: parseInt(stackMatch[2]!, 10),
          column_number: null,
          normalized: `${funcName || '<anon>'}@${path.basename(stackMatch[1]!)}`,
        });
      }
    }
    i++;
  }

  const topFrame = frames[0];
  return {
    errorType: 'PanicError',
    message,
    stackTrace: input,
    frames,
    sourceFile: topFrame?.file_path ?? null,
    sourceLine: topFrame?.line_number ?? null,
    language: 'go',
  };
}
