import fs from 'fs';
import path from 'path';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { ensureUploadDirs, safeFilename, relativeUploadPath, ASSIGNMENTS_DIR } from '../lib/uploads';
import type { CreateAssignmentInput } from '../validators/assignment.validator';

ensureUploadDirs();

export async function getAssignmentDashboard() {
  const [total, published, submissions, pending] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS cnt FROM assignments`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM assignments WHERE status = 'PUBLISHED'`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM assignment_submissions`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM assignment_submissions WHERE status != 'GRADED'`),
  ]);
  return {
    totalAssignments: total.rows[0].cnt,
    published:        published.rows[0].cnt,
    totalSubmissions:   submissions.rows[0].cnt,
    pendingGrading:   pending.rows[0].cnt,
  };
}

export async function listAssignments(filters: { courseId?: string; status?: string }) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filters.courseId) { clauses.push(`a.course_id = $${i++}`); params.push(filters.courseId); }
  if (filters.status)   { clauses.push(`a.status = $${i++}`); params.push(filters.status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT a.id, a.course_id AS "courseId", c.title AS "courseTitle",
            a.module_id AS "moduleId", m.title AS "moduleTitle",
            a.title, a.description, a.pdf_filename AS "pdfFilename",
            a.pdf_path AS "pdfPath", a.pdf_size_bytes AS "pdfSizeBytes",
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

export async function getAssignment(id: string) {
  const { rows } = await db.query(
    `SELECT a.id, a.course_id AS "courseId", c.title AS "courseTitle",
            a.module_id AS "moduleId", a.title, a.description,
            a.pdf_filename AS "pdfFilename", a.pdf_path AS "pdfPath",
            a.pdf_size_bytes AS "pdfSizeBytes", a.due_date AS "dueDate",
            a.max_score AS "maxScore", a.status, a.created_at AS "createdAt"
     FROM assignments a
     JOIN courses c ON c.id = a.course_id
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
    `SELECT s.id, s.student_id AS "studentId", u.name AS "studentName",
            s.submitted_at AS "submittedAt", s.score, s.feedback, s.status
     FROM assignment_submissions s
     JOIN users u ON u.id = s.student_id
     WHERE s.assignment_id = $1
     ORDER BY s.submitted_at DESC`,
    [id],
  );

  return { ...rows[0], batches: batches.rows, submissions: submissions.rows };
}

export async function createAssignment(
  input: CreateAssignmentInput,
  createdBy: string,
  file: { originalname: string; buffer: Buffer; size: number },
) {
  const course = await db.query('SELECT id FROM courses WHERE id = $1', [input.courseId]);
  if (!course.rowCount) throw new AppError('Course not found', 404, 'NOT_FOUND');

  const fname = safeFilename(file.originalname);
  const diskPath = path.join(ASSIGNMENTS_DIR, fname);
  fs.writeFileSync(diskPath, file.buffer);

  const assignmentId = await db.transaction(async (tx) => {
    const { rows } = await db.query(
      `INSERT INTO assignments
         (course_id, module_id, title, description, pdf_filename, pdf_path, pdf_size_bytes, due_date, max_score, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        input.courseId, input.moduleId ?? null, input.title, input.description ?? null,
        file.originalname, relativeUploadPath('assignments', fname), file.size,
        input.dueDate ?? null, input.maxScore, input.status, createdBy,
      ],
      tx,
    );
    const id = rows[0].id as string;
    for (const batchId of input.batchIds) {
      await db.query(
        'INSERT INTO assignment_batches (assignment_id, batch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [id, batchId],
        tx,
      );
    }
    return id;
  });

  return getAssignment(assignmentId);
}

export async function updateAssignment(id: string, input: Partial<CreateAssignmentInput>) {
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.title !== undefined)       { fields.push(`title = $${i++}`);       params.push(input.title); }
  if (input.description !== undefined) { fields.push(`description = $${i++}`); params.push(input.description); }
  if (input.dueDate !== undefined)   { fields.push(`due_date = $${i++}`);    params.push(input.dueDate); }
  if (input.maxScore !== undefined)  { fields.push(`max_score = $${i++}`);   params.push(input.maxScore); }
  if (input.status !== undefined)    { fields.push(`status = $${i++}`);      params.push(input.status); }
  if (input.moduleId !== undefined)  { fields.push(`module_id = $${i++}`);   params.push(input.moduleId); }

  if (fields.length) {
    params.push(id);
    await db.query(`UPDATE assignments SET ${fields.join(', ')} WHERE id = $${i}`, params);
  }

  if (input.batchIds) {
    await db.transaction(async (tx) => {
      await db.query('DELETE FROM assignment_batches WHERE assignment_id = $1', [id], tx);
      for (const batchId of input.batchIds!) {
        await db.query('INSERT INTO assignment_batches (assignment_id, batch_id) VALUES ($1,$2)', [id, batchId], tx);
      }
    });
  }

  return getAssignment(id);
}

export async function deleteAssignment(id: string) {
  const { rows } = await db.query('SELECT pdf_path FROM assignments WHERE id = $1', [id]);
  if (!rows.length) throw new AppError('Assignment not found', 404, 'NOT_FOUND');
  await db.query('DELETE FROM assignments WHERE id = $1', [id]);
  const fp = rows[0].pdf_path as string;
  const full = path.join(__dirname, '../../uploads', fp);
  if (fs.existsSync(full)) fs.unlinkSync(full);
}

export async function gradeSubmission(submissionId: string, score: number, feedback?: string) {
  const { rows } = await db.query(
    `UPDATE assignment_submissions SET score = $2, feedback = $3, status = 'GRADED'
     WHERE id = $1
     RETURNING id, score, feedback, status`,
    [submissionId, score, feedback ?? null],
  );
  if (!rows.length) throw new AppError('Submission not found', 404, 'NOT_FOUND');
  return rows[0];
}
