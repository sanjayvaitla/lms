import { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';

export async function stats(_req: Request, res: Response) {
  const data = await dashboardService.getDashboardStats();
  res.json({ success: true, data });
}
