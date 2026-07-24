import { Request, Response } from 'express';
import * as svc from '../services/mock_interviews.service';
import { createInterviewSchema, gradeInterviewSchema } from '../validators/mock_interview.validator';
import { AppError } from '../middleware/error.middleware';

export async function create(req: Request, res: Response) {
  const parsed = createInterviewSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }

  const creatorId = req.user!.userId;
  const interview = await svc.createInterview(parsed.data, creatorId);

  res.status(201).json({ success: true, data: interview });
}

export async function list(req: Request, res: Response) {
  const role = req.user!.role;
  const userId = req.user!.userId;
  
  const interviews = await svc.listInterviews(role, userId);
  res.json({ success: true, data: interviews });
}

export async function getById(req: Request, res: Response) {
  const interview = await svc.getInterviewById(
    String(req.params.id),
    req.user!.role,
    req.user!.userId,
  );
  res.json({ success: true, data: interview });
}

export async function grade(req: Request, res: Response) {
  const parsed = gradeInterviewSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }

  const interview = await svc.gradeInterview(String(req.params.id), parsed.data);
  res.json({ success: true, data: interview });
}

export async function remove(req: Request, res: Response) {
  await svc.deleteInterview(String(req.params.id));
  res.json({ success: true, message: 'Mock interview deleted' });
}

export async function publish(req: Request, res: Response) {
  const interview = await svc.publishInterview(String(req.params.id));
  res.json({ success: true, data: interview });
}
