// Memory categories available to all Brains
export type MemoryCategory = 'preference' | 'decision' | 'context' | 'fact' | 'goal' | 'lesson';
export type MemorySource = 'explicit' | 'inferred' | 'hook';
export type SessionOutcome = 'completed' | 'paused' | 'abandoned';

export interface MemoryRecord {
  id: number;
  project_id: number | null;
  session_id: number | null;
  category: MemoryCategory;
  key: string | null;
  content: string;
  importance: number;          // 1-10
  source: MemorySource;
  tags: string | null;         // JSON array
  expires_at: string | null;
  superseded_by: number | null;
  active: number;              // 0 or 1
  created_at: string;
  updated_at: string;
  embedding: Buffer | null;
}

export interface SessionRecord {
  id: number;
  session_id: string;          // UUID
  project_id: number | null;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  goals: string | null;        // JSON array
  outcome: SessionOutcome | null;
  metadata: string | null;     // JSON blob
  embedding: Buffer | null;
}

export interface RememberInput {
  content: string;
  category: MemoryCategory;
  key?: string;
  importance?: number;
  source?: MemorySource;
  tags?: string[];
  projectId?: number;
  sessionId?: number;
  expiresAt?: string;
}

export interface RecallInput {
  query: string;
  category?: MemoryCategory;
  projectId?: number;
  limit?: number;
  activeOnly?: boolean;
}

export interface StartSessionInput {
  sessionId?: string;          // UUID, auto-generated if not provided
  projectId?: number;
  goals?: string[];
  metadata?: Record<string, unknown>;
}

export interface EndSessionInput {
  sessionId: number;
  summary: string;
  outcome?: SessionOutcome;
}

export interface MemoryRepoInterface {
  create(data: Omit<MemoryRecord, 'id' | 'created_at' | 'updated_at'>): number;
  getById(id: number): MemoryRecord | undefined;
  findByKey(projectId: number | null, key: string): MemoryRecord | undefined;
  findByCategory(category: MemoryCategory, projectId?: number, limit?: number): MemoryRecord[];
  findActive(projectId?: number, limit?: number): MemoryRecord[];
  search(query: string, limit?: number): MemoryRecord[];
  supersede(oldId: number, newId: number): void;
  deactivate(id: number): void;
  expireOld(): number;
  update(id: number, data: Partial<MemoryRecord>): void;
}

export interface SessionRepoInterface {
  create(data: Omit<SessionRecord, 'id'>): number;
  getById(id: number): SessionRecord | undefined;
  findBySessionId(sessionId: string): SessionRecord | undefined;
  findByProject(projectId: number, limit?: number): SessionRecord[];
  findRecent(limit?: number): SessionRecord[];
  update(id: number, data: Partial<SessionRecord>): void;
  search(query: string, limit?: number): SessionRecord[];
}

export interface MemoryEngineConfig {
  intervalMs: number;          // Default: 30 min
  expiryCheckEnabled: boolean;
  consolidationEnabled: boolean;
  importanceDecayDays: number; // After X days without retrieval: importance -1
}
