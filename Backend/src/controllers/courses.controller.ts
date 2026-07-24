import { Request, Response } from 'express';
import * as svc from '../services/courses.service';
import { createCourseSchema, updateCourseSchema, courseQuerySchema } from '../validators/course.validator';
import { AppError } from '../middleware/error.middleware';
import db from '../lib/db';

const isTrainer = (req: Request) => req.user?.role === 'TRAINER';

/** Fetch trainer permissions from DB. Returns all-true for non-trainers. */
async function getTrainerPerms(userId: string) {
  const { rows } = await db.query(
    'SELECT * FROM trainer_permissions WHERE trainer_id = $1',
    [userId],
  );
  if (!rows.length) {
    return {
      canEditCourses: false, canDeleteCourses: false, canSoftDeleteOnly: false,
    };
  }
  return {
    canEditCourses:   rows[0].can_edit_courses   as boolean,
    canDeleteCourses: rows[0].can_delete_courses as boolean,
    canSoftDeleteOnly: rows[0].can_soft_delete_only as boolean,
  };
}

export async function list(req: Request, res: Response) {
  const parsed = courseQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
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

  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditCourses) {
      throw new AppError('You do not have permission to create courses', 403, 'FORBIDDEN');
    }
  }

  const forcedTrainerId = isTrainer(req) ? req.user!.userId : undefined;
  const course = await svc.createCourse(parsed.data, forcedTrainerId);
  res.status(201).json({ success: true, data: course });
}

export async function update(req: Request, res: Response) {
  const parsed = updateCourseSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');

  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditCourses) {
      throw new AppError('You do not have permission to edit courses', 403, 'FORBIDDEN');
    }
  }

  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const course = await svc.updateCourse(String(req.params.id), parsed.data, trainerId);
  res.json({ success: true, data: course });
}

export async function unarchive(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditCourses) {
      throw new AppError('You do not have permission to restore courses', 403, 'FORBIDDEN');
    }
  }
  const course = await svc.unarchiveCourse(String(req.params.id));
  res.json({ success: true, data: course });
}

export async function remove(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);

    if (!perms.canDeleteCourses) {
      throw new AppError('You do not have permission to delete courses', 403, 'FORBIDDEN');
    }

    // Soft-delete-only: trainer can only archive, never hard-delete
    if (perms.canSoftDeleteOnly) {
      const course = await svc.updateCourse(
        String(req.params.id),
        { status: 'ARCHIVED' },
        req.user!.userId,
      );
      return res.json({ success: true, action: 'archived', data: course });
    }
  }

  // Admin / SUPER_ADMIN / trainer with full delete permission
  const { action } = await svc.deleteCourse(String(req.params.id));
  res.json({
    success: true,
    action,
    message: action === 'archived' ? 'Course archived' : 'Course permanently deleted',
  });
}
