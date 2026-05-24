import { Request, Response } from 'express';
import * as svc from '../services/batches.service';
import { createBatchSchema, updateBatchSchema } from '../validators/batch.validator';
import { AppError } from '../middleware/error.middleware';

const isTrainer = (req: Request) => req.user?.role === 'TRAINER';

export async function list(req: Request, res: Response) {
  const { courseId } = req.query as { courseId?: string };
  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const batches = await svc.listBatches(courseId, trainerId);
  res.json({ success: true, data: batches });
}

export async function getById(req: Request, res: Response) {
  const batch = await svc.getBatch(String(req.params.id));
  res.json({ success: true, data: batch });
}

export async function create(req: Request, res: Response) {
  const parsed = createBatchSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const batch = await svc.createBatch(parsed.data, trainerId);
  res.status(201).json({ success: true, data: batch });
}

export async function update(req: Request, res: Response) {
  const parsed = updateBatchSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const batch = await svc.updateBatch(String(req.params.id), parsed.data, trainerId);
  res.json({ success: true, data: batch });
}

export async function archive(req: Request, res: Response) {
  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const batch = await svc.archiveBatch(String(req.params.id), trainerId);
  res.json({ success: true, data: batch });
}

export async function restore(req: Request, res: Response) {
  if (isTrainer(req)) throw new AppError('Trainers cannot restore batches', 403, 'FORBIDDEN');
  const batch = await svc.restoreBatch(String(req.params.id));
  res.json({ success: true, data: batch });
}

export async function remove(req: Request, res: Response) {
  if (isTrainer(req)) throw new AppError('Trainers cannot permanently delete batches', 403, 'FORBIDDEN');
  await svc.deleteBatch(String(req.params.id));
  res.json({ success: true, message: 'Batch deleted' });
}

export async function enroll(req: Request, res: Response) {
  const { studentId } = req.body as { studentId: string };
  if (!studentId) throw new AppError('studentId is required', 400, 'VALIDATION_ERROR');
  const batch = await svc.enrollStudent(String(req.params.id), studentId);
  res.status(201).json({ success: true, data: batch });
}

export async function unenroll(req: Request, res: Response) {
  await svc.unenrollStudent(String(req.params.id), String(req.params.studentId));
  res.json({ success: true, message: 'Student unenrolled' });
}

export async function updateEnrollment(req: Request, res: Response) {
  const { completionPct, grade } = req.body as { completionPct: number; grade?: string };
  await svc.updateEnrollment(String(req.params.enrollmentId), completionPct, grade);
  res.json({ success: true, message: 'Enrollment updated' });
}

export async function availableStudents(req: Request, res: Response) {
  const students = await svc.getAvailableStudents(String(req.params.id));
  res.json({ success: true, data: students });
}

export async function analytics(req: Request, res: Response) {
  const result = await svc.getBatchAnalytics(String(req.params.id));
  res.json({ success: true, data: result });
}
