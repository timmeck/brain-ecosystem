// ── CodeMiner Types ──────────────────────────────────────

export interface CodeMinerConfig {
  githubToken?: string;
  /** Max repos to mine per batch. Default: 50 */
  maxRepos?: number;
  /** Batch size for processing. Default: 50 */
  batchSize?: number;
  /** Delay between API calls in ms. Default: 1200 (rate limiting) */
  delayMs?: number;
}

export interface RepoContent {
  id: number;
  repo_id: number;
  file_path: string;
  content: string | null;
  content_hash: string | null;
  fetched_at: string;
}

export interface CodeMinerSummary {
  total_repos_mined: number;
  total_contents: number;
  total_size_bytes: number;
  last_mined_at: string | null;
  by_file: Array<{ file_path: string; count: number }>;
}

// ── PatternExtractor Types ───────────────────────────────

export interface ExtractedPattern {
  id: number;
  pattern_type: string;
  pattern_key: string;
  pattern_data: string;
  frequency: number;
  confidence: number;
  updated_at: string;
}

export interface DependencyPattern {
  name: string;
  count: number;
  percentage: number;
}

export interface TechStack {
  stack: string;
  count: number;
  repos: string[];
}

export interface ProjectStructure {
  path: string;
  count: number;
  percentage: number;
}

export interface ReadmePattern {
  section: string;
  count: number;
  percentage: number;
}

// ── ContextBuilder Types ─────────────────────────────────

export interface ContextBuilderConfig {
  maxPrinciples?: number;
  maxAntiPatterns?: number;
  maxStrategies?: number;
  maxPatterns?: number;
  maxJournalInsights?: number;
  maxTrending?: number;
}

export interface BuiltContext {
  systemPrompt: string;
  principlesUsed: number;
  antiPatternsUsed: number;
  patternsUsed: number;
  totalTokensEstimate: number;
}

// ── CodeGenerator Types ──────────────────────────────────

export interface CodeGeneratorConfig {
  brainName: string;
  apiKey?: string;
  /** Claude model to use. Default: 'claude-sonnet-4-20250514' */
  model?: string;
  /** Max tokens for generation. Default: 4096 */
  maxTokens?: number;
  /** Max generations per hour. Default: 10 */
  maxPerHour?: number;
}

export type GenerationTrigger = 'manual' | 'improvement_suggestion' | 'experiment';

export type GenerationStatus = 'generating' | 'generated' | 'pending_review' | 'approved' | 'rejected' | 'failed';

export interface GenerationRequest {
  task: string;
  context?: string;
  target_file?: string;
  language?: string;
  trigger?: GenerationTrigger;
  include_trends?: boolean;
  include_patterns?: boolean;
  knowledge_domains?: string[];
}

export interface GenerationResult {
  id: number;
  task: string;
  trigger: GenerationTrigger;
  status: GenerationStatus;
  context_summary: string;
  principles_used: number;
  anti_patterns_used: number;
  patterns_used: number;
  generated_code: string | null;
  generated_explanation: string | null;
  target_file: string | null;
  language: string;
  tokens_used: number;
  generation_time_ms: number;
  model_used: string;
  created_at: string;
  completed_at: string | null;
}

export interface GenerationRecord extends GenerationResult {
  validation_passed: number | null;
  validation_errors: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
}

export interface CodeGeneratorSummary {
  total_generations: number;
  by_status: Record<GenerationStatus, number>;
  by_trigger: Record<string, number>;
  total_tokens_used: number;
  avg_generation_time_ms: number;
  approval_rate: number;
  last_generation_at: string | null;
}
