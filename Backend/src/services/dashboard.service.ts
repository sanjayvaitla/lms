import db from '../lib/db';
import {
  syncCourseContentToBatch,
  releaseCompletedSessionContent,
} from './batches.service';

export async function getDashboardStats() {
  const [totalCoursesRes, totalStudentsRes, activeBatchesRes, activeCoursesRes, totalTrainersRes] =
    await Promise.all([
      db.query(`SELECT COUNT(*)::int AS cnt FROM courses WHERE status != 'ARCHIVED'`),
      db.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'STUDENT'`),
      db.query(`SELECT COUNT(*)::int AS cnt FROM batches WHERE status = 'ONGOING'`),
      db.query(`SELECT COUNT(*)::int AS cnt FROM courses WHERE status = 'ACTIVE'`),
      db.query(`SELECT COUNT(*)::int AS cnt FROM users WHERE role = 'TRAINER'`),
    ]);

  const totalCourses  = totalCoursesRes.rows[0].cnt;
  const totalStudents = totalStudentsRes.rows[0].cnt;
  const activeBatches = activeBatchesRes.rows[0].cnt;
  const activeCourses = activeCoursesRes.rows[0].cnt;
  const totalTrainers = totalTrainersRes.rows[0].cnt;

  const catRes = await db.query(
    `SELECT category, COUNT(*)::int AS count FROM courses WHERE status != 'ARCHIVED'
     GROUP BY category ORDER BY count DESC`,
  );

  // Enrollment count via batch_courses + real average completion
  const topCoursesRes = await db.query(
    `SELECT c.id, c.title, c.category,
       COUNT(DISTINCT e.id)::int AS "studentCount",
       COALESCE(ROUND(AVG(e.completion_pct))::int, 0) AS "completionPct"
     FROM courses c
     LEFT JOIN batch_courses bc ON bc.course_id = c.id
     LEFT JOIN enrollments e ON e.batch_id = bc.batch_id
     WHERE c.status != 'ARCHIVED'
     GROUP BY c.id
     ORDER BY "studentCount" DESC
     LIMIT 5`,
  );

  const trendRes = await db.query(
    `SELECT TO_CHAR(DATE_TRUNC('month', enrolled_at), 'Mon') AS month,
            DATE_TRUNC('month', enrolled_at) AS month_date, COUNT(*)::int AS count
     FROM enrollments
     WHERE enrolled_at >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
     GROUP BY DATE_TRUNC('month', enrolled_at) ORDER BY month_date ASC`,
  );

  const batchDistRes = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM batches GROUP BY status`,
  );

  const topTrainersRes = await db.query(
    `SELECT u.id, u.name,
       COUNT(DISTINCT c.id)::int AS "courseCount",
       COUNT(DISTINCT e.id)::int AS "studentCount"
     FROM users u
     LEFT JOIN courses c ON c.trainer_id = u.id AND c.status != 'ARCHIVED'
     LEFT JOIN batch_courses bc ON bc.course_id = c.id
     LEFT JOIN enrollments e ON e.batch_id = bc.batch_id
     WHERE u.role = 'TRAINER'
     GROUP BY u.id ORDER BY "studentCount" DESC LIMIT 5`,
  );

  // ── Needs-attention metrics ─────────────────────────────────────────────────
  const [ungradedRes, overdueRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS cnt FROM assignment_submissions
       WHERE status != 'GRADED'`,
    ),
    db.query(
      `SELECT COUNT(*)::int AS cnt FROM assignments
       WHERE status = 'PUBLISHED'
         AND due_date IS NOT NULL
         AND due_date < NOW()`,
    ),
  ]);

  // ── Session delivery stats ───────────────────────────────────────────────────
  const sessOverallRes = await db.query(
    `SELECT
       COUNT(*)::int                                                             AS total,
       COUNT(*) FILTER (WHERE cm.status IN ('RELEASED','COMPLETED'))::int        AS released,
       COUNT(*) FILTER (WHERE cm.status = 'COMPLETED')::int                      AS completed,
       COUNT(*) FILTER (WHERE cm.status = 'LOCKED')::int                         AS locked
     FROM course_modules cm
     JOIN courses c ON c.id = cm.course_id
     WHERE c.status != 'ARCHIVED'`,
  );

  const sessPerCourseRes = await db.query(
    `SELECT c.id, c.title, c.color_token AS "colorToken",
       COUNT(cm.id)::int                                                          AS total,
       COUNT(cm.id) FILTER (WHERE cm.status IN ('RELEASED','COMPLETED'))::int     AS released,
       COUNT(cm.id) FILTER (WHERE cm.status = 'COMPLETED')::int                   AS completed
     FROM courses c
     LEFT JOIN course_modules cm ON cm.course_id = c.id
     WHERE c.status != 'ARCHIVED'
     GROUP BY c.id
     HAVING COUNT(cm.id) > 0
     ORDER BY total DESC
     LIMIT 8`,
  );

  return {
    totalCourses, totalStudents, activeBatches, activeCourses, totalTrainers,
    categoryDistribution: catRes.rows,
    topCourses: topCoursesRes.rows,
    enrollmentTrend: trendRes.rows.map((r) => ({ month: r.month, count: r.count })),
    batchDistribution: batchDistRes.rows,
    topTrainers: topTrainersRes.rows,
    ungradedSubmissions: ungradedRes.rows[0]?.cnt ?? 0,
    overdueAssignments: overdueRes.rows[0]?.cnt ?? 0,
    sessionStats: {
      total:    sessOverallRes.rows[0]?.total    ?? 0,
      released: sessOverallRes.rows[0]?.released ?? 0,
      completed:sessOverallRes.rows[0]?.completed?? 0,
      locked:   sessOverallRes.rows[0]?.locked   ?? 0,
    },
    sessionDelivery: sessPerCourseRes.rows,
  };
}


// ── Student Dashboard ─────────────────────────────────────────────────────────
export async function getStudentDashboard(userId: string) {

  // ── Enrollments ─────────────────────────────────────────────────────────────
  const enrollRes = await db.query<any>(
    `WITH course_pct AS (
       SELECT bc.batch_id, cm.course_id,
         ROUND(
           COALESCE(
             COUNT(*) FILTER (WHERE bmp.status = 'COMPLETED')::numeric * 100.0
             / NULLIF(COUNT(*), 0),
             0
           )
         )::int AS pct
       FROM batch_courses bc
       JOIN course_modules cm ON cm.course_id = bc.course_id
       LEFT JOIN batch_module_progress bmp
         ON bmp.batch_id = bc.batch_id AND bmp.module_id = cm.id
       GROUP BY bc.batch_id, cm.course_id
     )
     SELECT
       e.id               AS "enrollmentId",
       COALESCE(cp.pct, 0) AS "completionPct",
       e.enrolled_at      AS "enrolledAt",
       b.id               AS "batchId",
       b.name             AS "batchName",
       b.status           AS "batchStatus",
       b.start_date       AS "startDate",
       b.end_date         AS "endDate",
       c.id               AS "courseId",
       c.title            AS "courseTitle",
       c.category         AS "courseCategory",
       c.level            AS "courseLevel",
       c.duration_months  AS "durationMonths",
       c.color_token      AS "colorToken",
       u.name             AS "trainerName"
     FROM enrollments e
     JOIN batches b       ON b.id = e.batch_id
     JOIN batch_courses bc ON bc.batch_id = b.id
     JOIN courses c       ON c.id = bc.course_id
     LEFT JOIN course_pct cp ON cp.batch_id = e.batch_id AND cp.course_id = c.id
     LEFT JOIN users u    ON u.id = c.trainer_id
     WHERE e.student_id = $1
     ORDER BY bc.sort_order ASC, e.enrolled_at DESC`,
    [userId],
  );
  const enrollments = enrollRes.rows;

  // Catch-up: package course content + release items for sessions already marked Done
  const seen = new Set<string>();
  for (const e of enrollments) {
    const key = `${e.batchId}:${e.courseId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await syncCourseContentToBatch(e.batchId, e.courseId);
    await releaseCompletedSessionContent(e.batchId, e.courseId);
  }

  if (enrollments.length === 0) {
    return {
      enrolled: false,
      enrollments: [],
      primaryEnrollment: null,
      nextSession: null,
      attendance: { overall: 0, total: 0, present: 0, absent: 0, late: 0, monthly: [] },
      assignments: { pending: 0, completed: 0, upcoming: [] },
      quizzes:     { pending: 0, completed: 0, recentAttempts: [], pendingList: [] },
      sessions:    { total: 0, released: 0, completed: 0 },
    };
  }

  const primaryCourseId = enrollments[0]?.courseId as string;
  const primaryBatchId = enrollments[0]?.batchId as string;
  const primaryEnrollmentId = enrollments[0]?.enrollmentId as string;

  // ── Attendance ──────────────────────────────────────────────────────────────
  const attOverall = await db.query<any>(
    `SELECT
       COUNT(*)::int                                          AS total,
       COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END)::int AS present,
       COUNT(CASE WHEN ar.status = 'ABSENT'  THEN 1 END)::int AS absent,
       COUNT(CASE WHEN ar.status = 'LATE'    THEN 1 END)::int AS late
     FROM attendance_records ar
     WHERE ar.student_id = $1`,
    [userId],
  );
  const att = attOverall.rows[0];
  const overallPct = att.total > 0
    ? Math.round(((att.present + att.late) / att.total) * 100)
    : 0;

  const attMonthly = await db.query<any>(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', s.session_date), 'Mon') AS month,
       DATE_TRUNC('month', s.session_date)                 AS month_date,
       COUNT(*)::int                                          AS total,
       COUNT(CASE WHEN ar.status = 'PRESENT' THEN 1 END)::int AS present,
       COUNT(CASE WHEN ar.status = 'ABSENT'  THEN 1 END)::int AS absent,
       COUNT(CASE WHEN ar.status = 'LATE'    THEN 1 END)::int AS late
     FROM attendance_records ar
     JOIN attendance_sessions s ON s.id = ar.session_id
     WHERE ar.student_id = $1
       AND s.session_date >= DATE_TRUNC('month', NOW() - INTERVAL '5 months')
     GROUP BY DATE_TRUNC('month', s.session_date)
     ORDER BY month_date ASC`,
    [userId],
  );

  // ── Assignments ─────────────────────────────────────────────────────────────
  const asgPending = await db.query<any>(
    `SELECT COUNT(DISTINCT a.id)::int AS cnt
     FROM assignments a
     JOIN assignment_batches ab ON ab.assignment_id = a.id AND ab.released = TRUE
     JOIN enrollments e         ON e.batch_id = ab.batch_id AND e.student_id = $1
     WHERE a.status = 'PUBLISHED'
       AND (
         a.module_id IS NULL
         OR EXISTS (
           SELECT 1 FROM batch_module_progress bmp
           WHERE bmp.module_id = a.module_id AND bmp.batch_id = e.batch_id AND bmp.status = 'COMPLETED'
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM assignment_submissions s
         WHERE s.assignment_id = a.id AND s.student_id = $1
           AND s.status IN ('SUBMITTED', 'GRADED', 'LATE')
       )`,
    [userId],
  );
  const asgDone = await db.query<any>(
    `SELECT COUNT(DISTINCT assignment_id)::int AS cnt
     FROM assignment_submissions
     WHERE student_id = $1 AND status IN ('SUBMITTED', 'GRADED', 'LATE')`,
    [userId],
  );
  const asgUpcoming = await db.query<any>(
    `SELECT a.id, a.title, a.due_date AS "dueDate", a.max_score AS "maxScore",
            c.title AS "courseTitle", c.color_token AS "colorToken",
            m.title AS "moduleTitle", m.session_number AS "sessionNumber"
     FROM assignments a
     JOIN assignment_batches ab ON ab.assignment_id = a.id AND ab.released = TRUE
     JOIN enrollments e         ON e.batch_id = ab.batch_id AND e.student_id = $1
     JOIN courses c             ON c.id = a.course_id
     LEFT JOIN course_modules m ON m.id = a.module_id
     WHERE a.status = 'PUBLISHED'
       AND (
         a.module_id IS NULL
         OR EXISTS (
           SELECT 1 FROM batch_module_progress bmp
           WHERE bmp.module_id = a.module_id AND bmp.batch_id = e.batch_id AND bmp.status = 'COMPLETED'
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM assignment_submissions s
         WHERE s.assignment_id = a.id AND s.student_id = $1
           AND s.status IN ('SUBMITTED', 'GRADED', 'LATE')
       )
     ORDER BY a.due_date ASC NULLS LAST
     LIMIT 5`,
    [userId],
  );

  // ── Quizzes ─────────────────────────────────────────────────────────────────
  const qzPending = await db.query<any>(
    `SELECT COUNT(DISTINCT q.id)::int AS cnt
     FROM quizzes q
     JOIN quiz_batches qb ON qb.quiz_id = q.id AND qb.released = TRUE
     JOIN enrollments e   ON e.batch_id = qb.batch_id AND e.student_id = $1
     WHERE q.status = 'ACTIVE'
       AND (
         q.module_id IS NULL
         OR EXISTS (
           SELECT 1 FROM batch_module_progress bmp
           WHERE bmp.module_id = q.module_id AND bmp.batch_id = e.batch_id AND bmp.status = 'COMPLETED'
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM quiz_attempts qa
         WHERE qa.quiz_id = q.id AND qa.student_id = $1
           AND qa.status = 'SUBMITTED'
       )`,
    [userId],
  );
  const qzDone = await db.query<any>(
    `SELECT COUNT(*)::int AS cnt
     FROM quiz_attempts WHERE student_id = $1 AND status = 'SUBMITTED'`,
    [userId],
  );
  const qzRecent = await db.query<any>(
    `SELECT
       qa.id,
       qa.quiz_id          AS "quizId",
       q.title             AS "quizTitle",
       COALESCE(qa.score, 0) AS score,
       CASE WHEN COALESCE(qa.score, 0) >= q.passing_score THEN true ELSE false END AS passed,
       qa.submitted_at     AS "submittedAt",
       c.title             AS "courseTitle",
       m.title             AS "moduleTitle",
       m.session_number    AS "sessionNumber"
     FROM quiz_attempts qa
     JOIN quizzes q ON q.id = qa.quiz_id
     JOIN courses c ON c.id = q.course_id
     LEFT JOIN course_modules m ON m.id = q.module_id
     WHERE qa.student_id = $1 AND qa.status = 'SUBMITTED'
     ORDER BY qa.submitted_at DESC
     LIMIT 5`,
    [userId],
  );
  const qzPendingList = await db.query<any>(
    `SELECT DISTINCT ON (q.id)
       q.id AS "quizId",
       q.title AS "quizTitle",
       c.id AS "courseId",
       c.title AS "courseTitle",
       e.id AS "enrollmentId",
       m.title AS "moduleTitle",
       m.session_number AS "sessionNumber"
     FROM quizzes q
     JOIN courses c ON c.id = q.course_id
     JOIN quiz_batches qb ON qb.quiz_id = q.id AND qb.released = TRUE
     JOIN enrollments e ON e.batch_id = qb.batch_id AND e.student_id = $1
     LEFT JOIN course_modules m ON m.id = q.module_id
     WHERE q.status = 'ACTIVE'
       AND (
         q.module_id IS NULL
         OR EXISTS (
           SELECT 1 FROM batch_module_progress bmp
           WHERE bmp.module_id = q.module_id AND bmp.batch_id = e.batch_id AND bmp.status = 'COMPLETED'
         )
       )
       AND NOT EXISTS (
         SELECT 1 FROM quiz_attempts qa
         WHERE qa.quiz_id = q.id AND qa.student_id = $1 AND qa.status = 'SUBMITTED'
       )
     ORDER BY q.id, q.title ASC
     LIMIT 10`,
    [userId],
  );

  // ── Sessions ─────────────────────────────────────────────────────────────────
  const [sessRes, sessPerEnrollRes] = await Promise.all([
    db.query<any>(
      `SELECT
         COUNT(cm.id)::int AS total,
         COUNT(cm.id) FILTER (WHERE COALESCE(bmp.status, cm.status) IN ('RELEASED','COMPLETED'))::int AS released,
         COUNT(cm.id) FILTER (WHERE COALESCE(bmp.status, cm.status) = 'COMPLETED')::int AS completed
       FROM enrollments e
       JOIN batch_courses bc ON bc.batch_id = e.batch_id
       JOIN course_modules cm ON cm.course_id = bc.course_id
       LEFT JOIN batch_module_progress bmp
         ON bmp.module_id = cm.id AND bmp.batch_id = e.batch_id
       WHERE e.student_id = $1`,
      [userId],
    ),
    db.query<any>(
      `SELECT
         e.id AS "enrollmentId",
         bc.course_id AS "courseId",
         COUNT(cm.id)::int AS total,
         COUNT(cm.id) FILTER (WHERE COALESCE(bmp.status, cm.status) IN ('RELEASED','COMPLETED'))::int AS released,
         COUNT(cm.id) FILTER (WHERE COALESCE(bmp.status, cm.status) = 'COMPLETED')::int AS completed
       FROM enrollments e
       JOIN batch_courses bc ON bc.batch_id = e.batch_id
       JOIN course_modules cm ON cm.course_id = bc.course_id
       LEFT JOIN batch_module_progress bmp
         ON bmp.module_id = cm.id AND bmp.batch_id = e.batch_id
       WHERE e.student_id = $1
       GROUP BY e.id, bc.course_id`,
      [userId],
    ),
  ]);

  const sessMap: Record<string, any> = {};
  sessPerEnrollRes.rows.forEach((r: any) => {
    sessMap[`${r.enrollmentId}:${r.courseId}`] = r;
  });
  const enrollmentsWithSessions = enrollments.map((e: any) => ({
    ...e,
    sessions: sessMap[`${e.enrollmentId}:${e.courseId}`] ?? { total: 0, released: 0, completed: 0 },
  }));

  // First RELEASED (not completed) session for primary course — Continue learning
  const nextSessionRes = await db.query<{
    id: string; title: string; sessionNumber: string | null;
  }>(
    `SELECT cm.id, cm.title, cm.session_number AS "sessionNumber"
     FROM course_modules cm
     LEFT JOIN batch_module_progress bmp
       ON bmp.module_id = cm.id AND bmp.batch_id = $2
     WHERE cm.course_id = $1
       AND COALESCE(bmp.status, cm.status) = 'RELEASED'
     ORDER BY cm.sort_order ASC
     LIMIT 1`,
    [primaryCourseId, primaryBatchId],
  );
  const nextRow = nextSessionRes.rows[0];
  const nextSession = nextRow
    ? {
        id: nextRow.id,
        title: nextRow.title,
        sessionNumber: nextRow.sessionNumber,
        batchId: primaryBatchId,
        enrollmentId: primaryEnrollmentId,
        courseId: primaryCourseId,
      }
    : null;

  return {
    enrolled:          true,
    enrollments:       enrollmentsWithSessions,
    primaryEnrollment: enrollmentsWithSessions[0],
    nextSession,
    attendance: {
      overall: overallPct,
      total:   att.total,
      present: att.present,
      absent:  att.absent,
      late:    att.late,
      monthly: attMonthly.rows,
    },
    assignments: {
      pending:   asgPending.rows[0].cnt,
      completed: asgDone.rows[0].cnt,
      upcoming:  asgUpcoming.rows,
    },
    quizzes: {
      pending:        qzPending.rows[0].cnt,
      completed:      qzDone.rows[0].cnt,
      recentAttempts: qzRecent.rows,
      pendingList:    qzPendingList.rows,
    },
    sessions: {
      total:    sessRes.rows[0]?.total    ?? 0,
      released: sessRes.rows[0]?.released ?? 0,
      completed:sessRes.rows[0]?.completed?? 0,
    },
  };
}
