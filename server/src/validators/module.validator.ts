import { z } from 'zod';

export const createModuleSchema = z.object({
  title:       z.string().min(2, 'Title required'),
  description: z.string().optional(),
  sortOrder:   z.coerce.number().int().min(0).optional(),
});

export const updateModuleSchema = createModuleSchema.partial();

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
