import { Request, Response } from 'express';
import * as otpService from '../services/auth.otp.service';
import { AppError } from '../middleware/error.middleware';
import { z } from 'zod';

const sendOtpSchema = z.object({
  phone: z.string().min(8).max(16),
});

const verifyOtpSchema = z.object({
  phone: z.string().min(8).max(16),
  otp:   z.string().length(6, 'OTP must be 6 digits'),
  name:  z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
});

// POST /api/auth/send-otp
export async function sendOtp(req: Request, res: Response) {
  const parsed = sendOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  const result = await otpService.sendOtp(parsed.data.phone);
  res.json({ success: true, data: result });
}

// POST /api/auth/verify-otp
export async function verifyOtp(req: Request, res: Response) {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  }
  const result = await otpService.verifyOtp(
    parsed.data.phone,
    parsed.data.otp,
    { name: parsed.data.name, email: parsed.data.email },
  );
  res.json({ success: true, data: result });
}
