import { ActivityLog } from '../models/ActivityLog';

interface ActivityLogParams {
  userId?: string; // Optional if not logged in
  actionType: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  metadata?: any;
}

export class ActivityLoggerService {
  /**
   * Log an activity asynchronously to avoid blocking the main thread.
   */
  static log(params: ActivityLogParams): void {
    // Fire and forget
    ActivityLog.create({
      userId: params.userId,
      actionType: params.actionType,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      ipAddress: params.ipAddress,
      metadata: params.metadata || {},
    }).catch((error) => {
      console.error('Failed to log activity:', error);
    });
  }
}
