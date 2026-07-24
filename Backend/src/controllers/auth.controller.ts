import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { ActivityLoggerService } from '../services/ActivityLoggerService';
import { registerSchema, loginSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema, validateResetTokenSchema, updateProfileSchema } from '../validators/auth.validator';
import { AppError } from '../middleware/error.middleware';

export async function checkEmail(req: Request, res: Response) {
  const email = String(req.query.email || '');
  if (!email) return res.json({ success: true, exists: false });
  const result = await authService.checkEmail(email);
  res.json({ success: true, data: result });
}

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  const result = await authService.register(parsed.data);
  res.status(201).json({ success: true, data: result });
}

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  const result = await authService.login(parsed.data);

  // Log the login activity
  const forwardedFor = req.headers['x-forwarded-for'];
  const ipAddress = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || req.socket.remoteAddress || '';
  ActivityLoggerService.log({
    userId: result.user.id,
    actionType: 'LOGIN',
    ipAddress,
  });

  res.json({ success: true, data: result });
}

export async function refresh(req: Request, res: Response) {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  const result = await authService.refresh(parsed.data.refreshToken);
  res.json({ success: true, data: result });
}

export async function logout(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  await authService.logout(req.user.userId);
  res.json({ success: true, message: 'Logged out successfully' });
}

export async function me(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const user = await authService.getMe(req.user.userId);
  res.json({ success: true, data: user });
}

export async function updateProfile(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const raw = req.body as Record<string, unknown>;
  if (
    raw.email !== undefined ||
    raw.phoneNumber !== undefined ||
    raw.phone_number !== undefined
  ) {
    throw new AppError(
      'Email and phone can only be changed by L&D Manager or Super Admin. Contact them if your login details are wrong.',
      403,
      'IDENTITY_LOCKED',
    );
  }
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  const user = await authService.updateMyProfile(req.user.userId, parsed.data);
  res.json({ success: true, data: user, message: 'Profile updated' });
}

export async function forgotPassword(req: Request, res: Response) {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  await authService.forgotPassword(parsed.data.email);
  // Always return 200 — don't reveal if email exists
  res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
}

export async function resetPassword(req: Request, res: Response) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  await authService.resetPassword(parsed.data.token, parsed.data.password);
  res.json({ success: true, message: 'Password reset successfully. Please log in.' });
}

export async function validateResetToken(req: Request, res: Response) {
  const parsed = validateResetTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  const result = await authService.validateResetToken(parsed.data.token);
  res.json({ success: true, data: result });
}

export async function uploadAvatar(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  if (!req.file) throw new AppError('No file uploaded', 400, 'NO_FILE');
  const result = await authService.uploadAvatar(req.user.userId, req.file as any);
  res.json({ success: true, data: result });
}

export async function deleteAvatar(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
  const result = await authService.deleteAvatar(req.user.userId);
  res.json({ success: true, data: result });
}
