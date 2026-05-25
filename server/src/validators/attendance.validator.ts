import { z } from 'zod';

// ── Attendance Status ─────────────────────────────────────────────────────────
export const AttendanceStatusEnum = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']);
export const SessionStatusEnum    = z.enum(['SCHEDULED', 'ONGOING', 'COMPLETED', 'CANCELLED']);

// ── Create Session ────────────────────────────────────────────────────────────
export const createSessionSchema = z.object({
  batchId:     z.string().uuid('Invalid batch ID'),
  trainerId:   z.string().uuid().optional().nullable(),
  title:       z.string().min(2, 'Title must be at least 2 characters').max(200),
  sessionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  startTime:   z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional().nullable(),
  endTime:     z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional().nullable(),
  durationMin: z.number().int().min(1).max(480).optional().nullable(),
  topic:       z.string().max(500).optional().nullable(),
  notes:       z.string().max(1000).optional().nullable(),
  status:      SessionStatusEnum.optional().default('SCHEDULED'),
});

// ── Update Session ────────────────────────────────────────────────────────────
export const updateSessionSchema = createSessionSchema.partial();

// ── Mark Single Record ────────────────────────────────────────────────────────
export const markRecordSchema = z.object({
  studentId: z.string().uuid('Invalid student ID'),
  status:    AttendanceStatusEnum,
  remarks:   z.string().max(500).optional().nullable(),
});

// ── Mark Bulk (array of records for one session) ──────────────────────────────
export const markBulkSchema = z.object({
  records: z.array(markRecordSchema).min(1, 'At least one record required'),
});

// ── Mark All (set every student in session to one status) ─────────────────────
export const markAllSchema = z.object({
  status: AttendanceStatusEnum,
});

// ── List sessions filters ─────────────────────────────────────────────────────
export const listSessionsQuerySchema = z.object({
  batchId:   z.string().uuid().optional(),
  trainerId: z.string().uuid().optional(),
  status:    SessionStatusEnum.optional(),
  dateFrom:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:      z.coerce.number().int().min(1).default(1),
  limit:     z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateSessionInput  = z.infer<typeof createSessionSchema>;
export type UpdateSessionInput  = z.infer<typeof updateSessionSchema>;
export type MarkRecordInput     = z.infer<typeof markRecordSchema>;
export type MarkBulkInput       = z.infer<typeof markBulkSchema>;
export type ListSessionsQuery   = z.infer<typeof listSessionsQuerySchema>;
