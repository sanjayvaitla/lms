import { z } from 'zod';

export const createAssessmentSchema = z.object({
  courseId:          z.string().uuid(),
  title:             z.string().min(2),
  description:       z.string().optional(),
  dueDate:           z.string().optional().refine(
    (val) => !val || !isNaN(Date.parse(val)),
    { message: 'Invalid date format' },
  ),
  totalMarks:        z.coerce.number().min(1).default(100),
  partAMarks:        z.coerce.number().min(1).default(25),
  partBMarks:        z.coerce.number().min(1).default(75),
  partBApproachPct:  z.coerce.number().min(1).max(99).default(40),
  partBVivaPct:      z.coerce.number().min(1).max(99).default(25),
  status:            z.enum(['DRAFT', 'PUBLISHED', 'CLOSED']).default('DRAFT'),
  aiRubric:          z.string().optional(),
  batchIds: z.preprocess(
    (val) => {
      if (Array.isArray(val)) return val;
      if (typeof val === 'string') {
        try { const p = JSON.parse(val); return Array.isArray(p) ? p : []; } catch { return []; }
      }
      return [];
    },
    z.array(z.string().uuid()).default([]),
  ),
});

export const updateAssessmentSchema = createAssessmentSchema.partial().omit({ courseId: true });

export const gradeAssessmentSchema = z.object({
  partAScore:    z.coerce.number().min(0).optional(),
  approachScore: z.coerce.number().min(0).optional(),
  vivaScore:     z.coerce.number().min(0).optional(),
  solutionScore: z.coerce.number().min(0).optional(),
  feedback:      z.string().optional(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;
