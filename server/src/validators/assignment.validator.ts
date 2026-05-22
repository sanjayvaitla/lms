import { z } from 'zod';

/**
 * Handles FormData quirks:
 * - batchIds arrives as a JSON string (e.g. '["uuid1","uuid2"]') from FormData
 * - dueDate may be an ISO string or absent
 * - maxScore comes as a string from FormData → z.coerce handles it
 */
export const createAssignmentSchema = z.object({
  courseId:    z.string().uuid(),
  moduleId:    z.string().uuid().optional(),
  title:       z.string().min(2),
  description: z.string().optional(),
  dueDate:     z.string().optional().refine(
    (val) => !val || !isNaN(Date.parse(val)),
    { message: 'Invalid date format' },
  ),
  maxScore:    z.coerce.number().int().min(1).default(100),
  status:      z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).default('DRAFT'),
  batchIds:    z.preprocess(
    (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
      }
      return [];
    },
    z.array(z.string().uuid()).default([]),
  ),
});

export const updateAssignmentSchema = createAssignmentSchema.partial().omit({ courseId: true });

export const gradeSubmissionSchema = z.object({
  score:    z.coerce.number().min(0),
  feedback: z.string().optional(),
  status:   z.enum(['SUBMITTED', 'GRADED']).default('GRADED'),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
