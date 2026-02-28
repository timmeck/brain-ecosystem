export interface CodeModuleRecord {
  id: number;
  project_id: number;
  name: string;
  file_path: string;
  language: string;
  fingerprint: string;
  description: string | null;
  source_hash: string;
  lines_of_code: number;
  complexity: number | null;
  reusability_score: number;
  created_at: string;
  updated_at: string;
}

export interface ModuleUsage {
  id: number;
  module_id: number;
  used_in_project_id: number;
  used_in_file: string;
  usage_type: string;
  first_used: string;
  last_used: string;
}

export interface ModuleSimilarity {
  id: number;
  module_a_id: number;
  module_b_id: number;
  similarity_score: number;
  computed_at: string;
}

export interface CodeUnit {
  name: string;
  filePath: string;
  language: string;
  source: string;
  exports: ExportInfo[];
}

export interface ExportInfo {
  name: string;
  type: 'function' | 'class' | 'constant' | 'type' | 'interface' | 'variable';
}

export interface ReusabilitySignal {
  name: string;
  score: number;
  reason: string;
}
