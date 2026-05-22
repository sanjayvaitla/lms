import { z } from 'zod';

export const createLearnerSchema = z.object({
  name:     z.string().min(2, 'Name must be at least 2 characters').max(100),
  email:    z.string().email('Invalid email address'),
  password: z.string().min(6).optional(),
});

export const updateLearnerSchema = createLearnerSchema.partial();

export type CreateLearnerInput = z.infer<typeof createLearnerSchema>;
export type UpdateLearnerInput = z.infer<typeof updateLearnerSchema>;
