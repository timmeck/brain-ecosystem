// ── Consciousness Types ─────────────────────────────────

export type ThoughtType =
  | 'perceiving'
  | 'analyzing'
  | 'discovering'
  | 'hypothesizing'
  | 'experimenting'
  | 'dreaming'
  | 'reflecting'
  | 'correlating'
  | 'predicting'
  | 'responding'
  | 'focusing';

export type ThoughtSignificance = 'routine' | 'notable' | 'breakthrough';

export interface Thought {
  id: string;
  timestamp: number;
  engine: string;
  type: ThoughtType;
  content: string;
  significance: ThoughtSignificance;
  data?: unknown;
}

export interface ConsciousnessConfig {
  /** Max thoughts in circular buffer. Default: 500 */
  maxThoughts?: number;
}

export interface ConsciousnessStatus {
  totalThoughts: number;
  thoughtsPerEngine: Record<string, number>;
  thoughtsPerType: Record<string, number>;
  thoughtsPerSignificance: Record<string, number>;
  activeEngines: string[];
  uptime: number;
}

export interface EngineActivity {
  engine: string;
  status: 'idle' | 'active' | 'sleeping';
  lastActive: number | null;
  metrics: {
    totalThoughts: number;
    discoveries: number;
    breakthroughs: number;
  };
}
