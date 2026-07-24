import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/\d/, 'Password must contain a number'),
  role: z.enum(['STUDENT', 'INTERN']).optional().default('STUDENT'),
  // Extended student intake fields (friend's signup)
  phoneNumber:     z.string().optional().nullable(),
  dateOfBirth:     z.string().optional().nullable(),
  address:         z.string().optional().nullable(),
  occupation:      z.string().optional().nullable(),
  qualification:   z.string().optional().nullable(),
  graduationYear:  z.string().optional().nullable(),
  classPreference: z.string().optional().nullable(),
  leadSource:      z.string().optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/\d/, 'Password must contain a number'),
});

export const validateResetTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

/** Student self-service profile — never email/phone (login identity; L&D / Super Admin only) */
export const updateProfileSchema = z.object({
  name:            z.string().min(2).max(100).optional(),
  dateOfBirth:     z.string().optional().nullable(),
  address:         z.string().max(500).optional().nullable(),
  occupation:      z.string().max(100).optional().nullable(),
  qualification:   z.string().max(200).optional().nullable(),
  graduationYear:  z.string().max(20).optional().nullable(),
  classPreference: z.string().max(50).optional().nullable(),
  leadSource:      z.string().max(100).optional().nullable(),
  /** GitHub login, unique LMS-wide; need not match real name/email */
  githubUsername:  z.string().max(39).optional().nullable()
    .refine(
      (v) => v == null || v === '' || /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(v),
      'Invalid GitHub username format',
    ),
});

export type RegisterInput        = z.infer<typeof registerSchema>;
export type LoginInput           = z.infer<typeof loginSchema>;
export type ForgotPasswordInput  = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput   = z.infer<typeof resetPasswordSchema>;
export type UpdateProfileInput   = z.infer<typeof updateProfileSchema>;
