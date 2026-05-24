import { Request, Response } from 'express';
import * as syllabusService from '../services/syllabus.service';
import { AppError } from '../middleware/error.middleware';

export async function uploadSyllabus(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const file = (req as any).file;
  if (!file) throw new AppError('No file uploaded', 400, 'NO_FILE');
  const label = (req.body as { label?: string }).label ?? null;

  const result = await syllabusService.uploadSyllabus(
    String(req.params.courseId),
    req.user.userId,
    file,
    label ?? undefined,
  );
  res.status(201).json({ success: true, data: result });
}

export async function listSyllabi(req: Request, res: Response) {
  const syllabi = await syllabusService.listSyllabi(String(req.params.courseId));
  res.json({ success: true, data: syllabi });
}

export async function getSyllabus(req: Request, res: Response) {
  const syllabusId = req.query.syllabusId ? String(req.query.syllabusId) : undefined;
  const syllabus = await syllabusService.getSyllabus(String(req.params.courseId), syllabusId);
  if (!syllabus) {
    res.json({ success: true, data: null });
    return;
  }
  res.json({ success: true, data: syllabus });
}

export async function deleteSyllabus(req: Request, res: Response) {
  await syllabusService.deleteSyllabus(String(req.params.courseId), String(req.params.syllabusId));
  res.json({ success: true, message: 'Syllabus deleted' });
}

export async function assignSyllabusToBatch(req: Request, res: Response) {
  const { syllabusId } = req.body as { syllabusId: string };
  if (!syllabusId) throw new AppError('syllabusId is required', 400, 'VALIDATION_ERROR');
  await syllabusService.assignSyllabusToBatch(String(req.params.batchId), syllabusId);
  res.json({ success: true, message: 'Syllabus assigned to batch' });
}

export async function getBatchSyllabus(req: Request, res: Response) {
  const syllabus = await syllabusService.getBatchSyllabus(String(req.params.batchId));
  res.json({ success: true, data: syllabus ?? null });
}
