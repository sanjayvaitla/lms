import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { registerSchema, loginSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators/auth.validator';
import { AppError } from '../middleware/error.middleware';

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
