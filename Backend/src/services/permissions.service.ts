import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';

export interface TrainerPermissions {
  trainerId:            string;
  canEditCourses:       boolean;
  canDeleteCourses:     boolean;
  canEditBatches:       boolean;
  canDeleteBatches:     boolean;
  canEditLearners:      boolean;
  canDeleteLearners:    boolean;
  canEditAssignments:   boolean;
  canDeleteAssignments: boolean;
  canEditQuizzes:       boolean;
  canDeleteQuizzes:     boolean;
  canEditAttendance:    boolean;
  canDeleteAttendance:  boolean;
  canSoftDeleteOnly:    boolean;
  // Sidebar visibility flags
  canViewCourses:       boolean;
  canViewBatches:       boolean;
  canViewLearners:      boolean;
  canViewAssignments:   boolean;
  canViewQuizzes:       boolean;
  canViewAttendance:    boolean;
  canViewContent:       boolean;
  canViewRecordings:    boolean;
  canViewDashboard:     boolean;
  canViewTrainers:      boolean;
  canViewProjects:      boolean;
  canViewPlacements:    boolean;
  canViewFees:          boolean;
  canViewMessaging:     boolean;
  canViewAiTutor:       boolean;
  updatedAt:            string;
  updatedByName:        string | null;
}

const DEFAULT_PERMS = {
  can_edit_courses:       false,
  can_delete_courses:     false,
  can_edit_batches:       false,
  can_delete_batches:     false,
  can_edit_learners:      false,
  can_delete_learners:    false,
  can_edit_assignments:   false,
  can_delete_assignments: false,
  can_edit_quizzes:       false,
  can_delete_quizzes:     false,
  can_edit_attendance:    false,
  can_delete_attendance:  false,
  can_soft_delete_only:   false,
  can_view_courses:       true,
  can_view_batches:       true,
  can_view_learners:      true,
  can_view_assignments:   true,
  can_view_quizzes:       true,
  can_view_attendance:    true,
  can_view_content:       true,
  can_view_recordings:    true,
  can_view_dashboard:     true,
  can_view_trainers:      true,
  can_view_projects:      true,
  can_view_placements:    true,
  can_view_fees:          true,
  can_view_messaging:     true,
  can_view_ai_tutor:      true,
};

function mapRow(row: Record<string, unknown>): TrainerPermissions {
  return {
    trainerId:            row.trainer_id as string,
    canEditCourses:       row.can_edit_courses as boolean,
    canDeleteCourses:     row.can_delete_courses as boolean,
    canEditBatches:       row.can_edit_batches as boolean,
    canDeleteBatches:     row.can_delete_batches as boolean,
    canEditLearners:      row.can_edit_learners as boolean,
    canDeleteLearners:    row.can_delete_learners as boolean,
    canEditAssignments:   row.can_edit_assignments as boolean,
    canDeleteAssignments: row.can_delete_assignments as boolean,
    canEditQuizzes:       row.can_edit_quizzes as boolean,
    canDeleteQuizzes:     row.can_delete_quizzes as boolean,
    canEditAttendance:    row.can_edit_attendance as boolean,
    canDeleteAttendance:  row.can_delete_attendance as boolean,
    canSoftDeleteOnly:    row.can_soft_delete_only as boolean,
    canViewCourses:       (row.can_view_courses     as boolean) ?? true,
    canViewBatches:       (row.can_view_batches     as boolean) ?? true,
    canViewLearners:      (row.can_view_learners    as boolean) ?? true,
    canViewAssignments:   (row.can_view_assignments as boolean) ?? true,
    canViewQuizzes:       (row.can_view_quizzes     as boolean) ?? true,
    canViewAttendance:    (row.can_view_attendance  as boolean) ?? true,
    canViewContent:       (row.can_view_content     as boolean) ?? true,
    canViewRecordings:    (row.can_view_recordings  as boolean) ?? true,
    canViewDashboard:     (row.can_view_dashboard   as boolean) ?? true,
    canViewTrainers:      (row.can_view_trainers    as boolean) ?? true,
    canViewProjects:      (row.can_view_projects    as boolean) ?? true,
    canViewPlacements:    (row.can_view_placements  as boolean) ?? true,
    canViewFees:          (row.can_view_fees        as boolean) ?? true,
    canViewMessaging:     (row.can_view_messaging   as boolean) ?? true,
    canViewAiTutor:       (row.can_view_ai_tutor    as boolean) ?? true,
    updatedAt:            row.updated_at as string,
    updatedByName:        row.updated_by_name as string | null,
  };
}

/** Get permissions for one trainer — auto-creates defaults if missing */
export async function getPermissions(trainerId: string): Promise<TrainerPermissions> {
  // Verify trainer exists
  const user = await db.query(
    `SELECT id FROM users WHERE id = $1 AND role = 'TRAINER'`,
    [trainerId],
  );
  if (!user.rowCount) throw new AppError('Trainer not found', 404, 'NOT_FOUND');

  const { rows } = await db.query(
    `SELECT p.*, u.name AS updated_by_name
     FROM trainer_permissions p
     LEFT JOIN users u ON u.id = p.updated_by
     WHERE p.trainer_id = $1`,
    [trainerId],
  );

  if (rows.length) return mapRow(rows[0]);

  // Auto-create defaults
  const { rows: created } = await db.query(
    `INSERT INTO trainer_permissions (trainer_id, ${Object.keys(DEFAULT_PERMS).join(', ')})
     VALUES ($1, ${Object.keys(DEFAULT_PERMS).map((_, i) => `$${i + 2}`).join(', ')})
     RETURNING *, NULL AS updated_by_name`,
    [trainerId, ...Object.values(DEFAULT_PERMS)],
  );
  return mapRow(created[0]);
}

/** Get permissions for all trainers at once (for the Role Control page) */
export async function getAllPermissions(): Promise<TrainerPermissions[]> {
  const { rows } = await db.query(
    `SELECT p.*, u.name AS updated_by_name
     FROM trainer_permissions p
     LEFT JOIN users u ON u.id = p.updated_by
     ORDER BY p.updated_at DESC`,
  );
  return rows.map(mapRow);
}

/** Upsert permissions for a trainer */
export async function updatePermissions(
  trainerId: string,
  perms: Partial<Omit<TrainerPermissions, 'trainerId' | 'updatedAt' | 'updatedByName'>>,
  updatedBy: string,
): Promise<TrainerPermissions> {
  // Verify trainer exists
  const user = await db.query(
    `SELECT id FROM users WHERE id = $1 AND role = 'TRAINER'`,
    [trainerId],
  );
  if (!user.rowCount) throw new AppError('Trainer not found', 404, 'NOT_FOUND');

  // Build column map from camelCase → snake_case
  const colMap: Record<string, string> = {
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
    canViewCourses:       'can_view_courses',
    canViewBatches:       'can_view_batches',
    canViewLearners:      'can_view_learners',
    canViewAssignments:   'can_view_assignments',
    canViewQuizzes:       'can_view_quizzes',
    canViewAttendance:    'can_view_attendance',
    canViewContent:       'can_view_content',
    canViewRecordings:    'can_view_recordings',
    canViewDashboard:     'can_view_dashboard',
    canViewTrainers:      'can_view_trainers',
    canViewProjects:      'can_view_projects',
    canViewPlacements:    'can_view_placements',
    canViewFees:          'can_view_fees',
    canViewMessaging:     'can_view_messaging',
    canViewAiTutor:       'can_view_ai_tutor',
  };


  // Ensure row exists first (upsert defaults)
  await db.query(
    `INSERT INTO trainer_permissions (trainer_id, ${Object.keys(DEFAULT_PERMS).join(', ')})
     VALUES ($1, ${Object.keys(DEFAULT_PERMS).map((_, i) => `$${i + 2}`).join(', ')})
     ON CONFLICT (trainer_id) DO NOTHING`,
    [trainerId, ...Object.values(DEFAULT_PERMS)],
  );

  // Now apply the specific fields being updated
  const setClauses: string[] = ['updated_at = NOW()', 'updated_by = $2'];
  const values: unknown[]    = [trainerId, updatedBy];
  let   idx = 3;

  for (const [key, col] of Object.entries(colMap)) {
    if (key in perms) {
      setClauses.push(`${col} = $${idx++}`);
      values.push((perms as Record<string, unknown>)[key]);
    }
  }

  await db.query(
    `UPDATE trainer_permissions SET ${setClauses.join(', ')} WHERE trainer_id = $1`,
    values,
  );

  return getPermissions(trainerId);
}

/** Check if a trainer has a specific permission */
export async function checkPermission(
  trainerId: string,
  permission: keyof Omit<TrainerPermissions, 'trainerId' | 'updatedAt' | 'updatedByName'>,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT * FROM trainer_permissions WHERE trainer_id = $1`,
    [trainerId],
  );
  if (!rows.length) return false;
  const perms = mapRow(rows[0]);
  return perms[permission] as boolean;
}
