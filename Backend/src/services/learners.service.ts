import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { trainerBatchAccessSql } from '../lib/batch-access';
import bcrypt from 'bcryptjs';

export interface Learner {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string | null;
  dateOfBirth?: string | null;
  occupation?: string | null;
  qualification?: string | null;
  graduationYear?: string | null;
  classPreference?: string | null;
  leadSource?: string | null;
  address?: string | null;
  accountStatus?: string | null;
  createdAt: string;
  enrollmentCount: number;
  avgCompletion: number;
  activeBatches: number;
  assignedProgramId?: string | null;
  programName?: string | null;
  programColor?: string | null;
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

export async function listLearners(search = '', page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  const pattern = `%${search}%`;

  const { rows } = await db.query<any>(
    `SELECT
       u.id, u.name, u.email, u.phone_number AS "phoneNumber",
       u.created_at AS "createdAt",
       u.assigned_program_id AS "assignedProgramId",
       p.name AS "programName",
       COALESCE(p.color_token, 'cyan') AS "programColor",
       COUNT(DISTINCT e.id)::int                                              AS "enrollmentCount",
       COALESCE(ROUND(AVG(e.completion_pct)::numeric, 0), 0)::int            AS "avgCompletion",
       COUNT(DISTINCT CASE WHEN b.status = 'ONGOING' THEN e.id END)::int     AS "activeBatches",
       COALESCE(
         (
           SELECT json_agg(
             json_build_object(
               'courseId', c.id,
               'courseTitle', c.title,
               'programName', (SELECT name FROM programs WHERE id = u.assigned_program_id)
             )
           )
           FROM program_course_selections pcs
           JOIN program_enrollments pe ON pe.id = pcs.program_enrollment_id
           JOIN courses c ON c.id = pcs.course_id
           WHERE pe.student_id = u.id AND pe.program_id = u.assigned_program_id
         ), '[]'
       ) AS "courses"
     FROM users u
     LEFT JOIN programs p ON p.id = u.assigned_program_id
     LEFT JOIN enrollments e ON e.student_id = u.id
     LEFT JOIN batches b     ON b.id = e.batch_id
     WHERE u.role = 'STUDENT'
       AND u.account_status NOT IN ('PENDING', 'REJECTED')
       AND (u.name ILIKE $1 OR u.email ILIKE $1 OR u.phone_number ILIKE $1)
     GROUP BY u.id, p.name, p.color_token
     ORDER BY u.created_at DESC
     LIMIT $2 OFFSET $3`,
    [pattern, limit, offset],
  );

  const countRes = await db.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM users
     WHERE role = 'STUDENT'
       AND account_status NOT IN ('PENDING', 'REJECTED')
       AND (name ILIKE $1 OR email ILIKE $1 OR phone_number ILIKE $1)`,
    [pattern],
  );

  return { learners: rows, total: countRes.rows[0]?.total ?? 0, page, limit };
}

export async function getLearner(id: string): Promise<LearnerDetail> {
  const { rows: userRows } = await db.query(
    `SELECT
       u.id, u.name, u.email,
       u.phone_number AS "phoneNumber",
       TO_CHAR(u.date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
       u.occupation AS "occupation",
       u.qualification AS "qualification",
       u.graduation_year AS "graduationYear",
       u.class_preference AS "classPreference",
       u.lead_source AS "leadSource",
       u.address AS "address",
       u.github_username AS "githubUsername",
       u.account_status AS "accountStatus",
       u.created_at AS "createdAt",
       u.assigned_program_id AS "assignedProgramId",
       p.name AS "programName",
       p.color_token AS "programColor",
       COUNT(DISTINCT e.id)::int                                              AS "enrollmentCount",
       COALESCE(ROUND(AVG(e.completion_pct)::numeric, 0), 0)::int            AS "avgCompletion",
       COUNT(DISTINCT CASE WHEN b.status = 'ONGOING' THEN e.id END)::int     AS "activeBatches"
     FROM users u
     LEFT JOIN programs p    ON p.id = u.assigned_program_id
     LEFT JOIN enrollments e ON e.student_id = u.id
     LEFT JOIN batches b     ON b.id = e.batch_id
     WHERE u.id = $1 AND u.role = 'STUDENT'
     GROUP BY u.id, p.name, p.color_token`,
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
       p.id          AS "courseId",
       p.id          AS "programId",
       p.name        AS "programName",
       p.name        AS "courseTitle",
       'Program'     AS "category",
       p.color_token AS "colorToken",
       e.completion_pct AS "completionPct",
       e.grade,
       e.enrolled_at AS "enrolledAt"
     FROM enrollments e
     JOIN batches b ON b.id = e.batch_id
     JOIN programs p ON p.id = b.program_id
     WHERE e.student_id = $1
     ORDER BY e.enrolled_at DESC`,
    [id],
  );

  return { ...(userRows[0] as Learner), enrollments: enrollRows };
}

export async function createLearner(data: { name: string; email: string; password?: string; phoneNumber?: string; dateOfBirth?: string; occupation?: string; qualification?: string; graduationYear?: string; classPreference?: string; leadSource?: string; address?: string }) {
  const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [data.email.toLowerCase().trim()]);
  if ((existing.rowCount ?? 0) > 0)
    throw new AppError('Email already registered', 409, 'DUPLICATE_EMAIL');

  const rawPassword = data.password?.trim();
  if (!rawPassword || rawPassword.length < 8) {
    throw new AppError('Password is required (min 8 characters). Or send a welcome/reset link instead of a default password.', 400, 'VALIDATION_ERROR');
  }
  const hash = await bcrypt.hash(rawPassword, 10);
  const { rows } = await db.query(
    `INSERT INTO users (name, email, password_hash, phone_number, date_of_birth, occupation, qualification, graduation_year, class_preference, lead_source, address, role)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'STUDENT')
     RETURNING id, name, email, phone_number AS "phoneNumber", created_at AS "createdAt"`,
    [data.name, data.email, hash, data.phoneNumber ?? null, data.dateOfBirth ?? null, data.occupation ?? null, data.qualification ?? null, data.graduationYear ?? null, data.classPreference ?? null, data.leadSource ?? null, data.address ?? null],
  );
  return rows[0];
}

export async function updateLearner(id: string, data: {
  name?: string; email?: string; phoneNumber?: string; password?: string;
  dateOfBirth?: string | null; occupation?: string | null; qualification?: string | null;
  graduationYear?: string | null; classPreference?: string | null; leadSource?: string | null;
  address?: string | null; githubUsername?: string | null;
}) {
  const fields: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  if (data.name !== undefined) { fields.push(`name = $${idx++}`); vals.push(data.name); }
  if (data.email !== undefined) { fields.push(`email = $${idx++}`); vals.push(data.email); }
  if (data.phoneNumber !== undefined) { fields.push(`phone_number = $${idx++}`); vals.push(data.phoneNumber || null); }
  if (data.dateOfBirth !== undefined) { fields.push(`date_of_birth = $${idx++}`); vals.push(data.dateOfBirth || null); }
  if (data.occupation !== undefined) { fields.push(`occupation = $${idx++}`); vals.push(data.occupation || null); }
  if (data.qualification !== undefined) { fields.push(`qualification = $${idx++}`); vals.push(data.qualification || null); }
  if (data.graduationYear !== undefined) { fields.push(`graduation_year = $${idx++}`); vals.push(data.graduationYear || null); }
  if (data.classPreference !== undefined) { fields.push(`class_preference = $${idx++}`); vals.push(data.classPreference || null); }
  if (data.leadSource !== undefined) { fields.push(`lead_source = $${idx++}`); vals.push(data.leadSource || null); }
  if (data.address !== undefined) { fields.push(`address = $${idx++}`); vals.push(data.address || null); }
  if (data.githubUsername !== undefined) {
    const normalized = data.githubUsername
      ? String(data.githubUsername).trim().replace(/^@/, '') || null
      : null;
    if (normalized) {
      const clash = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE LOWER(github_username) = LOWER($1) AND id <> $2`,
        [normalized, id],
      );
      if (clash.rows.length) {
        throw new AppError('GitHub username already linked to another learner', 409, 'GITHUB_TAKEN');
      }
    }
    fields.push(`github_username = $${idx++}`);
    vals.push(normalized);
  }
  if (data.password) {
    const hash = await bcrypt.hash(data.password, 10);
    fields.push(`password_hash = $${idx++}`);
    vals.push(hash);
  }
  if (!fields.length) throw new AppError('Nothing to update', 400, 'NO_DATA');
  fields.push('updated_at = NOW()');
  vals.push(id);

  try {
    const { rows } = await db.query(
      `UPDATE users SET ${fields.join(', ')}
       WHERE id = $${idx} AND role = 'STUDENT'
       RETURNING id, name, email, phone_number AS "phoneNumber",
         TO_CHAR(date_of_birth, 'YYYY-MM-DD') AS "dateOfBirth",
         occupation, qualification,
         graduation_year AS "graduationYear",
         class_preference AS "classPreference",
         lead_source AS "leadSource",
         address,
         github_username AS "githubUsername",
         created_at AS "createdAt"`,
      vals,
    );
    if (!rows[0]) throw new AppError('Learner not found', 404, 'NOT_FOUND');
    return rows[0];
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg.code === '23505') {
      throw new AppError('Email, phone, or GitHub username already in use', 409, 'DUPLICATE');
    }
    throw err;
  }
}

export async function deleteLearner(id: string) {
  // Check exists first
  const check = await db.query(`SELECT id FROM users WHERE id = $1 AND role = 'STUDENT'`, [id]);
  if (!check.rowCount) throw new AppError('Learner not found', 404, 'NOT_FOUND');

  // Full cascade cleanup (order matters: selections → enrollments → fees/proofs → tokens → user)
  await db.query(`
    DELETE FROM program_course_selections
    WHERE program_enrollment_id IN (
      SELECT id FROM program_enrollments WHERE student_id = $1
    )`, [id]);
  await db.query('DELETE FROM program_enrollments WHERE student_id = $1', [id]);
  await db.query('DELETE FROM payment_proofs     WHERE student_id = $1', [id]);
  await db.query('DELETE FROM student_fees       WHERE student_id = $1', [id]);
  await db.query('DELETE FROM enrollments        WHERE student_id = $1', [id]);
  await db.query('DELETE FROM refresh_tokens     WHERE user_id    = $1', [id]);
  await db.query(`DELETE FROM users WHERE id = $1 AND role = 'STUDENT'`, [id]);
}

export async function getAvailableBatches(learnerId: string, trainerId?: string) {
  const trainerFilter = trainerId
    ? `AND ${trainerBatchAccessSql('b', '$2')}`
    : '';
  const params: unknown[] = [learnerId];
  if (trainerId) params.push(trainerId);

  const { rows } = await db.query(
    `SELECT
       b.id, b.name, b.status,
       b.start_date  AS "startDate",
       b.end_date    AS "endDate",
       b.capacity,
       p.name        AS "programName",
       p.name        AS "courseTitle",
       'Program'     AS "category",
       p.color_token AS "colorToken",
       COUNT(e.id)::int AS "enrolledCount"
     FROM batches b
     JOIN programs p   ON p.id = b.program_id
     LEFT JOIN enrollments e ON e.batch_id = b.id
     WHERE b.status IN ('UPCOMING', 'ONGOING')
       AND b.id NOT IN (
         SELECT batch_id FROM enrollments WHERE student_id = $1
       )
       ${trainerFilter}
     GROUP BY b.id, p.name, p.color_token
     HAVING COUNT(e.id) < b.capacity
     ORDER BY b.start_date`,
    params,
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

export async function assignProgram(learnerId: string, programId: string | null) {
  const { rows } = await db.query(
    `UPDATE users
     SET assigned_program_id = $1,
         program_assigned_at = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE NULL END,
         updated_at = NOW()
     WHERE id = $2 AND role = 'STUDENT'
     RETURNING id, name, assigned_program_id AS "assignedProgramId"`,
    [programId, learnerId],
  );
  if (!rows[0]) throw new AppError('Learner not found', 404, 'NOT_FOUND');
  return rows[0];
}

export async function getDashboardStats() {
  const { rows } = await db.query(
    `SELECT
       COUNT(*)::int                                                           AS "totalLearners",
       COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END)::int AS "newThisMonth"
     FROM users WHERE role = 'STUDENT' AND account_status NOT IN ('PENDING', 'REJECTED')`,
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
