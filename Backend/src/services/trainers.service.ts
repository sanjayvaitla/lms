import bcrypt from 'bcryptjs';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { storageAdapter, extractStorageKey } from '../lib/storage';
import type { CreateTrainerInput, UpdateTrainerInput } from '../validators/trainer.validator';

function normalizeIndianPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digitsOnly = phone.replace(/\D/g, '');
  if (!digitsOnly) return null;
  const tenDigits = digitsOnly.startsWith('91') && digitsOnly.length === 12
    ? digitsOnly.slice(2)
    : digitsOnly;
  if (!/^\d{10}$/.test(tenDigits)) {
    throw new AppError('Phone number must be exactly 10 digits', 400, 'VALIDATION_ERROR');
  }
  return `+91${tenDigits}`;
}

async function generateAvatarUrl(avatarUrl: string | null): Promise<string | null> {
  if (!avatarUrl) return null;
  try {
    return await storageAdapter.getUrl(extractStorageKey(avatarUrl));
  } catch (error) {
    console.warn('Failed to generate presigned URL for avatar:', error);
    return null;
  }
}

// Map raw DB row to clean trainer object
function mapTrainer(row: any) {
  return {
    id:         row.id,
    name:       row.name,
    email:      row.email,
    avatarUrl:  row.avatarUrl ?? null,
    createdAt:  row.createdAt,
    bio:        row.bio ?? null,
    skills:     row.skills ?? null,
    linkedin:   row.linkedin ?? null,
    phone:      row.phone ?? null,
    courseCount:   row.courseCount  ?? 0,
    studentCount:  row.studentCount ?? 0,
    activeBatches: row.activeBatches ?? 0,
  };
}

// ── List trainers with aggregated stats ───────────────────────────────────────
export async function listTrainers() {
  const { rows } = await db.query(
    `SELECT
       u.id, u.name, u.email, u.avatar_url AS "avatarUrl",
       u.created_at AS "createdAt",
       tp.bio, tp.skills, tp.linkedin, tp.phone,
       COUNT(DISTINCT c.id)::int                              AS "courseCount",
       (
         SELECT COUNT(DISTINCT e.student_id)::int
         FROM enrollments e
         JOIN batch_courses bc ON bc.batch_id = e.batch_id
         JOIN courses c2 ON c2.id = bc.course_id
         WHERE c2.trainer_id = u.id AND c2.status != 'ARCHIVED'
       ) AS "studentCount",
       COUNT(DISTINCT CASE WHEN b.status = 'ONGOING' THEN b.id END)::int AS "activeBatches"
     FROM users u
     LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
     LEFT JOIN courses c ON c.trainer_id = u.id AND c.status != 'ARCHIVED'
     LEFT JOIN batch_courses bc_t ON bc_t.course_id = c.id
     LEFT JOIN batches b ON b.id = bc_t.batch_id
     WHERE u.role = 'TRAINER'
     GROUP BY u.id, tp.bio, tp.skills, tp.linkedin, tp.phone
     ORDER BY u.created_at DESC`,
  );

  // Generate S3 URLs for avatars
  const trainersWithUrls = await Promise.all(
    rows.map(async (row: any) => ({
      ...mapTrainer(row),
      avatarUrl: await generateAvatarUrl(row.avatarUrl),
    })),
  );

  return trainersWithUrls;
}

// ── Get single trainer with courses + performance ─────────────────────────────
export async function getTrainer(id: string) {
  const { rows } = await db.query(
    `SELECT
       u.id, u.name, u.email, u.avatar_url AS "avatarUrl",
       u.created_at AS "createdAt",
       tp.bio, tp.skills, tp.linkedin, tp.phone
     FROM users u
     LEFT JOIN trainer_profiles tp ON tp.user_id = u.id
     WHERE u.id = $1 AND u.role = 'TRAINER'`,
    [id],
  );
  if (!rows.length) throw new AppError('Trainer not found', 404, 'NOT_FOUND');

  // Courses assigned to this trainer
  const coursesRes = await db.query(
    `SELECT
       c.id, c.title, c.category, c.status, c.level,
       c.duration_months AS "durationMonths", c.color_token AS "colorToken",
       COUNT(DISTINCT b.id)::int                        AS "batchCount",
       COALESCE(SUM(b_stats.student_count), 0)::int     AS "studentCount",
       COALESCE(
         ROUND(SUM(b_stats.total_completion) / NULLIF(SUM(b_stats.student_count), 0))::int,
       0)                                               AS "completionPct"
     FROM courses c
     LEFT JOIN batch_courses bc_c ON bc_c.course_id = c.id
     LEFT JOIN batches b ON b.id = bc_c.batch_id
     LEFT JOIN (
       SELECT batch_id, COUNT(*)::int AS student_count, SUM(completion_pct) AS total_completion
       FROM enrollments GROUP BY batch_id
     ) b_stats ON b_stats.batch_id = b.id
     WHERE c.trainer_id = $1 AND c.status != 'ARCHIVED'
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [id],
  );

  // Recent enrollments under this trainer's batches (last 6 months)
  const trendRes = await db.query(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', e.enrolled_at), 'Mon') AS month,
       DATE_TRUNC('month', e.enrolled_at) AS month_date,
       COUNT(*)::int AS count
     FROM enrollments e
     JOIN batches b ON b.id = e.batch_id
     JOIN batch_courses bc_e ON bc_e.batch_id = b.id
     JOIN courses c ON c.id = bc_e.course_id
     WHERE c.trainer_id = $1
       AND e.enrolled_at >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
     GROUP BY DATE_TRUNC('month', e.enrolled_at)
     ORDER BY month_date ASC`,
    [id],
  );

  const t = rows[0];
  const trainer = {
    ...mapTrainer(t),
    avatarUrl: await generateAvatarUrl(t.avatarUrl),
    courses:        coursesRes.rows,
    enrollmentTrend: trendRes.rows.map((r) => ({ month: r.month, count: r.count })),
  };
  
  return trainer;
}

// ── Create trainer ────────────────────────────────────────────────────────────
export async function createTrainer(input: CreateTrainerInput) {
  // Check email uniqueness
  const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = $1', [input.email.toLowerCase().trim()]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw new AppError('Email already registered', 409, 'CONFLICT');
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const normalizedPhone = normalizeIndianPhone(input.phone);

  const userId = await db.transaction(async (transaction) => {
    const userRes = await db.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'TRAINER') RETURNING id`,
      [input.name, input.email, passwordHash],
      transaction,
    );
    const userId = userRes.rows[0].id as string;

    // Create trainer profile
    await db.query(
      `INSERT INTO trainer_profiles (user_id, bio, skills, linkedin, phone)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        input.bio ?? null,
        input.skills ?? null,
        input.linkedin || null,
        normalizedPhone,
      ],
      transaction,
    );

    return userId;
  });

  return getTrainer(userId);
}

// ── Update trainer ────────────────────────────────────────────────────────────
export async function updateTrainer(id: string, input: UpdateTrainerInput) {
  const existing = await db.query(
    'SELECT id FROM users WHERE id = $1 AND role = $2',
    [id, 'TRAINER'],
  );
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Trainer not found', 404, 'NOT_FOUND');
  }

  const normalizedPhone = normalizeIndianPhone(input.phone);

  await db.transaction(async (transaction) => {
    // Update users table fields
    const userFields: string[] = [];
    const userParams: unknown[] = [];
    let idx = 1;

    if (input.name !== undefined) { userFields.push(`name = $${idx}`); userParams.push(input.name); idx++; }
    if (input.email !== undefined) { userFields.push(`email = $${idx}`); userParams.push(input.email); idx++; }

    if (userFields.length > 0) {
      userParams.push(id);
      await db.query(
        `UPDATE users SET ${userFields.join(', ')} WHERE id = $${idx}`,
        userParams,
        transaction,
      );
    }

    // Upsert trainer_profiles
    await db.query(
      `INSERT INTO trainer_profiles (user_id, bio, skills, linkedin, phone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         bio      = COALESCE(EXCLUDED.bio, trainer_profiles.bio),
         skills   = COALESCE(EXCLUDED.skills, trainer_profiles.skills),
         linkedin = COALESCE(EXCLUDED.linkedin, trainer_profiles.linkedin),
         phone    = COALESCE(EXCLUDED.phone, trainer_profiles.phone),
         updated_at = NOW()`,
      [
        id,
        input.bio ?? null,
        input.skills ?? null,
        input.linkedin || null,
        normalizedPhone,
      ],
      transaction,
    );
  });

  return getTrainer(id);
}

// ── Delete trainer ────────────────────────────────────────────────────────────
export async function deleteTrainer(id: string) {
  const existing = await db.query(
    'SELECT id FROM users WHERE id = $1 AND role = $2',
    [id, 'TRAINER'],
  );
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Trainer not found', 404, 'NOT_FOUND');
  }

  // Unlink from courses before deleting
  await db.query('UPDATE courses SET trainer_id = NULL WHERE trainer_id = $1', [id]);
  
  // Delete all messages sent or received by this trainer
  await db.query('DELETE FROM messages WHERE sender_id = $1 OR receiver_id = $1', [id]);
  
  // Unlink from intern batches (mentor_id) - assuming we don't want to delete the whole batch
  // Wait, mentor_id is NOT NULL in the database, so if they are mentoring a batch, we MUST reassign or delete the batch.
  // We'll delete the batches they mentor to satisfy "deleted in db wherever".
  await db.query('DELETE FROM intern_batches WHERE mentor_id = $1', [id]);

  await db.query('DELETE FROM users WHERE id = $1', [id]);
}
