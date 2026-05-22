import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import bcrypt from 'bcryptjs';

export interface Learner {
  id: string;
  name: string;
  email: string;
  createdAt: string;
  enrollmentCount: number;
  avgCompletion: number;
  activeBatches: number;
}

export interface LearnerEnrollment {
  enrollmentId: string;
  batchId: string;
  batchName: string;
  batchStatus: string;
  startDate: string;
  endDate: string;
  courseId: string;
  courseTitle: string;
  category: string;
  colorToken: string;
  completionPct: number;
  grade: string | null;
  enrolledAt: string;
}

export interface LearnerDetail extends Learner {
  enrollments: LearnerEnrollment[];
}

export async function listLearners(search = '', page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const pattern = `%${search}%`;

  const { rows } = await db.query<Learner>(
    `SELECT
       u.id, u.name, u.email, u.created_at AS "createdAt",
       COUNT(DISTINCT e.id)::int                                              AS "enrollmentCount",
       COALESCE(ROUND(AVG(e.completion_pct)::numeric, 0), 0)::int            AS "avgCompletion",
       COUNT(DISTINCT CASE WHEN b.status = 'ONGOING' THEN e.id END)::int     AS "activeBatches"
     FROM users u
     LEFT JOIN enrollments e ON e.student_id = u.id
     LEFT JOIN batches b     ON b.id = e.batch_id
     WHERE u.role = 'STUDENT'
       AND (u.name ILIKE $1 OR u.email ILIKE $1)
     GROUP BY u.id
     ORDER BY u.created_at DESC
     LIMIT $2 OFFSET $3`,
    [pattern, limit, offset],
  );

  const countRes = await db.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM users
     WHERE role = 'STUDENT' AND (name ILIKE $1 OR email ILIKE $1)`,
    [pattern],
  );

  return { learners: rows, total: countRes.rows[0]?.total ?? 0, page, limit };
}

export async function getLearner(id: string): Promise<LearnerDetail> {
  const { rows: userRows } = await db.query(
    `SELECT
       u.id, u.name, u.email, u.created_at AS "createdAt",
       COUNT(DISTINCT e.id)::int                                              AS "enrollmentCount",
       COALESCE(ROUND(AVG(e.completion_pct)::numeric, 0), 0)::int            AS "avgCompletion",
       COUNT(DISTINCT CASE WHEN b.status = 'ONGOING' THEN e.id END)::int     AS "activeBatches"
     FROM users u
     LEFT JOIN enrollments e ON e.student_id = u.id
     LEFT JOIN batches b     ON b.id = e.batch_id
     WHERE u.id = $1 AND u.role = 'STUDENT'
     GROUP BY u.id`,
    [id],
  );
  if (!userRows[0]) throw new AppError('Learner not found', 404, 'NOT_FOUND');

  const { rows: enrollRows } = await db.query<LearnerEnrollment>(
    `SELECT
       e.id          AS "enrollmentId",
       b.id          AS "batchId",
       b.name        AS "batchName",
       b.status      AS "batchStatus",
       b.start_date  AS "startDate",
       b.end_date    AS "endDate",
       c.id          AS "courseId",
       c.title       AS "courseTitle",
       c.category,
       c.color_token AS "colorToken",
       e.completion_pct AS "completionPct",
       e.grade,
       e.enrolled_at AS "enrolledAt"
     FROM enrollments e
     JOIN batches b ON b.id = e.batch_id
     JOIN courses c ON c.id = b.course_id
     WHERE e.student_id = $1
     ORDER BY e.enrolled_at DESC`,
    [id],
  );

  return { ...(userRows[0] as Learner), enrollments: enrollRows };
}

export async function createLearner(data: { name: string; email: string; password?: string }) {
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [data.email]);
  if ((existing.rowCount ?? 0) > 0)
    throw new AppError('Email already registered', 409, 'DUPLICATE_EMAIL');

  const hash = await bcrypt.hash(data.password ?? 'password123', 10);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'STUDENT')
     RETURNING id, name, email, created_at AS "createdAt"`,
    [data.name, data.email, hash],
  );
  return rows[0];
}

export async function updateLearner(id: string, data: { name?: string; email?: string }) {
  const fields: string[] = [];
  const vals: unknown[]  = [];
  let idx = 1;
  if (data.name)  { fields.push(`name  = $${idx++}`); vals.push(data.name); }
  if (data.email) { fields.push(`email = $${idx++}`); vals.push(data.email); }
  if (!fields.length) throw new AppError('Nothing to update', 400, 'NO_DATA');
  vals.push(id);

  const { rows } = await db.query(
    `UPDATE users SET ${fields.join(', ')}
     WHERE id = $${idx} AND role = 'STUDENT'
     RETURNING id, name, email, created_at AS "createdAt"`,
    vals,
  );
  if (!rows[0]) throw new AppError('Learner not found', 404, 'NOT_FOUND');
  return rows[0];
}

export async function deleteLearner(id: string) {
  await db.query('DELETE FROM enrollments    WHERE student_id = $1', [id]);
  await db.query('DELETE FROM refresh_tokens WHERE user_id   = $1', [id]);
  const res = await db.query(
    `DELETE FROM users WHERE id = $1 AND role = 'STUDENT'`, [id],
  );
  if (!res.rowCount) throw new AppError('Learner not found', 404, 'NOT_FOUND');
}

export async function getAvailableBatches(learnerId: string) {
  const { rows } = await db.query(
    `SELECT
       b.id, b.name, b.status,
       b.start_date  AS "startDate",
       b.end_date    AS "endDate",
       b.capacity,
       c.title       AS "courseTitle",
       c.category,
       c.color_token AS "colorToken",
       COUNT(e.id)::int AS "enrolledCount"
     FROM batches b
     JOIN courses c   ON c.id = b.course_id
     LEFT JOIN enrollments e ON e.batch_id = b.id
     WHERE b.status IN ('UPCOMING', 'ONGOING')
       AND b.id NOT IN (
         SELECT batch_id FROM enrollments WHERE student_id = $1
       )
       AND c.status != 'ARCHIVED'
     GROUP BY b.id, c.title, c.category, c.color_token
     HAVING COUNT(e.id) < b.capacity
     ORDER BY b.start_date`,
    [learnerId],
  );
  return rows;
}

export async function assignBatch(learnerId: string, batchId: string) {
  const bRes = await db.query(
    `SELECT b.id, b.capacity, COUNT(e.id)::int AS enrolled
     FROM batches b
     LEFT JOIN enrollments e ON e.batch_id = b.id
     WHERE b.id = $1
     GROUP BY b.id`,
    [batchId],
  );
  const batch = bRes.rows[0] as { id: string; capacity: number; enrolled: number } | undefined;
  if (!batch) throw new AppError('Batch not found', 404, 'NOT_FOUND');
  if (batch.enrolled >= batch.capacity) throw new AppError('Batch is at full capacity', 400, 'FULL_CAPACITY');

  const { rows } = await db.query(
    `INSERT INTO enrollments (batch_id, student_id)
     VALUES ($1, $2)
     ON CONFLICT (batch_id, student_id) DO NOTHING
     RETURNING id`,
    [batchId, learnerId],
  );
  if (!rows[0]) throw new AppError('Already enrolled in this batch', 409, 'ALREADY_ENROLLED');
  return rows[0];
}

export async function removeBatch(learnerId: string, batchId: string) {
  const res = await db.query(
    'DELETE FROM enrollments WHERE student_id = $1 AND batch_id = $2',
    [learnerId, batchId],
  );
  if (!res.rowCount) throw new AppError('Enrollment not found', 404, 'NOT_FOUND');
}

export async function getDashboardStats() {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int                                                           AS "totalLearners",
       COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END)::int AS "newThisMonth"
     FROM users WHERE role = 'STUDENT'`,
  );
  const { rows: enrollRows } = await db.query(
    `SELECT
       COUNT(*)::int                                                            AS "totalEnrollments",
       COALESCE(ROUND(AVG(completion_pct)::numeric, 0), 0)::int               AS "avgCompletion",
       COUNT(CASE WHEN b.status = 'ONGOING' THEN 1 END)::int                  AS "activeEnrollments"
     FROM enrollments e
     JOIN batches b ON b.id = e.batch_id`,
  );
  return { ...rows[0], ...enrollRows[0] };
}
