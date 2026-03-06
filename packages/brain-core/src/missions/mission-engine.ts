import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import type { ThoughtStream } from '../consciousness/thought-stream.js';
import type { LLMService } from '../llm/llm-service.js';
import type { BraveSearchAdapter, JinaReaderAdapter } from '../research/adapters/web-research-adapter.js';
import type { KnowledgeDistiller } from '../research/knowledge-distiller.js';
import type { HypothesisEngine } from '../hypothesis/engine.js';
import type { ResearchJournal } from '../research/journal.js';

// ── Types ───────────────────────────────────────────────

export type MissionStatus = 'pending' | 'decomposing' | 'gathering' | 'hypothesizing' | 'analyzing' | 'synthesizing' | 'complete' | 'failed';
export type MissionDepth = 'quick' | 'standard' | 'deep';

export interface Mission {
  id?: number;
  topic: string;
  depth: MissionDepth;
  status: MissionStatus;
  subQuestions: string[];
  report: string | null;
  sourceCount: number;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface MissionPhase {
  id?: number;
  missionId: number;
  phase: string;
  status: 'pending' | 'running' | 'complete' | 'failed';
  result: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MissionSource {
  id?: number;
  missionId: number;
  url: string;
  title: string;
  content: string;
  sourceType: 'web' | 'database' | 'journal' | 'hypothesis';
  relevance: number;
  fetchedAt: string;
}

export interface MissionEngineConfig {
  brainName?: string;
  maxConcurrentMissions?: number;
  maxSourcesPerMission?: number;
  gatherDelayMs?: number;
}

// ── Migration ───────────────────────────────────────────

export function runMissionMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      depth TEXT NOT NULL DEFAULT 'standard',
      status TEXT NOT NULL DEFAULT 'pending',
      sub_questions TEXT NOT NULL DEFAULT '[]',
      report TEXT,
      source_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_missions_status ON research_missions(status);

    CREATE TABLE IF NOT EXISTS mission_phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id INTEGER NOT NULL REFERENCES research_missions(id),
      phase TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      started_at TEXT,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_phases_mission ON mission_phases(mission_id);

    CREATE TABLE IF NOT EXISTS mission_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id INTEGER NOT NULL REFERENCES research_missions(id),
      url TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'web',
      relevance REAL NOT NULL DEFAULT 0,
      fetched_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sources_mission ON mission_sources(mission_id);
  `);
}

// ── Engine ──────────────────────────────────────────────

export class ResearchMissionEngine {
  private log = getLogger();
  private thoughtStream: ThoughtStream | null = null;
  private llm: LLMService | null = null;
  private braveSearch: BraveSearchAdapter | null = null;
  private jinaReader: JinaReaderAdapter | null = null;
  private playwrightAdapter: import('../research/adapters/playwright-adapter.js').PlaywrightAdapter | null = null;
  private firecrawlAdapter: import('../research/adapters/firecrawl-adapter.js').FirecrawlAdapter | null = null;
  private knowledgeDistiller: KnowledgeDistiller | null = null;
  private hypothesisEngine: HypothesisEngine | null = null;
  private journal: ResearchJournal | null = null;
  private running = false;
  private config: Required<MissionEngineConfig>;

  // Prepared statements
  private stmtInsertMission: Database.Statement;
  private stmtUpdateMission: Database.Statement;
  private stmtInsertPhase: Database.Statement;
  private stmtUpdatePhase: Database.Statement;
  private stmtInsertSource: Database.Statement;

  constructor(private db: Database.Database, config: MissionEngineConfig = {}) {
    this.config = {
      brainName: config.brainName ?? 'brain',
      maxConcurrentMissions: config.maxConcurrentMissions ?? 3,
      maxSourcesPerMission: config.maxSourcesPerMission ?? 20,
      gatherDelayMs: config.gatherDelayMs ?? 1500,
    };

    runMissionMigration(db);

    this.stmtInsertMission = db.prepare(
      'INSERT INTO research_missions (topic, depth, status) VALUES (?, ?, ?)',
    );
    this.stmtUpdateMission = db.prepare(
      'UPDATE research_missions SET status=?, sub_questions=?, report=?, source_count=?, completed_at=?, error=? WHERE id=?',
    );
    this.stmtInsertPhase = db.prepare(
      'INSERT INTO mission_phases (mission_id, phase, status) VALUES (?, ?, ?)',
    );
    this.stmtUpdatePhase = db.prepare(
      'UPDATE mission_phases SET status=?, result=?, started_at=COALESCE(started_at, ?), completed_at=? WHERE id=?',
    );
    this.stmtInsertSource = db.prepare(
      'INSERT INTO mission_sources (mission_id, url, title, content, source_type, relevance) VALUES (?, ?, ?, ?, ?, ?)',
    );
  }

  // ── Setters ─────────────────────────────────────────

  setThoughtStream(ts: ThoughtStream): void { this.thoughtStream = ts; }
  setLLMService(llm: LLMService): void { this.llm = llm; }
  setBraveSearch(adapter: BraveSearchAdapter): void { this.braveSearch = adapter; }
  setJinaReader(adapter: JinaReaderAdapter): void { this.jinaReader = adapter; }
  setPlaywrightAdapter(adapter: import('../research/adapters/playwright-adapter.js').PlaywrightAdapter): void { this.playwrightAdapter = adapter; }
  setFirecrawlAdapter(adapter: import('../research/adapters/firecrawl-adapter.js').FirecrawlAdapter): void { this.firecrawlAdapter = adapter; }

  setDataSources(sources: {
    knowledgeDistiller?: KnowledgeDistiller;
    hypothesisEngine?: HypothesisEngine;
    journal?: ResearchJournal;
  }): void {
    this.knowledgeDistiller = sources.knowledgeDistiller ?? null;
    this.hypothesisEngine = sources.hypothesisEngine ?? null;
    this.journal = sources.journal ?? null;
  }

  // ── Public API ──────────────────────────────────────

  /**
   * Create a new research mission and start executing it asynchronously.
   */
  createMission(topic: string, depth: MissionDepth = 'standard'): Mission {
    const result = this.stmtInsertMission.run(topic, depth, 'pending');
    const id = Number(result.lastInsertRowid);

    // Create phase rows
    const phases = ['decompose', 'gather', 'hypothesize', 'analyze', 'synthesize'];
    for (const phase of phases) {
      this.stmtInsertPhase.run(id, phase, 'pending');
    }

    this.thoughtStream?.emit(
      'mission_engine', 'exploring',
      `New research mission: "${topic}" (depth: ${depth})`,
      'notable',
    );

    // Start async execution (fire-and-forget)
    this.executeMission(id, topic, depth).catch(err => {
      this.log.warn(`[missions] Mission #${id} failed: ${(err as Error).message}`);
    });

    return this.getMission(id)!;
  }

  /** Get a single mission by ID. */
  getMission(id: number): Mission | null {
    const row = this.db.prepare('SELECT * FROM research_missions WHERE id=?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToMission(row);
  }

  /** List missions with optional status filter. */
  listMissions(status?: MissionStatus, limit = 20): Mission[] {
    const sql = status
      ? 'SELECT * FROM research_missions WHERE status=? ORDER BY id DESC LIMIT ?'
      : 'SELECT * FROM research_missions ORDER BY id DESC LIMIT ?';
    const rows = (status
      ? this.db.prepare(sql).all(status, limit)
      : this.db.prepare(sql).all(limit)) as Array<Record<string, unknown>>;
    return rows.map(r => this.rowToMission(r));
  }

  /** Get the report for a completed mission. */
  getReport(id: number): { mission: Mission; phases: MissionPhase[]; sources: MissionSource[] } | null {
    const mission = this.getMission(id);
    if (!mission) return null;
    const phases = (this.db.prepare('SELECT * FROM mission_phases WHERE mission_id=? ORDER BY id').all(id) as Array<Record<string, unknown>>)
      .map(r => this.rowToPhase(r));
    const sources = (this.db.prepare('SELECT * FROM mission_sources WHERE mission_id=? ORDER BY relevance DESC').all(id) as Array<Record<string, unknown>>)
      .map(r => this.rowToSource(r));
    return { mission, phases, sources };
  }

  /** Cancel a running mission. */
  cancelMission(id: number): boolean {
    const mission = this.getMission(id);
    if (!mission || mission.status === 'complete' || mission.status === 'failed') return false;
    this.stmtUpdateMission.run('failed', JSON.stringify(mission.subQuestions), null, mission.sourceCount, null, 'Cancelled by user', id);
    return true;
  }

  /** Get engine status summary. */
  getStatus(): { activeMissions: number; completedMissions: number; totalMissions: number; totalSources: number } {
    const total = (this.db.prepare('SELECT COUNT(*) as c FROM research_missions').get() as { c: number }).c;
    const active = (this.db.prepare("SELECT COUNT(*) as c FROM research_missions WHERE status NOT IN ('complete','failed')").get() as { c: number }).c;
    const completed = (this.db.prepare("SELECT COUNT(*) as c FROM research_missions WHERE status='complete'").get() as { c: number }).c;
    const sources = (this.db.prepare('SELECT COUNT(*) as c FROM mission_sources').get() as { c: number }).c;
    return { activeMissions: active, completedMissions: completed, totalMissions: total, totalSources: sources };
  }

  // ── Mission Execution Pipeline ──────────────────────

  private async executeMission(id: number, topic: string, depth: MissionDepth): Promise<void> {
    const maxSources = depth === 'quick' ? 5 : depth === 'standard' ? 10 : 20;
    const maxSearchQueries = depth === 'quick' ? 2 : depth === 'standard' ? 4 : 8;

    try {
      // Phase 1: Decompose
      this.updateMissionStatus(id, 'decomposing');
      const subQuestions = await this.phaseDecompose(id, topic, maxSearchQueries);

      // Phase 2: Gather
      this.updateMissionStatus(id, 'gathering');
      const sources = await this.phaseGather(id, topic, subQuestions, maxSources);

      // Phase 3: Hypothesize
      this.updateMissionStatus(id, 'hypothesizing');
      await this.phaseHypothesize(id, topic, sources);

      // Phase 4: Analyze
      this.updateMissionStatus(id, 'analyzing');
      await this.phaseAnalyze(id, topic, sources);

      // Phase 5: Synthesize
      this.updateMissionStatus(id, 'synthesizing');
      const report = await this.phaseSynthesize(id, topic, subQuestions, sources);

      // Complete
      const sourceCount = (this.db.prepare('SELECT COUNT(*) as c FROM mission_sources WHERE mission_id=?').get(id) as { c: number }).c;
      this.stmtUpdateMission.run('complete', JSON.stringify(subQuestions), report, sourceCount, new Date().toISOString(), null, id);

      this.thoughtStream?.emit(
        'mission_engine', 'discovering',
        `Mission complete: "${topic}" — ${sourceCount} sources, report ready`,
        'breakthrough',
      );

      // Log to journal
      this.journal?.recordDiscovery(
        `Research Mission: ${topic}`,
        report.substring(0, 2000),
        { missionId: id, sourceCount, depth },
        'notable',
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.stmtUpdateMission.run('failed', '[]', null, 0, null, msg, id);
      this.log.warn(`[missions] Mission #${id} failed: ${msg}`);
    }
  }

  // ── Phase 1: Decompose ──────────────────────────────

  private async phaseDecompose(missionId: number, topic: string, maxQuestions: number): Promise<string[]> {
    const phaseId = this.startPhase(missionId, 'decompose');
    this.thoughtStream?.emit('mission_engine', 'analyzing', `Decomposing: "${topic}"`, 'routine');

    let subQuestions: string[];

    // Try LLM decomposition
    if (this.llm?.isAvailable()) {
      const response = await this.llm.call('research_question', [
        `Decompose this research topic into ${maxQuestions} specific, searchable sub-questions.`,
        `Topic: "${topic}"`,
        `Return ONLY a JSON array of strings, nothing else.`,
        `Example: ["What is X?", "How does X affect Y?", "What are the latest trends in X?"]`,
      ].join('\n'));

      if (response?.text) {
        try {
          const parsed = JSON.parse(response.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
          if (Array.isArray(parsed) && parsed.length > 0) {
            subQuestions = parsed.slice(0, maxQuestions).map(String);
            this.completePhase(phaseId, JSON.stringify(subQuestions));
            return subQuestions;
          }
        } catch { /* Fall through to heuristic */ }
      }
    }

    // Heuristic decomposition
    subQuestions = this.heuristicDecompose(topic, maxQuestions);
    this.completePhase(phaseId, JSON.stringify(subQuestions));
    return subQuestions;
  }

  private heuristicDecompose(topic: string, maxQuestions: number): string[] {
    const questions = [
      `What is ${topic}?`,
      `What are the key aspects of ${topic}?`,
      `What are the latest developments in ${topic}?`,
      `What are the challenges and risks of ${topic}?`,
      `What are best practices for ${topic}?`,
      `How does ${topic} compare to alternatives?`,
      `What is the future outlook for ${topic}?`,
      `What are real-world examples of ${topic}?`,
    ];
    return questions.slice(0, maxQuestions);
  }

  // ── Phase 2: Gather ─────────────────────────────────

  private async phaseGather(missionId: number, topic: string, subQuestions: string[], maxSources: number): Promise<MissionSource[]> {
    const phaseId = this.startPhase(missionId, 'gather');
    this.thoughtStream?.emit('mission_engine', 'exploring', `Gathering sources for: "${topic}"`, 'routine');

    const allSources: MissionSource[] = [];

    // 1. Search internal knowledge base
    const internalSources = this.gatherInternal(missionId, topic);
    allSources.push(...internalSources);

    // 2. Web search via Brave
    if (this.braveSearch?.isEnabled()) {
      for (const query of [topic, ...subQuestions.slice(0, 3)]) {
        if (allSources.length >= maxSources) break;
        try {
          await this.sleep(this.config.gatherDelayMs);
          const results = await this.braveSearch.search(query, 5);
          for (const result of results) {
            if (allSources.length >= maxSources) break;
            // Skip duplicates
            if (allSources.some(s => s.url === result.url)) continue;

            let content = result.description;
            // Try to extract full content: Jina → Playwright → Firecrawl
            if (result.url) {
              let extracted: { content: string } | null = null;
              // 1. Jina Reader (fast, free, no JS rendering)
              if (!extracted && this.jinaReader) {
                try {
                  await this.sleep(1000);
                  extracted = await this.jinaReader.extract(result.url);
                } catch { /* fallback to next */ }
              }
              // 2. Playwright (local, JS rendering)
              if (!extracted && this.playwrightAdapter) {
                try {
                  extracted = await this.playwrightAdapter.extract(result.url);
                } catch { /* fallback to next */ }
              }
              // 3. Firecrawl (cloud, LLM-ready)
              if (!extracted && this.firecrawlAdapter?.isEnabled()) {
                try {
                  extracted = await this.firecrawlAdapter.scrape(result.url);
                } catch { /* use description as final fallback */ }
              }
              if (extracted) {
                content = extracted.content.substring(0, 5000); // Limit to 5KB per source
              }
            }

            const source: MissionSource = {
              missionId,
              url: result.url,
              title: result.title,
              content,
              sourceType: 'web',
              relevance: result.relevanceScore,
              fetchedAt: new Date().toISOString(),
            };
            this.stmtInsertSource.run(missionId, source.url, source.title, source.content, source.sourceType, source.relevance);
            allSources.push(source);
          }
        } catch (err) {
          this.log.debug(`[missions] Gather error for "${query}": ${(err as Error).message}`);
        }
      }
    }

    this.completePhase(phaseId, `Gathered ${allSources.length} sources`);
    return allSources;
  }

  private gatherInternal(missionId: number, topic: string): MissionSource[] {
    const sources: MissionSource[] = [];
    const keywords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // Search principles
    if (this.knowledgeDistiller) {
      try {
        const principles = this.knowledgeDistiller.getPrinciples(undefined, 100);
        for (const p of principles) {
          const text = ((p as unknown as Record<string, unknown>).text ?? (p as unknown as Record<string, unknown>).content ?? '') as string;
          const matches = keywords.filter(k => text.toLowerCase().includes(k)).length;
          if (matches > 0) {
            const source: MissionSource = {
              missionId,
              url: '',
              title: `Principle: ${text.substring(0, 80)}`,
              content: text,
              sourceType: 'database',
              relevance: matches / keywords.length,
              fetchedAt: new Date().toISOString(),
            };
            this.stmtInsertSource.run(missionId, '', source.title, source.content, 'database', source.relevance);
            sources.push(source);
          }
        }
      } catch { /* ignore */ }
    }

    // Search journal
    if (this.journal) {
      try {
        const entries = this.journal.getEntries(undefined, 100) as unknown as Array<Record<string, unknown>>;
        for (const e of entries) {
          const title = (e.title ?? '') as string;
          const content = (e.content ?? '') as string;
          const combined = `${title} ${content}`.toLowerCase();
          const matches = keywords.filter(k => combined.includes(k)).length;
          if (matches > 0) {
            const source: MissionSource = {
              missionId,
              url: '',
              title: `Journal: ${title.substring(0, 80)}`,
              content: content.substring(0, 2000),
              sourceType: 'journal',
              relevance: matches / keywords.length,
              fetchedAt: new Date().toISOString(),
            };
            this.stmtInsertSource.run(missionId, '', source.title, source.content, 'journal', source.relevance);
            sources.push(source);
          }
        }
      } catch { /* ignore */ }
    }

    return sources.slice(0, 5); // Max 5 internal sources
  }

  // ── Phase 3: Hypothesize ────────────────────────────

  private async phaseHypothesize(missionId: number, topic: string, sources: MissionSource[]): Promise<void> {
    const phaseId = this.startPhase(missionId, 'hypothesize');
    this.thoughtStream?.emit('mission_engine', 'analyzing', `Forming hypotheses about: "${topic}"`, 'routine');

    const sourceContext = sources.slice(0, 10).map(s => `[${s.title}]: ${s.content.substring(0, 300)}`).join('\n\n');

    if (this.llm?.isAvailable()) {
      const response = await this.llm.call('creative_hypothesis', [
        `Based on these research sources about "${topic}", generate 3 testable hypotheses.`,
        '',
        sourceContext,
        '',
        'Return a JSON array of objects: [{"hypothesis": "...", "evidence": "...", "testable_via": "..."}]',
      ].join('\n'), { maxTokens: 1024 });

      if (response?.text) {
        this.completePhase(phaseId, response.text);
        // Store hypotheses if engine available
        if (this.hypothesisEngine) {
          try {
            const parsed = JSON.parse(response.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim());
            if (Array.isArray(parsed)) {
              for (const h of parsed.slice(0, 3)) {
                this.hypothesisEngine.propose({
                  statement: h.hypothesis ?? h.title ?? String(h),
                  type: 'creative',
                  source: `mission:${missionId}`,
                  variables: [],
                  condition: { type: 'correlation', params: { strategy: 'mission', topic } },
                });
              }
            }
          } catch { /* hypothesis text stored in phase result */ }
        }
        return;
      }
    }

    // Heuristic: create simple hypotheses from source titles
    const hypotheses = sources.slice(0, 3).map(s => `Based on "${s.title}": ${topic} may be influenced by ${s.title.split(':').pop()?.trim() ?? 'this factor'}`);
    this.completePhase(phaseId, JSON.stringify(hypotheses));
  }

  // ── Phase 4: Analyze ────────────────────────────────

  private async phaseAnalyze(missionId: number, topic: string, sources: MissionSource[]): Promise<void> {
    const phaseId = this.startPhase(missionId, 'analyze');
    this.thoughtStream?.emit('mission_engine', 'analyzing', `Analyzing evidence for: "${topic}"`, 'routine');

    const sourceContext = sources.slice(0, 8).map(s => `[${s.sourceType}] ${s.title}: ${s.content.substring(0, 200)}`).join('\n');

    if (this.llm?.isAvailable()) {
      const response = await this.llm.call('analyze_contradiction', [
        `Analyze the evidence gathered about "${topic}":`,
        '',
        sourceContext,
        '',
        'Identify: 1) Consistent findings across sources, 2) Contradictions or gaps, 3) Strength of evidence (strong/moderate/weak)',
      ].join('\n'), { maxTokens: 1024 });

      if (response?.text) {
        this.completePhase(phaseId, response.text);
        return;
      }
    }

    // Heuristic analysis: count source types and average relevance
    const byType: Record<string, number> = {};
    let totalRelevance = 0;
    for (const s of sources) {
      byType[s.sourceType] = (byType[s.sourceType] ?? 0) + 1;
      totalRelevance += s.relevance;
    }
    const avgRelevance = sources.length > 0 ? totalRelevance / sources.length : 0;
    const analysis = `Sources: ${sources.length} (${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(', ')}). Average relevance: ${(avgRelevance * 100).toFixed(0)}%.`;
    this.completePhase(phaseId, analysis);
  }

  // ── Phase 5: Synthesize ─────────────────────────────

  private async phaseSynthesize(missionId: number, topic: string, subQuestions: string[], sources: MissionSource[]): Promise<string> {
    const phaseId = this.startPhase(missionId, 'synthesize');
    this.thoughtStream?.emit('mission_engine', 'discovering', `Synthesizing report for: "${topic}"`, 'notable');

    const sourceContext = sources
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 12)
      .map((s, i) => `[Source ${i + 1}: ${s.title}] ${s.content.substring(0, 400)}`)
      .join('\n\n');

    if (this.llm?.isAvailable()) {
      const response = await this.llm.call('summarize', [
        `Create a comprehensive research report about: "${topic}"`,
        '',
        `Sub-questions investigated: ${subQuestions.join('; ')}`,
        '',
        'Sources:',
        sourceContext,
        '',
        'Write a structured report with:',
        '1. Executive Summary (2-3 sentences)',
        '2. Key Findings (bullet points)',
        '3. Evidence Assessment (strong/moderate/weak for each finding)',
        '4. Gaps & Limitations',
        '5. Conclusions & Recommendations',
        `Use plain text, no markdown headers. Cite sources by number [Source N].`,
      ].join('\n'), { maxTokens: 2048 });

      if (response?.text) {
        this.completePhase(phaseId, 'Report generated via LLM');
        return response.text;
      }
    }

    // Heuristic report
    const report = this.heuristicReport(topic, subQuestions, sources);
    this.completePhase(phaseId, 'Report generated via heuristic');
    return report;
  }

  private heuristicReport(topic: string, subQuestions: string[], sources: MissionSource[]): string {
    const lines: string[] = [];
    lines.push(`Research Report: ${topic}`);
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    lines.push('EXECUTIVE SUMMARY');
    lines.push(`This report investigates "${topic}" using ${sources.length} sources (${sources.filter(s => s.sourceType === 'web').length} web, ${sources.filter(s => s.sourceType !== 'web').length} internal).`);
    lines.push('');

    lines.push('SUB-QUESTIONS INVESTIGATED');
    for (const q of subQuestions) {
      lines.push(`- ${q}`);
    }
    lines.push('');

    lines.push('KEY FINDINGS');
    const topSources = sources.sort((a, b) => b.relevance - a.relevance).slice(0, 8);
    for (const s of topSources) {
      lines.push(`- [${s.sourceType}] ${s.title}`);
      lines.push(`  ${s.content.substring(0, 200).replace(/\n/g, ' ')}`);
      lines.push('');
    }

    lines.push('EVIDENCE ASSESSMENT');
    const avgRelevance = sources.length > 0 ? sources.reduce((s, x) => s + x.relevance, 0) / sources.length : 0;
    lines.push(`Average source relevance: ${(avgRelevance * 100).toFixed(0)}% — ${avgRelevance > 0.6 ? 'Strong' : avgRelevance > 0.3 ? 'Moderate' : 'Weak'} evidence base.`);
    lines.push('');

    lines.push('GAPS & LIMITATIONS');
    if (sources.filter(s => s.sourceType === 'web').length === 0) {
      lines.push('- No web sources available (Brave Search API key not set)');
    }
    if (sources.length < 5) {
      lines.push('- Limited source count — deeper research recommended');
    }
    lines.push('');

    lines.push('CONCLUSIONS');
    lines.push(`Based on ${sources.length} sources, the research provides a ${avgRelevance > 0.5 ? 'solid' : 'preliminary'} overview of "${topic}".`);

    return lines.join('\n');
  }

  // ── Helpers ─────────────────────────────────────────

  private updateMissionStatus(id: number, status: MissionStatus): void {
    this.db.prepare('UPDATE research_missions SET status=? WHERE id=?').run(status, id);
  }

  private startPhase(missionId: number, phase: string): number {
    const row = this.db.prepare('SELECT id FROM mission_phases WHERE mission_id=? AND phase=?').get(missionId, phase) as { id: number } | undefined;
    if (!row) return 0;
    this.stmtUpdatePhase.run('running', null, new Date().toISOString(), null, row.id);
    return row.id;
  }

  private completePhase(phaseId: number, result: string): void {
    if (phaseId === 0) return;
    this.stmtUpdatePhase.run('complete', result, null, new Date().toISOString(), phaseId);
  }

  private rowToMission(row: Record<string, unknown>): Mission {
    return {
      id: row.id as number,
      topic: row.topic as string,
      depth: row.depth as MissionDepth,
      status: row.status as MissionStatus,
      subQuestions: JSON.parse((row.sub_questions as string) || '[]'),
      report: (row.report as string) ?? null,
      sourceCount: (row.source_count as number) ?? 0,
      createdAt: row.created_at as string,
      completedAt: (row.completed_at as string) ?? null,
      error: (row.error as string) ?? null,
    };
  }

  private rowToPhase(row: Record<string, unknown>): MissionPhase {
    return {
      id: row.id as number,
      missionId: row.mission_id as number,
      phase: row.phase as string,
      status: row.status as 'pending' | 'running' | 'complete' | 'failed',
      result: (row.result as string) ?? null,
      startedAt: (row.started_at as string) ?? null,
      completedAt: (row.completed_at as string) ?? null,
    };
  }

  private rowToSource(row: Record<string, unknown>): MissionSource {
    return {
      id: row.id as number,
      missionId: row.mission_id as number,
      url: row.url as string,
      title: row.title as string,
      content: row.content as string,
      sourceType: row.source_type as 'web' | 'database' | 'journal' | 'hypothesis',
      relevance: row.relevance as number,
      fetchedAt: row.fetched_at as string,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
