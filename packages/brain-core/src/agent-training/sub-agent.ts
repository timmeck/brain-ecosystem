import type Database from 'better-sqlite3';
import { getLogger } from '../utils/logger.js';

// ── Types ──────────────────────────────────────────────────

export interface SubAgentConfig {
  name: string;
  specialization: string;
  description: string;
  systemPrompt: string;
  tools: string[];
  maxConcurrent?: number;
}

export interface SubAgentTask {
  id: string;
  agentId: number;
  input: string;
  output: string | null;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
  createdAt: number;
}

export interface SubAgentStatus {
  id: number;
  name: string;
  specialization: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgDurationMs: number;
  lastRunAt: string | null;
}

type TaskExecutor = (input: string, systemPrompt: string, tools: string[]) => Promise<string>;

// ── Migration ──────────────────────────────────────────────

export function runSubAgentMigration(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sub_agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      specialization TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      tools TEXT NOT NULL DEFAULT '[]',
      max_concurrent INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sub_agent_tasks (
      id TEXT PRIMARY KEY,
      agent_id INTEGER NOT NULL,
      input TEXT NOT NULL,
      output TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      started_at INTEGER,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES sub_agents(id)
    );
    CREATE INDEX IF NOT EXISTS idx_sat_agent ON sub_agent_tasks(agent_id);
    CREATE INDEX IF NOT EXISTS idx_sat_status ON sub_agent_tasks(status);
  `);
}

// ── SubAgent ──────────────────────────────────────────────

const log = getLogger();

export class SubAgent {
  readonly id: number;
  readonly config: SubAgentConfig;
  private readonly db: Database.Database;
  private executor: TaskExecutor | null = null;

  private readonly stmtInsertTask;
  private readonly stmtUpdateTask;
  private readonly stmtGetTasks;
  private readonly stmtCountTasks;

  constructor(db: Database.Database, id: number, config: SubAgentConfig) {
    this.db = db;
    this.id = id;
    this.config = config;

    this.stmtInsertTask = db.prepare(`INSERT INTO sub_agent_tasks (id, agent_id, input, status, created_at) VALUES (?, ?, ?, 'pending', ?)`);
    this.stmtUpdateTask = db.prepare(`UPDATE sub_agent_tasks SET status = ?, output = ?, error = ?, started_at = COALESCE(started_at, ?), completed_at = ? WHERE id = ?`);
    this.stmtGetTasks = db.prepare(`SELECT * FROM sub_agent_tasks WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?`);
    this.stmtCountTasks = db.prepare(`SELECT status, COUNT(*) as count FROM sub_agent_tasks WHERE agent_id = ? GROUP BY status`);
  }

  setExecutor(executor: TaskExecutor): void {
    this.executor = executor;
  }

  /** Submit a task to this agent */
  submit(input: string): string {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    this.stmtInsertTask.run(taskId, this.id, input, Date.now());
    log.info(`[sub-agent:${this.config.name}] Task submitted: ${taskId}`);
    return taskId;
  }

  /** Run a specific task */
  async run(taskId: string): Promise<SubAgentTask> {
    if (!this.executor) throw new Error(`No executor set for agent "${this.config.name}"`);

    this.stmtUpdateTask.run('running', null, null, Date.now(), null, taskId);

    try {
      const output = await this.executor(
        this.getTaskInput(taskId),
        this.config.systemPrompt,
        this.config.tools,
      );
      this.stmtUpdateTask.run('completed', output, null, null, Date.now(), taskId);
      log.info(`[sub-agent:${this.config.name}] Task completed: ${taskId}`);
      return this.getTask(taskId)!;
    } catch (err) {
      const error = (err as Error).message;
      this.stmtUpdateTask.run('failed', null, error, null, Date.now(), taskId);
      log.warn(`[sub-agent:${this.config.name}] Task failed: ${taskId} — ${error}`);
      return this.getTask(taskId)!;
    }
  }

  /** Submit and immediately run */
  async execute(input: string): Promise<SubAgentTask> {
    const taskId = this.submit(input);
    return this.run(taskId);
  }

  /** Get task history */
  getTasks(limit = 20): SubAgentTask[] {
    const rows = this.stmtGetTasks.all(this.id, limit) as RawTask[];
    return rows.map(deserializeTask);
  }

  /** Get status */
  getStatus(): SubAgentStatus {
    const counts = this.stmtCountTasks.all(this.id) as { status: string; count: number }[];
    const statusMap: Record<string, number> = {};
    for (const row of counts) statusMap[row.status] = row.count;

    const tasks = this.getTasks(100);
    const completed = tasks.filter(t => t.status === 'completed');
    const avgDuration = completed.length > 0
      ? completed.reduce((sum, t) => sum + ((t.completedAt ?? 0) - (t.startedAt ?? 0)), 0) / completed.length
      : 0;

    return {
      id: this.id,
      name: this.config.name,
      specialization: this.config.specialization,
      totalTasks: Object.values(statusMap).reduce((a, b) => a + b, 0),
      completedTasks: statusMap['completed'] ?? 0,
      failedTasks: statusMap['failed'] ?? 0,
      avgDurationMs: Math.round(avgDuration),
      lastRunAt: completed.length > 0 ? new Date(completed[0].completedAt!).toISOString() : null,
    };
  }

  private getTaskInput(taskId: string): string {
    const row = this.db.prepare(`SELECT input FROM sub_agent_tasks WHERE id = ?`).get(taskId) as { input: string } | undefined;
    if (!row) throw new Error(`Task ${taskId} not found`);
    return row.input;
  }

  private getTask(taskId: string): SubAgentTask | null {
    const row = this.db.prepare(`SELECT * FROM sub_agent_tasks WHERE id = ?`).get(taskId) as RawTask | undefined;
    return row ? deserializeTask(row) : null;
  }
}

// ── Helpers ──────────────────────────────────────────────────

interface RawTask {
  id: string;
  agent_id: number;
  input: string;
  output: string | null;
  status: string;
  error: string | null;
  started_at: number | null;
  completed_at: number | null;
  created_at: number;
}

function deserializeTask(row: RawTask): SubAgentTask {
  return {
    id: row.id,
    agentId: row.agent_id,
    input: row.input,
    output: row.output,
    status: row.status as SubAgentTask['status'],
    error: row.error,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}
