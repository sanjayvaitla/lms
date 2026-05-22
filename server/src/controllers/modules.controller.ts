import { Request, Response } from 'express';
import * as svc from '../services/modules.service';
import { createModuleSchema, updateModuleSchema } from '../validators/module.validator';
import { AppError } from '../middleware/error.middleware';

export async function list(req: Request, res: Response) {
  const modules = await svc.listModules(String(req.params.courseId));
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

export async function complete(req: Request, res: Response) {
  const modules = await svc.completeModule(String(req.params.id), req.user!.userId);
  res.json({ success: true, data: modules, message: 'Module completed — quiz released for learners' });
}

export async function remove(req: Request, res: Response) {
  await svc.deleteModule(String(req.params.id));
  res.json({ success: true, message: 'Module deleted' });
}
