import db from "../lib/db";
import {
  ensureBatchModuleProgress,
  ensureAllBatchModuleProgress,
  getCourseCompletionPct,
} from "./batch-progress.service";
import { AppError } from "../middleware/error.middleware";
import { storageAdapter, slugify } from "../lib/storage";
import { getModuleRecording } from "./recordings.service";
import {
  syncCourseContentToBatch,
  releaseCompletedSessionContent,
} from "./batches.service";

/** Ensure course content is packaged onto the batch and released for completed sessions. */
async function ensureCourseContentForBatch(batchId: string, courseId: string) {
  await syncCourseContentToBatch(batchId, courseId);
  await releaseCompletedSessionContent(batchId, courseId);
}

/** Attach presigned fileUrl to rows — one batched S3 call per unique key */
async function enrichRowsWithFileUrls<T extends { filePath?: string | null }>(
  rows: T[],
): Promise<(T & { fileUrl: string | null })[]> {
  if (!rows.length) return [];
  const keys = rows.map((r) => r.filePath).filter(Boolean) as string[];
  const urlMap = keys.length ? await storageAdapter.getUrls(keys) : new Map<string, string>();
  return rows.map((r) => ({
    ...r,
    fileUrl: r.filePath ? urlMap.get(r.filePath) ?? null : null,
  }));
}

/** Ensure the course is linked to the student's batch (prevents ?courseId= abuse) */
async function resolveEnrollmentCourse(
  batchId: string,
  courseId: string | undefined,
  defaultCourseId: string | null | undefined,
): Promise<string> {
  let resolved = courseId ?? defaultCourseId ?? null;
  if (!resolved) {
    const first = await db.query<{ course_id: string }>(
      `SELECT bc.course_id FROM batch_courses bc WHERE bc.batch_id=$1 ORDER BY bc.sort_order LIMIT 1`,
      [batchId],
    );
    resolved = first.rows[0]?.course_id ?? null;
  }
  if (!resolved) throw new AppError("No course found for this batch", 404, "NOT_FOUND");

  const link = await db.query(
    `SELECT 1 FROM batch_courses WHERE batch_id = $1 AND course_id = $2`,
    [batchId, resolved],
  );
  if (!link.rowCount) {
    throw new AppError("Course not available for this enrollment", 403, "FORBIDDEN");
  }
  return resolved;
}

// ── Student: get all assignments for a course (via enrollment) ────────────────
export async function getCourseAssignments(
  enrollmentId: string,
  studentId: string,
  courseId?: string,
) {
  const enrollRes = await db.query<any>(
    `SELECT e.batch_id, COALESCE(b.course_id,
       (SELECT bc.course_id FROM batch_courses bc WHERE bc.batch_id=b.id ORDER BY bc.sort_order LIMIT 1)) AS default_course_id
     FROM enrollments e JOIN batches b ON b.id=e.batch_id
     WHERE e.id=$1 AND e.student_id=$2`,
    [enrollmentId, studentId],
  );
  if (!enrollRes.rows.length)
    throw new AppError("Enrollment not found", 404, "NOT_FOUND");
  const { batch_id: batchId, default_course_id: defaultCourseId } = enrollRes.rows[0];
  const resolvedCourseId = await resolveEnrollmentCourse(batchId, courseId, defaultCourseId);

  // Catch-up: package course content onto batch + publish items for already-completed sessions
  await ensureCourseContentForBatch(batchId, resolvedCourseId);

  const { rows } = await db.query<any>(
    `SELECT a.id, a.title, a.description, a.due_date AS "dueDate",
            a.max_score AS "maxScore", a.status, a.pdf_filename AS "pdfFilename",
            a.pdf_path AS "pdfPath", a.created_at AS "createdAt",
            m.title AS "moduleTitle", m.session_number AS "sessionNumber",
            (SELECT row_to_json(s) FROM (
              SELECT id, status, score, submitted_at AS "submittedAt", feedback,
                     pdf_key AS "pdfKey", zip_key AS "zipKey",
                     ai_score AS "aiScore", ai_feedback AS "aiFeedback",
                     ai_breakdown AS "aiBreakdown", ai_graded_at AS "aiGradedAt",
                     ai_model AS "aiModel"
              FROM assignment_submissions
              WHERE assignment_id = a.id AND student_id = $2 LIMIT 1
            ) s) AS submission
     FROM assignments a
     LEFT JOIN course_modules m ON m.id = a.module_id
     WHERE a.course_id = $1
       AND a.status = 'PUBLISHED'
       AND a.pdf_path IS DISTINCT FROM 'git-task'
       AND EXISTS (
         SELECT 1 FROM assignment_batches ab
         WHERE ab.assignment_id = a.id AND ab.batch_id = $3 AND ab.released = TRUE
       )
       AND (
         a.module_id IS NULL
         OR EXISTS (
           SELECT 1 FROM batch_module_progress bmp
           WHERE bmp.module_id = a.module_id
             AND bmp.batch_id = $3
             AND bmp.status = 'COMPLETED'
         )
       )
     ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC`,
    [resolvedCourseId, studentId, batchId],
  );

  const urlKeys: string[] = [];
  for (const row of rows) {
    if (row.pdfPath) urlKeys.push(row.pdfPath);
    const sub = row.submission as { pdfKey?: string | null; zipKey?: string | null } | null;
    if (sub?.pdfKey) urlKeys.push(sub.pdfKey);
    if (sub?.zipKey) urlKeys.push(sub.zipKey);
  }
  const urlMap = urlKeys.length ? await storageAdapter.getUrls(urlKeys) : new Map<string, string>();

  return rows.map((row: any) => {
    const sub = row.submission as { pdfKey?: string | null; zipKey?: string | null } | null;
    return {
      ...row,
      pdfUrl: row.pdfPath ? urlMap.get(row.pdfPath) ?? null : null,
      submission: sub
        ? {
            ...sub,
            pdfUrl: sub.pdfKey ? urlMap.get(sub.pdfKey) ?? null : null,
            zipUrl: sub.zipKey ? urlMap.get(sub.zipKey) ?? null : null,
          }
        : null,
    };
  });
}

// ── Student: get all quizzes for a course (via enrollment) ────────────────────
export async function getCourseQuizzes(
  enrollmentId: string,
  studentId: string,
  courseId?: string,
) {
  const enrollRes = await db.query<any>(
    `SELECT e.batch_id, COALESCE(b.course_id,
       (SELECT bc.course_id FROM batch_courses bc WHERE bc.batch_id=b.id ORDER BY bc.sort_order LIMIT 1)) AS default_course_id
     FROM enrollments e JOIN batches b ON b.id=e.batch_id
     WHERE e.id=$1 AND e.student_id=$2`,
    [enrollmentId, studentId],
  );
  if (!enrollRes.rows.length)
    throw new AppError("Enrollment not found", 404, "NOT_FOUND");
  const { batch_id: batchId, default_course_id: defaultCourseId } = enrollRes.rows[0];
  const resolvedCourseId = await resolveEnrollmentCourse(batchId, courseId, defaultCourseId);

  await ensureCourseContentForBatch(batchId, resolvedCourseId);

  const { rows } = await db.query<any>(
    `SELECT q.id, q.title, q.description,
            q.passing_score AS "passingScore",
            q.time_limit_minutes AS "timeLimitMinutes",
            q.max_attempts AS "maxAttempts", q.status,
            q.questions_per_attempt AS "questionsPerAttempt",
            m.title AS "moduleTitle", m.session_number AS "sessionNumber",
            (SELECT COUNT(*)::int FROM quiz_attempts qa
             WHERE qa.quiz_id = q.id AND qa.student_id = $2 AND qa.status = 'SUBMITTED') AS "attemptsUsed",
            (SELECT row_to_json(t) FROM (
              SELECT COALESCE(qa.score,0) AS score,
                CASE WHEN COALESCE(qa.score,0) >= q.passing_score THEN true ELSE false END AS passed,
                qa.submitted_at AS "submittedAt"
              FROM quiz_attempts qa
              WHERE qa.quiz_id = q.id AND qa.student_id = $2 AND qa.status = 'SUBMITTED'
              ORDER BY qa.score DESC LIMIT 1
            ) t) AS "bestAttempt"
     FROM quizzes q
     LEFT JOIN course_modules m ON m.id = q.module_id
     WHERE q.course_id = $1
       AND q.status = 'ACTIVE'
       AND EXISTS (
         SELECT 1 FROM quiz_batches qb
         WHERE qb.quiz_id = q.id AND qb.batch_id = $3 AND qb.released = TRUE
       )
       AND (
         q.module_id IS NULL
         OR EXISTS (
           SELECT 1 FROM batch_module_progress bmp
           WHERE bmp.module_id = q.module_id
             AND bmp.batch_id = $3
             AND bmp.status = 'COMPLETED'
         )
       )
     ORDER BY m.sort_order ASC NULLS LAST, q.created_at ASC`,
    [resolvedCourseId, studentId, batchId],
  );

  return rows;
}

// ── Student: get all SLMs / References / Artifacts for a course ──────────────
export async function getCourseMaterials(
  enrollmentId: string,
  studentId: string,
  courseId?: string,
) {
  const enrollRes = await db.query<any>(
    `SELECT e.batch_id,
            COALESCE(b.course_id,
       (SELECT bc.course_id FROM batch_courses bc WHERE bc.batch_id=b.id ORDER BY bc.sort_order LIMIT 1)) AS default_course_id
     FROM enrollments e JOIN batches b ON b.id=e.batch_id
     WHERE e.id=$1 AND e.student_id=$2`,
    [enrollmentId, studentId],
  );
  if (!enrollRes.rows.length)
    throw new AppError("Enrollment not found", 404, "NOT_FOUND");
  const { batch_id: batchId } = enrollRes.rows[0];
  const resolvedCourseId = await resolveEnrollmentCourse(batchId, courseId, enrollRes.rows[0].default_course_id);

  await ensureBatchModuleProgress(batchId, resolvedCourseId);

  // References / SLM / PPT — only for sessions unlocked for this batch (RELEASED or COMPLETED)
  const refsRes = await db.query<any>(
    `SELECT sr.id, sr.title, sr.type, sr.url, sr.file_path AS "filePath",
            sr.description, sr.created_at AS "createdAt",
            m.title AS "moduleTitle", m.session_number AS "sessionNumber",
            m.section, m.sort_order AS "sortOrder",
            u.name AS "addedByName"
     FROM session_references sr
     JOIN course_modules m ON m.id = sr.module_id
     LEFT JOIN users u ON u.id = sr.added_by
     JOIN batch_module_progress bmp
       ON bmp.module_id = m.id AND bmp.batch_id = $2
     WHERE m.course_id = $1
       AND bmp.status IN ('RELEASED', 'COMPLETED')
     ORDER BY m.sort_order ASC, sr.created_at DESC`,
    [resolvedCourseId, batchId],
  );

  // Artifacts
  const artsRes = await db.query<any>(
    `SELECT sa.id, sa.title, sa.type, sa.url, sa.file_path AS "filePath",
            sa.description, sa.created_at AS "createdAt",
            m.title AS "moduleTitle", m.session_number AS "sessionNumber",
            m.section, m.sort_order AS "sortOrder",
            u.name AS "addedByName"
     FROM session_artifacts sa
     JOIN course_modules m ON m.id = sa.module_id
     LEFT JOIN users u ON u.id = sa.added_by
     JOIN batch_module_progress bmp
       ON bmp.module_id = m.id AND bmp.batch_id = $2
     WHERE m.course_id = $1
       AND bmp.status IN ('RELEASED', 'COMPLETED')
     ORDER BY m.sort_order ASC, sa.created_at DESC`,
    [resolvedCourseId, batchId],
  );

  const allRefs = await enrichRowsWithFileUrls(refsRes.rows);
  const artifacts = await enrichRowsWithFileUrls(artsRes.rows);

  // Split refs: SLM vs other references
  const slm = allRefs.filter((r: any) => r.type === "SLM");
  const ppt = allRefs.filter((r: any) => r.type === "PPT");
  const references = allRefs.filter((r: any) => r.type !== "SLM" && r.type !== "PPT");

  return { references, slm, ppt, artifacts };
}

// ── Student: list sessions for an enrollment ─────────────────────────────────
// courseId param allows multi-course batch: student picks which course to view.
export async function getEnrollmentSessions(
  enrollmentId: string,
  studentId: string,
  courseId?: string,
) {
  const enrollRes = await db.query<any>(
    `SELECT e.id, e.batch_id, e.completion_pct,
            b.name AS batch_name, b.status AS batch_status,
            b.start_date, b.end_date
     FROM enrollments e
     JOIN batches b ON b.id = e.batch_id
     WHERE e.id = $1 AND e.student_id = $2`,
    [enrollmentId, studentId],
  );
  if (!enrollRes.rows.length)
    throw new AppError("Enrollment not found", 404, "NOT_FOUND");
  const enrRow = enrollRes.rows[0];

  const firstCourse = await db.query<any>(
    `SELECT bc.course_id FROM batch_courses bc WHERE bc.batch_id=$1 ORDER BY bc.sort_order LIMIT 1`,
    [enrRow.batch_id],
  );
  const resolvedCourseId = await resolveEnrollmentCourse(
    enrRow.batch_id,
    courseId,
    firstCourse.rows[0]?.course_id,
  );

  const progExists = await db.query(
    `SELECT 1 FROM batch_module_progress bmp
     JOIN course_modules cm ON cm.id = bmp.module_id
     WHERE bmp.batch_id = $1 AND cm.course_id = $2 LIMIT 1`,
    [enrRow.batch_id, resolvedCourseId],
  );
  if (!progExists.rowCount) {
    await ensureBatchModuleProgress(enrRow.batch_id, resolvedCourseId);
  }
  const courseCompletionPct = await getCourseCompletionPct(enrRow.batch_id, resolvedCourseId);

  const courseRes = await db.query<any>(
    `SELECT c.id, c.title AS course_title, c.category, c.color_token, c.level, u.name AS trainer_name
     FROM courses c LEFT JOIN users u ON u.id=c.trainer_id WHERE c.id=$1`, [resolvedCourseId]);
  const courseRow = courseRes.rows[0] ?? {};
  const enr = { ...enrRow, course_id: resolvedCourseId, course_title: courseRow.course_title,
    category: courseRow.category, color_token: courseRow.color_token, level: courseRow.level,
    trainer_name: courseRow.trainer_name };

  const sessionsRes = await db.query<any>(
    `SELECT
       cm.id,
       cm.title,
       cm.description,
       cm.section,
       cm.session_number   AS "sessionNumber",
       cm.topics,
       cm.duration_minutes AS "durationMinutes",
       cm.sort_order       AS "sortOrder",
       COALESCE(bmp.status, cm.status) AS status,
       bmp.completed_at    AS "completedAt",
       lcl.meet_link       AS "meetLink",
       (SELECT COUNT(*)::int FROM assignments a
        WHERE a.module_id = cm.id AND a.status = 'PUBLISHED' AND a.pdf_path IS DISTINCT FROM 'git-task') AS "assignmentCount",
       (SELECT COUNT(*)::int FROM quizzes q
        WHERE q.module_id = cm.id AND q.status = 'ACTIVE') AS "quizCount",
       (SELECT COUNT(*)::int FROM session_references sr WHERE sr.module_id = cm.id) AS "referenceCount",
       (SELECT COUNT(*)::int FROM session_artifacts  sa WHERE sa.module_id = cm.id) AS "artifactCount"
     FROM course_modules cm
     LEFT JOIN batch_module_progress bmp ON bmp.module_id = cm.id AND bmp.batch_id = $2
     LEFT JOIN live_class_links lcl ON lcl.module_id = cm.id AND lcl.batch_id = $2
     WHERE cm.course_id = $1
     ORDER BY cm.sort_order ASC, cm.created_at ASC`,
    [enr.course_id, enrRow.batch_id],
  );

  // Group sessions by section for cleaner frontend consumption
  const sectionMap = new Map<string, { section: string; sessions: any[] }>();
  for (const sess of sessionsRes.rows) {
    const key = sess.section ?? "General";
    if (!sectionMap.has(key))
      sectionMap.set(key, { section: key, sessions: [] });
    sectionMap.get(key)!.sessions.push(sess);
  }
  const sections = Array.from(sectionMap.values());

  return {
    enrollment: {
      id: enr.id,
      batchId: enr.batch_id,
      batchName: enr.batch_name,
      batchStatus: enr.batch_status,
      startDate: enr.start_date,
      endDate: enr.end_date,
      courseTitle: enr.course_title,
      category: enr.category,
      colorToken: enr.color_token,
      level: enr.level,
      trainerName: enr.trainer_name,
      completionPct: courseCompletionPct,
    },
    sections,
    sessions: sessionsRes.rows, // flat list still available
  };
}

// ── Student: get full session detail ─────────────────────────────────────────
export async function getSessionDetail(
  moduleId: string,
  studentId: string,
  enrollmentId?: string,
) {
  const modRes = await db.query<any>(
    `SELECT cm.id, cm.title, cm.description,
            cm.section, cm.session_number AS "sessionNumber",
            cm.topics, cm.duration_minutes AS "durationMinutes",
            cm.sort_order AS "sortOrder", cm.status,
            c.id AS "courseId", c.title AS "courseTitle", c.color_token AS "colorToken"
     FROM course_modules cm
     JOIN courses c ON c.id = cm.course_id
     WHERE cm.id = $1`,
    [moduleId],
  );
  if (!modRes.rows.length)
    throw new AppError("Session not found", 404, "NOT_FOUND");

  const mod = modRes.rows[0];

  // Always resolve the student's batch for this course — never trust course_modules.status alone
  let resolvedEnrollmentId = enrollmentId ?? null;
  if (!resolvedEnrollmentId) {
    const auto = await db.query<{ id: string }>(
      `SELECT e.id
       FROM enrollments e
       JOIN batch_courses bc ON bc.batch_id = e.batch_id AND bc.course_id = $2
       WHERE e.student_id = $1
       ORDER BY e.enrolled_at DESC
       LIMIT 1`,
      [studentId, mod.courseId],
    );
    resolvedEnrollmentId = auto.rows[0]?.id ?? null;
  }

  if (!resolvedEnrollmentId) {
    throw new AppError('Not enrolled in this course', 403, 'FORBIDDEN');
  }

  const enrollRes = await db.query<any>(
    `SELECT e.batch_id
     FROM enrollments e
     JOIN batch_courses bc ON bc.batch_id = e.batch_id AND bc.course_id = $3
     WHERE e.id = $1 AND e.student_id = $2`,
    [resolvedEnrollmentId, studentId, mod.courseId],
  );
  if (!enrollRes.rows.length) {
    throw new AppError('Session not available for this enrollment', 403, 'FORBIDDEN');
  }
  const batchId = enrollRes.rows[0].batch_id as string;

  await ensureBatchModuleProgress(batchId, mod.courseId);
  const bmpRes = await db.query<{ status: string }>(
    `SELECT status FROM batch_module_progress WHERE batch_id = $1 AND module_id = $2`,
    [batchId, moduleId],
  );
  const effectiveStatus = (bmpRes.rows[0]?.status ?? 'LOCKED') as string;

  let meetLink: string | null = null;
  const liveLinkRes = await db.query<any>(
    `SELECT meet_link FROM live_class_links WHERE batch_id = $1 AND module_id = $2`,
    [batchId, moduleId],
  );
  if (liveLinkRes.rows.length) {
    meetLink = liveLinkRes.rows[0].meet_link;
  }

  if (effectiveStatus === 'LOCKED') {
    return {
      session: { ...mod, status: effectiveStatus, meetLink: null },
      assignments: [],
      quizzes: [],
      references: [],
      slm: [],
      ppt: [],
      artifacts: [],
      recording: null,
      locked: true,
    };
  }

  // Assignments + quizzes only after this batch's session is marked COMPLETED
  const sessionDone = effectiveStatus === 'COMPLETED';

  if (sessionDone) {
    await ensureCourseContentForBatch(batchId, mod.courseId as string);
  }

  // Materials available once session is unlocked for this batch (RELEASED or COMPLETED)
  const materialsOpen = effectiveStatus === 'RELEASED' || effectiveStatus === 'COMPLETED';

  const assignSql = `SELECT a.id, a.title, a.description, a.due_date AS "dueDate",
              a.max_score AS "maxScore", a.status,
              (SELECT row_to_json(s) FROM (
                SELECT id, status, score, submitted_at AS "submittedAt"
                FROM assignment_submissions
                WHERE assignment_id = a.id AND student_id = $2 LIMIT 1
              ) s) AS submission
       FROM assignments a
       WHERE a.module_id = $1
         AND a.status = 'PUBLISHED'
         AND EXISTS (
           SELECT 1 FROM assignment_batches ab
           WHERE ab.assignment_id = a.id AND ab.batch_id = $3 AND ab.released = TRUE
         )
         AND a.pdf_path IS DISTINCT FROM 'git-task'
       ORDER BY a.due_date ASC NULLS LAST`;
  const assignParams: unknown[] = [moduleId, studentId, batchId];

  const quizSql = `SELECT q.id, q.title, q.description,
              q.passing_score AS "passingScore",
              q.time_limit_minutes AS "timeLimitMinutes",
              q.max_attempts AS "maxAttempts", q.status,
              (SELECT row_to_json(t) FROM (
                SELECT COALESCE(qa.score,0) AS score,
                  CASE WHEN COALESCE(qa.score,0) >= q.passing_score THEN true ELSE false END AS passed,
                  qa.submitted_at AS "submittedAt"
                FROM quiz_attempts qa
                WHERE qa.quiz_id = q.id AND qa.student_id = $2 AND qa.status = 'SUBMITTED'
                ORDER BY qa.score DESC LIMIT 1
              ) t) AS best_attempt,
              (SELECT COUNT(*)::int FROM quiz_attempts qa
               WHERE qa.quiz_id = q.id AND qa.student_id = $2 AND qa.status = 'SUBMITTED') AS "attemptsUsed"
       FROM quizzes q
       WHERE q.module_id = $1 AND q.status = 'ACTIVE'
         AND EXISTS (
           SELECT 1 FROM quiz_batches qb
           WHERE qb.quiz_id = q.id AND qb.batch_id = $3 AND qb.released = TRUE
         )
       ORDER BY q.created_at ASC`;
  const quizParams: unknown[] = [moduleId, studentId, batchId];

  const emptyRows = { rows: [] as any[] };
  const materialsSql = `SELECT id, title, type, url, file_path AS "filePath", description,
              added_by AS "addedBy", created_at AS "createdAt"
       FROM session_references WHERE module_id = $1
       ORDER BY created_at ASC`;
  const artsSql = `SELECT id, title, type, url, file_path AS "filePath", description,
              added_by AS "addedBy", created_at AS "createdAt"
       FROM session_artifacts WHERE module_id = $1 ORDER BY created_at ASC`;
  const slmSql = `SELECT id, title, type, url, file_path AS "filePath", description,
              added_by AS "addedBy", created_at AS "createdAt"
       FROM session_references WHERE module_id = $1 AND type = 'SLM'
       ORDER BY created_at ASC`;
  const pptSql = `SELECT id, title, type, url, file_path AS "filePath", description,
              added_by AS "addedBy", created_at AS "createdAt"
       FROM session_references WHERE module_id = $1 AND type = 'PPT'
       ORDER BY created_at ASC`;

  const [assignRes, quizRes, refRes, artRes, slmRes, pptRes] = await Promise.all([
    sessionDone ? db.query<any>(assignSql, assignParams) : Promise.resolve(emptyRows),
    sessionDone ? db.query<any>(quizSql, quizParams) : Promise.resolve(emptyRows),
    materialsOpen ? db.query<any>(materialsSql, [moduleId]) : Promise.resolve(emptyRows),
    materialsOpen ? db.query<any>(artsSql, [moduleId]) : Promise.resolve(emptyRows),
    materialsOpen ? db.query<any>(slmSql, [moduleId]) : Promise.resolve(emptyRows),
    materialsOpen ? db.query<any>(pptSql, [moduleId]) : Promise.resolve(emptyRows),
  ]);

  // references = non-SLM and non-PPT items
  const references = refRes.rows.filter((r: any) => r.type !== "SLM" && r.type !== "PPT");

  const enrichUrls = async (items: any[]) => enrichRowsWithFileUrls(items);

  let recording: any = null;
  recording = await getModuleRecording(moduleId, batchId);

  return {
    session: { ...mod, status: effectiveStatus, meetLink },
    assignments: assignRes.rows,
    quizzes: quizRes.rows,
    references: await enrichUrls(references),
    slm: await enrichUrls(slmRes.rows),
    ppt: await enrichUrls(pptRes.rows),
    artifacts: await enrichUrls(artRes.rows),
    recording,
  };
}

// ── Helpers: resolve course slug from a module ID ────────────────────────────
async function getCourseSlugForModule(moduleId: string): Promise<string> {
  const { rows } = await db.query<{ title: string }>(
    `SELECT c.title FROM course_modules cm
     JOIN courses c ON c.id = cm.course_id
     WHERE cm.id = $1`,
    [moduleId],
  );
  return rows[0] ? slugify(rows[0].title) : "general";
}

async function mapReferenceRow(
  row: Record<string, unknown>,
  fileUrl: string | null,
) {
  const filePath = row.file_path as string | null;
  return {
    id: row.id as string,
    moduleId: row.module_id as string,
    title: row.title as string,
    type: row.type as string,
    url: (row.url as string | null) ?? null,
    filePath,
    description: (row.description as string | null) ?? null,
    createdAt: row.created_at as string,
    fileUrl:
      fileUrl ??
      (filePath ? await storageAdapter.getUrl(filePath).catch(() => null) : null),
  };
}

// ── Trainer/Admin: add reference (URL or file) ───────────────────────────────
export async function addReference(
  moduleId: string,
  body: any,
  userId: string,
  file?: { buffer: Buffer; originalname: string; mimetype: string },
) {
  const { title, type = "LINK", url, description } = body;
  if (!title) throw new AppError("Title required", 400, "VALIDATION_ERROR");

  let filePath: string | null = null;
  let fileUrl: string | null = null;

  if (file) {
    const courseSlug = await getCourseSlugForModule(moduleId);
    const stored = await storageAdapter.uploadWithContext(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      { type: "reference", courseSlug, moduleSlug: moduleId, title },
    );
    filePath = stored.key;
    fileUrl = await storageAdapter.getUrl(stored.key);
  }

  const res = await db.query<any>(
    `INSERT INTO session_references (module_id, title, type, url, file_path, description, added_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [moduleId, title, type, url ?? null, filePath, description ?? null, userId],
  );
  const row = res.rows[0];
  return mapReferenceRow(row, fileUrl);
}

export async function deleteReference(refId: string) {
  const { rows } = await db.query<{ file_path: string | null }>(
    "DELETE FROM session_references WHERE id = $1 RETURNING file_path",
    [refId],
  );
  const fp = rows[0]?.file_path;
  if (fp) await storageAdapter.delete(fp).catch(() => null);
}

// ── Trainer/Admin: add SLM (Student Learning Material) ───────────────────────
export async function addSlm(
  moduleId: string,
  body: any,
  userId: string,
  file?: { buffer: Buffer; originalname: string; mimetype: string },
) {
  const { title, url, description } = body;
  if (!title) throw new AppError("Title required", 400, "VALIDATION_ERROR");

  let filePath: string | null = null;
  let fileUrl: string | null = null;

  if (file) {
    const courseSlug = await getCourseSlugForModule(moduleId);
    const stored = await storageAdapter.uploadWithContext(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      { type: "slm", courseSlug, moduleSlug: moduleId, title },
    );
    filePath = stored.key;
    fileUrl = await storageAdapter.getUrl(stored.key);
  }

  const res = await db.query<any>(
    `INSERT INTO session_references (module_id, title, type, url, file_path, description, added_by)
     VALUES ($1,$2,'SLM',$3,$4,$5,$6) RETURNING *`,
    [moduleId, title, url ?? null, filePath, description ?? null, userId],
  );
  const row = res.rows[0];
  return mapReferenceRow(row, fileUrl);
}

// ── Trainer/Admin: add PPT ───────────────────────────────────────────────────
export async function addPpt(
  moduleId: string,
  body: any,
  userId: string,
  file?: { buffer: Buffer; originalname: string; mimetype: string },
) {
  const { title, url, description } = body;
  if (!title) throw new AppError("Title required", 400, "VALIDATION_ERROR");

  let filePath: string | null = null;
  let fileUrl: string | null = null;

  if (file) {
    const courseSlug = await getCourseSlugForModule(moduleId);
    const stored = await storageAdapter.uploadWithContext(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      { type: "ppt", courseSlug, moduleSlug: moduleId, title },
    );
    filePath = stored.key;
    fileUrl = await storageAdapter.getUrl(stored.key);
  }

  const res = await db.query<any>(
    `INSERT INTO session_references (module_id, title, type, url, file_path, description, added_by)
     VALUES ($1,$2,'PPT',$3,$4,$5,$6) RETURNING *`,
    [moduleId, title, url ?? null, filePath, description ?? null, userId],
  );
  const row = res.rows[0];
  return mapReferenceRow(row, fileUrl);
}

// ── Trainer/Admin: add artifact (URL or file) ────────────────────────────────
export async function addArtifact(
  moduleId: string,
  body: any,
  userId: string,
  file?: { buffer: Buffer; originalname: string; mimetype: string },
) {
  const { title, type = "DEMO", url, description } = body;
  if (!title) throw new AppError("Title required", 400, "VALIDATION_ERROR");

  let filePath: string | null = null;
  let fileUrl: string | null = null;

  if (file) {
    const courseSlug = await getCourseSlugForModule(moduleId);
    const stored = await storageAdapter.uploadWithContext(
      {
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      },
      { type: "artifact", courseSlug, moduleSlug: moduleId, title },
    );
    filePath = stored.key;
    fileUrl = await storageAdapter.getUrl(stored.key);
  }

  const res = await db.query<any>(
    `INSERT INTO session_artifacts (module_id, title, type, url, file_path, description, added_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [moduleId, title, type, url ?? null, filePath, description ?? null, userId],
  );
  const row = res.rows[0];
  return mapReferenceRow(row, fileUrl);
}

export async function deleteArtifact(artId: string) {
  const { rows } = await db.query<{ file_path: string | null }>(
    "DELETE FROM session_artifacts WHERE id = $1 RETURNING file_path",
    [artId],
  );
  const fp = rows[0]?.file_path;
  if (fp) await storageAdapter.delete(fp).catch(() => null);
}

// ── Content Master: build session sections with refs/artifacts ────────────────
async function buildContentMasterSections(sessionsRows: any[]) {
  const sessionIds = sessionsRows.map((s: any) => s.id);

  const refsRes = sessionIds.length
    ? await db.query<any>(
        `SELECT id, module_id AS "moduleId", title, type, url,
                file_path AS "filePath", description, created_at AS "createdAt"
         FROM session_references
         WHERE module_id = ANY($1)
         ORDER BY created_at ASC`,
        [sessionIds],
      )
    : { rows: [] };

  const artsRes = sessionIds.length
    ? await db.query<any>(
        `SELECT id, module_id AS "moduleId", title, type, url,
                file_path AS "filePath", description, created_at AS "createdAt"
         FROM session_artifacts
         WHERE module_id = ANY($1)
         ORDER BY created_at ASC`,
        [sessionIds],
      )
    : { rows: [] };

  const refsByModule = new Map<string, any[]>();
  for (const r of refsRes.rows) {
    if (!refsByModule.has(r.moduleId)) refsByModule.set(r.moduleId, []);
    refsByModule.get(r.moduleId)!.push(r);
  }
  const artsByModule = new Map<string, any[]>();
  for (const a of artsRes.rows) {
    if (!artsByModule.has(a.moduleId)) artsByModule.set(a.moduleId, []);
    artsByModule.get(a.moduleId)!.push(a);
  }

  const allFilePaths = [
    ...refsRes.rows.map((r: any) => r.filePath),
    ...artsRes.rows.map((a: any) => a.filePath),
  ].filter(Boolean) as string[];
  const urlMap = allFilePaths.length
    ? await storageAdapter.getUrls(allFilePaths)
    : new Map<string, string>();

  const withUrl = (item: any) => ({
    ...item,
    fileUrl: item.filePath ? urlMap.get(item.filePath) ?? null : null,
  });

  const sectionMap = new Map<string, { section: string; sessions: any[] }>();
  for (const sess of sessionsRows) {
    const key = sess.section ?? "General";
    if (!sectionMap.has(key))
      sectionMap.set(key, { section: key, sessions: [] });

    const refs = (refsByModule.get(sess.id) ?? []).map(withUrl);
    const arts = (artsByModule.get(sess.id) ?? []).map(withUrl);

    sectionMap.get(key)!.sessions.push({
      ...sess,
      slm: refs.filter((r: any) => r.type === "SLM"),
      ppt: refs.filter((r: any) => r.type === "PPT"),
      references: refs.filter((r: any) => r.type !== "SLM" && r.type !== "PPT"),
      artifacts: arts,
    });
  }

  return Array.from(sectionMap.values());
}

// ── Content Master: get all sessions for a course (no batch required) ─────────
export async function getCourseSessionsForContentMaster(courseId: string) {
  return loadCourseSessionsForContentMaster(courseId);
}

async function loadCourseSessionsForContentMaster(courseId: string) {
  const courseRes = await db.query<any>(
    `SELECT id, title, color_token AS "colorToken" FROM courses WHERE id = $1`,
    [courseId],
  );
  if (!courseRes.rows.length)
    throw new AppError("Course not found", 404, "NOT_FOUND");
  const course = courseRes.rows[0];

  const sessionsRes = await db.query<any>(
    `SELECT
       cm.id, cm.title, cm.section,
       cm.session_number AS "sessionNumber",
       cm.sort_order AS "sortOrder", cm.status,
       cm.course_id AS "courseId"
     FROM course_modules cm
     WHERE cm.course_id = $1
     ORDER BY cm.sort_order ASC, cm.created_at ASC`,
    [courseId],
  );

  const sections = await buildContentMasterSections(sessionsRes.rows);
  return { course, sections };
}

// ── Content Master: get all sessions for a batch (grouped by section) ─────────
export async function getBatchSessionsForContentMaster(batchId: string) {
  return loadBatchSessionsForContentMaster(batchId);
}

async function loadBatchSessionsForContentMaster(batchId: string) {
  // Verify batch exists and get course info
  const batchRes = await db.query<any>(
    `SELECT b.id, b.name AS "batchName", b.status FROM batches b WHERE b.id = $1`,
    [batchId],
  );
  if (!batchRes.rows.length)
    throw new AppError("Batch not found", 404, "NOT_FOUND");
  const batchRow = batchRes.rows[0];

  // Get all courses for this batch (multi-course support)
  const batchCoursesRes = await db.query<any>(
    `SELECT c.id AS "courseId", c.title AS "courseTitle", c.color_token AS "colorToken", bc.sort_order
     FROM batch_courses bc JOIN courses c ON c.id = bc.course_id
     WHERE bc.batch_id = $1 ORDER BY bc.sort_order`,
    [batchId],
  );
  const primaryCourse = batchCoursesRes.rows[0] ?? {};
  // Use first course for legacy batch.courseId field
  const batch = { ...batchRow, courseId: primaryCourse.courseId, courseTitle: primaryCourse.courseTitle, colorToken: primaryCourse.colorToken };

  const courseIds = batchCoursesRes.rows.map((r: any) => r.courseId).filter(Boolean);
  if (!courseIds.length) {
    return { batch, sections: [] };
  }

  await ensureAllBatchModuleProgress(batchId);

  // Get all sessions for ALL courses in this batch, with course title as prefix when multiple
  const multiCourse = courseIds.length > 1;
  const sessionsRes = await db.query<any>(
    `SELECT
       cm.id, cm.title, cm.section,
       cm.session_number AS "sessionNumber",
       cm.sort_order AS "sortOrder",
       COALESCE(bmp.status, cm.status) AS status,
       cm.course_id AS "courseId",
       c.title AS "courseTitle", bc.sort_order AS "courseOrder"
     FROM course_modules cm
     JOIN courses c ON c.id = cm.course_id
     JOIN batch_courses bc ON bc.batch_id = $2 AND bc.course_id = cm.course_id
     LEFT JOIN batch_module_progress bmp ON bmp.module_id = cm.id AND bmp.batch_id = $2
     WHERE cm.course_id = ANY($1)
     ORDER BY bc.sort_order ASC, cm.sort_order ASC, cm.created_at ASC`,
    [courseIds, batchId],
  );
  // When multiple courses, prefix section name with course title for clarity
  if (multiCourse) {
    sessionsRes.rows.forEach((r: any) => {
      r.section = r.courseTitle + (r.section && r.section !== r.courseTitle ? ' — ' + r.section : '');
    });
  }

  const sections = await buildContentMasterSections(sessionsRes.rows);

  return {
    batch,
    sections,
  };
}
