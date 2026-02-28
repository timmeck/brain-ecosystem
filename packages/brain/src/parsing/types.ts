export interface StackFrame {
  function_name: string | null;
  file_path: string | null;
  line_number: number | null;
  column_number: number | null;
  normalized: string | null;
}

export interface ParsedError {
  errorType: string;
  message: string;
  stackTrace: string | null;
  frames: StackFrame[];
  sourceFile: string | null;
  sourceLine: number | null;
  language: string | null;
}

export interface ErrorParser {
  name: string;
  priority: number;
  canParse(input: string): boolean;
  parse(input: string): ParsedError | null;
}

export class ErrorParserRegistry {
  private parsers: ErrorParser[] = [];

  register(parser: ErrorParser): void {
    this.parsers.push(parser);
    this.parsers.sort((a, b) => b.priority - a.priority);
  }

  parse(input: string): ParsedError | null {
    for (const parser of this.parsers) {
      if (parser.canParse(input)) {
        const result = parser.parse(input);
        if (result) return result;
      }
    }
    return null;
  }

  getRegistered(): string[] {
    return this.parsers.map(p => p.name);
  }
}
