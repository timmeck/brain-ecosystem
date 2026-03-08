import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';
import { SubAgent, runSubAgentMigration } from './sub-agent.js';
import type { SubAgentConfig, SubAgentStatus } from './sub-agent.js';

// ── Types ──────────────────────────────────────────────────

export interface SubAgentFactoryStatus {
  totalAgents: number;
  agents: SubAgentStatus[];
}

type TaskExecutor = (input: string, systemPrompt: string, tools: string[]) => Promise<string>;

// ── Preset Templates ──────────────────────────────────────

const PRESETS: Record<string, Omit<SubAgentConfig, 'name'>> = {
  'crypto-analyst': {
    specialization: 'cryptocurrency',
    description: 'Analyzes crypto markets, trends, and trading signals',
    systemPrompt: 'You are a crypto market analyst. Analyze the given data and provide actionable insights about market trends, price movements, and trading signals.',
    tools: ['market.data', 'signal.cross.status', 'paper.status'],
  },
  'content-writer': {
    specialization: 'content',
    description: 'Writes and optimizes social media content',
    systemPrompt: 'You are a content strategist. Create engaging, informative social media posts about the given topics. Focus on clarity, engagement, and value.',
    tools: ['content.generate', 'content.best', 'insight.list'],
  },
  'code-reviewer': {
    specialization: 'code',
    description: 'Reviews code patterns and suggests improvements',
    systemPrompt: 'You are a senior code reviewer. Analyze the given code patterns, identify issues, and suggest improvements based on best practices.',
    tools: ['codeforge.patterns', 'codeforge.products', 'code.health'],
  },
  'research-agent': {
    specialization: 'research',
    description: 'Conducts deep research on given topics',
    systemPrompt: 'You are a research agent. Investigate the given topic thoroughly, gather evidence, form hypotheses, and synthesize findings.',
    tools: ['insight.list', 'memory.query', 'knowledge.search'],
  },
};

// ── Factory ──────────────────────────────────────────────

const log = getLogger();

export class SubAgentFactory {
  private readonly db: Database.Database;
  private readonly agents = new Map<string, SubAgent>();
  private executor: TaskExecutor | null = null;

  private readonly stmtInsert;
  private readonly stmtGetByName;
  private readonly stmtGetAll;
  private readonly stmtDelete;

  constructor(db: Database.Database) {
    this.db = db;
    runSubAgentMigration(db);

    this.stmtInsert = db.prepare(`INSERT INTO sub_agents (name, specialization, description, system_prompt, tools, max_concurrent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    this.stmtGetByName = db.prepare(`SELECT * FROM sub_agents WHERE name = ?`);
    this.stmtGetAll = db.prepare(`SELECT * FROM sub_agents ORDER BY created_at ASC`);
    this.stmtDelete = db.prepare(`DELETE FROM sub_agents WHERE name = ?`);

    // Load existing agents from DB
    this.loadFromDb();
  }

  /** Set the executor used to run all sub-agent tasks */
  setExecutor(executor: TaskExecutor): void {
    this.executor = executor;
    for (const agent of this.agents.values()) {
      agent.setExecutor(executor);
    }
  }

  /** Create a new sub-agent from config */
  create(config: SubAgentConfig): SubAgent {
    if (this.agents.has(config.name)) {
      throw new Error(`Agent "${config.name}" already exists`);
    }

    const result = this.stmtInsert.run(
      config.name,
      config.specialization,
      config.description,
      config.systemPrompt,
      JSON.stringify(config.tools),
      config.maxConcurrent ?? 1,
      Date.now(),
    );

    const agent = new SubAgent(this.db, Number(result.lastInsertRowid), config);
    if (this.executor) agent.setExecutor(this.executor);
    this.agents.set(config.name, agent);

    log.info(`[sub-agent-factory] Created agent: ${config.name} (${config.specialization})`);
    return agent;
  }

  /** Create a sub-agent from a preset template */
  createFromPreset(presetName: string, name?: string): SubAgent {
    const preset = PRESETS[presetName];
    if (!preset) {
      throw new Error(`Unknown preset: "${presetName}". Available: ${Object.keys(PRESETS).join(', ')}`);
    }
    return this.create({ name: name ?? presetName, ...preset });
  }

  /** Get a sub-agent by name */
  get(name: string): SubAgent | null {
    return this.agents.get(name) ?? null;
  }

  /** List all sub-agents */
  list(): SubAgent[] {
    return Array.from(this.agents.values());
  }

  /** Remove a sub-agent */
  remove(name: string): boolean {
    if (!this.agents.has(name)) return false;
    this.stmtDelete.run(name);
    this.agents.delete(name);
    log.info(`[sub-agent-factory] Removed agent: ${name}`);
    return true;
  }

  /** Get available preset names */
  getPresets(): string[] {
    return Object.keys(PRESETS);
  }

  /** Get factory status */
  getStatus(): SubAgentFactoryStatus {
    return {
      totalAgents: this.agents.size,
      agents: Array.from(this.agents.values()).map(a => a.getStatus()),
    };
  }

  // ── Private ──────────────────────────────────────────────

  private loadFromDb(): void {
    const rows = this.stmtGetAll.all() as RawAgent[];
    for (const row of rows) {
      const config: SubAgentConfig = {
        name: row.name,
        specialization: row.specialization,
        description: row.description,
        systemPrompt: row.system_prompt,
        tools: JSON.parse(row.tools),
        maxConcurrent: row.max_concurrent,
      };
      const agent = new SubAgent(this.db, row.id, config);
      if (this.executor) agent.setExecutor(this.executor);
      this.agents.set(row.name, agent);
    }
    if (rows.length > 0) {
      log.info(`[sub-agent-factory] Loaded ${rows.length} agents from DB`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

interface RawAgent {
  id: number;
  name: string;
  specialization: string;
  description: string;
  system_prompt: string;
  tools: string;
  max_concurrent: number;
  created_at: number;
}
