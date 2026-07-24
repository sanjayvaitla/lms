import { Request, Response } from 'express';
import * as feedbackService from '../services/feedback.service';
import { AppError } from '../middleware/error.middleware';

export async function getConfig(req: Request, res: Response) {
  const batchId = req.params.batchId as string;
  const data = await feedbackService.getFeedbackConfig(batchId);
  res.json({ success: true, data });
}

export async function updateConfig(req: Request, res: Response) {
  const batchId = req.params.batchId as string;
  const { moduleIds } = req.body as { moduleIds: string[] };
  const data = await feedbackService.updateFeedbackConfig(batchId, moduleIds || []);
  res.json({ success: true, data });
}

export async function getStudentStatus(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const enrollmentId = req.params.enrollmentId as string;
  const moduleId = req.params.moduleId as string;
  const data = await feedbackService.getStudentFeedbackStatus(enrollmentId, moduleId, req.user.userId);
  res.json({ success: true, data });
}

export async function submitFeedback(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const data = await feedbackService.submitStudentFeedback(req.user.userId, req.body);
  res.status(201).json({ success: true, data });
}

export async function getPendingFeedback(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const data = await feedbackService.getPendingFeedback(req.user.userId);
  res.json({ success: true, data });
}

export async function getBatchFeedback(req: Request, res: Response) {
  const batchId = req.params.batchId as string;
  const data = await feedbackService.getBatchFeedbackResponses(batchId);
  res.json({ success: true, data });
}

export async function submitCourseFeedback(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const data = await feedbackService.submitCourseFeedback(req.user.userId, req.body);
  res.status(201).json({ success: true, data });
}

export async function getCourseStatus(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const enrollmentId = req.params.enrollmentId as string;
  const courseId = req.params.courseId as string;
  const data = await feedbackService.getCourseFeedbackStatus(enrollmentId, courseId, req.user.userId);
  res.json({ success: true, data });
}

export async function getBatchCourseFeedback(req: Request, res: Response) {
  const batchId = req.params.batchId as string;
  const data = await feedbackService.getBatchCourseFeedbackResponses(batchId);
  res.json({ success: true, data });
}

export async function submitProgramFeedback(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const data = await feedbackService.submitProgramFeedback(req.user.userId, req.body);
  res.status(201).json({ success: true, data });
}

export async function getProgramStatus(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const programId = req.params.programId as string;
  const data = await feedbackService.getProgramFeedbackStatus(programId, req.user.userId);
  res.json({ success: true, data });
}

export async function getProgramFeedback(req: Request, res: Response) {
  const programId = req.params.programId as string;
  const data = await feedbackService.getProgramFeedbackResponses(programId);
  res.json({ success: true, data });
}
