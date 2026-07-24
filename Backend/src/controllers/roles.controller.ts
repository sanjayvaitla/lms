import { Request, Response } from 'express';
import * as svc from '../services/roles.service';
import { AppError } from '../middleware/error.middleware';

/** GET /roles/users — list all users with roles (optionally filter by role) */
export async function listUsers(req: Request, res: Response) {
  const roleFilter = req.query.role as svc.UserRole | undefined;
  const users = await svc.listUsersWithRoles(roleFilter);
  res.json({ success: true, data: users });
}

/** GET /roles/users/:id — get a single user's role */
export async function getUser(req: Request, res: Response) {
  const user = await svc.getUserRole(String(req.params.id));
  res.json({ success: true, data: user });
}

/** PUT /roles/users/:id — assign a new role to a user */
export async function assignRole(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');

  const { role } = req.body as { role: string };
  if (!role) throw new AppError('role is required', 400, 'VALIDATION_ERROR');

  const validRoles = ['ADMIN', 'TRAINER', 'STUDENT'];
  if (!validRoles.includes(role)) {
    throw new AppError(
      `Invalid role. Must be one of: ${validRoles.join(', ')}`,
      400,
      'VALIDATION_ERROR',
    );
  }

  const user = await svc.assignRole(
    String(req.params.id),
    role as svc.UserRole,
    req.user.userId,
  );
  res.json({ success: true, data: user });
}

/** GET /roles/stats — role distribution stats */
export async function stats(_req: Request, res: Response) {
  const data = await svc.getRoleStats();
  res.json({ success: true, data });
}

/** POST /roles/users — manually create a user */
export async function createUser(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const { name, email, role } = req.body;
  if (!name || !email || !role) {
    throw new AppError('Name, email, and role are required', 400, 'VALIDATION_ERROR');
  }

  // Generate a random dummy password since the user will set it via email link
  const crypto = await import('crypto');
  const dummyPassword = crypto.randomBytes(16).toString('hex');

  const user = await svc.createUser(
    { name, email, role: role as svc.UserRole, password: dummyPassword },
    { userId: req.user.userId, role: req.user.role as svc.UserRole }
  );

  const { setupUserPassword } = await import('../services/auth.service');
  await setupUserPassword(email, role);

  res.status(201).json({ success: true, data: user });
}

/** PUT /roles/users/:id/password — change user password */
export async function changePassword(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const { password } = req.body;
  if (!password) {
    throw new AppError('New password is required', 400, 'VALIDATION_ERROR');
  }

  await svc.changeUserPassword(
    String(req.params.id),
    password,
    { userId: req.user.userId, role: req.user.role as svc.UserRole }
  );
  res.json({ success: true, message: 'Password updated successfully' });
}

/** PUT /roles/users/:id/status — activate/deactivate user */
export async function toggleUserStatus(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const { action } = req.body;
  if (!action || !['ACTIVATE', 'DEACTIVATE'].includes(action)) {
    throw new AppError('Valid action (ACTIVATE or DEACTIVATE) is required', 400, 'VALIDATION_ERROR');
  }

  await svc.toggleUserStatus(
    String(req.params.id),
    action as 'ACTIVATE' | 'DEACTIVATE',
    { userId: req.user.userId, role: req.user.role as svc.UserRole }
  );
  res.json({ success: true, message: `User account ${action.toLowerCase()}d successfully` });
}

export async function deleteUser(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  await svc.deleteUser(
    String(req.params.id),
    { userId: req.user.userId, role: req.user.role as svc.UserRole }
  );
  res.json({ success: true, message: 'Account deleted successfully' });
}
