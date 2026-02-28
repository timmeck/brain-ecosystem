import type { TaskRepository } from '../db/repositories/task.repository.js';
import type { MemoryRepository } from '../db/repositories/memory.repository.js';
import type { DecisionRepository } from '../db/repositories/decision.repository.js';
import type { ChangelogRepository } from '../db/repositories/changelog.repository.js';
import type { ProjectRepository } from '../db/repositories/project.repository.js';
import type { SynapseManager } from '../synapses/synapse-manager.js';
import type { TaskRecord, AddTaskInput, UpdateTaskInput, ListTasksInput } from '../types/task.types.js';
import { getEventBus } from '../utils/events.js';
import { getLogger } from '../utils/logger.js';

export class TaskService {
  private logger = getLogger();

  constructor(
    private taskRepo: TaskRepository,
    private memoryRepo: MemoryRepository,
    private decisionRepo: DecisionRepository,
    private changelogRepo: ChangelogRepository,
    private projectRepo: ProjectRepository,
    private synapseManager: SynapseManager,
  ) {}

  addTask(input: AddTaskInput & { project?: string }): { taskId: number } {
    const bus = getEventBus();

    let projectId = input.projectId ?? null;
    if (!projectId && input.project) {
      const project = this.projectRepo.findByName(input.project);
      if (project) projectId = project.id;
    }

    const taskId = this.taskRepo.create({
      project_id: projectId,
      session_id: input.sessionId ?? null,
      parent_task_id: input.parentTaskId ?? null,
      title: input.title,
      description: input.description ?? null,
      status: 'pending',
      priority: input.priority ?? 5,
      due_date: input.dueDate ?? null,
      completed_at: null,
      blocked_by: input.blockedBy ? JSON.stringify(input.blockedBy) : null,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      notes: null,
      embedding: null,
    });

    if (projectId) {
      this.synapseManager.strengthen(
        { type: 'task', id: taskId },
        { type: 'project', id: projectId },
        'co_occurs',
      );
    }

    bus.emit('task:created', { taskId, projectId });
    this.logger.info(`Task #${taskId} created: ${input.title}`);
    return { taskId };
  }

  updateTask(id: number, input: UpdateTaskInput & { note?: string }): TaskRecord | undefined {
    const bus = getEventBus();

    if (input.note) {
      this.taskRepo.addNote(id, input.note);
    }

    const updateData: Partial<TaskRecord> = {};
    if (input.status) updateData.status = input.status;
    if (input.title) updateData.title = input.title;
    if (input.description) updateData.description = input.description;
    if (input.priority) updateData.priority = input.priority;
    if (input.dueDate) updateData.due_date = input.dueDate;
    if (input.tags) updateData.tags = JSON.stringify(input.tags);
    if (input.blockedBy) updateData.blocked_by = JSON.stringify(input.blockedBy);
    if (input.status === 'completed') updateData.completed_at = new Date().toISOString();

    if (Object.keys(updateData).length > 0) {
      this.taskRepo.update(id, updateData);
    }

    if (input.status === 'completed') {
      bus.emit('task:completed', { taskId: id });
      this.logger.info(`Task #${id} completed`);
    }

    return this.taskRepo.getById(id);
  }

  listTasks(input: ListTasksInput = {}): TaskRecord[] {
    if (input.status) {
      return this.taskRepo.findByStatus(input.status, input.projectId, input.limit ?? 50);
    }
    if (input.parentTaskId) {
      return this.taskRepo.findSubtasks(input.parentTaskId);
    }
    return this.taskRepo.findAll(input.projectId, input.limit ?? 50);
  }

  getById(id: number): TaskRecord | undefined {
    return this.taskRepo.getById(id);
  }

  getTaskContext(id: number): {
    task: TaskRecord | undefined;
    subtasks: TaskRecord[];
    memories: unknown[];
    decisions: unknown[];
    changes: unknown[];
  } {
    const task = this.taskRepo.getById(id);
    if (!task) return { task: undefined, subtasks: [], memories: [], decisions: [], changes: [] };

    const subtasks = this.taskRepo.findSubtasks(id);

    // Get related items via synapse activation
    const activated = this.synapseManager.activate({ type: 'task', id });
    const memoryIds = activated.filter(a => a.node.type === 'memory').map(a => a.node.id);
    const decisionIds = activated.filter(a => a.node.type === 'decision').map(a => a.node.id);
    const changelogIds = activated.filter(a => a.node.type === 'changelog_entry').map(a => a.node.id);

    const memories = memoryIds.map(mid => this.memoryRepo.getById(mid)).filter(Boolean);
    const decisions = decisionIds.map(did => this.decisionRepo.getById(did)).filter(Boolean);
    const changes = changelogIds.map(cid => this.changelogRepo.getById(cid)).filter(Boolean);

    return { task, subtasks, memories, decisions, changes };
  }

  searchTasks(query: string, limit?: number): TaskRecord[] {
    try {
      return this.taskRepo.search(query, limit ?? 20);
    } catch {
      return [];
    }
  }
}
