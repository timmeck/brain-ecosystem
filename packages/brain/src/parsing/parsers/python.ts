import type { ErrorParser, ParsedError, StackFrame } from '../types.js';
import path from 'node:path';

const FRAME_RE = /File "(.+?)", line (\d+)(?:, in (.+))?/g;
const ERROR_LINE_RE = /^(\w+(?:Error|Exception|Warning)?): (.+)$/m;

export const pythonParser: ErrorParser = {
  name: 'python',
  priority: 10,

  canParse(input: string): boolean {
    return (
      /Traceback \(most recent call last\)/.test(input) ||
      /File ".+", line \d+/.test(input)
    );
  },

  parse(input: string): ParsedError | null {
    const frames: StackFrame[] = [];
    let match: RegExpExecArray | null;
    const frameRe = new RegExp(FRAME_RE.source, 'g');

    while ((match = frameRe.exec(input)) !== null) {
      frames.push({
        function_name: match[3] || null,
        file_path: match[1]!,
        line_number: parseInt(match[2]!, 10),
        column_number: null,
        normalized: `${match[3] || '<module>'}@${path.basename(match[1]!)}`,
      });
    }

    const lines = input.trim().split('\n');
    let errorType = 'PythonError';
    let message = '';

    for (let i = lines.length - 1; i >= 0; i--) {
      const errMatch = ERROR_LINE_RE.exec(lines[i]!);
      if (errMatch) {
        errorType = errMatch[1]!;
        message = errMatch[2]!;
        break;
      }
    }

    if (!message && lines.length > 0) {
      message = lines[lines.length - 1]!;
    }

    const topFrame = frames[frames.length - 1];

    return {
      errorType,
      message,
      stackTrace: input,
      frames,
      sourceFile: topFrame?.file_path ?? null,
      sourceLine: topFrame?.line_number ?? null,
      language: 'python',
    };
  },
};
