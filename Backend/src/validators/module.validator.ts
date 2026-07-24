import { z } from 'zod';

export const createModuleSchema = z.object({
  title:       z.string().min(2, 'Title required'),
  description: z.string().optional(),
  sortOrder:   z.coerce.number().int().min(0).optional(),
});

export const updateModuleSchema = createModuleSchema.partial();

export const createSubSessionSchema = z.object({
  afterModuleId:   z.string().uuid('Invalid parent session'),
  sessionNumber:   z.string()
    .min(1, 'Session number required (e.g. 1.1)')
    .regex(/^\d+(\.\d+)+$/, 'Use dotted sub-session numbers like 1.1 or 2.3'),
  title:           z.string().min(2, 'Title required'),
  description:     z.string().optional(),
  section:         z.string().optional(),
  durationMinutes: z.coerce.number().int().min(1).max(480).optional(),
  topics:          z.array(z.string()).optional().default([]),
});

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type CreateSubSessionInput = z.infer<typeof createSubSessionSchema>;
