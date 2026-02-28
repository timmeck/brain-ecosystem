import type { ErrorParser, ParsedError, StackFrame } from '../types.js';
import path from 'node:path';

const RUST_ERROR_RE = /error(?:\[E(\d+)\])?: (.+)/;
const RUST_LOCATION_RE = /^\s*--> (.+):(\d+):(\d+)/m;
// Reserved for future note extraction
// const RUST_NOTE_RE = /^\s*= note: (.+)/gm;

export const rustParser: ErrorParser = {
  name: 'rust',
  priority: 10,

  canParse(input: string): boolean {
    return /error\[E\d+\]:/.test(input) || /^error:/.test(input);
  },

  parse(input: string): ParsedError | null {
    const errMatch = RUST_ERROR_RE.exec(input);
    if (!errMatch) return null;

    const message = errMatch[2]!.trim();
    const errorType = errMatch[1] ? `E${errMatch[1]}` : 'CompilerError';

    const frames: StackFrame[] = [];
    let sourceFile: string | null = null;
    let sourceLine: number | null = null;

    const locMatch = RUST_LOCATION_RE.exec(input);
    if (locMatch) {
      sourceFile = locMatch[1]!;
      sourceLine = parseInt(locMatch[2]!, 10);
      frames.push({
        function_name: null,
        file_path: locMatch[1]!,
        line_number: parseInt(locMatch[2]!, 10),
        column_number: parseInt(locMatch[3]!, 10),
        normalized: `<compiler>@${path.basename(locMatch[1]!)}`,
      });
    }

    return {
      errorType,
      message,
      stackTrace: input,
      frames,
      sourceFile,
      sourceLine,
      language: 'rust',
    };
  },
};
