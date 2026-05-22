import { Request, Response } from 'express';
import * as syllabusService from '../services/syllabus.service';
import { AppError } from '../middleware/error.middleware';

export async function uploadSyllabus(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const file = (req as any).file;
  if (!file) throw new AppError('No file uploaded', 400, 'NO_FILE');

  const result = await syllabusService.uploadSyllabus(
    String(req.params.courseId),
    req.user.userId,
    file,
  );
  res.status(201).json({ success: true, data: result });
}

export async function getSyllabus(req: Request, res: Response) {
  const syllabus = await syllabusService.getSyllabus(String(req.params.courseId));
  if (!syllabus) {
    res.json({ success: true, data: null });
    return;
  }
  res.json({ success: true, data: syllabus });
}
