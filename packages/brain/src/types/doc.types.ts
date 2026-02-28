export type DocType = 'readme' | 'claude_md' | 'package_json' | 'tsconfig' | 'architecture' | 'api' | 'other';

export interface ProjectDocRecord {
  id: number;
  project_id: number;
  file_path: string;
  doc_type: DocType;
  content: string;
  content_hash: string;
  parsed_metadata: string | null;  // JSON
  last_indexed_at: string;
  embedding: Buffer | null;
}

export interface IndexProjectInput {
  projectPath: string;
  project?: string;
  projectId?: number;
}

export interface QueryDocsInput {
  query?: string;
  projectId?: number;
  docType?: DocType;
  limit?: number;
}
