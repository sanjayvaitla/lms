import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';

// ── List batches ──────────────────────────────────────────────────────────────
export async function listBatches(courseId?: string, trainerId?: string) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;
  if (courseId)  { conditions.push(`b.course_id = $${idx++}`); params.push(courseId); }
  if (trainerId) { conditions.push(`c.trainer_id = $${idx++}`); params.push(trainerId); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT
       b.id, b.name, b.course_id AS "courseId",
       b.start_date AS "startDate", b.end_date AS "endDate",
       b.capacity, b.status,
       b.created_at AS "createdAt",
       c.id AS course_ref_id, c.title AS course_title, c.category AS course_category,
       COUNT(e.id)::int AS enrollment_count
     FROM batches b
     JOIN courses c ON c.id = b.course_id
     LEFT JOIN enrollments e ON e.batch_id = b.id
     ${where}
     GROUP BY b.id, c.id
     ORDER BY b.created_at DESC`,
    params,
  );

  return rows.map((r) => ({
    id:         r.id,
    name:       r.name,
    courseId:   r.courseId,
    course:     { id: r.course_ref_id, title: r.course_title, category: r.course_category },
    startDate:  r.startDate,
    endDate:    r.endDate,
    capacity:   r.capacity,
    status:     r.status,
    createdAt:  r.createdAt,
    _count:     { enrollments: r.enrollment_count },
  }));
}

// ── Get single batch with enrollments ────────────────────────────────────────
export async function getBatch(id: string) {
  const { rows } = await db.query(
    `SELECT
       b.id, b.name, b.course_id AS "courseId",
       b.start_date AS "startDate", b.end_date AS "endDate",
       b.capacity, b.status, b.created_at AS "createdAt",
       c.id AS course_ref_id, c.title AS course_title, c.category AS course_category
     FROM batches b
     JOIN courses c ON c.id = b.course_id
     WHERE b.id = $1`,
    [id],
  );
  if (!rows.length) throw new AppError('Batch not found', 404, 'NOT_FOUND');

  const b = rows[0];

  const enrollRes = await db.query(
    `SELECT
       e.id, e.completion_pct AS "completionPct", e.grade, e.enrolled_at AS "enrolledAt",
       u.id AS student_id, u.name AS student_name, u.email AS student_email
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     WHERE e.batch_id = $1
     ORDER BY u.name`,
    [id],
  );

  return {
    id:        b.id,
    name:      b.name,
    courseId:  b.courseId,
    course:    { id: b.course_ref_id, title: b.course_title, category: b.course_category },
    startDate: b.startDate,
    endDate:   b.endDate,
    capacity:  b.capacity,
    status:    b.status,
    createdAt: b.createdAt,
    enrollments: enrollRes.rows.map((e) => ({
      id:            e.id,
      completionPct: e.completionPct,
      grade:         e.grade,
      enrolledAt:    e.enrolledAt,
      student:       { id: e.student_id, name: e.student_name, email: e.student_email },
    })),
  };
}

// ── Archive batch (soft-delete → status=COMPLETED) ───────────────────────────
export async function archiveBatch(id: string, trainerId?: string) {
  const checkSql = trainerId
    ? `SELECT b.id FROM batches b JOIN courses c ON c.id = b.course_id WHERE b.id = $1 AND c.trainer_id = $2`
    : `SELECT id FROM batches WHERE id = $1`;
  const existing = await db.query(checkSql, trainerId ? [id, trainerId] : [id]);
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  await db.query(`UPDATE batches SET status = 'COMPLETED' WHERE id = $1`, [id]);
  return getBatch(id);
}

// ── Restore batch (COMPLETED → UPCOMING) ─────────────────────────────────────
export async function restoreBatch(id: string) {
  const existing = await db.query(`SELECT id FROM batches WHERE id = $1`, [id]);
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  await db.query(`UPDATE batches SET status = 'UPCOMING', updated_at = NOW() WHERE id = $1`, [id]);
  return getBatch(id);
}

// ── Create batch ──────────────────────────────────────────────────────────────
export async function createBatch(input: {
  name: string; courseId: string; startDate: string; endDate: string;
  capacity?: number; status?: string;
}, trainerId?: string) {
  const courseRes = await db.query('SELECT id FROM courses WHERE id = $1', [input.courseId]);
  if (!courseRes.rowCount || courseRes.rowCount === 0) {
    throw new AppError('Course not found', 404, 'NOT_FOUND');
  }

  const { rows } = await db.query(
    `INSERT INTO batches (name, course_id, start_date, end_date, capacity, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.name,
      input.courseId,
      new Date(input.startDate),
      new Date(input.endDate),
      input.capacity ?? 30,
      input.status ?? 'UPCOMING',
    ],
  );
  return getBatch(rows[0].id);
}

// ── Update batch ──────────────────────────────────────────────────────────────
export async function updateBatch(id: string, input: {
  name?: string; startDate?: string; endDate?: string;
  capacity?: number; status?: string; courseId?: string;
}, trainerId?: string) {
  const checkSql = trainerId
    ? `SELECT b.id FROM batches b JOIN courses c ON c.id = b.course_id WHERE b.id = $1 AND c.trainer_id = $2`
    : `SELECT id FROM batches WHERE id = $1`;
  const existing = await db.query(checkSql, trainerId ? [id, trainerId] : [id]);
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }

  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const map: Record<string, string> = {
    name:      'name',
    startDate: 'start_date',
    endDate:   'end_date',
    capacity:  'capacity',
    status:    'status',
    courseId:  'course_id',
  };

  for (const [key, col] of Object.entries(map)) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) {
      fields.push(`${col} = $${idx}`);
      params.push(
        (key === 'startDate' || key === 'endDate') && value
          ? new Date(value as string)
          : value,
      );
      idx++;
    }
  }

  if (fields.length === 0) return getBatch(id);

  params.push(id);
  await db.query(`UPDATE batches SET ${fields.join(', ')} WHERE id = $${idx}`, params);
  return getBatch(id);
}

// ── Delete batch ──────────────────────────────────────────────────────────────
export async function deleteBatch(id: string) {
  const existing = await db.query('SELECT id FROM batches WHERE id = $1', [id]);
  if (!existing.rowCount || existing.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  await db.query('DELETE FROM batches WHERE id = $1', [id]);
}

// ── Get available students (not yet enrolled in this batch) ──────────────────
export async function getAvailableStudents(batchId: string) {
  const batchCheck = await db.query('SELECT id FROM batches WHERE id = $1', [batchId]);
  if (!batchCheck.rowCount || batchCheck.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }

  const { rows } = await db.query(
    `SELECT u.id, u.name, u.email
     FROM users u
     WHERE u.role = 'STUDENT'
       AND u.id NOT IN (
         SELECT e.student_id FROM enrollments e WHERE e.batch_id = $1
       )
     ORDER BY u.name`,
    [batchId],
  );
  return rows;
}

// ── Enroll student ────────────────────────────────────────────────────────────
export async function enrollStudent(batchId: string, studentId: string) {
  const batchRes = await db.query(
    `SELECT b.id, b.capacity,
       (SELECT COUNT(*) FROM enrollments WHERE batch_id = b.id)::int AS enrolled
     FROM batches b WHERE b.id = $1`,
    [batchId],
  );
  if (!batchRes.rowCount || batchRes.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  const batch = batchRes.rows[0];
  if (batch.enrolled >= batch.capacity) {
    throw new AppError('Batch is at full capacity', 400, 'BATCH_FULL');
  }

  const studentRes = await db.query('SELECT id FROM users WHERE id = $1 AND role = $2', [studentId, 'STUDENT']);
  if (!studentRes.rowCount || studentRes.rowCount === 0) {
    throw new AppError('Student not found', 404, 'NOT_FOUND');
  }

  try {
    await db.query(
      `INSERT INTO enrollments (student_id, batch_id) VALUES ($1, $2)`,
      [studentId, batchId],
    );
  } catch (e: unknown) {
    if ((e as { code?: string }).code === '23505') throw new AppError('Student already enrolled in this batch', 409, 'DUPLICATE');
    throw e;
  }

  return getBatch(batchId);
}

// ── Unenroll student ──────────────────────────────────────────────────────────
export async function unenrollStudent(batchId: string, studentId: string) {
  const res = await db.query(
    'DELETE FROM enrollments WHERE batch_id = $1 AND student_id = $2 RETURNING id',
    [batchId, studentId],
  );
  if (!res.rowCount || res.rowCount === 0) {
    throw new AppError('Enrollment not found', 404, 'NOT_FOUND');
  }
}

// ── Update enrollment progress ────────────────────────────────────────────────
export async function updateEnrollment(enrollmentId: string, completionPct: number, grade?: string) {
  const fields = ['completion_pct = $1'];
  const params: unknown[] = [completionPct];
  let idx = 2;
  if (grade !== undefined) {
    fields.push(`grade = $${idx}`);
    params.push(grade);
    idx++;
  }
  params.push(enrollmentId);

  const res = await db.query(
    `UPDATE enrollments SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id`,
    params,
  );
  if (!res.rowCount || res.rowCount === 0) {
    throw new AppError('Enrollment not found', 404, 'NOT_FOUND');
  }
}

// ── Batch analytics ───────────────────────────────────────────────────────────
export async function getBatchAnalytics(batchId: string) {
  const batchRes = await db.query(
    `SELECT b.id, b.name, b.capacity, b.status,
       b.start_date AS "startDate", b.end_date AS "endDate",
       c.title AS course_title,
       COUNT(e.id)::int                                     AS total_enrolled,
       COALESCE(ROUND(AVG(e.completion_pct))::int, 0)      AS avg_completion,
       COUNT(CASE WHEN e.completion_pct = 100 THEN 1 END)::int AS completed_100
     FROM batches b
     JOIN courses c ON c.id = b.course_id
     LEFT JOIN enrollments e ON e.batch_id = b.id
     WHERE b.id = $1
     GROUP BY b.id, c.title`,
    [batchId],
  );
  if (!batchRes.rowCount || batchRes.rowCount === 0) {
    throw new AppError('Batch not found', 404, 'NOT_FOUND');
  }
  const row = batchRes.rows[0];

  const studentsRes = await db.query(
    `SELECT u.name AS student_name, e.completion_pct AS "completionPct", e.grade,
            e.enrolled_at AS "enrolledAt"
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     WHERE e.batch_id = $1
     ORDER BY e.completion_pct DESC`,
    [batchId],
  );

  const buckets = [
    { range: '0-20%',   min: 0,  max: 20,  count: 0 },
    { range: '21-40%',  min: 21, max: 40,  count: 0 },
    { range: '41-60%',  min: 41, max: 60,  count: 0 },
    { range: '61-80%',  min: 61, max: 80,  count: 0 },
    { range: '81-100%', min: 81, max: 100, count: 0 },
  ];
  for (const s of studentsRes.rows) {
    const pct = s.completionPct ?? 0;
    const bucket = buckets.find((b) => pct >= b.min && pct <= b.max);
    if (bucket) bucket.count++;
  }

  return {
    batch: {
      id:          row.id,
      name:        row.name,
      capacity:    row.capacity,
      status:      row.status,
      startDate:   row.startDate,
      endDate:     row.endDate,
      courseTitle: row.course_title,
    },
    totalEnrolled:     row.total_enrolled,
    capacity:          row.capacity,
    avgCompletion:     row.avg_completion,
    completed100:      row.completed_100,
    completionBuckets: buckets.map(({ range, count }) => ({ range, count })),
    students:          studentsRes.rows.map((s) => ({
      studentName:   s.student_name,
      completionPct: s.completionPct,
      grade:         s.grade ?? null,
      enrolledAt:    s.enrolledAt,
    })),
  };
}
