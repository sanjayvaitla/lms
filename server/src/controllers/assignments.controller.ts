import { Request, Response } from 'express';
import * as svc from '../services/assignments.service';
import { createAssignmentSchema, updateAssignmentSchema, gradeSubmissionSchema } from '../validators/assignment.validator';
import { AppError } from '../middleware/error.middleware';

export async function dashboard(_req: Request, res: Response) {
  res.json({ success: true, data: await svc.getAssignmentDashboard() });
}

export async function list(req: Request, res: Response) {
  res.json({
    success: true,
    data: await svc.listAssignments({
      courseId: req.query.courseId as string | undefined,
      status: req.query.status as string | undefined,
    }),
  });
}

export async function getById(req: Request, res: Response) {
  res.json({ success: true, data: await svc.getAssignment(String(req.params.id)) });
}

export async function create(req: Request, res: Response) {
  if (!req.file) throw new AppError('PDF file required', 400, 'FILE_REQUIRED');
  const parsed = createAssignmentSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const data = await svc.createAssignment(
    parsed.data,
    req.user!.userId,
    { originalname: req.file.originalname, buffer: req.file.buffer, size: req.file.size },
  );
  res.status(201).json({ success: true, data });
}

export async function update(req: Request, res: Response) {
  const parsed = updateAssignmentSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.json({ success: true, data: await svc.updateAssignment(String(req.params.id), parsed.data) });
}

export async function remove(req: Request, res: Response) {
  await svc.deleteAssignment(String(req.params.id));
  res.json({ success: true, message: 'Assignment deleted' });
}

export async function grade(req: Request, res: Response) {
  const parsed = gradeSubmissionSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.json({ success: true, data: await svc.gradeSubmission(String(req.params.submissionId), parsed.data.score, parsed.data.feedback) });
}
