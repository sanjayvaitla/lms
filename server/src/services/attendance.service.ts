/**
 * attendance.service.ts
 *
 * All business logic for the Attendance Master module.
 *
 * Data model:
 *   attendance_sessions  — one row per class meeting (batch + date + trainer)
 *   attendance_records   — one row per (session, student); UNIQUE constraint prevents duplicates
 *
 * Status values:
 *   Session : SCHEDULED | ONGOING | COMPLETED | CANCELLED
 *   Record  : PRESENT   | ABSENT  | LATE      | EXCUSED
 */

import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import type {
  CreateSessionInput,
  UpdateSessionInput,
  MarkBulkInput,
  ListSessionsQuery,
} from '../validators/attendance.validator';

// ─────────────────────────────────────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function createSession(input: CreateSessionInput, createdBy: string) {
  // Verify batch exists
  const { rows: batchRows } = await db.query(
    'SELECT id, name, course_id FROM batches WHERE id = $1',
    [input.batchId],
  );
  if (!batchRows.length) throw new AppError('Batch not found', 404, 'NOT_FOUND');

  const { rows } = await db.query(
    `INSERT INTO attendance_sessions
       (batch_id, trainer_id, title, session_date, start_time, end_time,
        duration_min, topic, notes, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      input.batchId,
      input.trainerId ?? null,
      input.title,
      input.sessionDate,
      input.startTime ?? null,
      input.endTime   ?? null,
      input.durationMin ?? null,
      input.topic  ?? null,
      input.notes  ?? null,
      input.status ?? 'SCHEDULED',
      createdBy,
    ],
  );

  // Pre-create ABSENT records for every enrolled student
  const { rows: students } = await db.query(
    `SELECT student_id FROM enrollments WHERE batch_id = $1`,
    [input.batchId],
  );

  if (students.length > 0) {
    const session = rows[0];
    const values  = students
      .map((_: any, i: number) => `($1, $${i + 2}, 'ABSENT', $${students.length + 2})`)
      .join(', ');
    const params  = [session.id, ...students.map((s: any) => s.student_id), createdBy];
    await db.query(
      `INSERT INTO attendance_records (session_id, student_id, status, marked_by)
       VALUES ${values}
       ON CONFLICT (session_id, student_id) DO NOTHING`,
      params,
    );
  }

  return formatSession(rows[0]);
}

export async function listSessions(query: ListSessionsQuery) {
  const conds: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (query.batchId)   { conds.push(`s.batch_id   = $${i++}`);    params.push(query.batchId); }
  if (query.trainerId) { conds.push(`s.trainer_id = $${i++}`);    params.push(query.trainerId); }
  if (query.status)    { conds.push(`s.status      = $${i++}`);   params.push(query.status); }
  if (query.dateFrom)  { conds.push(`s.session_date >= $${i++}`); params.push(query.dateFrom); }
  if (query.dateTo)    { conds.push(`s.session_date <= $${i++}`); params.push(query.dateTo); }

  const where  = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const offset = (query.page - 1) * query.limit;

  const { rows } = await db.query(
    `SELECT
       s.*,
       b.name  AS batch_name,
       c.title AS course_title,
       u.name  AS trainer_name,
       COUNT(r.id)::int                                               AS total_records,
       COUNT(r.id) FILTER (WHERE r.status = 'PRESENT')::int          AS present_count,
       COUNT(r.id) FILTER (WHERE r.status = 'ABSENT')::int           AS absent_count,
       COUNT(r.id) FILTER (WHERE r.status = 'LATE')::int             AS late_count,
       COUNT(r.id) FILTER (WHERE r.status = 'EXCUSED')::int          AS excused_count
     FROM attendance_sessions s
     JOIN batches b  ON b.id = s.batch_id
     JOIN courses c  ON c.id = b.course_id
     LEFT JOIN users u ON u.id = s.trainer_id
     LEFT JOIN attendance_records r ON r.session_id = s.id
     ${where}
     GROUP BY s.id, b.name, c.title, u.name
     ORDER BY s.session_date DESC, s.start_time DESC
     LIMIT $${i++} OFFSET $${i++}`,
    [...params, query.limit, offset],
  );

  const { rows: countRows } = await db.query(
    `SELECT COUNT(*)::int AS total
     FROM attendance_sessions s
     JOIN batches b ON b.id = s.batch_id
     ${where}`,
    params,
  );

  return {
    sessions: rows.map(formatSessionWithStats),
    total:    countRows[0].total,
    page:     query.page,
    limit:    query.limit,
  };
}

export async function getSession(id: string) {
  const { rows: sessionRows } = await db.query(
    `SELECT
       s.*,
       b.name  AS batch_name,
       c.title AS course_title,
       u.name  AS trainer_name
     FROM attendance_sessions s
     JOIN batches b  ON b.id = s.batch_id
     JOIN courses c  ON c.id = b.course_id
     LEFT JOIN users u ON u.id = s.trainer_id
     WHERE s.id = $1`,
    [id],
  );
  if (!sessionRows.length) throw new AppError('Session not found', 404, 'NOT_FOUND');

  const { rows: records } = await db.query(
    `SELECT
       r.*,
       u.name       AS student_name,
       u.email      AS student_email,
       u.avatar_url AS student_avatar,
       m.name       AS marked_by_name
     FROM attendance_records r
     JOIN users u ON u.id = r.student_id
     LEFT JOIN users m ON m.id = r.marked_by
     WHERE r.session_id = $1
     ORDER BY u.name ASC`,
    [id],
  );

  return {
    ...formatSessionWithStats(sessionRows[0]),
    records: records.map(formatRecord),
  };
}

export async function updateSession(id: string, input: UpdateSessionInput) {
  const { rows: existing } = await db.query(
    'SELECT id FROM attendance_sessions WHERE id = $1',
    [id],
  );
  if (!existing.length) throw new AppError('Session not found', 404, 'NOT_FOUND');

  const fields: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  const map: Record<string, string> = {
    trainerId:   'trainer_id',
    title:       'title',
    sessionDate: 'session_date',
    startTime:   'start_time',
    endTime:     'end_time',
    durationMin: 'duration_min',
    topic:       'topic',
    notes:       'notes',
    status:      'status',
  };

  for (const [key, col] of Object.entries(map)) {
    if ((input as any)[key] !== undefined) {
      fields.push(`${col} = $${idx++}`);
      params.push((input as any)[key]);
    }
  }

  if (!fields.length) throw new AppError('Nothing to update', 400, 'BAD_REQUEST');

  fields.push(`updated_at = NOW()`);
  params.push(id);

  const { rows } = await db.query(
    `UPDATE attendance_sessions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    params,
  );
  return formatSession(rows[0]);
}

export async function deleteSession(id: string) {
  const { rowCount } = await db.query(
    'DELETE FROM attendance_sessions WHERE id = $1',
    [id],
  );
  if (!rowCount) throw new AppError('Session not found', 404, 'NOT_FOUND');
}

// ─────────────────────────────────────────────────────────────────────────────
// MARK ATTENDANCE
// ─────────────────────────────────────────────────────────────────────────────

/** Upsert attendance for multiple students in one session */
export async function markBulk(sessionId: string, input: MarkBulkInput, markedBy: string) {
  const { rows: session } = await db.query(
    'SELECT id, batch_id FROM attendance_sessions WHERE id = $1',
    [sessionId],
  );
  if (!session.length) throw new AppError('Session not found', 404, 'NOT_FOUND');

  await db.transaction(async (client) => {
    for (const rec of input.records) {
      await db.query(
        `INSERT INTO attendance_records (session_id, student_id, status, marked_by, marked_at, remarks)
         VALUES ($1, $2, $3, $4, NOW(), $5)
         ON CONFLICT (session_id, student_id)
         DO UPDATE SET
           status    = EXCLUDED.status,
           marked_by = EXCLUDED.marked_by,
           marked_at = NOW(),
           remarks   = EXCLUDED.remarks`,
        [sessionId, rec.studentId, rec.status, markedBy, rec.remarks ?? null],
        client,
      );
    }
    // Mark session as COMPLETED once attendance is saved
    await db.query(
      `UPDATE attendance_sessions SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1 AND status != 'CANCELLED'`,
      [sessionId],
      client,
    );
  });

  return getSession(sessionId);
}

/** Mark ALL enrolled students in a session with one status */
export async function markAll(sessionId: string, status: string, markedBy: string) {
  const { rows: session } = await db.query(
    'SELECT id, batch_id FROM attendance_sessions WHERE id = $1',
    [sessionId],
  );
  if (!session.length) throw new AppError('Session not found', 404, 'NOT_FOUND');

  await db.query(
    `UPDATE attendance_records
     SET status = $1, marked_by = $2, marked_at = NOW()
     WHERE session_id = $3`,
    [status, markedBy, sessionId],
  );

  return getSession(sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS & VIEWS
// ─────────────────────────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const { rows } = await db.query(`
    SELECT
      COUNT(DISTINCT s.id)::int                                              AS total_sessions,
      COUNT(DISTINCT s.batch_id)::int                                        AS active_batches,
      COUNT(r.id)::int                                                        AS total_records,
      COUNT(r.id) FILTER (WHERE r.status = 'PRESENT')::int                   AS total_present,
      COUNT(r.id) FILTER (WHERE r.status = 'ABSENT')::int                    AS total_absent,
      COUNT(r.id) FILTER (WHERE r.status = 'LATE')::int                      AS total_late,
      COUNT(r.id) FILTER (WHERE r.status = 'EXCUSED')::int                   AS total_excused,
      ROUND(
        CASE WHEN COUNT(r.id) > 0
          THEN COUNT(r.id) FILTER (WHERE r.status IN ('PRESENT','LATE'))::numeric
            / COUNT(r.id)::numeric * 100
          ELSE 0
        END, 1
      )                                                                        AS overall_pct,
      COUNT(DISTINCT s.id) FILTER (WHERE s.session_date = CURRENT_DATE)::int AS today_sessions
    FROM attendance_sessions s
    LEFT JOIN attendance_records r ON r.session_id = s.id
  `);

  // At-risk students: attendance < 75% across any batch
  const { rows: atRiskRows } = await db.query(`
    SELECT
      u.id, u.name, u.email,
      COUNT(r.id)::int                                                      AS total,
      COUNT(r.id) FILTER (WHERE r.status IN ('PRESENT','LATE'))::int        AS attended,
      ROUND(
        CASE WHEN COUNT(r.id) > 0
          THEN COUNT(r.id) FILTER (WHERE r.status IN ('PRESENT','LATE'))::numeric
            / COUNT(r.id)::numeric * 100
          ELSE 0
        END, 1
      ) AS pct
    FROM users u
    JOIN attendance_records r ON r.student_id = u.id
    WHERE u.role = 'STUDENT'
    GROUP BY u.id
    HAVING COUNT(r.id) >= 3
      AND (COUNT(r.id) FILTER (WHERE r.status IN ('PRESENT','LATE'))::numeric
           / COUNT(r.id)::numeric * 100) < 75
    ORDER BY pct ASC
    LIMIT 10
  `);

  // Last 30 days trend — includes all status breakdowns
  const { rows: trend } = await db.query(`
    SELECT
      s.session_date::text AS date,
      COUNT(r.id)::int                                                AS total,
      COUNT(r.id) FILTER (WHERE r.status = 'PRESENT')::int           AS present,
      COUNT(r.id) FILTER (WHERE r.status = 'ABSENT')::int            AS absent,
      COUNT(r.id) FILTER (WHERE r.status = 'LATE')::int              AS late,
      COUNT(r.id) FILTER (WHERE r.status = 'EXCUSED')::int           AS excused
    FROM attendance_sessions s
    LEFT JOIN attendance_records r ON r.session_id = s.id
    WHERE s.session_date >= CURRENT_DATE - INTERVAL '29 days'
    GROUP BY s.session_date
    ORDER BY s.session_date ASC
  `);

  const statsRow = rows[0];
  return {
    totalSessions:    Number(statsRow.total_sessions   ?? 0),
    activeBatches:    Number(statsRow.active_batches   ?? 0),
    totalPresent:     Number(statsRow.total_present    ?? 0),
    totalAbsent:      Number(statsRow.total_absent     ?? 0),
    totalLate:        Number(statsRow.total_late       ?? 0),
    totalExcused:     Number(statsRow.total_excused    ?? 0),
    avgAttendancePct: Number(statsRow.overall_pct      ?? 0),
    todaySessions:    Number(statsRow.today_sessions   ?? 0),
    atRisk: atRiskRows.map((s: any) => ({
      studentId: s.id,
      name:      s.name,
      email:     s.email,
      pct:       Number(s.pct),
      sessions:  Number(s.total),
    })),
    trend: trend.map((t: any) => ({
      date:    t.date,
      total:   Number(t.total),
      present: Number(t.present),
      absent:  Number(t.absent),
      late:    Number(t.late),
      excused: Number(t.excused),
    })),
  };
}

export async function getBatchAttendance(batchId: string) {
  const { rows: batchRows } = await db.query(
    `SELECT b.id, b.name, c.title AS course_title
     FROM batches b JOIN courses c ON c.id = b.course_id
     WHERE b.id = $1`,
    [batchId],
  );
  if (!batchRows.length) throw new AppError('Batch not found', 404, 'NOT_FOUND');

  const { rows: sessions } = await db.query(
    `SELECT
       s.id, s.title, s.session_date::text AS session_date,
       s.start_time, s.status,
       COUNT(r.id)::int                                              AS total,
       COUNT(r.id) FILTER (WHERE r.status = 'PRESENT')::int         AS present,
       COUNT(r.id) FILTER (WHERE r.status = 'ABSENT')::int          AS absent,
       COUNT(r.id) FILTER (WHERE r.status = 'LATE')::int            AS late,
       COUNT(r.id) FILTER (WHERE r.status = 'EXCUSED')::int         AS excused
     FROM attendance_sessions s
     LEFT JOIN attendance_records r ON r.session_id = s.id
     WHERE s.batch_id = $1
     GROUP BY s.id
     ORDER BY s.session_date DESC`,
    [batchId],
  );

  const { rows: students } = await db.query(
    `SELECT
       u.id, u.name, u.email, u.avatar_url AS "avatarUrl",
       COUNT(r.id)::int                                              AS total_sessions,
       COUNT(r.id) FILTER (WHERE r.status = 'PRESENT')::int         AS present,
       COUNT(r.id) FILTER (WHERE r.status = 'ABSENT')::int          AS absent,
       COUNT(r.id) FILTER (WHERE r.status = 'LATE')::int            AS late,
       COUNT(r.id) FILTER (WHERE r.status = 'EXCUSED')::int         AS excused,
       ROUND(
         CASE WHEN COUNT(r.id) > 0
           THEN COUNT(r.id) FILTER (WHERE r.status IN ('PRESENT','LATE'))::numeric
             / COUNT(r.id)::numeric * 100
           ELSE 0
         END, 1
       ) AS attendance_pct
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     LEFT JOIN attendance_records r ON r.student_id = u.id
       AND r.session_id IN (SELECT id FROM attendance_sessions WHERE batch_id = $1)
     WHERE e.batch_id = $1
     GROUP BY u.id
     ORDER BY attendance_pct ASC`,
    [batchId],
  );

  return {
    batch:    batchRows[0],
    sessions,
    students: students.map((s: any) => ({
      studentId: s.id,
      name:      s.name,
      email:     s.email,
      present:   Number(s.present    ?? 0),
      absent:    Number(s.absent     ?? 0),
      late:      Number(s.late       ?? 0),
      excused:   Number(s.excused    ?? 0),
      total:     Number(s.total_sessions ?? 0),
      pct:       Number(s.attendance_pct ?? 0),
    })),
  };
}

export async function getLearnerAttendance(studentId: string) {
  const { rows: userRows } = await db.query(
    'SELECT id, name, email, avatar_url AS "avatarUrl", role FROM users WHERE id = $1',
    [studentId],
  );
  if (!userRows.length) throw new AppError('Student not found', 404, 'NOT_FOUND');

  const { rows: records } = await db.query(
    `SELECT
       r.id, r.status, r.marked_at, r.remarks,
       s.id AS session_id, s.title AS session_title,
       s.session_date::text AS session_date,
       s.start_time, s.duration_min,
       b.id AS batch_id, b.name AS batch_name,
       c.title AS course_title
     FROM attendance_records r
     JOIN attendance_sessions s ON s.id = r.session_id
     JOIN batches b ON b.id = s.batch_id
     JOIN courses c ON c.id = b.course_id
     WHERE r.student_id = $1
     ORDER BY s.session_date DESC`,
    [studentId],
  );

  // Summary per batch
  const { rows: summary } = await db.query(
    `SELECT
       b.id AS batch_id, b.name AS batch_name, c.title AS course_title,
       COUNT(r.id)::int                                              AS total,
       COUNT(r.id) FILTER (WHERE r.status = 'PRESENT')::int         AS present,
       COUNT(r.id) FILTER (WHERE r.status = 'ABSENT')::int          AS absent,
       COUNT(r.id) FILTER (WHERE r.status = 'LATE')::int            AS late,
       COUNT(r.id) FILTER (WHERE r.status = 'EXCUSED')::int         AS excused,
       ROUND(
         CASE WHEN COUNT(r.id) > 0
           THEN COUNT(r.id) FILTER (WHERE r.status IN ('PRESENT','LATE'))::numeric
             / COUNT(r.id)::numeric * 100
           ELSE 0
         END, 1
       ) AS attendance_pct
     FROM attendance_records r
     JOIN attendance_sessions s ON s.id = r.session_id
     JOIN batches b ON b.id = s.batch_id
     JOIN courses c ON c.id = b.course_id
     WHERE r.student_id = $1
     GROUP BY b.id, c.title
     ORDER BY attendance_pct ASC`,
    [studentId],
  );

  // Aggregate totals across all batches for the top-level summary card
  const totalCount   = records.length;
  const presentCount = records.filter((r: any) => r.status === 'PRESENT').length;
  const absentCount  = records.filter((r: any) => r.status === 'ABSENT').length;
  const lateCount    = records.filter((r: any) => r.status === 'LATE').length;
  const excusedCount = records.filter((r: any) => r.status === 'EXCUSED').length;
  const pct = totalCount > 0
    ? Math.round(((presentCount + lateCount) / totalCount) * 1000) / 10
    : 0;

  return {
    student: userRows[0],
    // `history` is the flat list expected by LearnerAttendanceView
    history: records.map((r: any) => ({
      status:        r.status,
      session_title: r.session_title,
      batch_name:    r.batch_name,
      session_date:  r.session_date,
      remarks:       r.remarks ?? null,
    })),
    // Single aggregated summary object expected by LearnerAttendanceView
    summary: {
      total:   totalCount,
      present: presentCount,
      absent:  absentCount,
      late:    lateCount,
      excused: excusedCount,
      pct,
    },
    // Per-batch breakdown kept for advanced consumers
    batchSummary: summary,
  };
}

export async function getTrainerSessions(trainerId: string) {
  const { rows: userRows } = await db.query(
    'SELECT id, name, email, avatar_url AS "avatarUrl" FROM users WHERE id = $1',
    [trainerId],
  );
  if (!userRows.length) throw new AppError('Trainer not found', 404, 'NOT_FOUND');

  const { rows: sessions } = await db.query(
    `SELECT
       s.*,
       b.name  AS batch_name,
       c.title AS course_title,
       COUNT(r.id)::int                                              AS total,
       COUNT(r.id) FILTER (WHERE r.status = 'PRESENT')::int         AS present,
       COUNT(r.id) FILTER (WHERE r.status = 'ABSENT')::int          AS absent,
       COUNT(r.id) FILTER (WHERE r.status = 'LATE')::int            AS late
     FROM attendance_sessions s
     JOIN batches b ON b.id = s.batch_id
     JOIN courses c ON c.id = b.course_id
     LEFT JOIN attendance_records r ON r.session_id = s.id
     WHERE s.trainer_id = $1
     GROUP BY s.id, b.name, c.title
     ORDER BY s.session_date DESC`,
    [trainerId],
  );

  const { rows: stats } = await db.query(
    `SELECT
       COUNT(DISTINCT s.id)::int                                     AS total_sessions,
       COUNT(DISTINCT s.batch_id)::int                               AS batches_covered,
       COUNT(DISTINCT r.student_id)::int                             AS total_students,
       ROUND(AVG(
         CASE WHEN total.cnt > 0
           THEN present.cnt::numeric / total.cnt::numeric * 100
           ELSE 0
         END
       ), 1) AS avg_attendance_pct
     FROM attendance_sessions s
     LEFT JOIN attendance_records r ON r.session_id = s.id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt FROM attendance_records WHERE session_id = s.id
     ) total ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt FROM attendance_records
       WHERE session_id = s.id AND status IN ('PRESENT','LATE')
     ) present ON TRUE
     WHERE s.trainer_id = $1`,
    [trainerId],
  );

  const statsRow = stats[0] ?? {};
  return {
    trainer:  userRows[0],
    sessions: sessions.map(formatSessionWithStats),
    // Shape expected by TrainerAttendanceView
    stats: {
      totalSessions: Number(statsRow.total_sessions    ?? 0),
      totalStudents: Number(statsRow.total_students    ?? 0),
      batchesCovered: Number(statsRow.batches_covered  ?? 0),
      avgPct:        Number(statsRow.avg_attendance_pct ?? 0),
    },
  };
}

export async function getReportsData(query: {
  batchId?: string;
  trainerId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const conds: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (query.batchId)   { conds.push(`s.batch_id   = $${i++}`);   params.push(query.batchId); }
  if (query.trainerId) { conds.push(`s.trainer_id = $${i++}`);   params.push(query.trainerId); }
  if (query.dateFrom)  { conds.push(`s.session_date >= $${i++}`); params.push(query.dateFrom); }
  if (query.dateTo)    { conds.push(`s.session_date <= $${i++}`); params.push(query.dateTo); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT
       u.name  AS student_name,
       u.email AS student_email,
       b.name  AS batch_name,
       c.title AS course_title,
       s.session_date::text AS session_date,
       s.title AS session_title,
       r.status,
       r.remarks,
       r.marked_at
     FROM attendance_records r
     JOIN attendance_sessions s ON s.id = r.session_id
     JOIN batches b ON b.id = s.batch_id
     JOIN courses c ON c.id = b.course_id
     JOIN users u ON u.id = r.student_id
     ${where}
     ORDER BY s.session_date DESC, u.name ASC`,
    params,
  );

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMATTERS
// ─────────────────────────────────────────────────────────────────────────────
/** Coerce a pg DATE/TIMESTAMP value to a YYYY-MM-DD string */
function toDateStr(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().split('T')[0];
  return String(v).split('T')[0]; // handle ISO strings and plain text
}

function formatSession(r: any) {
  return {
    id:          r.id,
    batchId:     r.batch_id,
    trainerId:   r.trainer_id,
    title:       r.title,
    sessionDate: toDateStr(r.session_date) ?? '',
    startTime:   r.start_time   ?? null,
    endTime:     r.end_time     ?? null,
    durationMin: r.duration_min ?? null,
    topic:       r.topic        ?? null,
    notes:       r.notes        ?? null,
    status:      r.status,
    createdBy:   r.created_by   ?? null,
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

function formatSessionWithStats(r: any) {
  const total   = Number(r.total_records   ?? r.total   ?? 0);
  const present = Number(r.present_count   ?? r.present ?? 0);
  const absent  = Number(r.absent_count    ?? r.absent  ?? 0);
  const late    = Number(r.late_count      ?? r.late    ?? 0);
  const excused = Number(r.excused_count   ?? r.excused ?? 0);
  const pct     = total > 0 ? Math.round(((present + late) / total) * 1000) / 10 : 0;

  return {
    ...formatSession(r),
    // Nested objects expected by the frontend
    batch:   { id: r.batch_id,   name: r.batch_name   ?? null },
    trainer: r.trainer_name
      ? { id: r.trainer_id, name: r.trainer_name }
      : null,
    // Flat aliases kept for backward compatibility
    batchName:   r.batch_name,
    batch_name:  r.batch_name,   // TrainerAttendanceView uses s.batch_name
    session_date: r.session_date, // TrainerAttendanceView uses s.session_date
    courseName:  r.course_title,
    trainerName: r.trainer_name,
    // Top-level stats expected by SessionListView / BatchAttendanceView
    total,
    present,
    absent,
    late,
    excused,
    pct,
    // Nested stats kept for any callers relying on the old shape
    stats: { total, present, absent, late, excused, pct },
  };
}

function formatRecord(r: any) {
  return {
    id:          r.id,
    sessionId:   r.session_id,
    studentId:   r.student_id,
    status:      r.status,
    markedBy:    r.marked_by   ?? null,
    markedAt:    r.marked_at,
    remarks:     r.remarks     ?? null,
    student: {
      id:        r.student_id,
      name:      r.student_name,
      email:     r.student_email,
      avatarUrl: r.student_avatar ?? null,
    },
    markedByName: r.marked_by_name ?? null,
  };
}
