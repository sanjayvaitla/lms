import { z } from 'zod';

const batchStatuses = ['UPCOMING', 'ONGOING', 'COMPLETED'] as const;

export const createBatchSchema = z.object({
  name:      z.string().min(2).max(200),
  courseId:  z.string().uuid(),
  startDate: z.string().min(1, 'Start date is required'),
  endDate:   z.string().min(1, 'End date is required'),
  capacity:  z.number().int().min(1).max(500).default(30),
  status:    z.enum(batchStatuses).default('UPCOMING'),
});

export const updateBatchSchema = createBatchSchema.partial();

export type CreateBatchInput = z.infer<typeof createBatchSchema>;
export type UpdateBatchInput = z.infer<typeof updateBatchSchema>;
