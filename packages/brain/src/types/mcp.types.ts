export interface HookInput {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ReportErrorParams {
  project: string;
  error_output: string;
  file_path?: string;
  terminal_id?: string;
}

export interface GetSolutionsParams {
  error_output?: string;
  error_id?: number;
  project?: string;
}

export interface ApplySolutionParams {
  error_id: number;
  solution_id: number;
  terminal_id?: string;
}

export interface RegisterModuleParams {
  project: string;
  name: string;
  file_path: string;
  language: string;
  source: string;
  description?: string;
}

export interface SearchModulesParams {
  query: string;
  language?: string;
  project?: string;
  limit?: number;
}

export interface GetInsightsParams {
  project?: string;
  type?: string;
  active_only?: boolean;
  limit?: number;
}

export interface GetNetworkParams {
  node_type: string;
  node_id: number;
  depth?: number;
  min_weight?: number;
}
