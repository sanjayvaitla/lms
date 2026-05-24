import { Request, Response } from 'express';
import * as svc from '../services/quizzes.service';
import {
  createDatasetSchema, createQuestionSchema, createQuizSchema, updateQuizSchema,
  startAttemptSchema, submitAttemptSchema,
} from '../validators/quiz.validator';
import { AppError } from '../middleware/error.middleware';

export async function dashboard(_req: Request, res: Response) {
  res.json({ success: true, data: await svc.getQuizDashboard() });
}

export async function listDatasets(req: Request, res: Response) {
  res.json({ success: true, data: await svc.listDatasets(req.query.courseId as string | undefined) });
}

export async function uploadDataset(req: Request, res: Response) {
  const parsed = createDatasetSchema.safeParse({ ...req.body, courseId: req.body.courseId });
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  if (!req.file) throw new AppError('Dataset file required', 400, 'FILE_REQUIRED');
  const data = await svc.uploadDataset(parsed.data.courseId, parsed.data.title, req.user!.userId, req.file);
  res.status(201).json({ success: true, data });
}

export async function getDataset(req: Request, res: Response) {
  res.json({ success: true, data: await svc.getDataset(String(req.params.id)) });
}

export async function deleteDataset(req: Request, res: Response) {
  await svc.deleteDataset(String(req.params.id));
  res.json({ success: true, message: 'Dataset deleted' });
}

export async function listQuestions(req: Request, res: Response) {
  res.json({
    success: true,
    data: await svc.listQuestions({
      courseId: req.query.courseId as string | undefined,
      moduleId: req.query.moduleId as string | undefined,
    }),
  });
}

export async function createQuestion(req: Request, res: Response) {
  const parsed = createQuestionSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.status(201).json({ success: true, data: await svc.createQuestion(parsed.data) });
}

export async function deleteQuestion(req: Request, res: Response) {
  await svc.deleteQuestion(String(req.params.id));
  res.json({ success: true, message: 'Question deleted' });
}

export async function listQuizzes(req: Request, res: Response) {
  res.json({
    success: true,
    data: await svc.listQuizzes({
      courseId: req.query.courseId as string | undefined,
      releasedOnly: req.query.releasedOnly === 'true',
    }),
  });
}

export async function createQuiz(req: Request, res: Response) {
  const parsed = createQuizSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.status(201).json({ success: true, data: await svc.createQuiz(parsed.data, req.user!.userId) });
}

export async function updateQuiz(req: Request, res: Response) {
  const parsed = updateQuizSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.json({ success: true, data: await svc.updateQuiz(String(req.params.id), parsed.data) });
}

export async function deleteQuiz(req: Request, res: Response) {
  await svc.deleteQuiz(String(req.params.id));
  res.json({ success: true, message: 'Quiz deleted' });
}

export async function previewRandom(req: Request, res: Response) {
  res.json({ success: true, data: await svc.previewRandomDraw(String(req.params.id)) });
}

export async function startAttempt(req: Request, res: Response) {
  const parsed = startAttemptSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const studentId = parsed.data.studentId ?? req.user!.userId;
  res.json({ success: true, data: await svc.startAttempt(String(req.params.id), studentId) });
}

export async function submitAttempt(req: Request, res: Response) {
  const parsed = submitAttemptSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  res.json({ success: true, data: await svc.submitAttempt(String(req.params.attemptId), parsed.data.answers) });
}

export async function listAttempts(req: Request, res: Response) {
  res.json({ success: true, data: await svc.listAttempts(req.query.quizId as string | undefined) });
}

export async function importCsv(req: Request, res: Response) {
  if (!req.file) throw new AppError('CSV file required', 400, 'FILE_REQUIRED');
  const { courseId, moduleId, title, questionsPerAttempt, timeLimitMinutes,
          passingScore, maxAttempts, status } = req.body;
  if (!courseId)  throw new AppError('courseId is required', 400, 'VALIDATION_ERROR');
  if (!moduleId)  throw new AppError('moduleId is required', 400, 'VALIDATION_ERROR');
  if (!title)     throw new AppError('Quiz title is required', 400, 'VALIDATION_ERROR');

  const data = await svc.importQuizFromCsv(
    courseId,
    moduleId,
    req.user!.userId,
    req.file,
    {
      title,
      questionsPerAttempt: parseInt(questionsPerAttempt ?? '10', 10),
      timeLimitMinutes:    timeLimitMinutes ? parseInt(timeLimitMinutes, 10) : null,
      passingScore:        parseInt(passingScore ?? '60', 10),
      maxAttempts:         parseInt(maxAttempts ?? '1', 10),
      status:              (status as 'DRAFT' | 'ACTIVE') ?? 'DRAFT',
    }
  );
  res.status(201).json({ success: true, data });
}
