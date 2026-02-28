export interface ErrorRecord {
  id: number;
  project_id: number;
  terminal_id: number | null;
  fingerprint: string;
  type: string;
  message: string;
  raw_output: string;
  context: string | null;
  file_path: string | null;
  line_number: number | null;
  column_number: number | null;
  occurrence_count: number;
  first_seen: string;
  last_seen: string;
  resolved: number;
  resolved_at: string | null;
}

export interface StackFrame {
  file: string;
  line: number;
  column: number | null;
  function_name: string | null;
  source: string | null;
}

export interface ParsedError {
  type: string;
  message: string;
  fingerprint: string;
  stackFrames: StackFrame[];
  filePath: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  context: string | null;
}

export interface ErrorParser {
  name: string;
  canParse(raw: string): boolean;
  parse(raw: string): ParsedError | null;
}

export interface MatchSignal {
  field: string;
  similarity: number;
  weight: number;
}

export interface MatchResult {
  errorId: number;
  score: number;
  signals: MatchSignal[];
}

export interface ErrorSolutionPair {
  error: ErrorRecord;
  solutionIds: number[];
}

export interface Pattern {
  type: string;
  message: string;
  count: number;
  lastSeen: string;
}
