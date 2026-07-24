import { Request, Response, NextFunction } from 'express';
import { ActivityLoggerService } from '../services/ActivityLoggerService';

export const trackActivity = (actionType: string, resourceType?: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // We execute this immediately, without awaiting, so the request continues smoothly.
    
    // Attempt to get user ID if authentication middleware has already run
    const userId = (req as any).user?.id || undefined;
    
    // The resource ID is typically in req.params.id, but could be in a different param
    const resourceId = req.params.id || req.params.courseId || req.params.batchId || undefined;

    const forwardedFor = req.headers['x-forwarded-for'];
    const ipAddress = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || req.socket.remoteAddress || '';

    ActivityLoggerService.log({
      userId,
      actionType,
      resourceType,
      resourceId: resourceId as string | undefined,
      ipAddress,
      metadata: {
        method: req.method,
        path: req.originalUrl,
        query: req.query,
      }
    });

    next();
  };
};
