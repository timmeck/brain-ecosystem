import type { NotificationRepository, NotificationRecord } from '../db/repositories/notification.repository.js';
import { getLogger } from '../utils/logger.js';

export interface CreateNotificationInput {
  type: string;
  title: string;
  message: string;
  priority?: number;
  projectId?: number;
}

export class NotificationService {
  private logger = getLogger();

  constructor(private notificationRepo: NotificationRepository) {}

  create(input: CreateNotificationInput): number {
    const id = this.notificationRepo.create({
      type: input.type,
      title: input.title,
      message: input.message,
      priority: input.priority ?? 0,
      project_id: input.projectId ?? null,
    });

    this.logger.info(`Notification created (id=${id}, type=${input.type})`);
    return id;
  }

  list(projectId?: number): NotificationRecord[] {
    return this.notificationRepo.findUnacknowledged(projectId);
  }

  acknowledge(id: number): void {
    this.notificationRepo.acknowledge(id);
  }

  getById(id: number): NotificationRecord | undefined {
    return this.notificationRepo.getById(id);
  }
}
