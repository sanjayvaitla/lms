/**
 * User Permissions Service
 * Unified permission system for ADMIN and TRAINER roles
 * SUPER_ADMIN has all permissions by default (not stored in DB)
 */

import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';

export interface UserPermissions {
  userId: string;
  // Sidebar visibility
  canViewDashboard:   boolean;
  canViewCourses:     boolean;
  canViewBatches:     boolean;
  canViewContent:     boolean;
  canViewLearners:    boolean;
  canViewTrainers:    boolean;
  canViewAssignments: boolean;
  canViewQuizzes:     boolean;
  canViewProjects:    boolean;
  canViewPlacements:  boolean;
  canViewAttendance:  boolean;
  canViewFees:        boolean;
  canViewMessaging:   boolean;
  canViewAiTutor:     boolean;
  // Action permissions
  canEditCourses:       boolean;
  canDeleteCourses:     boolean;
  canEditBatches:       boolean;
  canDeleteBatches:     boolean;
  canEditLearners:      boolean;
  canDeleteLearners:    boolean;
  canEditTrainers:      boolean;
  canDeleteTrainers:    boolean;
  canEditAssignments:   boolean;
  canDeleteAssignments: boolean;
  canEditQuizzes:       boolean;
  canDeleteQuizzes:     boolean;
  canEditAttendance:    boolean;
  canDeleteAttendance:  boolean;
  canEditFees:          boolean;
  canDeleteFees:        boolean;
  canSoftDeleteOnly:    boolean;
}

const DEFAULT_PERMS: Omit<UserPermissions, 'userId'> = {
  canViewDashboard: true, canViewCourses: true, canViewBatches: true, canViewContent: true,
  canViewLearners: true, canViewTrainers: false, canViewAssignments: true, canViewQuizzes: true,
  canViewProjects: false, canViewPlacements: false, canViewAttendance: true, canViewFees: false,
  canViewMessaging: true, canViewAiTutor: true,
  canEditCourses: false, canDeleteCourses: false,
  canEditBatches: false, canDeleteBatches: false,
  canEditLearners: false, canDeleteLearners: false,
  canEditTrainers: false, canDeleteTrainers: false,
  canEditAssignments: false, canDeleteAssignments: false,
  canEditQuizzes: false, canDeleteQuizzes: false,
  canEditAttendance: false, canDeleteAttendance: false,
  canEditFees: false, canDeleteFees: false,
  canSoftDeleteOnly: false,
};

function mapRow(row: any): UserPermissions {
  return {
    userId: row.user_id as string,
    canViewDashboard:   row.can_view_dashboard as boolean,
    canViewCourses:     row.can_view_courses as boolean,
    canViewBatches:     row.can_view_batches as boolean,
    canViewContent:     row.can_view_content as boolean,
    canViewLearners:    row.can_view_learners as boolean,
    canViewTrainers:    row.can_view_trainers as boolean,
    canViewAssignments: row.can_view_assignments as boolean,
    canViewQuizzes:     row.can_view_quizzes as boolean,
    canViewProjects:    row.can_view_projects as boolean,
    canViewPlacements:  row.can_view_placements as boolean,
    canViewAttendance:  row.can_view_attendance as boolean,
    canViewFees:        row.can_view_fees as boolean,
    canViewMessaging:   row.can_view_messaging as boolean,
    canViewAiTutor:     row.can_view_ai_tutor as boolean,
    canEditCourses:       row.can_edit_courses as boolean,
    canDeleteCourses:     row.can_delete_courses as boolean,
    canEditBatches:       row.can_edit_batches as boolean,
    canDeleteBatches:     row.can_delete_batches as boolean,
    canEditLearners:      row.can_edit_learners as boolean,
    canDeleteLearners:    row.can_delete_learners as boolean,
    canEditTrainers:      row.can_edit_trainers as boolean,
    canDeleteTrainers:    row.can_delete_trainers as boolean,
    canEditAssignments:   row.can_edit_assignments as boolean,
    canDeleteAssignments: row.can_delete_assignments as boolean,
    canEditQuizzes:       row.can_edit_quizzes as boolean,
    canDeleteQuizzes:     row.can_delete_quizzes as boolean,
    canEditAttendance:    row.can_edit_attendance as boolean,
    canDeleteAttendance:  row.can_delete_attendance as boolean,
    canEditFees:          row.can_edit_fees as boolean,
    canDeleteFees:        row.can_delete_fees as boolean,
    canSoftDeleteOnly:    row.can_soft_delete_only as boolean,
  };
}

/**
 * Get permissions for a user (ADMIN or TRAINER)
 * SUPER_ADMIN always gets full permissions (not from DB)
 */
export async function getUserPermissions(userId: string, userRole: string): Promise<UserPermissions> {
  // SUPER_ADMIN and LD_MANAGER have all permissions
  if (userRole === 'SUPER_ADMIN' || userRole === 'LD_MANAGER') {
    return {
      userId,
      canViewDashboard: true, canViewCourses: true, canViewBatches: true, canViewContent: true,
      canViewLearners: true, canViewTrainers: true, canViewAssignments: true, canViewQuizzes: true,
      canViewProjects: true, canViewPlacements: true, canViewAttendance: true, canViewFees: true,
      canViewMessaging: true, canViewAiTutor: true,
      canEditCourses: true, canDeleteCourses: true,
      canEditBatches: true, canDeleteBatches: true,
      canEditLearners: true, canDeleteLearners: true,
      canEditTrainers: true, canDeleteTrainers: true,
      canEditAssignments: true, canDeleteAssignments: true,
      canEditQuizzes: true, canDeleteQuizzes: true,
      canEditAttendance: true, canDeleteAttendance: true,
      canEditFees: true, canDeleteFees: true,
      canSoftDeleteOnly: false,
    };
  }

  // OPERATIONAL_MANAGER has view-only for most, but edit for Courses and Batches
  if (userRole === 'OPERATIONAL_MANAGER') {
    return {
      userId,
      canViewDashboard: true, canViewCourses: true, canViewBatches: true, canViewContent: true,
      canViewLearners: true, canViewTrainers: true, canViewAssignments: true, canViewQuizzes: true,
      canViewProjects: true, canViewPlacements: true, canViewAttendance: true, canViewFees: false,
      canViewMessaging: true, canViewAiTutor: true,
      canEditCourses: true, canDeleteCourses: true,
      canEditBatches: true, canDeleteBatches: true,
      canEditLearners: false, canDeleteLearners: false,
      canEditTrainers: false, canDeleteTrainers: false,
      canEditAssignments: false, canDeleteAssignments: false,
      canEditQuizzes: false, canDeleteQuizzes: false,
      canEditAttendance: false, canDeleteAttendance: false,
      canEditFees: false, canDeleteFees: false,
      canSoftDeleteOnly: false,
    };
  }

  const { rows } = await db.query('SELECT * FROM user_permissions WHERE user_id = $1', [userId]);
  
  if (!rows.length) {
    // Return defaults if no permissions record exists
    return { userId, ...DEFAULT_PERMS };
  }

  return mapRow(rows[0]);
}

/**
 * Get all users with their permissions (for Role Control page)
 */
export async function getAllUserPermissions(): Promise<Array<UserPermissions & { name: string; email: string; role: string }>> {
  const { rows } = await db.query(`
    SELECT 
      u.id as user_id, u.name, u.email, u.role,
      COALESCE(up.can_view_dashboard, true) as can_view_dashboard,
      COALESCE(up.can_view_courses, true) as can_view_courses,
      COALESCE(up.can_view_batches, true) as can_view_batches,
      COALESCE(up.can_view_content, true) as can_view_content,
      COALESCE(up.can_view_learners, true) as can_view_learners,
      COALESCE(up.can_view_trainers, false) as can_view_trainers,
      COALESCE(up.can_view_assignments, true) as can_view_assignments,
      COALESCE(up.can_view_quizzes, true) as can_view_quizzes,
      COALESCE(up.can_view_projects, false) as can_view_projects,
      COALESCE(up.can_view_placements, false) as can_view_placements,
      COALESCE(up.can_view_attendance, true) as can_view_attendance,
      COALESCE(up.can_view_fees, false) as can_view_fees,
      COALESCE(up.can_view_messaging, true) as can_view_messaging,
      COALESCE(up.can_view_ai_tutor, true) as can_view_ai_tutor,
      COALESCE(up.can_edit_courses, false) as can_edit_courses,
      COALESCE(up.can_delete_courses, false) as can_delete_courses,
      COALESCE(up.can_edit_batches, false) as can_edit_batches,
      COALESCE(up.can_delete_batches, false) as can_delete_batches,
      COALESCE(up.can_edit_learners, false) as can_edit_learners,
      COALESCE(up.can_delete_learners, false) as can_delete_learners,
      COALESCE(up.can_edit_trainers, false) as can_edit_trainers,
      COALESCE(up.can_delete_trainers, false) as can_delete_trainers,
      COALESCE(up.can_edit_assignments, false) as can_edit_assignments,
      COALESCE(up.can_delete_assignments, false) as can_delete_assignments,
      COALESCE(up.can_edit_quizzes, false) as can_edit_quizzes,
      COALESCE(up.can_delete_quizzes, false) as can_delete_quizzes,
      COALESCE(up.can_edit_attendance, false) as can_edit_attendance,
      COALESCE(up.can_delete_attendance, false) as can_delete_attendance,
      COALESCE(up.can_edit_fees, false) as can_edit_fees,
      COALESCE(up.can_delete_fees, false) as can_delete_fees,
      COALESCE(up.can_soft_delete_only, false) as can_soft_delete_only
    FROM users u
    LEFT JOIN user_permissions up ON u.id = up.user_id
    WHERE u.role IN ('ADMIN', 'TRAINER')
    ORDER BY u.role, u.name
  `);

  return rows.map(row => ({
    ...mapRow(row),
    name: row.name as string,
    email: row.email as string,
    role: row.role as string,
  }));
}

/**
 * Update user permissions (SUPER_ADMIN only)
 */
export async function updateUserPermissions(
  userId: string,
  updates: Partial<Omit<UserPermissions, 'userId'>>,
  updatedBy: string,
): Promise<UserPermissions> {
  // Verify user exists and is ADMIN or TRAINER
  const { rows: userRows } = await db.query(
    'SELECT id, role FROM users WHERE id = $1 AND role IN ($2, $3)',
    [userId, 'ADMIN', 'TRAINER'],
  );
  if (!userRows.length) {
    throw new AppError('User not found or not eligible for permissions', 404, 'NOT_FOUND');
  }

  const colMap: Record<string, string> = {
    canViewDashboard: 'can_view_dashboard', canViewCourses: 'can_view_courses',
    canViewBatches: 'can_view_batches', canViewContent: 'can_view_content',
    canViewLearners: 'can_view_learners', canViewTrainers: 'can_view_trainers',
    canViewAssignments: 'can_view_assignments', canViewQuizzes: 'can_view_quizzes',
    canViewProjects: 'can_view_projects', canViewPlacements: 'can_view_placements',
    canViewAttendance: 'can_view_attendance', canViewFees: 'can_view_fees',
    canViewMessaging: 'can_view_messaging', canViewAiTutor: 'can_view_ai_tutor',
    canEditCourses: 'can_edit_courses', canDeleteCourses: 'can_delete_courses',
    canEditBatches: 'can_edit_batches', canDeleteBatches: 'can_delete_batches',
    canEditLearners: 'can_edit_learners', canDeleteLearners: 'can_delete_learners',
    canEditTrainers: 'can_edit_trainers', canDeleteTrainers: 'can_delete_trainers',
    canEditAssignments: 'can_edit_assignments', canDeleteAssignments: 'can_delete_assignments',
    canEditQuizzes: 'can_edit_quizzes', canDeleteQuizzes: 'can_delete_quizzes',
    canEditAttendance: 'can_edit_attendance', canDeleteAttendance: 'can_delete_attendance',
    canEditFees: 'can_edit_fees', canDeleteFees: 'can_delete_fees',
    canSoftDeleteOnly: 'can_soft_delete_only',
  };

  const setClauses: string[] = [];
  const values: any[] = [userId];
  let paramIdx = 2;

  for (const [key, val] of Object.entries(updates)) {
    if (colMap[key]) {
      setClauses.push(`${colMap[key]} = $${paramIdx}`);
      values.push(val);
      paramIdx++;
    }
  }

  if (setClauses.length === 0) {
    throw new AppError('No valid fields to update', 400, 'INVALID_INPUT');
  }

  setClauses.push(`updated_at = NOW()`);
  setClauses.push(`updated_by = $${paramIdx}`);
  values.push(updatedBy);

  const sql = `
    INSERT INTO user_permissions (user_id, ${setClauses.map((_, i) => colMap[Object.keys(updates)[i]] || 'updated_at').join(', ')})
    VALUES ($1, ${values.slice(1).map((_, i) => `$${i + 2}`).join(', ')})
    ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}
    RETURNING *
  `;

  // Simpler upsert
  const upsertSql = `
    INSERT INTO user_permissions (user_id, ${Object.keys(updates).map(k => colMap[k]).filter(Boolean).join(', ')}, updated_at, updated_by)
    VALUES ($1, ${Object.keys(updates).map((_, i) => `$${i + 2}`).join(', ')}, NOW(), $${paramIdx})
    ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}
    RETURNING *
  `;

  const { rows } = await db.query(upsertSql, values);
  return mapRow(rows[0]);
}

/**
 * Create default permissions for a new user
 */
export async function createDefaultPermissions(userId: string, role: 'ADMIN' | 'TRAINER'): Promise<void> {
  const isAdmin = role === 'ADMIN';
  
  await db.query(`
    INSERT INTO user_permissions (
      user_id,
      can_view_dashboard, can_view_courses, can_view_batches, can_view_content,
      can_view_learners, can_view_trainers, can_view_assignments, can_view_quizzes,
      can_view_projects, can_view_placements, can_view_attendance, can_view_fees,
      can_view_messaging, can_view_ai_tutor,
      can_edit_courses, can_delete_courses,
      can_edit_batches, can_delete_batches,
      can_edit_learners, can_delete_learners,
      can_edit_trainers, can_delete_trainers,
      can_edit_assignments, can_delete_assignments,
      can_edit_quizzes, can_delete_quizzes,
      can_edit_attendance, can_delete_attendance,
      can_edit_fees, can_delete_fees,
      can_soft_delete_only
    ) VALUES (
      $1,
      TRUE, TRUE, TRUE, TRUE, TRUE, $2, TRUE, TRUE, $2, $2, TRUE, $2, TRUE, TRUE,
      $2, $2, $2, $2, $2, $2, $2, $2, $2, $2, $2, $2, $2, $2, $2, $2,
      FALSE
    )
    ON CONFLICT (user_id) DO NOTHING
  `, [userId, isAdmin]);
}
