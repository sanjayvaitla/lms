import { Request, Response } from 'express';
import * as cleanupService from '../services/cleanup.service';

export async function systemHealth(_req: Request, res: Response) {
  const health = await cleanupService.systemHealthCheck();
  const status = health.storage.ok && health.database.ok ? 200 : 503;
  res.status(status).json({ success: true, data: health });
}

export async function storageStats(_req: Request, res: Response) {
  const stats = await cleanupService.getStorageStats();
  res.json({ success: true, data: stats });
}

export async function fileIntegrity(_req: Request, res: Response) {
  const integrity = await cleanupService.validateFileIntegrity();
  res.json({ success: true, data: integrity });
}

export async function cleanupOrphaned(_req: Request, res: Response) {
  const result = await cleanupService.cleanupOrphanedRecords();
  res.json({ success: true, data: result });
}