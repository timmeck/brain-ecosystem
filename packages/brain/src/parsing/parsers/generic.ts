import type { ErrorParser, ParsedError } from '../types.js';

const ERROR_LINE_RE = /(?:error|Error|ERROR)[\s:]+(.+)/;

export const genericParser: ErrorParser = {
  name: 'generic',
  priority: 0,

  canParse(_input: string): boolean {
    return true;
  },

  parse(input: string): ParsedError | null {
    const match = ERROR_LINE_RE.exec(input);
    const firstLine = input.trim().split('\n')[0] ?? input;
    const message = match ? match[1]! : firstLine;

    return {
      errorType: 'UnknownError',
      message: message.trim(),
      stackTrace: null,
      frames: [],
      sourceFile: null,
      sourceLine: null,
      language: null,
    };
  },
};
