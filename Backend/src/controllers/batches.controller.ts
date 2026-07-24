import { Request, Response } from 'express';
import * as svc from '../services/batches.service';
import { createBatchSchema, updateBatchSchema } from '../validators/batch.validator';
import { AppError } from '../middleware/error.middleware';
import db from '../lib/db';

const isTrainer = (req: Request) => req.user?.role === 'TRAINER';

function getTrainerScope(req: Request): string | undefined {
  return isTrainer(req) ? req.user!.userId : undefined;
}

async function getTrainerPerms(userId: string) {
  const { rows } = await db.query(
    'SELECT * FROM trainer_permissions WHERE trainer_id = $1',
    [userId],
  );
  if (!rows.length) {
    return { canEditBatches: false, canDeleteBatches: false, canSoftDeleteOnly: false };
  }
  return {
    canEditBatches:    rows[0].can_edit_batches    as boolean,
    canDeleteBatches:  rows[0].can_delete_batches  as boolean,
    canSoftDeleteOnly: rows[0].can_soft_delete_only as boolean,
  };
}

export async function list(req: Request, res: Response) {
  const { programId, courseId, page, limit } = req.query as {
    programId?: string;
    courseId?: string;
    page?: string;
    limit?: string;
  };
  const trainerId = getTrainerScope(req);

  const pageNum = page ? parseInt(page, 10) : undefined;
  const limitNum = limit ? parseInt(limit, 10) : undefined;

  const result = await svc.listBatches(programId, trainerId, pageNum, limitNum, courseId);
  res.json({ success: true, data: result });
}

export async function getById(req: Request, res: Response) {
  const batch = await svc.getBatch(String(req.params.id), getTrainerScope(req));
  res.json({ success: true, data: batch });
}

export async function create(req: Request, res: Response) {
  const parsed = createBatchSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');

  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditBatches) {
      throw new AppError('You do not have permission to create batches', 403, 'FORBIDDEN');
    }
  }

  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const batchInput = trainerId ? { ...parsed.data, trainerId } : parsed.data;
  const batch = await svc.createBatch(batchInput, trainerId);
  res.status(201).json({ success: true, data: batch });
}

export async function update(req: Request, res: Response) {
  const parsed = updateBatchSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');

  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditBatches) {
      throw new AppError('You do not have permission to edit batches', 403, 'FORBIDDEN');
    }
  }

  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const batchInput = trainerId ? { ...parsed.data, trainerId } : parsed.data;
  const batch = await svc.updateBatch(String(req.params.id), batchInput, trainerId);
  res.json({ success: true, data: batch });
}

export async function archive(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canDeleteBatches) {
      throw new AppError('You do not have permission to archive batches', 403, 'FORBIDDEN');
    }
  }
  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const batch = await svc.archiveBatch(String(req.params.id), trainerId);
  res.json({ success: true, data: batch });
}

export async function restore(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditBatches) {
      throw new AppError('You do not have permission to restore batches', 403, 'FORBIDDEN');
    }
  }
  const batch = await svc.restoreBatch(String(req.params.id));
  res.json({ success: true, data: batch });
}

export async function remove(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);

    if (!perms.canDeleteBatches) {
      throw new AppError('You do not have permission to delete batches', 403, 'FORBIDDEN');
    }

    // Soft-delete-only: archive instead of hard delete
    if (perms.canSoftDeleteOnly) {
      const trainerId = req.user!.userId;
      const batch = await svc.archiveBatch(String(req.params.id), trainerId);
      return res.json({ success: true, action: 'archived', data: batch });
    }
  }

  await svc.deleteBatch(String(req.params.id));
  res.json({ success: true, message: 'Batch deleted' });
}

export async function enroll(req: Request, res: Response) {
  const { studentId } = req.body as { studentId: string };
  if (!studentId) throw new AppError('studentId is required', 400, 'VALIDATION_ERROR');
  const batch = await svc.enrollStudent(String(req.params.id), studentId, getTrainerScope(req));
  res.status(201).json({ success: true, data: batch });
}

export async function unenroll(req: Request, res: Response) {
  await svc.unenrollStudent(String(req.params.id), String(req.params.studentId), getTrainerScope(req));
  res.json({ success: true, message: 'Student unenrolled' });
}

export async function updateEnrollment(req: Request, res: Response) {
  const { completionPct, grade } = req.body as { completionPct: number; grade?: string };
  await svc.updateEnrollment(
    String(req.params.id),
    String(req.params.enrollmentId),
    completionPct,
    grade,
    getTrainerScope(req),
  );
  res.json({ success: true, message: 'Enrollment updated' });
}

export async function availableStudents(req: Request, res: Response) {
  const students = await svc.getAvailableStudents(String(req.params.id), getTrainerScope(req));
  res.json({ success: true, data: students });
}

export async function analytics(req: Request, res: Response) {
  const result = await svc.getBatchAnalytics(String(req.params.id), getTrainerScope(req));
  res.json({ success: true, data: result });
}

export async function getCourses(req: Request, res: Response) {
  const courses = await svc.getBatchCourses(String(req.params.id), getTrainerScope(req));
  res.json({ success: true, data: courses });
}

export async function setCourses(req: Request, res: Response) {
  const { courseIds } = req.body as { courseIds: string[] };
  if (!Array.isArray(courseIds)) {
    res.status(400).json({ success: false, message: 'courseIds must be an array' });
    return;
  }
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditBatches) {
      throw new AppError('You do not have permission to edit batches', 403, 'FORBIDDEN');
    }
  }
  const batch = await svc.updateBatch(String(req.params.id), { courseIds }, getTrainerScope(req));
  res.json({ success: true, data: batch });
}
