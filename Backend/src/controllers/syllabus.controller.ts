import { Request, Response } from 'express';
import * as syllabusService from '../services/syllabus.service';
import { AppError } from '../middleware/error.middleware';
import { assertTrainerBatchAccess } from '../lib/batch-access';

const isTrainer = (req: Request) => req.user?.role === 'TRAINER';
const getTrainerScope = (req: Request) => (isTrainer(req) ? req.user!.userId : undefined);

export async function uploadSyllabus(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const file = (req as any).file;
  if (!file) throw new AppError('No file uploaded', 400, 'NO_FILE');
  const label = (req.body as { label?: string }).label ?? null;
  const result = await syllabusService.uploadSyllabus(
    String(req.params.courseId), req.user.userId, file, label ?? undefined,
  );
  res.status(201).json({ success: true, data: result });
}

export async function listSyllabi(req: Request, res: Response) {
  const syllabi = await syllabusService.listSyllabi(String(req.params.courseId));
  res.json({ success: true, data: syllabi });
}

export async function getSyllabus(req: Request, res: Response) {
  const syllabusId = req.query.syllabusId ? String(req.query.syllabusId) : undefined;
  const syllabus   = await syllabusService.getSyllabus(String(req.params.courseId), syllabusId);
  res.json({ success: true, data: syllabus ?? null });
}

export async function deleteSyllabus(req: Request, res: Response) {
  await syllabusService.deleteSyllabus(String(req.params.courseId), String(req.params.syllabusId));
  res.json({ success: true, message: 'Syllabus deleted' });
}

// POST /courses/:courseId/syllabus/sync
// Retroactively syncs the latest syllabus into course_modules without re-uploading.
export async function syncSyllabus(req: Request, res: Response) {
  const courseId = String(req.params.courseId);
  const syllabus = await syllabusService.getSyllabus(courseId);
  if (!syllabus)
    throw new AppError('No syllabus uploaded for this course yet', 404, 'NOT_FOUND');
  if (!syllabus.structuredData)
    throw new AppError('PDF-only syllabus cannot be synced — upload an Excel file', 400, 'NO_STRUCTURED_DATA');
  await syllabusService.syncModulesFromSyllabus(courseId, syllabus.structuredData);
  res.json({ success: true, message: 'Sessions synced from syllabus successfully' });
}

export async function assignSyllabusToBatch(req: Request, res: Response) {
  const { syllabusId } = req.body as { syllabusId: string };
  if (!syllabusId) throw new AppError('syllabusId is required', 400, 'VALIDATION_ERROR');
  const batchId = String(req.params.batchId);
  const trainerScope = getTrainerScope(req);
  if (trainerScope) await assertTrainerBatchAccess(batchId, trainerScope);
  await syllabusService.assignSyllabusToBatch(batchId, syllabusId);
  res.json({ success: true, message: 'Syllabus assigned to batch' });
}

export async function getBatchSyllabus(req: Request, res: Response) {
  const batchId = String(req.params.batchId);
  const trainerScope = getTrainerScope(req);
  if (trainerScope) await assertTrainerBatchAccess(batchId, trainerScope);
  const syllabus = await syllabusService.getBatchSyllabus(batchId);
  res.json({ success: true, data: syllabus ?? null });
}
