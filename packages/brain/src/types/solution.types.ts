export interface SolutionRecord {
  id: number;
  description: string;
  commands: string | null;
  code_change: string | null;
  source: string;
  confidence: number;
  success_count: number;
  fail_count: number;
  created_at: string;
  updated_at: string;
}

export interface ErrorSolution {
  id: number;
  error_id: number;
  solution_id: number;
  applied_at: string | null;
  success: number | null;
}

export interface SolutionAttempt {
  id: number;
  error_solution_id: number;
  terminal_id: number | null;
  attempted_at: string;
  success: number;
  output: string | null;
  duration_ms: number | null;
}
