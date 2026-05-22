import { Request, Response } from 'express';
import * as svc from '../services/learners.service';

export async function list(req: Request, res: Response) {
  const { search, page, limit } = req.query;
  const result = await svc.listLearners(
    search as string | undefined,
    page  ? parseInt(page  as string) : 1,
    limit ? parseInt(limit as string) : 20,
  );
  res.json({ success: true, data: result });
}

export async function getById(req: Request, res: Response) {
  const learner = await svc.getLearner(String(req.params.id));
  res.json({ success: true, data: learner });
}

export async function create(req: Request, res: Response) {
  const learner = await svc.createLearner(req.body as { name: string; email: string; password?: string });
  res.status(201).json({ success: true, data: learner });
}

export async function update(req: Request, res: Response) {
  const learner = await svc.updateLearner(String(req.params.id), req.body as { name?: string; email?: string });
  res.json({ success: true, data: learner });
}

export async function remove(req: Request, res: Response) {
  await svc.deleteLearner(String(req.params.id));
  res.json({ success: true, message: 'Learner deleted' });
}

export async function availableBatches(req: Request, res: Response) {
  const batches = await svc.getAvailableBatches(String(req.params.id));
  res.json({ success: true, data: batches });
}

export async function assignBatch(req: Request, res: Response) {
  const { batchId } = req.body as { batchId: string };
  const result = await svc.assignBatch(String(req.params.id), batchId);
  res.status(201).json({ success: true, data: result });
}

export async function removeBatch(req: Request, res: Response) {
  await svc.removeBatch(String(req.params.id), String(req.params.batchId));
  res.json({ success: true, message: 'Removed from batch' });
}

export async function dashboardStats(_req: Request, res: Response) {
  const stats = await svc.getDashboardStats();
  res.json({ success: true, data: stats });
}
