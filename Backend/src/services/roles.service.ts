import db from '../lib/db';
import bcrypt from 'bcryptjs';
import { AppError } from '../middleware/error.middleware';
import { sendEmail, passwordChangedEmail } from '../lib/email';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'TRAINER' | 'STUDENT' | 'LD_MANAGER' | 'OPERATIONAL_MANAGER' | 'FEES_ADMIN';

export interface UserWithRole {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

/**
 * List all users with their roles (for Super Admin management).
 * Optionally filter by role.
 */
export async function listUsersWithRoles(roleFilter?: UserRole): Promise<UserWithRole[]> {
  let query = `SELECT id, name, email, role, created_at AS "createdAt", account_status AS "accountStatus" FROM users`;
  const params: unknown[] = [];

  if (roleFilter) {
    query += ` WHERE role = $1`;
    params.push(roleFilter);
  }

  query += ` ORDER BY role, name`;
  const { rows } = await db.query<UserWithRole>(query, params);
  return rows;
}

/**
 * Get a single user's role info.
 */
export async function getUserRole(userId: string): Promise<UserWithRole> {
  const { rows } = await db.query<UserWithRole>(
    `SELECT id, name, email, role, created_at AS "createdAt" FROM users WHERE id = $1`,
    [userId],
  );
  if (!rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');
  return rows[0];
}

/**
 * Assign a new role to a user.
 * Rules:
 * - Cannot change SUPER_ADMIN role (only one super admin allowed)
 * - Cannot promote to SUPER_ADMIN
 * - When demoting from TRAINER, remove their permissions row
 * - When promoting to TRAINER, create default permissions row
 */
export async function assignRole(
  userId: string,
  newRole: UserRole,
  assignedBy: string,
): Promise<UserWithRole> {
  // Validate the new role
  const validRoles: UserRole[] = ['ADMIN', 'TRAINER', 'STUDENT'];
  if (!validRoles.includes(newRole)) {
    throw new AppError('Cannot assign SUPER_ADMIN role', 403, 'FORBIDDEN');
  }

  // Get current user
  const { rows: userRows } = await db.query(
    `SELECT id, name, email, role FROM users WHERE id = $1`,
    [userId],
  );
  if (!userRows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');

  const currentRole = userRows[0].role as UserRole;

  // Cannot change SUPER_ADMIN
  if (currentRole === 'SUPER_ADMIN') {
    throw new AppError('Cannot change Super Admin role', 403, 'FORBIDDEN');
  }

  // Cannot assign to self
  if (userId === assignedBy) {
    throw new AppError('Cannot change your own role', 400, 'SELF_ROLE_CHANGE');
  }

  // Same role — no-op
  if (currentRole === newRole) {
    return getUserRole(userId);
  }

  // If demoting from TRAINER, clean up permissions
  if (currentRole === 'TRAINER' && newRole !== 'TRAINER') {
    await db.query('DELETE FROM trainer_permissions WHERE trainer_id = $1', [userId]);
  }

  // If promoting to TRAINER, create default permissions
  if (newRole === 'TRAINER' && currentRole !== 'TRAINER') {
    await db.query(
      `INSERT INTO trainer_permissions (trainer_id)
       VALUES ($1)
       ON CONFLICT (trainer_id) DO NOTHING`,
      [userId],
    );
  }

  // Update the role
  await db.query(
    `UPDATE users SET role = $1 WHERE id = $2`,
    [newRole, userId],
  );

  return getUserRole(userId);
}

/**
 * Get role statistics for the dashboard.
 */
export async function getRoleStats() {
  const { rows } = await db.query(
    `SELECT role, COUNT(*)::int AS count FROM users GROUP BY role ORDER BY role`,
  );
  return rows;
}


/**
 * Creates a new user with a specific role.
 */
export async function createUser(
  data: { name: string; email: string; role: UserRole; password: string },
  actor: { userId: string; role: UserRole }
): Promise<UserWithRole> {
  // Validate hierarchy
  if (actor.role === 'SUPER_ADMIN') {
    const allowed = ['SUPER_ADMIN', 'LD_MANAGER', 'FEES_ADMIN', 'OPERATIONAL_MANAGER', 'TRAINER', 'ADMIN', 'STUDENT'];
    if (!allowed.includes(data.role)) {
      throw new AppError('Super Admin cannot create ' + data.role, 403, 'FORBIDDEN');
    }
  } else if (actor.role === 'LD_MANAGER') {
    const allowed = ['OPERATIONAL_MANAGER', 'TRAINER'];
    if (!allowed.includes(data.role)) {
      throw new AppError('L&D Manager can only create Ops Managers and Trainers', 403, 'FORBIDDEN');
    }
  } else {
    throw new AppError('Only Super Admin and L&D Manager can create accounts', 403, 'FORBIDDEN');
  }

  // Check email
  const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [data.email.toLowerCase().trim()]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw new AppError('Email already registered', 409, 'DUPLICATE');
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const { rows } = await db.query<UserWithRole>(
    `INSERT INTO users (name, email, password_hash, role, account_status)
     VALUES ($1, $2, $3, $4, 'ACTIVE')
     RETURNING id, name, email, role, created_at AS "createdAt"`,
    [data.name, data.email, passwordHash, data.role]
  );
  
  const user = rows[0];

  // If creating a trainer, insert default permissions
  if (user.role === 'TRAINER') {
    await db.query(
      `INSERT INTO trainer_permissions (trainer_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [user.id]
    );
  }

  return user;
}

/**
 * Changes a user's password.
 */
export async function changeUserPassword(
  targetUserId: string,
  newPassword: string,
  actor: { userId: string; role: UserRole }
): Promise<void> {
  // Get target user
  const { rows } = await db.query('SELECT id, name, email, role FROM users WHERE id = $1', [targetUserId]);
  if (!rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');
  
  const targetRole = rows[0].role as UserRole;

  // Validate hierarchy
  if (actor.role === 'LD_MANAGER') {
    const allowed = ['OPERATIONAL_MANAGER', 'TRAINER'];
    if (!allowed.includes(targetRole)) {
      throw new AppError('L&D Manager can only change passwords for Ops Managers and Trainers', 403, 'FORBIDDEN');
    }
  } else if (actor.role !== 'SUPER_ADMIN') {
    throw new AppError('Not authorized to change passwords', 403, 'FORBIDDEN');
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  
  await db.transaction(async (tx) => {
    await db.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [passwordHash, targetUserId],
      tx
    );
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [targetUserId], tx);
  });

  // Send notification email
  const emailOpts = passwordChangedEmail(rows[0].name);
  emailOpts.to = rows[0].email;
  sendEmail(emailOpts).catch(err => console.error('[email] Error sending password change email to', rows[0].email, err));
}

/**
 * Activates or deactivates a user account.
 */
export async function toggleUserStatus(
  targetUserId: string,
  action: 'ACTIVATE' | 'DEACTIVATE',
  actor: { userId: string; role: UserRole }
): Promise<void> {
  const { rows } = await db.query('SELECT id, role FROM users WHERE id = $1', [targetUserId]);
  if (!rows[0]) throw new AppError('User not found', 404, 'NOT_FOUND');
  
  const targetRole = rows[0].role as UserRole;

  if (targetRole !== 'STUDENT') {
    throw new AppError('Status can only be toggled for STUDENT accounts', 403, 'FORBIDDEN');
  }

  if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'LD_MANAGER') {
    throw new AppError('Not authorized to toggle account status', 403, 'FORBIDDEN');
  }

  const newStatus = action === 'ACTIVATE' ? 'ACTIVE' : 'BLOCKED';

  await db.query(
    'UPDATE users SET account_status = $1, updated_at = NOW() WHERE id = $2',
    [newStatus, targetUserId]
  );

  const { invalidateAuthGateCache } = await import('../lib/tokens');
  invalidateAuthGateCache(targetUserId);
  
  if (newStatus === 'BLOCKED') {
    await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [targetUserId]);
  }
}

export async function deleteUser(
  targetUserId: string,
  actor: { userId: string; role: UserRole }
) {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new AppError('Only Super Admin can delete accounts', 403, 'FORBIDDEN');
  }
  
  if (targetUserId === actor.userId) {
    throw new AppError('Cannot delete your own account', 400, 'BAD_REQUEST');
  }

  const { rows } = await db.query('SELECT role FROM users WHERE id = $1', [targetUserId]);
  if (!rows.length) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  if (rows[0].role === 'SUPER_ADMIN') {
    throw new AppError('Cannot delete a Super Admin', 403, 'FORBIDDEN');
  }

  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [targetUserId]);
  await db.query('DELETE FROM trainer_permissions WHERE trainer_id = $1', [targetUserId]);
  
  // if learner, cleanup their enrollments 
  if (rows[0].role === 'STUDENT') {
    await db.query(`
      DELETE FROM program_course_selections
      WHERE program_enrollment_id IN (
        SELECT id FROM program_enrollments WHERE student_id = $1
      )`, [targetUserId]);
    await db.query('DELETE FROM program_enrollments WHERE student_id = $1', [targetUserId]);
    await db.query('DELETE FROM payment_proofs     WHERE student_id = $1', [targetUserId]);
    await db.query('DELETE FROM student_fees       WHERE student_id = $1', [targetUserId]);
    await db.query('DELETE FROM enrollments        WHERE student_id = $1', [targetUserId]);
  }
  
  await db.query('DELETE FROM users WHERE id = $1', [targetUserId]);
}
