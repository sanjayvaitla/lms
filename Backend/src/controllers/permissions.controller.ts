import { Request, Response } from 'express';
import * as svc from '../services/permissions.service';
import { AppError } from '../middleware/error.middleware';

/** GET /permissions/trainers/:trainerId */
export async function getTrainerPermissions(req: Request, res: Response) {
  const perms = await svc.getPermissions(String(req.params.trainerId));
  res.json({ success: true, data: perms });
}

/** GET /permissions/trainers — all trainers' permissions */
export async function getAllTrainerPermissions(_req: Request, res: Response) {
  const perms = await svc.getAllPermissions();
  res.json({ success: true, data: perms });
}

/** PUT /permissions/trainers/:trainerId */
export async function updateTrainerPermissions(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const perms = await svc.updatePermissions(
    String(req.params.trainerId),
    req.body,
    req.user.userId,
  );
  res.json({ success: true, data: perms });
}

/** GET /permissions/me — trainer fetches their own permissions */
export async function getMyPermissions(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  if (req.user.role !== 'TRAINER') {
    // Non-trainers have full access — return all-true
    res.json({
      success: true,
      data: {
        trainerId:            req.user.userId,
        canEditCourses:       true,
        canDeleteCourses:     true,
        canEditBatches:       true,
        canDeleteBatches:     true,
        canEditLearners:      true,
        canDeleteLearners:    true,
        canEditAssignments:   true,
        canDeleteAssignments: true,
        canEditQuizzes:       true,
        canDeleteQuizzes:     true,
        canEditAttendance:    true,
        canDeleteAttendance:  true,
        canSoftDeleteOnly:    false,
        canViewCourses:       true,
        canViewBatches:       true,
        canViewLearners:      true,
        canViewAssignments:   true,
        canViewQuizzes:       true,
        canViewAttendance:    true,
        canViewContent:       true,
        canViewRecordings:    true,
        canViewDashboard:     true,
        canViewTrainers:      true,
        canViewProjects:      true,
        canViewPlacements:    true,
        canViewFees:          true,
        canViewMessaging:     true,
        canViewAiTutor:       true,
      },
    });
    return;
  }
  const perms = await svc.getPermissions(req.user.userId);
  res.json({ success: true, data: perms });
}
