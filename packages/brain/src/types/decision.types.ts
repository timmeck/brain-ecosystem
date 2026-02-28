export type DecisionCategory = 'architecture' | 'technology' | 'pattern' | 'convention' | 'dependency' | 'process' | 'other';
export type DecisionStatus = 'active' | 'superseded' | 'deprecated' | 'rejected';
export type ChangeType = 'created' | 'modified' | 'deleted' | 'renamed' | 'refactored';

export interface DecisionRecord {
  id: number;
  project_id: number | null;
  session_id: number | null;
  title: string;
  description: string;
  alternatives: string | null;   // JSON: [{ option, pros, cons, rejected_reason }]
  category: DecisionCategory;
  status: DecisionStatus;
  superseded_by: number | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
  embedding: Buffer | null;
}

export interface ChangelogEntry {
  id: number;
  project_id: number;
  session_id: number | null;
  file_path: string;
  change_type: ChangeType;
  summary: string;
  reason: string | null;
  diff_snippet: string | null;
  related_error_id: number | null;
  related_decision_id: number | null;
  commit_hash: string | null;
  created_at: string;
  embedding: Buffer | null;
}

export interface RecordDecisionInput {
  title: string;
  description: string;
  alternatives?: Array<{ option: string; pros?: string[]; cons?: string[]; rejected_reason?: string }>;
  category?: DecisionCategory;
  tags?: string[];
  project?: string;
  projectId?: number;
  sessionId?: number;
}

export interface QueryDecisionsInput {
  query?: string;
  category?: DecisionCategory;
  projectId?: number;
  status?: DecisionStatus;
  limit?: number;
}

export interface RecordChangeInput {
  filePath: string;
  changeType: ChangeType;
  summary: string;
  reason?: string;
  diffSnippet?: string;
  relatedErrorId?: number;
  relatedDecisionId?: number;
  commitHash?: string;
  project?: string;
  projectId?: number;
  sessionId?: number;
}

export interface QueryChangesInput {
  query?: string;
  filePath?: string;
  projectId?: number;
  sessionId?: number;
  limit?: number;
}
