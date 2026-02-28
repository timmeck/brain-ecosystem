import type { ErrorParser, ParsedError, StackFrame } from '../types.js';
import path from 'node:path';

const V8_STACK_RE = /at (?:(.+?) )?\((.+?):(\d+):(\d+)\)/;
const V8_STACK_BARE_RE = /at (.+?):(\d+):(\d+)/;
const ERROR_TYPE_RE = /^(\w+(?:Error|Exception|Warning)?): (.+)$/m;

function parseFrames(input: string): StackFrame[] {
  const frames: StackFrame[] = [];
  for (const line of input.split('\n')) {
    const trimmed = line.trim();
    let match = V8_STACK_RE.exec(trimmed);
    if (match) {
      frames.push({
        function_name: match[1] || null,
        file_path: match[2]!,
        line_number: parseInt(match[3]!, 10),
        column_number: parseInt(match[4]!, 10),
        normalized: `${match[1] || '<anon>'}@${path.basename(match[2]!)}`,
      });
      continue;
    }
    match = V8_STACK_BARE_RE.exec(trimmed);
    if (match) {
      frames.push({
        function_name: null,
        file_path: match[1]!,
        line_number: parseInt(match[2]!, 10),
        column_number: parseInt(match[3]!, 10),
        normalized: `<anon>@${path.basename(match[1]!)}`,
      });
    }
  }
  return frames;
}

export const nodeParser: ErrorParser = {
  name: 'node',
  priority: 10,

  canParse(input: string): boolean {
    return (
      /at .+ \(.+:\d+:\d+\)/.test(input) ||
      /at .+:\d+:\d+/.test(input) ||
      /^\w*Error:/.test(input) ||
      /^\w*TypeError:/.test(input)
    );
  },

  parse(input: string): ParsedError | null {
    const typeMatch = ERROR_TYPE_RE.exec(input);
    if (!typeMatch) return null;

    const errorType = typeMatch[1]!;
    const message = typeMatch[2]!;
    const frames = parseFrames(input);
    const topFrame = frames[0];

    return {
      errorType,
      message,
      stackTrace: input,
      frames,
      sourceFile: topFrame?.file_path ?? null,
      sourceLine: topFrame?.line_number ?? null,
      language: 'javascript',
    };
  },
};
