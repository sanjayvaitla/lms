import { z } from 'zod';

export const createTrainerSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters'),
  email:    z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  bio:      z.string().optional(),
  skills:   z.string().optional(),
  linkedin: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
  phone:    z.string().optional(),
});

export const updateTrainerSchema = z.object({
  name:     z.string().min(2).optional(),
  email:    z.string().email().optional(),
  bio:      z.string().optional(),
  skills:   z.string().optional(),
  linkedin: z.string().url('Invalid LinkedIn URL').optional().or(z.literal('')),
  phone:    z.string().optional(),
});

export type CreateTrainerInput = z.infer<typeof createTrainerSchema>;
export type UpdateTrainerInput = z.infer<typeof updateTrainerSchema>;
