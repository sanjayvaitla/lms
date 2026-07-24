import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { storageAdapter, slugify } from '../lib/storage';
import { clampListPagination } from '../lib/pagination';
import type { CreateAssignmentInput } from '../validators/assignment.validator';
import { autoAiGrade } from './ai-grader.service';
import { notifyAssessmentPublished, notifyAssignmentEvaluation } from './whatsapp-notifications.service';
import { sendEmail, assignmentReleaseEmail, assignmentEvaluationEmail } from '../lib/email';
import { syncCourseContentToBatch, releaseCompletedSessionContent, mapContentToCourseBatches } from './batches.service';

/** Git tasks store a sentinel path — never treat it as an S3/local PDF key */
function resolveAssignmentPdfUrl(pdfPath: string | null | undefined): Promise<string | null> {
  if (!pdfPath || pdfPath === 'git-task') return Promise.resolve(null);
  return storageAdapter.getUrl(pdfPath).catch(() => null);
}

export async function getAssignmentDashboard() {
  const [total, published, submissions, pending] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS cnt FROM assignments`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM assignments WHERE status = 'PUBLISHED'`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM assignment_submissions`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM assignment_submissions WHERE status != 'GRADED'`),
  ]);
  return {
    totalAssignments: total.rows[0].cnt,
    published: published.rows[0].cnt,
    totalSubmissions: submissions.rows[0].cnt,
    pendingGrading: pending.rows[0].cnt,
  };
}

export async function listAssignments(filters: {
  courseId?: string;
  moduleId?: string;
  status?: string;
  page?: number | string;
  limit?: number | string;
}) {
  const { limit, offset } = clampListPagination(filters.page, filters.limit);
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filters.courseId) { clauses.push(`a.course_id = $${i++}`); params.push(filters.courseId); }
  if (filters.moduleId) { clauses.push(`a.module_id = $${i++}`); params.push(filters.moduleId); }
  if (filters.status) { clauses.push(`a.status = $${i++}`); params.push(filters.status); }
  // PDF assignment list — GitHub tasks have their own tab/API
  clauses.push(`a.pdf_path IS DISTINCT FROM 'git-task'`);
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT a.id, a.course_id AS "courseId", c.title AS "courseTitle",
            a.module_id AS "moduleId", m.title AS "moduleTitle",
            m.session_number AS "moduleSessionNumber", m.section AS "moduleSection",
            m.sort_order AS "moduleOrder",
            a.title, a.description, a.pdf_filename AS "pdfFilename",
            a.pdf_path AS "pdfPath", a.pdf_size_bytes AS "pdfSizeBytes",
            a.due_date AS "dueDate", a.max_score AS "maxScore", a.status,
            a.created_at AS "createdAt",
            (SELECT COUNT(*)::int FROM assignment_batches ab WHERE ab.assignment_id = a.id) AS "batchCount",
            (SELECT COALESCE(json_agg(ab.batch_id), '[]'::json)
               FROM assignment_batches ab WHERE ab.assignment_id = a.id) AS "batchIds",
            (SELECT COUNT(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id) AS "submissionCount"
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     LEFT JOIN course_modules m ON m.id = a.module_id
     ${where}
     ORDER BY m.sort_order NULLS LAST, a.created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    params,
  );
  const pdfPaths = rows
    .map((row) => row.pdfPath as string | null)
    .filter((p): p is string => !!p && p !== 'git-task');
  const urlMap = pdfPaths.length ? await storageAdapter.getUrls(pdfPaths) : new Map<string, string>();
  return rows.map((row) => ({
    ...row,
    batchIds: Array.isArray(row.batchIds) ? row.batchIds : [],
    pdfUrl: row.pdfPath && row.pdfPath !== 'git-task'
      ? urlMap.get(row.pdfPath as string) ?? null
      : null,
  }));
}

export async function getAssignment(id: string) {
  const { rows } = await db.query(
    `SELECT a.id, a.course_id AS "courseId", c.title AS "courseTitle",
            a.module_id AS "moduleId", m.title AS "moduleTitle", m.session_number AS "moduleSessionNumber",
            a.title, a.description,
            a.pdf_filename AS "pdfFilename", a.pdf_path AS "pdfPath",
            a.pdf_size_bytes AS "pdfSizeBytes", a.due_date AS "dueDate",
            a.max_score AS "maxScore", a.status, a.created_at AS "createdAt"
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     LEFT JOIN course_modules m ON m.id = a.module_id
     WHERE a.id = $1`,
    [id],
  );
  if (!rows.length) throw new AppError('Assignment not found', 404, 'NOT_FOUND');

  const batches = await db.query(
    `SELECT b.id, b.name, b.status
     FROM assignment_batches ab
     JOIN batches b ON b.id = ab.batch_id
     WHERE ab.assignment_id = $1`,
    [id],
  );

  const submissions = await db.query(
    `WITH unique_students AS (
        SELECT DISTINCT ON (e.student_id)
            e.student_id AS "studentId", u.name AS "studentName",
            s.id, s.file_path AS "filePath", s.pdf_key AS "pdfKey", s.zip_key AS "zipKey",
            s.submitted_at AS "submittedAt", s.score, s.feedback,
            COALESCE(s.status, 'PENDING') AS status,
            s.ai_score AS "aiScore", s.ai_feedback AS "aiFeedback",
            s.ai_breakdown AS "aiBreakdown", s.ai_graded_at AS "aiGradedAt",
            s.ai_model AS "aiModel"
        FROM assignment_batches ab
        JOIN enrollments e ON e.batch_id = ab.batch_id
        JOIN users u ON u.id = e.student_id
        LEFT JOIN assignment_submissions s ON s.assignment_id = ab.assignment_id AND s.student_id = e.student_id
        WHERE ab.assignment_id = $1
    )
    SELECT * FROM unique_students
    ORDER BY "submittedAt" DESC NULLS LAST, "studentName" ASC`,
    [id],
  );

  const assignment = rows[0];
  const pdfUrl = await resolveAssignmentPdfUrl(assignment.pdfPath as string | null);

  // Resolve S3 URLs for submission files (pdf_key preferred over legacy file_path)
  const submissionsWithUrls = await Promise.all(
    submissions.rows.map(async (submission: any) => {
      const resolvedPdfKey = submission.pdfKey ?? submission.filePath;
      return {
        ...submission,
        fileUrl: resolvedPdfKey ? await storageAdapter.getUrl(resolvedPdfKey) : null,
        zipUrl: submission.zipKey ? await storageAdapter.getUrl(submission.zipKey) : null,
      };
    }),
  );

  return { ...assignment, pdfUrl, batches: batches.rows, submissions: submissionsWithUrls };
}

export async function createAssignment(
  input: CreateAssignmentInput,
  createdBy: string,
  file: { originalname: string; buffer: Buffer; size: number },
) {
  // Fetch course title for structured S3 key
  const course = await db.query<{ title: string }>(
    'SELECT id, title FROM courses WHERE id = $1',
    [input.courseId],
  );
  if (!course.rowCount) throw new AppError('Course not found', 404, 'NOT_FOUND');
  const courseSlug = slugify(course.rows[0].title);

  // Map to every batch that already includes this course (course↔batch packaging)
  const explicitBatchIds = input.batchIds ?? [];
  let batchIds = explicitBatchIds;
  if (batchIds.length === 0) {
    const linked = await db.query<{ id: string }>(
      'SELECT batch_id AS id FROM batch_courses WHERE course_id = $1',
      [input.courseId],
    );
    batchIds = linked.rows.map((r) => r.id);
  }

  // Build batchSlug for S3 path only
  let batchSlug = 'unassigned';
  if (batchIds.length === 1) {
    const br = await db.query<{ name: string }>(
      'SELECT name FROM batches WHERE id = $1',
      [batchIds[0]],
    );
    if (br.rows[0]) batchSlug = slugify(br.rows[0].name);
  } else if (batchIds.length > 1) {
    const br = await db.query<{ name: string }>(
      'SELECT name FROM batches WHERE id = $1',
      [batchIds[0]],
    );
    batchSlug = br.rows[0]
      ? `${slugify(br.rows[0].name)}-and-${batchIds.length - 1}-more`
      : 'multi-batch';
  }

  // Upload to structured S3 path:
  // assignments/{course-slug}/{batch-slug}/{ts}_{assignment-title}.pdf
  const stored = await storageAdapter.uploadWithContext(
    { buffer: file.buffer, originalname: file.originalname, mimetype: 'application/pdf' },
    { type: 'assignment', courseSlug, batchSlug, title: input.title },
  );

  // PDF assignments linked to a session stay DRAFT until session Done (or catch-up below)
  const status = input.moduleId ? 'DRAFT' : input.status;

  const assignmentId = await db.transaction(async (tx) => {
    const { rows } = await db.query(
      `INSERT INTO assignments
         (course_id, module_id, title, description, pdf_filename, pdf_path, pdf_size_bytes, due_date, max_score, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        input.courseId, input.moduleId ?? null, input.title, input.description ?? null,
        file.originalname, stored.key, file.size,
        input.dueDate ?? null, input.maxScore, status, createdBy,
      ],
      tx,
    );
    const id = rows[0].id as string;

    if (batchIds.length > 0) {
      for (const batchId of batchIds) {
        await db.query(
          'INSERT INTO assignment_batches (assignment_id, batch_id, released) VALUES ($1,$2,FALSE) ON CONFLICT DO NOTHING',
          [id, batchId],
          tx,
        );
      }
    } else {
      await mapContentToCourseBatches('assignment', id, input.courseId, tx);
    }
    return id;
  });

  // Late upload after session Done: release + publish for completed batches
  if (input.moduleId) {
    await db.query(
      `UPDATE assignment_batches ab
       SET released = TRUE
       FROM batch_module_progress bmp
       WHERE ab.assignment_id = $1
         AND bmp.batch_id = ab.batch_id
         AND bmp.module_id = $2
         AND bmp.status = 'COMPLETED'`,
      [assignmentId, input.moduleId],
    );
    await db.query(
      `UPDATE assignments a
       SET status = 'PUBLISHED', updated_at = NOW()
       WHERE a.id = $1 AND a.status = 'DRAFT'
         AND EXISTS (
           SELECT 1 FROM assignment_batches ab
           WHERE ab.assignment_id = a.id AND ab.released = TRUE
         )`,
      [assignmentId],
    );
  } else if (status === 'PUBLISHED') {
    await db.query(
      `UPDATE assignment_batches SET released = TRUE WHERE assignment_id = $1`,
      [assignmentId],
    );
  }

  const assignment = await getAssignment(assignmentId);

  if (assignment && assignment.status === 'PUBLISHED') {
    setImmediate(() => { notifyAssessmentPublished(assignmentId).catch(console.error); });
  }

  // Send email notifications to students in the assigned batches
  if (assignment && assignment.status === 'PUBLISHED') {
    for (const batchId of batchIds) {
      const { rows: students } = await db.query(
        `SELECT u.email, u.name, p.name AS program_name
         FROM enrollments e 
         JOIN users u ON e.student_id = u.id 
         LEFT JOIN programs p ON p.id = u.assigned_program_id
         WHERE e.batch_id = $1`,
        [batchId]
      );
      for (const student of students) {
        if (student.email) {
          const programName = student.program_name || 'your program';
          const releaseDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
          const submissionDeadline = assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not Set';
          const emailOpts = assignmentReleaseEmail(
            student.name,
            programName,
            assignment.title,
            assignment.courseTitle,
            releaseDate,
            submissionDeadline,
            assignment.maxScore
          );
          emailOpts.to = student.email;
          sendEmail(emailOpts).catch(err => console.error('[email] Error sending assignment email to', student.email, err));
        }
      }
    }
  }

  return assignment;
}

export async function updateAssignment(id: string, input: Partial<CreateAssignmentInput>) {
  const prev = await db.query<{ status: string; module_id: string | null; pdf_path: string | null }>(
    'SELECT status, module_id, pdf_path FROM assignments WHERE id = $1',
    [id],
  );
  if (!prev.rows.length) throw new AppError('Assignment not found', 404, 'NOT_FOUND');
  const wasPublished = prev.rows[0].status === 'PUBLISHED';
  const isGitTask = prev.rows[0].pdf_path === 'git-task';

  const nextModuleId = input.moduleId !== undefined ? input.moduleId : prev.rows[0].module_id;
  const nextStatus = input.status;

  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.title !== undefined) { fields.push(`title = $${i++}`); params.push(input.title); }
  if (input.description !== undefined) { fields.push(`description = $${i++}`); params.push(input.description); }
  if (input.dueDate !== undefined) { fields.push(`due_date = $${i++}`); params.push(input.dueDate); }
  if (input.maxScore !== undefined) { fields.push(`max_score = $${i++}`); params.push(input.maxScore); }
  if (nextStatus !== undefined) { fields.push(`status = $${i++}`); params.push(nextStatus); }
  if (input.moduleId !== undefined) { fields.push(`module_id = $${i++}`); params.push(input.moduleId); }

  if (fields.length) {
    params.push(id);
    await db.query(`UPDATE assignments SET ${fields.join(', ')} WHERE id = $${i}`, params);
  }

  if (input.batchIds !== undefined) {
    // Batch mapping only — does not flip status by itself.
    // Catch-up: if session already COMPLETED for a mapped batch, publish so quick-release works.
    await db.transaction(async (tx) => {
      await db.query('DELETE FROM assignment_batches WHERE assignment_id = $1', [id], tx);
      if (input.batchIds!.length > 0) {
        const vals: unknown[] = [];
        let pi = 1;
        const placeholders = input.batchIds!.map((batchId) => {
          vals.push(id, batchId);
          return `($${pi++},$${pi++},FALSE)`;
        });
        await db.query(
          `INSERT INTO assignment_batches (assignment_id, batch_id, released) VALUES ${placeholders.join(',')}`,
          vals, tx,
        );
      }
    });

    if (
      !isGitTask
      && nextStatus === undefined
      && prev.rows[0].status === 'DRAFT'
      && nextModuleId
      && (input.batchIds?.length ?? 0) > 0
    ) {
      await db.query(
        `UPDATE assignment_batches ab
         SET released = TRUE
         FROM batch_module_progress bmp
         WHERE ab.assignment_id = $1
           AND bmp.batch_id = ab.batch_id
           AND bmp.module_id = $2
           AND bmp.status = 'COMPLETED'
           AND ab.batch_id = ANY($3::uuid[])`,
        [id, nextModuleId, input.batchIds],
      );
      const done = await db.query(
        `SELECT 1 FROM assignment_batches WHERE assignment_id = $1 AND released = TRUE LIMIT 1`,
        [id],
      );
      if (done.rowCount) {
        await db.query(
          `UPDATE assignments SET status = 'PUBLISHED', updated_at = NOW()
           WHERE id = $1 AND status = 'DRAFT'`,
          [id],
        );
      }
    }
  }

  const assignment = await getAssignment(id);

  if (nextStatus === 'PUBLISHED' && !wasPublished) {
    await db.query(
      `UPDATE assignment_batches SET released = TRUE WHERE assignment_id = $1`,
      [id],
    );
    setImmediate(() => { notifyAssessmentPublished(id).catch(console.error); });

    const batchIdsToNotify = assignment.batches.map((b: any) => b.id);
    for (const batchId of batchIdsToNotify) {
      const { rows: students } = await db.query(
        `SELECT u.email, u.name, p.name AS program_name
         FROM enrollments e 
         JOIN users u ON e.student_id = u.id 
         LEFT JOIN programs p ON p.id = u.assigned_program_id
         WHERE e.batch_id = $1`,
        [batchId]
      );
      for (const student of students) {
        if (student.email) {
          const programName = student.program_name || 'your program';
          const releaseDate = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
          const submissionDeadline = assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Not Set';
          const emailOpts = assignmentReleaseEmail(
            student.name,
            programName,
            assignment.title,
            assignment.courseTitle,
            releaseDate,
            submissionDeadline,
            assignment.maxScore
          );
          emailOpts.to = student.email;
          sendEmail(emailOpts).catch(err => console.error('[email] Error sending assignment email to', student.email, err));
        }
      }
    }
  }

  return assignment;
}

export async function deleteAssignment(id: string) {
  const { rows } = await db.query('SELECT pdf_path FROM assignments WHERE id = $1', [id]);
  if (!rows.length) throw new AppError('Assignment not found', 404, 'NOT_FOUND');
  await db.query('DELETE FROM assignments WHERE id = $1', [id]);
  const fp = rows[0].pdf_path as string;
  if (fp) await storageAdapter.delete(fp);
}

export async function getStudentAssignments(studentId: string) {
  // Catch-up: package + release for sessions already Done (late uploads after mark-Done)
  const { rows: links } = await db.query<{ batchId: string; courseId: string }>(
    `SELECT DISTINCT e.batch_id AS "batchId", bc.course_id AS "courseId"
     FROM enrollments e
     JOIN batch_courses bc ON bc.batch_id = e.batch_id
     WHERE e.student_id = $1`,
    [studentId],
  );
  for (const link of links) {
    await syncCourseContentToBatch(link.batchId, link.courseId);
    await releaseCompletedSessionContent(link.batchId, link.courseId);
  }

  const { rows } = await db.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (a.id)
         a.id, a.title, a.description,
         a.pdf_path AS "pdfPath", a.pdf_filename AS "pdfFilename",
         a.due_date AS "dueDate", a.max_score AS "maxScore", a.status,
         a.created_at AS "createdAt", a.github_template_url AS "githubTemplateUrl",
         c.title AS "courseTitle",
         b.name AS "batchName", b.id AS "batchId",
         s.id AS "submissionId", s.status AS "submissionStatus",
         s.pdf_key AS "submissionPdfKey", s.zip_key AS "submissionZipKey",
         s.github_fork_url AS "githubForkUrl",
         s.submitted_at AS "submittedAt", s.score, s.feedback,
         s.ai_score AS "aiScore", s.ai_feedback AS "aiFeedback",
         s.ai_breakdown AS "aiBreakdown", s.ai_graded_at AS "aiGradedAt",
         s.ai_model AS "aiModel",
         m.title AS "moduleTitle", m.session_number AS "sessionNumber"
       FROM enrollments e
       JOIN batches b       ON b.id = e.batch_id
       JOIN assignment_batches ab ON ab.batch_id = b.id
       JOIN assignments a   ON a.id = ab.assignment_id AND a.status = 'PUBLISHED' AND ab.released = TRUE
       JOIN courses c       ON c.id = a.course_id
       LEFT JOIN course_modules m ON m.id = a.module_id
       LEFT JOIN assignment_submissions s
         ON s.assignment_id = a.id AND s.student_id = $1
       WHERE e.student_id = $1
         AND (
           a.module_id IS NULL
           OR EXISTS (
             SELECT 1 FROM batch_module_progress bmp
             WHERE bmp.module_id = a.module_id
               AND bmp.batch_id = e.batch_id
               AND bmp.status = 'COMPLETED'
           )
         )
       ORDER BY a.id, a.due_date ASC NULLS LAST, a.created_at DESC
     ) uniq
     ORDER BY "dueDate" ASC NULLS LAST, "createdAt" DESC`,
    [studentId],
  );

  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      pdfUrl: await resolveAssignmentPdfUrl(row.pdfPath as string | null),
      submissionPdfUrl: row.submissionPdfKey
        ? await storageAdapter.getUrl(row.submissionPdfKey as string).catch(() => null)
        : null,
      submissionZipUrl: row.submissionZipKey
        ? await storageAdapter.getUrl(row.submissionZipKey as string).catch(() => null)
        : null,
    })),
  );
}

export async function submitAssignment(
  assignmentId: string,
  studentId: string,
  files: {
    pdf?: { originalname: string; buffer: Buffer; mimetype: string };
    zip?: { originalname: string; buffer: Buffer; mimetype: string };
  },
) {
  if (!files.pdf && !files.zip) {
    throw new AppError('At least one file (PDF or ZIP) is required', 400, 'FILE_REQUIRED');
  }

  // Single query: validate access + session completed + get all slugs needed for S3 key
  const asgRow = await db.query<{
    id: string; title: string; course_title: string;
    batch_id: string; batch_name: string; student_name: string;
    due_date: Date | null; module_id: string | null;
  }>(
    `SELECT a.id, a.title, c.title AS course_title, a.due_date, a.module_id,
            b.id AS batch_id, b.name AS batch_name, u.name AS student_name
     FROM assignments a
     JOIN courses c         ON c.id = a.course_id
     JOIN assignment_batches ab ON ab.assignment_id = a.id AND ab.released = TRUE
     JOIN enrollments e     ON e.batch_id = ab.batch_id AND e.student_id = $2
     JOIN batches b         ON b.id = ab.batch_id
     JOIN users u           ON u.id = $2
     WHERE a.id = $1 AND a.status = 'PUBLISHED'
       AND (
         a.module_id IS NULL
         OR EXISTS (
           SELECT 1 FROM batch_module_progress bmp
           WHERE bmp.module_id = a.module_id
             AND bmp.batch_id = b.id
             AND bmp.status = 'COMPLETED'
         )
       )
     LIMIT 1`,
    [assignmentId, studentId],
  );
  if (!asgRow.rows.length) {
    throw new AppError('Assignment not found or not accessible', 404, 'NOT_FOUND');
  }

  const asg = asgRow.rows[0];

  if (asg.due_date && asg.due_date.getTime() < Date.now()) {
    throw new AppError('Cannot submit: Assignment is past due', 400, 'PAST_DUE');
  }

  const courseSlug = slugify(asg.course_title);
  const assignTitle = slugify(asg.title);
  const batchSlug = slugify(asg.batch_name);
  const studentSlug = slugify(asg.student_name);

  const ctx = { type: 'submission' as const, courseSlug, batchSlug, title: assignTitle, userId: studentId, studentSlug };

  // Upload both files in parallel
  const [pdfResult, zipResult] = await Promise.all([
    files.pdf ? storageAdapter.uploadWithContext(files.pdf, ctx) : Promise.resolve(null),
    files.zip ? storageAdapter.uploadWithContext(files.zip, ctx) : Promise.resolve(null),
  ]);

  const { rows: subRows } = await db.query<{ id: string }>(
    `INSERT INTO assignment_submissions (assignment_id, student_id, pdf_key, zip_key, status)
     VALUES ($1, $2, $3, $4, 'SUBMITTED')
     ON CONFLICT (assignment_id, student_id)
     DO UPDATE SET pdf_key      = COALESCE($3, assignment_submissions.pdf_key),
                   zip_key      = COALESCE($4, assignment_submissions.zip_key),
                   submitted_at = NOW(),
                   status       = 'SUBMITTED',
                   ai_score     = NULL,
                   ai_feedback  = NULL,
                   ai_breakdown = NULL,
                   ai_graded_at = NULL
     RETURNING id`,
    [assignmentId, studentId, pdfResult?.key ?? null, zipResult?.key ?? null],
  );

  const submissionId = subRows[0].id;

  // Fire-and-forget AI grading — pass in-memory buffers, skip S3 re-download
  const pdfBuf = files.pdf?.buffer;
  const zipBuf = files.zip?.buffer;
  setImmediate(() => {
    autoAiGrade(submissionId, pdfBuf, zipBuf).catch((err) =>
      console.error('[assignments] AI grading failed for submission', submissionId, ':', err?.message ?? err)
    );
  });

  return {
    assignmentId,
    submissionId,
    submittedAt: new Date(),
    pdfKey: pdfResult?.key ?? null,
    zipKey: zipResult?.key ?? null,
  };
}

// ── Git Task (GitHub-based assignments) ──────────────────────────────────────

export async function createGitTask(input: {
  courseId: string;
  moduleId?: string;
  title: string;
  description?: string;
  templateRepoUrl: string;
  dueDate?: string;
  maxScore?: number;
  status?: string;
  batchIds?: string[];
  artifactType?: string;
}, createdBy: string) {
  const course = await db.query<{ title: string }>('SELECT id, title FROM courses WHERE id = $1', [input.courseId]);
  if (!course.rowCount) throw new AppError('Course not found', 404, 'NOT_FOUND');

  if (input.moduleId) {
    const mod = await db.query(
      'SELECT id FROM course_modules WHERE id = $1 AND course_id = $2',
      [input.moduleId, input.courseId],
    );
    if (!mod.rowCount) throw new AppError('Session not found for this course', 404, 'NOT_FOUND');
  }

  // Explicit batch map only — empty means unmapped until Edit
  const batchIds = input.batchIds ?? [];
  // Git tasks use manual release — status is controlled by admin, not session completion
  const status = input.status ?? 'DRAFT';

  const taskId = await db.transaction(async (tx) => {
    const { rows } = await db.query(
      `INSERT INTO assignments
         (course_id, module_id, title, description, github_template_url, pdf_filename, pdf_path, pdf_size_bytes,
          due_date, max_score, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        input.courseId, input.moduleId ?? null, input.title, input.description ?? null,
        input.templateRepoUrl,
        // Store artifact type in pdf_filename as a metadata marker, pdf_path = 'git-task'
        `[GIT-TASK] ${input.artifactType ?? 'GitHub'}`,
        'git-task',
        0,
        input.dueDate ?? null,
        input.maxScore ?? 100,
        status,
        createdBy,
      ],
      tx,
    );
    const id = rows[0].id as string;
    for (const batchId of batchIds) {
      await db.query(
        'INSERT INTO assignment_batches (assignment_id, batch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [id, batchId], tx,
      );
    }
    return id;
  });

  if (status === 'PUBLISHED') {
    setImmediate(() => { notifyAssessmentPublished(taskId).catch(console.error); });
  }

  return getGitTask(taskId);
}

export async function getGitTask(id: string) {
  const { rows } = await db.query(
    `SELECT a.id, a.course_id AS "courseId", c.title AS "courseTitle",
            a.module_id AS "moduleId", m.title AS "moduleTitle", m.session_number AS "moduleSessionNumber",
            a.title, a.description, a.github_template_url AS "templateRepoUrl",
            a.pdf_filename AS "artifactType",
            a.due_date AS "dueDate", a.max_score AS "maxScore", a.status,
            a.created_at AS "createdAt"
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     LEFT JOIN course_modules m ON m.id = a.module_id
     WHERE a.id = $1 AND a.pdf_path = 'git-task'`,
    [id],
  );
  if (!rows.length) throw new AppError('Git task not found', 404, 'NOT_FOUND');
  const batches = await db.query(
    `SELECT b.id, b.name, b.status FROM assignment_batches ab
     JOIN batches b ON b.id = ab.batch_id WHERE ab.assignment_id = $1`,
    [id],
  );
  return { ...rows[0], batches: batches.rows };
}

export async function listGitTasks(filters: { courseId?: string; status?: string }) {
  const clauses: string[] = [`a.pdf_path = 'git-task'`];
  const params: unknown[] = [];
  let i = 1;
  if (filters.courseId) { clauses.push(`a.course_id = $${i++}`); params.push(filters.courseId); }
  if (filters.status)   { clauses.push(`a.status = $${i++}`);    params.push(filters.status); }
  const where = `WHERE ${clauses.join(' AND ')}`;
  const { rows } = await db.query(
    `SELECT a.id, a.course_id AS "courseId", c.title AS "courseTitle",
            a.module_id AS "moduleId", m.title AS "moduleTitle", m.session_number AS "moduleSessionNumber",
            a.title, a.description, a.github_template_url AS "templateRepoUrl",
            a.pdf_filename AS "artifactType",
            a.due_date AS "dueDate", a.max_score AS "maxScore", a.status,
            a.created_at AS "createdAt",
            (SELECT COUNT(*)::int FROM assignment_batches ab WHERE ab.assignment_id = a.id) AS "batchCount",
            (SELECT COUNT(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id) AS "submissionCount"
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     LEFT JOIN course_modules m ON m.id = a.module_id
     ${where}
     ORDER BY a.created_at DESC`,
    params,
  );
  return rows;
}

export async function getGitTaskPipeline(taskId: string) {
  const { rows } = await db.query(
    `SELECT s.id, s.student_id AS "studentId", u.name AS "studentName",
            s.github_fork_url AS "forkUrl", s.github_latest_commit_sha AS "lastCommitSha",
            s.submitted_at AS "submittedAt", s.score, s.feedback, s.status,
            s.ai_score AS "aiScore", s.ai_feedback AS "aiFeedback",
            s.ai_breakdown AS "aiBreakdown"
     FROM assignment_submissions s
     JOIN users u ON u.id = s.student_id
     WHERE s.assignment_id = $1
     ORDER BY s.submitted_at DESC`,
    [taskId],
  );
  return rows;
}

export async function gradeSubmission(submissionId: string, score: number, feedback?: string) {
  const { rows } = await db.query<{ assignment_id: string, student_id: string }>(
    `UPDATE assignment_submissions
     SET score = $1, feedback = $2, status = 'GRADED', graded_at = NOW()
     WHERE id = $3
     RETURNING assignment_id, student_id`,
    [score, feedback ?? null, submissionId],
  );
  if (!rows.length) throw new AppError('Submission not found', 404, 'NOT_FOUND');

  // get assignment and user info for email + WhatsApp
  const info = await db.query(
    `SELECT a.title AS "assignmentName", c.title AS "courseName", a.max_score AS "maxScore",
            u.name AS "studentName", u.email AS "studentEmail", u.phone_number AS "studentPhone"
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
     JOIN users u ON u.id = $1
     WHERE a.id = $2`,
     [rows[0].student_id, rows[0].assignment_id]
  );

  if (info.rows.length) {
    const data = info.rows[0];
    const dateStr = new Date().toLocaleDateString('en-IN');
    const feedbackText = feedback || 'No feedback provided';

    if (data.studentEmail) {
      const emailOpts = assignmentEvaluationEmail(
        data.studentName || 'Learner',
        data.assignmentName,
        data.courseName,
        score.toString(),
        data.maxScore.toString(),
        dateStr,
        feedbackText
      );
      emailOpts.to = data.studentEmail;
      sendEmail(emailOpts).catch(err => console.error('[email] Error sending evaluation email:', err));
    }

    if (data.studentPhone) {
      notifyAssignmentEvaluation({
        phone: data.studentPhone,
        name: data.studentName || 'Learner',
        assignmentTitle: data.assignmentName,
        courseName: data.courseName,
        score: score.toString(),
        maxScore: data.maxScore?.toString() ?? 'N/A',
        date: dateStr,
        feedback: feedbackText,
      }).catch(err => console.error('[whatsapp] Error sending evaluation notification:', err));
    }
  }

  return rows[0];
}
