import { Request, Response } from 'express';
import { ActivityLog } from '../models/ActivityLog';
import sequelize from '../lib/sequelize';
import { Op } from 'sequelize';
import { AppError } from '../middleware/error.middleware';
import { User } from '../models/User';

export async function getDashboardStats(req: Request, res: Response) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can access analytics', 403, 'FORBIDDEN');
  }

  // Raw query for popular resources grouped by student vs staff
  const popularResourcesQuery = `
    SELECT 
      a."resourceType", 
      u.role,
      COUNT(a.id) as views
    FROM "ActivityLogs" a
    JOIN users u ON a."userId" = u.id
    WHERE a."resourceType" IS NOT NULL
    GROUP BY a."resourceType", u.role
    ORDER BY views DESC
  `;
  const [popularResourcesRaw] = await sequelize.query(popularResourcesQuery);

  // Separate them
  const studentResources = popularResourcesRaw.filter((r: any) => r.role === 'STUDENT');
  const staffResources = popularResourcesRaw.filter((r: any) => r.role !== 'STUDENT');

  // Recent Logins
  const recentLogins = await ActivityLog.findAll({
    where: { actionType: 'LOGIN' },
    order: [['createdAt', 'DESC']],
    limit: 50,
    include: [{ association: 'user', attributes: ['id', 'name', 'email', 'role'] }]
  });

  // Summary
  const summary = await ActivityLog.findAll({
    attributes: [
      'actionType',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count']
    ],
    group: ['actionType'],
    raw: true
  });

  res.json({
    success: true,
    data: {
      studentResources,
      staffResources,
      recentLogins,
      summary
    }
  });
}

function parseUserAgent(ua: string) {
  let browser = 'Unknown';
  let os = 'Unknown';

  if (!ua) return { browser, os };

  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'Mac OS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  return { browser, os };
}

export async function logActivity(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

  // Support batched events in an array, fallback to a single event wrapper if frontend hasn't updated yet
  const events = req.body.events || [req.body];
  if (!Array.isArray(events) || events.length === 0) {
    throw new AppError('Invalid payload', 400, 'VALIDATION_ERROR');
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const ipAddress = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || req.socket.remoteAddress || '';

  const recordsToInsert = events.filter(e => e.actionType).map(e => {
    let finalMetadata = e.metadata || {};
    if (finalMetadata.userAgent) {
      const parsed = parseUserAgent(finalMetadata.userAgent);
      finalMetadata = { ...finalMetadata, ...parsed };
    }

    return {
      userId: req.user!.userId || (req.user as any).id,
      actionType: e.actionType,
      resourceType: e.resourceType || null,
      resourceId: e.resourceId || null,
      ipAddress,
      metadata: finalMetadata,
      createdAt: e.timestamp ? new Date(e.timestamp) : new Date()
    };
  });

  if (recordsToInsert.length > 0) {
    await ActivityLog.bulkCreate(recordsToInsert);
  }

  res.json({ success: true, message: 'Activities logged' });
}

export async function getUserTimeline(req: Request, res: Response) {
  if (!req.user || req.user.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can access analytics', 403, 'FORBIDDEN');
  }

  const { userId } = req.params;

  const logs = await ActivityLog.findAll({
    where: { userId },
    order: [['createdAt', 'ASC']],
    raw: true
  });

  // Calculate session times (time spent on a page)
  const timeline = [];
  for (let i = 0; i < logs.length; i++) {
    const current = logs[i];
    const next = logs[i + 1];

    if (current.actionType === 'SESSION_END' || current.actionType === 'TAB_CLOSED') {
      timeline.push({ ...current, durationMs: 0, durationFormatted: 'Session Ended' });
      continue;
    }

    let durationMs = 0;
    if (next) {
      durationMs = new Date(next.createdAt).getTime() - new Date(current.createdAt).getTime();
      
      // If the next event is a session end, we trust the duration up to 2 hours
      if (next.actionType === 'SESSION_END' || next.actionType === 'TAB_CLOSED') {
        if (durationMs > 7200000) durationMs = 7200000;
      } else {
        // Normal actions cap at 30 minutes
        if (durationMs > 1800000) durationMs = 1800000; 
      }
    } else {
      // If it's the last log, we don't know duration, assume a small default or 0
      durationMs = 60000; // Assume 1 minute for the last action
    }

    // Convert to readable minutes and seconds
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    const durationFormatted = `${minutes}m ${seconds}s`;

    timeline.push({
      ...current,
      durationMs,
      durationFormatted
    });
  }

  // Reverse timeline so newest is first
  res.json({
    success: true,
    data: timeline.reverse()
  });
}
