import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { AppError } from '../middleware/error.middleware';
import { getCached } from '../lib/redis';

export async function stats(_req: Request, res: Response) {
  // Cache the admin dashboard stats for 5 minutes (300 seconds)
  const data = await getCached('admin_dashboard_stats', 300, () => dashboardService.getDashboardStats());
  res.json({ success: true, data });
}

export async function studentStats(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  // Cache the student dashboard stats for 5 minutes (300 seconds)
  const data = await getCached(`student_dashboard_stats_${req.user.userId}`, 60, () => dashboardService.getStudentDashboard(req.user!.userId));
  res.json({ success: true, data });
}
