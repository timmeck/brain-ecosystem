/**
 * TechRadar Types — Täglicher Internet-Scan + Relevanz-Analyse
 */

// ── Radar Entry ──────────────────────────────────────────

export interface TechRadarEntry {
  id?: number;
  name: string;
  source: TechRadarSource;
  source_url: string;
  category: TechRadarCategory;
  ring: TechRadarRing;
  description: string;
  relevance_score: number;       // 0-100: wie relevant für Brain Ecosystem
  relevance_reason: string;      // LLM-generierte Begründung
  action_type: TechRadarAction;  // was tun?
  action_detail: string;         // konkrete Handlungsempfehlung
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
}

export type TechRadarSource = 'github_release' | 'github_trending' | 'hackernews' | 'web' | 'changelog' | 'npm' | 'manual';
export type TechRadarCategory = 'framework' | 'library' | 'tool' | 'language' | 'platform' | 'technique' | 'ai_model' | 'crypto' | 'other';
export type TechRadarRing = 'adopt' | 'trial' | 'assess' | 'hold';
export type TechRadarAction = 'integrate' | 'update' | 'investigate' | 'monitor' | 'none';

// ── Watched Repo ─────────────────────────────────────────

export interface WatchedRepo {
  id?: number;
  full_name: string;     // e.g. "anthropics/claude-code"
  url: string;
  reason: string;        // warum überwacht
  last_release_tag: string | null;
  last_release_at: string | null;
  last_checked_at: string | null;
  is_active: boolean;
}

export interface RepoRelease {
  tag: string;
  name: string;
  body: string;          // changelog/release notes
  published_at: string;
  url: string;
  is_prerelease: boolean;
}

// ── Daily Digest ─────────────────────────────────────────

export interface DailyDigest {
  id?: number;
  date: string;
  summary: string;       // LLM-generierte Zusammenfassung
  entries: DigestEntry[];
  opportunities: DigestOpportunity[];
  action_items: DigestActionItem[];
  created_at: string;
}

export interface DigestEntry {
  name: string;
  source: TechRadarSource;
  category: TechRadarCategory;
  relevance_score: number;
  summary: string;
}

export interface DigestOpportunity {
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}

export interface DigestActionItem {
  action: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  related_entry: string;
}

// ── Config ───────────────────────────────────────────────

export interface TechRadarConfig {
  enabled: boolean;
  scanIntervalMs: number;       // default: 6h
  digestTime: string;           // default: "06:00"
  maxEntriesPerScan: number;    // default: 50
  relevanceThreshold: number;   // default: 30 (0-100)
  githubToken?: string;
  watchedRepos: string[];       // default repos to watch
}

// ── Scan Result ──────────────────────────────────────────

export interface TechRadarScanResult {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  new_entries: number;
  updated_entries: number;
  releases_found: number;
  digest_generated: boolean;
  errors: string[];
}
