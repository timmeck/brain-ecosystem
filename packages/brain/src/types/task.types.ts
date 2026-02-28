export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';

export interface TaskRecord {
  id: number;
  project_id: number | null;
  session_id: number | null;
  parent_task_id: number | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;               // 1-10
  due_date: string | null;
  completed_at: string | null;
  blocked_by: string | null;      // JSON array of task IDs
  tags: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  embedding: Buffer | null;
}

export interface AddTaskInput {
  title: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  tags?: string[];
  parentTaskId?: number;
  blockedBy?: number[];
  project?: string;
  projectId?: number;
  sessionId?: number;
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  title?: string;
  description?: string;
  priority?: number;
  dueDate?: string;
  notes?: string;
  tags?: string[];
  blockedBy?: number[];
}

export interface ListTasksInput {
  projectId?: number;
  status?: TaskStatus;
  parentTaskId?: number;
  limit?: number;
}
