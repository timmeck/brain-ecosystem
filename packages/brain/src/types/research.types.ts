export type InsightType = 'pattern' | 'correlation' | 'suggestion' | 'warning' | 'optimization' | 'trend' | 'gap' | 'synergy' | 'template_candidate' | 'project_suggestion';

export interface InsightRecord {
  id: number;
  type: InsightType;
  title: string;
  description: string;
  evidence: string;
  priority: number;
  project_id: number | null;
  active: number;
  expires_at: string | null;
  created_at: string;
}

export interface ResearchCycleResult {
  insightsGenerated: number;
  patternsFound: number;
  correlationsFound: number;
  duration: number;
}

export interface ProjectTemplateSuggestion {
  name: string;
  description: string;
  basedOn: string[];
  confidence: number;
}
