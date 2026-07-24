import { Request, Response } from 'express';
import * as svc from '../services/learners.service';
import { AppError } from '../middleware/error.middleware';
import db from '../lib/db';

const isTrainer = (req: Request) => req.user?.role === 'TRAINER';

async function getTrainerPerms(userId: string) {
  const { rows } = await db.query(
    'SELECT * FROM trainer_permissions WHERE trainer_id = $1',
    [userId],
  );
  if (!rows.length) {
    return { canEditLearners: false, canDeleteLearners: false, canSoftDeleteOnly: false };
  }
  return {
    canEditLearners:   rows[0].can_edit_learners   as boolean,
    canDeleteLearners: rows[0].can_delete_learners  as boolean,
    canSoftDeleteOnly: rows[0].can_soft_delete_only as boolean,
  };
}

export async function list(req: Request, res: Response) {
  const { search, page, limit } = req.query;
  const result = await svc.listLearners(
    search as string | undefined,
    page  ? parseInt(page  as string) : 1,
    limit ? parseInt(limit as string) : 20,
  );
  res.json({ success: true, data: result });
}

export async function getById(req: Request, res: Response) {
  const learner = await svc.getLearner(String(req.params.id));
  res.json({ success: true, data: learner });
}

export async function create(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditLearners) {
      throw new AppError('You do not have permission to create learners', 403, 'FORBIDDEN');
    }
  }
  const learner = await svc.createLearner(req.body);
  res.status(201).json({ success: true, data: learner });
}

export async function update(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);
    if (!perms.canEditLearners) {
      throw new AppError('You do not have permission to edit learners', 403, 'FORBIDDEN');
    }
  }

  const role = req.user?.role;
  const canEditLoginIdentity = role === 'SUPER_ADMIN' || role === 'LD_MANAGER';
  const body = { ...req.body } as Record<string, unknown>;

  // Email / phone are login identity — only Super Admin & L&D Manager
  if (!canEditLoginIdentity) {
    if (body.email !== undefined || body.phoneNumber !== undefined) {
      throw new AppError(
        'Only L&D Manager or Super Admin can change a learner’s email or phone number.',
        403,
        'IDENTITY_LOCKED',
      );
    }
    delete body.email;
    delete body.phoneNumber;
  }

  const learner = await svc.updateLearner(String(req.params.id), body);
  res.json({ success: true, data: learner });
}

export async function remove(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);

    if (!perms.canDeleteLearners) {
      throw new AppError('You do not have permission to delete learners', 403, 'FORBIDDEN');
    }

    // Soft-delete-only: unenroll from all batches instead of hard delete
    if (perms.canSoftDeleteOnly) {
      await db.query('DELETE FROM enrollments WHERE student_id = $1', [req.params.id]);
      return res.json({
        success: true,
        action: 'soft-deleted',
        message: 'Learner unenrolled from all batches (soft delete). Contact Super Admin for permanent deletion.',
      });
    }
  }

  await svc.deleteLearner(String(req.params.id));
  res.json({ success: true, message: 'Learner deleted' });
}

export async function batchRemove(req: Request, res: Response) {
  if (isTrainer(req)) {
    const perms = await getTrainerPerms(req.user!.userId);

    if (!perms.canDeleteLearners) {
      throw new AppError('You do not have permission to delete learners', 403, 'FORBIDDEN');
    }

    if (perms.canSoftDeleteOnly) {
      const { ids } = req.body as { ids: string[] };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        throw new AppError('No learner IDs provided', 400, 'VALIDATION_ERROR');
      }
      for (const id of ids) {
        await db.query('DELETE FROM enrollments WHERE student_id = $1', [id]);
      }
      return res.json({
        success: true,
        action: 'soft-deleted',
        message: `${ids.length} learners unenrolled from all batches (soft delete). Contact Super Admin for permanent deletion.`,
      });
    }
  }

  const { ids } = req.body as { ids: string[] };
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new AppError('No learner IDs provided', 400, 'VALIDATION_ERROR');
  }
  for (const id of ids) {
    await svc.deleteLearner(id);
  }
  res.json({ success: true, message: `${ids.length} learners deleted` });
}

export async function availableBatches(req: Request, res: Response) {
  const trainerId = isTrainer(req) ? req.user!.userId : undefined;
  const batches = await svc.getAvailableBatches(String(req.params.id), trainerId);
  res.json({ success: true, data: batches });
}

export async function assignBatch(req: Request, res: Response) {
  const { batchId } = req.body as { batchId: string };
  const result = await svc.assignBatch(String(req.params.id), batchId);
  res.status(201).json({ success: true, data: result });
}

export async function removeBatch(req: Request, res: Response) {
  await svc.removeBatch(String(req.params.id), String(req.params.batchId));
  res.json({ success: true, message: 'Removed from batch' });
}

export async function dashboardStats(_req: Request, res: Response) {
  const stats = await svc.getDashboardStats();
  res.json({ success: true, data: stats });
}

export async function assignProgram(req: Request, res: Response) {
  const { programId } = req.body as { programId: string | null };
  const result = await svc.assignProgram(String(req.params.id), programId ?? null);
  res.json({ success: true, data: result, message: programId ? 'Program assigned' : 'Program unassigned' });
}
