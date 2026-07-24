import { Request, Response } from 'express';
import * as svc from '../services/modules.service';
import { createModuleSchema, updateModuleSchema, createSubSessionSchema } from '../validators/module.validator';
import { AppError } from '../middleware/error.middleware';
import { invalidateContentMasterBatch } from '../lib/contentMasterCache';

function parseBatchId(req: Request): string | undefined {
  const fromBody = (req.body as { batchId?: string })?.batchId;
  const fromQuery = req.query.batchId;
  if (fromBody) return fromBody;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  return undefined;
}

export async function list(req: Request, res: Response) {
  const courseId = String(req.params.courseId);
  const batchId = parseBatchId(req);
  if (batchId) {
    try {
      const modules = await svc.listModulesForBatch(batchId, courseId);
      return res.json({ success: true, data: modules });
    } catch (err) {
      console.warn('[modules.list] batch-scoped list failed, falling back to course modules:', err);
    }
  }
  const modules = await svc.listModules(courseId);
  res.json({ success: true, data: modules });
}

export async function create(req: Request, res: Response) {
  const parsed = createModuleSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const mod = await svc.createModule(String(req.params.courseId), parsed.data);
  res.status(201).json({ success: true, data: mod });
}

export async function update(req: Request, res: Response) {
  const parsed = updateModuleSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const mod = await svc.updateModule(String(req.params.id), parsed.data);
  res.json({ success: true, data: mod });
}

export async function createSubSession(req: Request, res: Response) {
  const parsed = createSubSessionSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const modules = await svc.createSubSession(String(req.params.courseId), parsed.data);
  res.status(201).json({ success: true, data: modules, message: 'Sub-session created' });
}

export async function complete(req: Request, res: Response) {
  const batchId = parseBatchId(req);
  const result = await svc.completeModule(String(req.params.id), req.user!.userId, batchId);
  if (batchId) void invalidateContentMasterBatch(batchId);
  const parts: string[] = ['Session completed'];
  if (result.releasedAssignmentIds.length) {
    parts.push(`${result.releasedAssignmentIds.length} assignment(s) released`);
  }
  if (result.releasedQuizIds.length) {
    parts.push(`${result.releasedQuizIds.length} quiz(zes) activated`);
  }
  parts.push('students notified');
  res.json({
    success: true,
    data: result.modules,
    releasedAssignmentIds: result.releasedAssignmentIds,
    releasedQuizIds: result.releasedQuizIds,
    message: parts.join(' — '),
  });
}

export async function release(req: Request, res: Response) {
  const batchId = parseBatchId(req);
  const mod = await svc.releaseModule(String(req.params.id), batchId);
  if (batchId) void invalidateContentMasterBatch(batchId);
  res.json({ success: true, data: mod, message: 'Session released - students can now access it' });
}

export async function lock(req: Request, res: Response) {
  const batchId = parseBatchId(req);
  const mod = await svc.lockModule(String(req.params.id), batchId);
  if (batchId) void invalidateContentMasterBatch(batchId);
  res.json({ success: true, data: mod, message: 'Session locked' });
}

export async function uncomplete(req: Request, res: Response) {
  const batchId = parseBatchId(req);
  const modules = await svc.uncompleteModule(String(req.params.id), batchId);
  if (batchId) void invalidateContentMasterBatch(batchId);
  res.json({ success: true, data: modules, message: 'Session reverted to Released — student progress recalculated' });
}

export async function remove(req: Request, res: Response) {
  await svc.deleteModule(String(req.params.id));
  res.json({ success: true, message: 'Module deleted' });
}
