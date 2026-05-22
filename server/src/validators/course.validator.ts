import { z } from 'zod';

const courseStatuses = ['ACTIVE', 'NEW', 'DRAFT', 'ARCHIVED'] as const;
const courseLevels   = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
const colorTokens    = ['emerald', 'cyan', 'purple', 'amber', 'rose', 'indigo', 'sky', 'orange'] as const;

export const createCourseSchema = z.object({
  title:          z.string().min(3, 'Title must be at least 3 characters').max(200),
  category:       z.string().min(1, 'Category is required').max(50),
  status:         z.enum(courseStatuses).default('ACTIVE'),
  level:          z.enum(courseLevels).default('INTERMEDIATE'),
  durationMonths: z.number().int().min(1).max(24),
  description:    z.string().max(1000).optional(),
  trainerId:      z.string().uuid().optional().nullable().or(z.literal('').transform(() => null)),
  colorToken:     z.enum(colorTokens).default('emerald'),
});

export const updateCourseSchema = createCourseSchema.partial();

export const courseQuerySchema = z.object({
  search:   z.string().optional(),
  category: z.string().optional(),
  status:   z.enum(courseStatuses).optional(),
  level:    z.enum(courseLevels).optional(),
  page:     z.coerce.number().int().min(1).default(1),
  limit:    z.coerce.number().int().min(1).max(100).default(12),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
