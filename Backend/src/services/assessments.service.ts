import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { storageAdapter, slugify } from '../lib/storage';
import { clampListPagination } from '../lib/pagination';
import { sendEmail, assessmentNotificationEmail, assessmentResultEmail } from '../lib/email';
import type { CreateAssessmentInput } from '../validators/assessment.validator';
import { aiGradeAssessmentSubmission } from './ai-assessment-grader.service';

/* ─── CSV parser ────────────────────────────────────────────────────────────
   Expected header: Question,Option A,Option B,Option C,Option D,Correct Answer,Points
   Correct Answer must exactly match one of the option values.
─────────────────────────────────────────────────────────────────────────── */
interface McqQuestion {
  id: string;
  questionText: string;
  options: string[];
  correctAnswer: string;
  points: number;
}

function parseCsvRow(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      cols.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseCsvQuestions(buffer: Buffer): McqQuestion[] {
  const lines = buffer.toString('utf-8').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  return lines.slice(1).map((line, i) => {
    const [question, optA, optB, optC, optD, correct, points] = parseCsvRow(line);
    const options = [optA, optB, optC, optD].filter(Boolean);
    return {
      id: `q${i + 1}`,
      questionText: question ?? '',
      options,
      correctAnswer: correct ?? '',
      points: parseInt(points ?? '1', 10) || 1,
    };
  }).filter((q) => q.questionText && q.options.length >= 2 && q.correctAnswer);
}

/* ─── Service functions ─────────────────────────────────────────────────── */

export async function getAssessmentDashboard() {
  const [total, published, submissions, pending] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS cnt FROM assessments`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM assessments WHERE status = 'PUBLISHED'`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM assessment_submissions`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM assessment_submissions WHERE status != 'GRADED'`),
  ]);
  return {
    totalAssessments: total.rows[0].cnt,
    published:        published.rows[0].cnt,
    totalSubmissions: submissions.rows[0].cnt,
    pendingGrading:   pending.rows[0].cnt,
  };
}

export async function listAssessments(filters: {
  courseId?: string;
  status?: string;
  page?: number | string;
  limit?: number | string;
}) {
  const { limit, offset } = clampListPagination(filters.page, filters.limit);
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filters.courseId) { clauses.push(`a.course_id = $${i++}`); params.push(filters.courseId); }
  if (filters.status)   { clauses.push(`a.status = $${i++}`);    params.push(filters.status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await db.query(
    `SELECT a.id, a.course_id AS "courseId", c.title AS "courseTitle",
            a.title, a.description,
            a.pdf_filename AS "pdfFilename", a.pdf_path AS "pdfPath",
            a.pdf_size_bytes AS "pdfSizeBytes",
            a.due_date AS "dueDate",
            a.total_marks AS "totalMarks",
            a.part_a_marks AS "partAMarks",
            a.part_b_marks AS "partBMarks",
            a.part_b_approach_pct AS "partBApproachPct",
            a.part_b_viva_pct AS "partBVivaPct",
            a.part_a_filename AS "partAFilename",
            (a.part_a_questions IS NOT NULL) AS "hasPartA",
            a.status, a.created_at AS "createdAt",
            (SELECT COUNT(*)::int FROM assessment_batches ab WHERE ab.assessment_id = a.id) AS "batchCount",
            (SELECT COUNT(*)::int FROM assessment_submissions s WHERE s.assessment_id = a.id) AS "submissionCount"
     FROM assessments a
     JOIN courses c ON c.id = a.course_id
     ${where}
     ORDER BY a.created_at DESC
     LIMIT $${i++} OFFSET $${i++}`,
    params,
  );

  const pdfPaths = rows.map((row) => row.pdfPath as string | null).filter(Boolean) as string[];
  const urlMap = pdfPaths.length ? await storageAdapter.getUrls(pdfPaths) : new Map<string, string>();
  return rows.map((row) => ({
    ...row,
    pdfUrl: row.pdfPath ? urlMap.get(row.pdfPath as string) ?? null : null,
  }));
}

export async function getAssessment(id: string) {
  const { rows } = await db.query(
    `SELECT a.id, a.course_id AS "courseId", c.title AS "courseTitle",
            a.title, a.description,
            a.pdf_filename AS "pdfFilename", a.pdf_path AS "pdfPath",
            a.pdf_size_bytes AS "pdfSizeBytes",
            a.due_date AS "dueDate",
            a.total_marks AS "totalMarks",
            a.part_a_marks AS "partAMarks",
            a.part_b_marks AS "partBMarks",
            a.part_b_approach_pct AS "partBApproachPct",
            a.part_b_viva_pct AS "partBVivaPct",
            a.part_a_filename AS "partAFilename",
            a.part_a_questions AS "partAQuestions",
            a.ai_rubric AS "aiRubric",
            a.status, a.created_at AS "createdAt"
     FROM assessments a
     JOIN courses c ON c.id = a.course_id
     WHERE a.id = $1`,
    [id],
  );
  if (!rows.length) throw new AppError('Assessment not found', 404, 'NOT_FOUND');

  const batches = await db.query(
    `SELECT b.id, b.name, b.status
     FROM assessment_batches ab
     JOIN batches b ON b.id = ab.batch_id
     WHERE ab.assessment_id = $1`,
    [id],
  );

  const submissions = await db.query(
    `WITH unique_students AS (
        SELECT DISTINCT ON (e.student_id)
            e.student_id AS "studentId", u.name AS "studentName",
            s.id, s.pdf_key AS "pdfKey",
            s.submitted_at AS "submittedAt",
            s.part_a_score AS "partAScore",
            s.approach_score AS "approachScore",
            s.viva_score AS "vivaScore",
            s.solution_score AS "solutionScore",
            s.ai_approach_score AS "aiApproachScore",
            s.ai_solution_score AS "aiSolutionScore",
            s.ai_feedback AS "aiFeedback",
            s.ai_status AS "aiStatus",
            s.feedback, COALESCE(s.status, 'PENDING') AS status, s.graded_at AS "gradedAt"
        FROM assessment_batches ab
        JOIN enrollments e ON e.batch_id = ab.batch_id
        JOIN users u ON u.id = e.student_id
        LEFT JOIN assessment_submissions s ON s.assessment_id = ab.assessment_id AND s.student_id = e.student_id
        WHERE ab.assessment_id = $1
    )
    SELECT * FROM unique_students
    ORDER BY "submittedAt" DESC NULLS LAST, "studentName" ASC`,
    [id],
  );

  const assessment = rows[0];
  const pdfUrl = assessment.pdfPath ? await storageAdapter.getUrl(assessment.pdfPath) : null;

  const submissionsWithUrls = await Promise.all(
    submissions.rows.map(async (sub: any) => ({
      ...sub,
      fileUrl: sub.pdfKey ? await storageAdapter.getUrl(sub.pdfKey) : null,
      totalScore: (sub.partAScore ?? 0) + (sub.approachScore ?? 0) +
                  (sub.vivaScore ?? 0) + (sub.solutionScore ?? 0),
    })),
  );

  return { ...assessment, pdfUrl, batches: batches.rows, submissions: submissionsWithUrls };
}

export async function createAssessment(
  input: CreateAssessmentInput,
  createdBy: string,
  file: { originalname: string; buffer: Buffer; size: number },
  csvFile?: { originalname: string; buffer: Buffer },
  rubricPdf?: { originalname: string; buffer: Buffer },
) {
  const course = await db.query<{ title: string }>(
    'SELECT id, title FROM courses WHERE id = $1',
    [input.courseId],
  );
  if (!course.rowCount) throw new AppError('Course not found', 404, 'NOT_FOUND');
  const courseSlug = slugify(course.rows[0].title);

  let batchIds = input.batchIds ?? [];
  if (batchIds.length === 0) {
    const allBatches = await db.query<{ id: string }>(
      'SELECT batch_id AS id FROM batch_courses WHERE course_id = $1',
      [input.courseId],
    );
    batchIds = allBatches.rows.map((b) => b.id);
  }

  let batchSlug = 'all-batches';
  if (batchIds.length === 1) {
    const br = await db.query<{ name: string }>('SELECT name FROM batches WHERE id = $1', [batchIds[0]]);
    if (br.rows[0]) batchSlug = slugify(br.rows[0].name);
  } else if (batchIds.length > 1) {
    const br = await db.query<{ name: string }>('SELECT name FROM batches WHERE id = $1', [batchIds[0]]);
    batchSlug = br.rows[0]
      ? `${slugify(br.rows[0].name)}-and-${batchIds.length - 1}-more`
      : 'multi-batch';
  }

  const stored = await storageAdapter.uploadWithContext(
    { buffer: file.buffer, originalname: file.originalname, mimetype: 'application/pdf' },
    { type: 'assessment', courseSlug, batchSlug, title: input.title },
  );

  let rubricPdfKey: string | null = null;
  if (rubricPdf) {
    const rubricStored = await storageAdapter.uploadWithContext(
      { buffer: rubricPdf.buffer, originalname: rubricPdf.originalname, mimetype: 'application/pdf' },
      { type: 'assessment-rubric', courseSlug, batchSlug, title: input.title },
    );
    rubricPdfKey = rubricStored.key;
  }

  const questions = csvFile ? parseCsvQuestions(csvFile.buffer) : null;

  const assessmentId = await db.transaction(async (tx) => {
    const { rows } = await db.query(
      `INSERT INTO assessments
         (course_id, title, description, pdf_filename, pdf_path, pdf_size_bytes,
          due_date, total_marks, part_a_marks, part_b_marks,
          part_b_approach_pct, part_b_viva_pct, status, created_by,
          part_a_questions, part_a_filename, ai_rubric, ai_rubric_pdf_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        input.courseId, input.title, input.description ?? null,
        file.originalname, stored.key, file.size,
        input.dueDate ?? null,
        input.totalMarks, input.partAMarks, input.partBMarks,
        input.partBApproachPct, input.partBVivaPct,
        input.status, createdBy,
        questions ? JSON.stringify(questions) : null,
        csvFile?.originalname ?? null,
        input.aiRubric ?? null,
        rubricPdfKey,
      ],
      tx,
    );
    const id = rows[0].id as string;

    for (const batchId of batchIds) {
      await db.query(
        'INSERT INTO assessment_batches (assessment_id, batch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [id, batchId],
        tx,
      );
    }
    return id;
  });

  const assessment = await getAssessment(assessmentId);

  if (assessment && assessment.status === 'PUBLISHED') {
    for (const batchId of batchIds) {
      const { rows: students } = await db.query(
        `SELECT u.email, u.name 
         FROM enrollments e 
         JOIN users u ON e.student_id = u.id 
         WHERE e.batch_id = $1`,
        [batchId]
      );
      for (const student of students) {
        if (student.email) {
          const emailOpts = assessmentNotificationEmail(
            student.name || 'Learner',
            assessment.title,
            course.rows[0].title,
            assessment.dueDate ? new Date(assessment.dueDate).toLocaleDateString('en-IN') : 'TBD',
            assessment.dueDate ? new Date(assessment.dueDate).toLocaleTimeString('en-IN') : 'TBD',
            'As specified in guidelines',
            'Online'
          );
          emailOpts.to = student.email;
          sendEmail(emailOpts).catch(err => console.error('[email] Error sending assessment email to', student.email, err));
        }
      }
    }
  }

  return assessment;
}

export async function updateAssessment(id: string, input: Partial<CreateAssessmentInput>) {
  const prev = await db.query<{ status: string }>('SELECT status FROM assessments WHERE id = $1', [id]);
  if (!prev.rows.length) throw new AppError('Assessment not found', 404, 'NOT_FOUND');
  const wasPublished = prev.rows[0].status === 'PUBLISHED';

  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.title !== undefined)           { fields.push(`title = $${i++}`);               params.push(input.title); }
  if (input.description !== undefined)     { fields.push(`description = $${i++}`);          params.push(input.description); }
  if (input.dueDate !== undefined)         { fields.push(`due_date = $${i++}`);             params.push(input.dueDate); }
  if (input.totalMarks !== undefined)      { fields.push(`total_marks = $${i++}`);          params.push(input.totalMarks); }
  if (input.partAMarks !== undefined)      { fields.push(`part_a_marks = $${i++}`);         params.push(input.partAMarks); }
  if (input.partBMarks !== undefined)      { fields.push(`part_b_marks = $${i++}`);         params.push(input.partBMarks); }
  if (input.partBApproachPct !== undefined){ fields.push(`part_b_approach_pct = $${i++}`); params.push(input.partBApproachPct); }
  if (input.partBVivaPct !== undefined)    { fields.push(`part_b_viva_pct = $${i++}`);     params.push(input.partBVivaPct); }
  if (input.status !== undefined)          { fields.push(`status = $${i++}`);               params.push(input.status); }
  if (input.aiRubric !== undefined)        { fields.push(`ai_rubric = $${i++}`);            params.push(input.aiRubric); }

  if (fields.length) {
    params.push(id);
    await db.query(`UPDATE assessments SET ${fields.join(', ')} WHERE id = $${i}`, params);
  }

  if (input.batchIds) {
    await db.transaction(async (tx) => {
      await db.query('DELETE FROM assessment_batches WHERE assessment_id = $1', [id], tx);
      for (const batchId of input.batchIds!) {
        await db.query(
          'INSERT INTO assessment_batches (assessment_id, batch_id) VALUES ($1,$2)',
          [id, batchId],
          tx,
        );
      }
    });
  }

  const assessment = await getAssessment(id);

  if (input.status === 'PUBLISHED' && !wasPublished) {
    const batchIds = assessment.batches.map((b: any) => b.id);
    for (const batchId of batchIds) {
      const { rows: students } = await db.query(
        `SELECT u.email, u.name 
         FROM enrollments e 
         JOIN users u ON e.student_id = u.id 
         WHERE e.batch_id = $1`,
        [batchId]
      );
      for (const student of students) {
        if (student.email) {
          const emailOpts = assessmentNotificationEmail(
            student.name || 'Learner',
            assessment.title,
            assessment.courseTitle || 'Your Course',
            assessment.dueDate ? new Date(assessment.dueDate).toLocaleDateString('en-IN') : 'TBD',
            assessment.dueDate ? new Date(assessment.dueDate).toLocaleTimeString('en-IN') : 'TBD',
            'As specified in guidelines',
            'Online'
          );
          emailOpts.to = student.email;
          sendEmail(emailOpts).catch(err => console.error('[email] Error sending assessment email to', student.email, err));
        }
      }
    }
  }

  return assessment;
}

export async function deleteAssessment(id: string) {
  const { rows } = await db.query('SELECT pdf_path FROM assessments WHERE id = $1', [id]);
  if (!rows.length) throw new AppError('Assessment not found', 404, 'NOT_FOUND');
  await db.query('DELETE FROM assessments WHERE id = $1', [id]);
  const fp = rows[0].pdf_path as string;
  if (fp) await storageAdapter.delete(fp);
}

export async function gradeSubmission(
  submissionId: string,
  scores: {
    partAScore?: number;
    approachScore?: number;
    vivaScore?: number;
    solutionScore?: number;
    feedback?: string;
  },
) {
  const fields: string[] = ['status = \'GRADED\'', 'graded_at = NOW()'];
  const params: unknown[] = [];
  let i = 1;

  if (scores.partAScore !== undefined)    { fields.push(`part_a_score = $${i++}`);    params.push(scores.partAScore); }
  if (scores.approachScore !== undefined) { fields.push(`approach_score = $${i++}`);  params.push(scores.approachScore); }
  if (scores.vivaScore !== undefined)     { fields.push(`viva_score = $${i++}`);      params.push(scores.vivaScore); }
  if (scores.solutionScore !== undefined) { fields.push(`solution_score = $${i++}`);  params.push(scores.solutionScore); }
  if (scores.feedback !== undefined)      { fields.push(`feedback = $${i++}`);        params.push(scores.feedback); }

  params.push(submissionId);
  const { rows } = await db.query(
    `UPDATE assessment_submissions SET ${fields.join(', ')} WHERE id = $${i} RETURNING assessment_id, student_id, part_a_score, approach_score, viva_score, solution_score`,
    params,
  );
  if (!rows.length) throw new AppError('Submission not found', 404, 'NOT_FOUND');

  // get assessment and user info for email
  const info = await db.query(
    `SELECT a.title AS "assessmentName", c.title AS "courseName", a.total_marks AS "totalMarks",
            u.name AS "studentName", u.email AS "studentEmail"
     FROM assessments a
     JOIN courses c ON c.id = a.course_id
     JOIN users u ON u.id = $1
     WHERE a.id = $2`,
     [rows[0].student_id, rows[0].assessment_id]
  );
  
  if (info.rows.length && info.rows[0].studentEmail) {
    const data = info.rows[0];
    const sub = rows[0];
    const totalScore = (Number(sub.part_a_score) || 0) + (Number(sub.approach_score) || 0) + (Number(sub.viva_score) || 0) + (Number(sub.solution_score) || 0);
    const percentage = ((totalScore / data.totalMarks) * 100).toFixed(1);
    const passThreshold = data.totalMarks * 0.6; // Assuming 60% is passing
    const resultStatus = totalScore >= passThreshold ? 'Pass' : 'Needs Improvement';

    const emailOpts = assessmentResultEmail(
      data.studentName || 'Learner',
      data.assessmentName,
      data.courseName,
      totalScore.toFixed(1),
      data.totalMarks.toString(),
      percentage,
      resultStatus
    );
    emailOpts.to = data.studentEmail;
    sendEmail(emailOpts).catch(err => console.error('[email] Error sending assessment result email:', err));
  }

  return rows[0];
}

export async function getStudentAssessments(studentId: string) {
  const { rows } = await db.query(
    `SELECT DISTINCT
       a.id, a.title, a.description,
       a.pdf_path AS "pdfPath", a.pdf_filename AS "pdfFilename",
       a.due_date AS "dueDate",
       a.total_marks AS "totalMarks",
       a.part_a_marks AS "partAMarks",
       a.part_b_marks AS "partBMarks",
       a.part_b_approach_pct AS "partBApproachPct",
       a.part_b_viva_pct AS "partBVivaPct",
       a.part_a_questions AS "partAQuestions",
       a.status, a.created_at AS "createdAt",
       c.title AS "courseTitle",
       b.name AS "batchName", b.id AS "batchId",
       s.id AS "submissionId", s.status AS "submissionStatus",
       s.pdf_key AS "submissionPdfKey",
       s.submitted_at AS "submittedAt",
       s.part_a_score AS "partAScore",
       s.approach_score AS "approachScore",
       s.viva_score AS "vivaScore",
       s.solution_score AS "solutionScore",
       s.feedback, s.graded_at AS "gradedAt"
     FROM enrollments e
     JOIN batches b            ON b.id = e.batch_id
     JOIN assessment_batches ab ON ab.batch_id = b.id
     JOIN assessments a        ON a.id = ab.assessment_id AND a.status = 'PUBLISHED'
     JOIN courses c            ON c.id = a.course_id
     LEFT JOIN assessment_submissions s
       ON s.assessment_id = a.id AND s.student_id = $1
     WHERE e.student_id = $1
     ORDER BY a.due_date ASC NULLS LAST, a.created_at DESC`,
    [studentId],
  );

  return Promise.all(
    rows.map(async (row) => {
      // Strip correctAnswer from questions before returning to student
      const rawQuestions: McqQuestion[] | null = row.partAQuestions ?? null;
      const partAQuestions = rawQuestions
        ? rawQuestions.map(({ correctAnswer: _ca, ...q }) => q)
        : null;

      return {
        ...row,
        partAQuestions,
        pdfUrl: row.pdfPath ? await storageAdapter.getUrl(row.pdfPath) : null,
        submissionPdfUrl: row.submissionPdfKey ? await storageAdapter.getUrl(row.submissionPdfKey) : null,
        totalScore: row.submissionStatus === 'GRADED'
          ? (row.partAScore ?? 0) + (row.approachScore ?? 0) +
            (row.vivaScore ?? 0) + (row.solutionScore ?? 0)
          : null,
      };
    }),
  );
}

export async function submitPartA(
  assessmentId: string,
  studentId: string,
  answers: Array<{ questionId: string; selectedAnswer: string }>,
) {
  const { rows } = await db.query<{
    part_a_questions: McqQuestion[];
    part_a_marks: number;
    due_date: Date | null;
    status: string;
  }>(
    `SELECT a.part_a_questions, a.part_a_marks, a.due_date, a.status
     FROM assessments a
     JOIN assessment_batches ab ON ab.assessment_id = a.id
     JOIN enrollments e ON e.batch_id = ab.batch_id AND e.student_id = $2
     WHERE a.id = $1 AND a.status = 'PUBLISHED'
     LIMIT 1`,
    [assessmentId, studentId],
  );
  if (!rows.length) throw new AppError('Assessment not found or not accessible', 404, 'NOT_FOUND');

  if (rows[0].due_date && new Date() > new Date(rows[0].due_date)) {
    throw new AppError('The due date for this assessment has passed', 403, 'PAST_DUE');
  }

  const questions: McqQuestion[] = rows[0].part_a_questions ?? [];
  if (!questions.length) throw new AppError('This assessment has no Part A questions', 400, 'NO_QUESTIONS');

  const answerMap: Record<string, string> = {};
  for (const a of answers) answerMap[a.questionId] = a.selectedAnswer;

  let score = 0;
  for (const q of questions) {
    const selected = (answerMap[q.id] ?? '').trim().toLowerCase();
    const correct = (q.correctAnswer ?? '').trim().toLowerCase();
    if (selected && correct && selected === correct) score += q.points;
  }
  const total = questions.reduce((s, q) => s + q.points, 0);

  // Upsert: create row if not exists (status=SUBMITTED, no pdf_key), or update part_a fields only
  await db.query(
    `INSERT INTO assessment_submissions
       (assessment_id, student_id, part_a_score, part_a_answers, status)
     VALUES ($1, $2, $3, $4, 'SUBMITTED')
     ON CONFLICT (assessment_id, student_id)
     DO UPDATE SET part_a_score = $3, part_a_answers = $4`,
    [assessmentId, studentId, score, JSON.stringify(answers)],
  );

  return { score, total };
}

export async function submitAssessment(
  assessmentId: string,
  studentId: string,
  file: { originalname: string; buffer: Buffer; mimetype: string },
) {
  const asgRow = await db.query<{
    id: string; title: string; course_title: string;
    batch_id: string; batch_name: string; student_name: string;
    due_date: Date | null;
  }>(
    `SELECT a.id, a.title, a.due_date, c.title AS course_title,
            b.id AS batch_id, b.name AS batch_name, u.name AS student_name
     FROM assessments a
     JOIN courses c            ON c.id = a.course_id
     JOIN assessment_batches ab ON ab.assessment_id = a.id
     JOIN enrollments e        ON e.batch_id = ab.batch_id AND e.student_id = $2
     JOIN batches b            ON b.id = ab.batch_id
     JOIN users u              ON u.id = $2
     WHERE a.id = $1 AND a.status = 'PUBLISHED'
     LIMIT 1`,
    [assessmentId, studentId],
  );
  if (!asgRow.rows.length) {
    throw new AppError('Assessment not found or not accessible', 404, 'NOT_FOUND');
  }

  if (asgRow.rows[0].due_date && new Date() > new Date(asgRow.rows[0].due_date)) {
    throw new AppError('The due date for this assessment has passed', 403, 'PAST_DUE');
  }

  const asg         = asgRow.rows[0];
  const courseSlug  = slugify(asg.course_title);
  const titleSlug   = slugify(asg.title);
  const batchSlug   = slugify(asg.batch_name);
  const studentSlug = slugify(asg.student_name);

  const result = await storageAdapter.uploadWithContext(file, {
    type: 'assessment-submission',
    courseSlug,
    batchSlug,
    title: titleSlug,
    userId: studentId,
    studentSlug,
  });

  // Preserve part_a_score/part_a_answers — only reset Part B grading fields
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO assessment_submissions (assessment_id, student_id, pdf_key, status, ai_status)
     VALUES ($1, $2, $3, 'SUBMITTED', 'PENDING')
     ON CONFLICT (assessment_id, student_id)
     DO UPDATE SET pdf_key = $3, submitted_at = NOW(), status = 'SUBMITTED',
                   approach_score = NULL, viva_score = NULL,
                   solution_score = NULL, graded_at = NULL,
                   ai_approach_score = NULL, ai_solution_score = NULL, ai_feedback = NULL, ai_status = 'PENDING'
     RETURNING id`,
    [assessmentId, studentId, result.key],
  );

  const submissionId = rows[0].id;

  // Trigger AI Grader
  aiGradeAssessmentSubmission(submissionId, file.buffer).catch((err) => {
    console.error('[assessments.service] Background AI grading failed:', err);
  });

  return { assessmentId, submissionId, submittedAt: new Date(), pdfKey: result.key };
}

