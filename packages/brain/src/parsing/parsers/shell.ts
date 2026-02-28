import type { ErrorParser, ParsedError } from '../types.js';

const ERROR_MAP: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /command not found/i, type: 'CommandNotFound' },
  { pattern: /Permission denied|EACCES/i, type: 'PermissionError' },
  { pattern: /No such file or directory|ENOENT/i, type: 'FileNotFound' },
  { pattern: /ECONNREFUSED/i, type: 'ConnectionRefused' },
  { pattern: /EADDRINUSE/i, type: 'AddressInUse' },
  { pattern: /ETIMEDOUT|ESOCKETTIMEDOUT/i, type: 'Timeout' },
  { pattern: /ENOMEM/i, type: 'OutOfMemory' },
];

export const shellParser: ErrorParser = {
  name: 'shell',
  priority: 5,

  canParse(input: string): boolean {
    return ERROR_MAP.some(e => e.pattern.test(input));
  },

  parse(input: string): ParsedError | null {
    let errorType = 'ShellError';
    for (const entry of ERROR_MAP) {
      if (entry.pattern.test(input)) {
        errorType = entry.type;
        break;
      }
    }

    const firstLine = input.trim().split('\n')[0] ?? input;

    return {
      errorType,
      message: firstLine,
      stackTrace: null,
      frames: [],
      sourceFile: null,
      sourceLine: null,
      language: 'shell',
    };
  },
};
