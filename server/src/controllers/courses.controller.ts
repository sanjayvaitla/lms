import { Request, Response } from 'express';
import * as svc from '../services/courses.service';
import { createCourseSchema, updateCourseSchema, courseQuerySchema } from '../validators/course.validator';
import { AppError } from '../middleware/error.middleware';

const isTrainer = (req: Request) => req.user?.role === 'TRAINER';

export async function list(req: Request, res: Response) {
  const parsed = courseQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  // Trainers see only their own courses
  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const result = await svc.listCourses({ ...parsed.data, trainerId });
  res.json({ success: true, data: result });
}

export async function getById(req: Request, res: Response) {
  const course = await svc.getCourse(String(req.params.id));
  res.json({ success: true, data: course });
}

export async function create(req: Request, res: Response) {
  const parsed = createCourseSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  // Force trainer_id to their own userId when role is TRAINER
  const forcedTrainerId = isTrainer(req) ? req.user!.userId : undefined;
  const course = await svc.createCourse(parsed.data, forcedTrainerId);
  res.status(201).json({ success: true, data: course });
}

export async function update(req: Request, res: Response) {
  const parsed = updateCourseSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const course = await svc.updateCourse(String(req.params.id), parsed.data, trainerId);
  res.json({ success: true, data: course });
}

export async function unarchive(req: Request, res: Response) {
  const course = await svc.unarchiveCourse(String(req.params.id));
  res.json({ success: true, data: course });
}

export async function remove(req: Request, res: Response) {
  // Trainers can only soft-delete (archive), not hard-delete
  if (isTrainer(req)) {
    const course = await svc.updateCourse(
      String(req.params.id),
      { status: 'ARCHIVED' },
      req.user!.userId,
    );
    return res.json({ success: true, action: 'archived', data: course });
  }
  const { action } = await svc.deleteCourse(String(req.params.id));
  res.json({
    success: true,
    action,
    message: action === 'archived' ? 'Course archived' : 'Course permanently deleted',
  });
}
