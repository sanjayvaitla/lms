import { Request, Response } from 'express';
import * as svc from '../services/assessments.service';
import {
  createAssessmentSchema,
  updateAssessmentSchema,
  gradeAssessmentSchema,
} from '../validators/assessment.validator';
import { AppError } from '../middleware/error.middleware';

export async function dashboard(_req: Request, res: Response) {
  res.json({ success: true, data: await svc.getAssessmentDashboard() });
}

export async function list(req: Request, res: Response) {
  res.json({
    success: true,
    data: await svc.listAssessments({
      courseId: req.query.courseId as string | undefined,
      status:   req.query.status as string | undefined,
      page: req.query.page as string | undefined,
      limit: req.query.limit as string | undefined,
    }),
  });
}

export async function getById(req: Request, res: Response) {
  res.json({ success: true, data: await svc.getAssessment(String(req.params.id)) });
}

export async function create(req: Request, res: Response) {
  const files = req.files as { [field: string]: Express.Multer.File[] } | undefined;
  const pdfFile = files?.file?.[0];
  const csvFile = files?.csv?.[0];
  const rubricPdf = files?.rubricPdf?.[0];

  if (!pdfFile) throw new AppError('PDF file required', 400, 'FILE_REQUIRED');

  const parsed = createAssessmentSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');

  const data = await svc.createAssessment(
    parsed.data,
    req.user!.userId,
    { originalname: pdfFile.originalname, buffer: pdfFile.buffer, size: pdfFile.size },
    csvFile ? { originalname: csvFile.originalname, buffer: csvFile.buffer } : undefined,
    rubricPdf ? { originalname: rubricPdf.originalname, buffer: rubricPdf.buffer } : undefined,
  );
  res.status(201).json({ success: true, data });
}

export async function update(req: Request, res: Response) {
  const parsed = updateAssessmentSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.json({ success: true, data: await svc.updateAssessment(String(req.params.id), parsed.data) });
}

export async function remove(req: Request, res: Response) {
  await svc.deleteAssessment(String(req.params.id));
  res.json({ success: true, message: 'Assessment deleted' });
}

export async function grade(req: Request, res: Response) {
  const parsed = gradeAssessmentSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.json({
    success: true,
    data: await svc.gradeSubmission(String(req.params.submissionId), parsed.data),
  });
}

export async function studentList(req: Request, res: Response) {
  res.json({ success: true, data: await svc.getStudentAssessments(req.user!.userId) });
}

export async function submit(req: Request, res: Response) {
  if (!req.file) throw new AppError('PDF file required', 400, 'FILE_REQUIRED');
  const data = await svc.submitAssessment(
    String(req.params.id),
    req.user!.userId,
    { originalname: req.file.originalname, buffer: req.file.buffer, mimetype: req.file.mimetype },
  );
  res.status(201).json({ success: true, data });
}

export async function submitPartA(req: Request, res: Response) {
  const { partAAnswers } = req.body as { partAAnswers: Array<{ questionId: string; selectedAnswer: string }> };
  if (!Array.isArray(partAAnswers)) throw new AppError('partAAnswers must be an array', 400, 'VALIDATION_ERROR');
  const data = await svc.submitPartA(String(req.params.id), req.user!.userId, partAAnswers);
  res.json({ success: true, data });
}
