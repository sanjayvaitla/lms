/**
 * permissions.middleware.ts
 *
 * Reads trainer_permissions from the DB for the current user and checks
 * whether they have the requested permission.
 *
 * Non-trainer roles (SUPER_ADMIN, ADMIN) always pass.
 * Trainers must have the specific flag set to TRUE in trainer_permissions.
 *
 * Usage:
 *   router.delete('/:id', authenticate, requirePermission('canDeleteCourses'), ctrl.remove);
 */

import { Request, Response, NextFunction } from 'express';
import db from '../lib/db';
import { AppError } from './error.middleware';

type PermissionKey =
  | 'canEditCourses'   | 'canDeleteCourses'
  | 'canEditBatches'   | 'canDeleteBatches'
  | 'canEditLearners'  | 'canDeleteLearners'
  | 'canEditAssignments'  | 'canDeleteAssignments'
  | 'canEditQuizzes'   | 'canDeleteQuizzes'
  | 'canEditAttendance'| 'canDeleteAttendance'
  | 'canSoftDeleteOnly';

// camelCase → snake_case column name
const COL: Record<PermissionKey, string> = {
  canEditCourses:       'can_edit_courses',
  canDeleteCourses:     'can_delete_courses',
  canEditBatches:       'can_edit_batches',
  canDeleteBatches:     'can_delete_batches',
  canEditLearners:      'can_edit_learners',
  canDeleteLearners:    'can_delete_learners',
  canEditAssignments:   'can_edit_assignments',
  canDeleteAssignments: 'can_delete_assignments',
  canEditQuizzes:       'can_edit_quizzes',
  canDeleteQuizzes:     'can_delete_quizzes',
  canEditAttendance:    'can_edit_attendance',
  canDeleteAttendance:  'can_delete_attendance',
  canSoftDeleteOnly:    'can_soft_delete_only',
};

/**
 * Middleware factory — checks a single permission flag.
 * Non-trainers always pass. Trainers must have the flag = TRUE.
 */
export function requirePermission(permission: PermissionKey) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) return next(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));

      // SUPER_ADMIN and ADMIN always have full access
      if (req.user.role !== 'TRAINER') return next();

      const col = COL[permission];
      const { rows } = await db.query(
        `SELECT ${col} AS val FROM trainer_permissions WHERE trainer_id = $1`,
        [req.user.userId],
      );

      // No row means defaults (all false) — deny
      if (!rows.length || !rows[0].val) {
        return next(new AppError(
          `You do not have permission to perform this action (${permission})`,
          403,
          'FORBIDDEN',
        ));
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Attaches the trainer's full permission set to req for use in controllers.
 * Call this once per request when you need multiple permission checks.
 * Non-trainers get all-true defaults.
 */
export async function loadPermissions(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) return next();

    if (req.user.role !== 'TRAINER') {
      // Non-trainers: full access
      (req as Request & { trainerPerms?: Record<PermissionKey, boolean> }).trainerPerms = Object.fromEntries(
        Object.keys(COL).map((k) => [k, true]),
      ) as Record<PermissionKey, boolean>;
      return next();
    }

    const { rows } = await db.query(
      `SELECT * FROM trainer_permissions WHERE trainer_id = $1`,
      [req.user.userId],
    );

    if (!rows.length) {
      // No row — all false defaults
      (req as Request & { trainerPerms?: Record<PermissionKey, boolean> }).trainerPerms = Object.fromEntries(
        Object.keys(COL).map((k) => [k, false]),
      ) as Record<PermissionKey, boolean>;
    } else {
      const row = rows[0];
      (req as Request & { trainerPerms?: Record<PermissionKey, boolean> }).trainerPerms = {
        canEditCourses:       row.can_edit_courses,
        canDeleteCourses:     row.can_delete_courses,
        canEditBatches:       row.can_edit_batches,
        canDeleteBatches:     row.can_delete_batches,
        canEditLearners:      row.can_edit_learners,
        canDeleteLearners:    row.can_delete_learners,
        canEditAssignments:   row.can_edit_assignments,
        canDeleteAssignments: row.can_delete_assignments,
        canEditQuizzes:       row.can_edit_quizzes,
        canDeleteQuizzes:     row.can_delete_quizzes,
        canEditAttendance:    row.can_edit_attendance,
        canDeleteAttendance:  row.can_delete_attendance,
        canSoftDeleteOnly:    row.can_soft_delete_only,
      };
    }
    next();
  } catch (err) {
    next(err);
  }
}
