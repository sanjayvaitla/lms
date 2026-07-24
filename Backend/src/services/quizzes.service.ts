import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { extractTextFromFile } from '../lib/fileExtract';
import { pickRandomIds, shuffle, shuffleMcqOptions } from '../lib/quizRandomize';
import { storageAdapter, slugify } from '../lib/storage';
import { clampListPagination } from '../lib/pagination';
import type { CreateQuestionInput, CreateQuizInput } from '../validators/quiz.validator';
import * as xlsx from 'xlsx';
import { mapContentToCourseBatches } from './batches.service';

// â”€â”€ Auto-number helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function nextQuizTitle(courseId: string): Promise<string> {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS cnt FROM quizzes WHERE course_id = $1',
    [courseId],
  );
  return `Quiz ${(rows[0].cnt as number) + 1}`;
}

// â”€â”€ CSV helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// â”€â”€ Dashboard stats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function getQuizDashboard() {
  const [mods, qs, quizzes, attempts] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS cnt FROM course_modules'),
    db.query('SELECT COUNT(*)::int AS cnt FROM quiz_questions'),
    db.query("SELECT COUNT(*)::int AS cnt FROM quizzes WHERE status != 'ARCHIVED'"),
    db.query("SELECT COUNT(*)::int AS cnt FROM quiz_attempts WHERE status = 'SUBMITTED'"),
  ]);
  const released = await db.query(
    `SELECT COUNT(DISTINCT q.id)::int AS cnt FROM quizzes q
     WHERE q.status = 'ACTIVE'
       AND (
         q.module_id IS NULL
         OR EXISTS (
           SELECT 1 FROM batch_module_progress bmp
           WHERE bmp.module_id = q.module_id AND bmp.status = 'COMPLETED'
         )
       )`,
  );
  return {
    totalModules:    mods.rows[0].cnt,
    totalQuestions:  qs.rows[0].cnt,
    totalQuizzes:    quizzes.rows[0].cnt,
    releasedQuizzes: released.rows[0].cnt,
    totalAttempts:   attempts.rows[0].cnt,
  };
}

// â”€â”€ Datasets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function listDatasets(courseId?: string) {
  const params: unknown[] = [];
  let where = '';
  if (courseId) { where = 'WHERE d.course_id = $1'; params.push(courseId); }
  const { rows } = await db.query(
    `SELECT d.id, d.course_id AS "courseId", c.title AS "courseTitle",
            d.title, d.filename, d.file_type AS "fileType",
            LEFT(d.content_text, 200) AS "preview",
            LENGTH(d.content_text) AS "contentLength",
            d.file_path AS "filePath", d.created_at AS "createdAt",
            u.name AS "uploadedByName"
     FROM quiz_datasets d
     JOIN courses c ON c.id = d.course_id
     LEFT JOIN users u ON u.id = d.uploaded_by
     ${where}
     ORDER BY d.created_at DESC`,
    params,
  );
  // Resolve S3 / local URL for each dataset file (skip broken keys)
  return Promise.all(
    rows.map(async (row) => {
      let fileUrl: string | null = null;
      if (row.filePath) {
        try {
          fileUrl = await storageAdapter.getUrl(row.filePath);
        } catch {
          fileUrl = null;
        }
      }
      return { ...row, fileUrl };
    }),
  );
}

export async function uploadDataset(
  courseId: string,
  title: string,
  uploadedBy: string,
  file: { mimetype: string; originalname: string; buffer: Buffer },
) {
  const course = await db.query<{ id: string; title: string }>(
    'SELECT id, title FROM courses WHERE id = $1',
    [courseId],
  );
  if (!course.rowCount) throw new AppError('Course not found', 404, 'NOT_FOUND');
  const courseSlug = slugify(course.rows[0].title);

  const { contentText, fileType } = await extractTextFromFile(file);

  // Upload to structured S3 path:
  // quiz-datasets/{course-slug}/{ts}_{filename}.{ext}
  const stored = await storageAdapter.uploadWithContext(file, {
    type: 'quiz-dataset',
    courseSlug,
    title,
  });

  const { rows } = await db.query(
    `INSERT INTO quiz_datasets
       (course_id, title, filename, file_type, content_text, file_path, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, course_id AS "courseId", title, filename,
               file_type AS "fileType", content_text AS "contentText",
               file_path AS "filePath", created_at AS "createdAt"`,
    [courseId, title, file.originalname, fileType, contentText, stored.key, uploadedBy],
  );
  const row = rows[0];
  return { ...row, fileUrl: await storageAdapter.getUrl(stored.key) };
}

export async function getDataset(id: string) {
  const { rows } = await db.query(
    `SELECT id, course_id AS "courseId", title, filename,
            file_type AS "fileType", content_text AS "contentText",
            file_path AS "filePath", created_at AS "createdAt"
     FROM quiz_datasets WHERE id = $1`,
    [id],
  );
  if (!rows.length) throw new AppError('Dataset not found', 404, 'NOT_FOUND');
  const row = rows[0];
  const fileUrl = row.filePath ? await storageAdapter.getUrl(row.filePath) : null;
  return { ...row, fileUrl };
}

export async function deleteDataset(id: string) {
  const { rows } = await db.query('SELECT file_path FROM quiz_datasets WHERE id = $1', [id]);
  if (!rows.length) throw new AppError('Dataset not found', 404, 'NOT_FOUND');
  const fp = rows[0].file_path as string | null;
  await db.query('DELETE FROM quiz_datasets WHERE id = $1', [id]);
  if (fp) await storageAdapter.delete(fp);
}

// â”€â”€ Questions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function listQuestions(filters: { courseId?: string; moduleId?: string }) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filters.courseId) { clauses.push(`q.course_id = $${i++}`); params.push(filters.courseId); }
  if (filters.moduleId) { clauses.push(`q.module_id = $${i++}`); params.push(filters.moduleId); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT q.id, q.course_id AS "courseId", q.module_id AS "moduleId",
            m.title AS "moduleTitle", q.dataset_id AS "datasetId",
            q.question_text AS "questionText", q.question_type AS "questionType",
            q.options, q.correct_answer AS "correctAnswer", q.explanation,
            q.points, q.difficulty, q.tags, q.created_at AS "createdAt"
     FROM quiz_questions q
     LEFT JOIN course_modules m ON m.id = q.module_id
     ${where}
     ORDER BY q.created_at DESC`,
    params,
  );
  return rows;
}

export async function createQuestion(input: CreateQuestionInput) {
  const opts = input.questionType === 'MCQ' ? JSON.stringify(input.options ?? []) : null;
  const { rows } = await db.query(
    `INSERT INTO quiz_questions
       (course_id, module_id, dataset_id, question_text, question_type,
        options, correct_answer, explanation, points, difficulty, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, course_id AS "courseId", module_id AS "moduleId",
               question_text AS "questionText", question_type AS "questionType",
               options, correct_answer AS "correctAnswer", points, difficulty, tags`,
    [
      input.courseId, input.moduleId ?? null, input.datasetId ?? null,
      input.questionText, input.questionType, opts,
      input.correctAnswer, input.explanation ?? null,
      input.points, input.difficulty, input.tags ?? null,
    ],
  );
  return rows[0];
}

export async function deleteQuestion(id: string) {
  await db.query('DELETE FROM quiz_questions WHERE id = $1', [id]);
}

// â”€â”€ Quizzes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function listQuizzes(filters: {
  courseId?: string;
  moduleId?: string;
  releasedOnly?: boolean;
  page?: number | string;
  limit?: number | string;
}) {
  const { limit, offset } = clampListPagination(filters.page, filters.limit);
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filters.courseId)    { clauses.push(`q.course_id = $${i++}`); params.push(filters.courseId); }
  if (filters.moduleId)    { clauses.push(`q.module_id = $${i++}`); params.push(filters.moduleId); }
  if (filters.releasedOnly){ clauses.push(`COALESCE(m.status, 'LOCKED') = 'COMPLETED'`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT q.id, q.course_id AS "courseId", c.title AS "courseTitle",
            q.module_id AS "moduleId", m.title AS "moduleTitle", m.status AS "moduleStatus",
            m.session_number AS "moduleSessionNumber", m.section AS "moduleSection",
            m.sort_order AS "moduleOrder", q.title, q.description,
            q.questions_per_attempt AS "questionsPerAttempt",
            q.time_limit_minutes AS "timeLimitMinutes", q.passing_score AS "passingScore",
            q.randomize_questions AS "randomizeQuestions",
            q.randomize_options AS "randomizeOptions",
            q.max_attempts AS "maxAttempts", q.status,
            (SELECT COUNT(*)::int FROM quiz_questions qq
             WHERE qq.module_id = q.module_id) AS "poolSize",
            (SELECT COUNT(*)::int FROM quiz_batches qb WHERE qb.quiz_id = q.id) AS "batchCount",
            (SELECT COALESCE(json_agg(qb.batch_id), '[]'::json)
               FROM quiz_batches qb WHERE qb.quiz_id = q.id) AS "batchIds",
            q.created_at AS "createdAt"
     FROM quizzes q
     JOIN courses c ON c.id = q.course_id
     LEFT JOIN course_modules m ON m.id = q.module_id
     ${where}
     ORDER BY m.sort_order NULLS LAST, q.created_at
     LIMIT $${i++} OFFSET $${i++}`,
    params,
  );
  return rows.map((row) => ({
    ...row,
    batchIds: Array.isArray(row.batchIds) ? row.batchIds : [],
  }));
}

export async function createQuiz(input: CreateQuizInput, createdBy: string) {
  const mod = await db.query(
    'SELECT id, course_id FROM course_modules WHERE id = $1',
    [input.moduleId],
  );
  if (!mod.rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');

  const existing = await db.query('SELECT id FROM quizzes WHERE module_id = $1', [input.moduleId]);
  if (existing.rowCount) throw new AppError('This module already has a quiz', 409, 'CONFLICT');

  const title = (input.title && input.title.trim())
    ? input.title.trim()
    : await nextQuizTitle(input.courseId);

  // Session-linked quizzes stay DRAFT until the session is marked Done
  const status = input.moduleId ? 'DRAFT' : input.status;

  const quizId = await db.transaction(async (tx) => {
    const { rows } = await db.query(
      `INSERT INTO quizzes
         (course_id, module_id, title, description, questions_per_attempt,
          time_limit_minutes, passing_score, randomize_questions, randomize_options,
          max_attempts, status, created_by, available_from, available_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, module_id AS "moduleId", title, status`,
      [
        input.courseId, input.moduleId, title, input.description ?? null,
        input.questionsPerAttempt, input.timeLimitMinutes ?? null,
        input.passingScore, input.randomizeQuestions, input.randomizeOptions,
        input.maxAttempts, status, createdBy,
        input.availableFrom ?? null, input.availableUntil ?? null,
      ],
      tx,
    );
    const id = rows[0].id as string;

    // Prefer explicit batchIds; otherwise map to every batch linked to this course
    const explicit = (input as { batchIds?: string[] }).batchIds ?? [];
    if (explicit.length > 0) {
      for (const batchId of explicit) {
        await db.query(
          'INSERT INTO quiz_batches (quiz_id, batch_id, released) VALUES ($1,$2,FALSE) ON CONFLICT DO NOTHING',
          [id, batchId],
          tx,
        );
      }
    } else {
      await mapContentToCourseBatches('quiz', id, input.courseId, tx);
    }
    return id;
  });

  // Late create after session Done: release + activate for completed batches
  if (input.moduleId) {
    await db.query(
      `UPDATE quiz_batches qb
       SET released = TRUE
       FROM batch_module_progress bmp
       WHERE qb.quiz_id = $1
         AND bmp.batch_id = qb.batch_id
         AND bmp.module_id = $2
         AND bmp.status = 'COMPLETED'`,
      [quizId, input.moduleId],
    );
    await db.query(
      `UPDATE quizzes q
       SET status = 'ACTIVE', updated_at = NOW()
       WHERE q.id = $1 AND q.status = 'DRAFT'
         AND EXISTS (
           SELECT 1 FROM quiz_batches qb
           WHERE qb.quiz_id = q.id AND qb.released = TRUE
         )`,
      [quizId],
    );
  }

  const final = await db.query(
    `SELECT id, module_id AS "moduleId", title, status FROM quizzes WHERE id = $1`,
    [quizId],
  );
  return final.rows[0];
}

/** Toggle quiz between DRAFT (locked) and ACTIVE (released) */
export async function toggleQuizRelease(quizId: string, action: 'release' | 'lock') {
  const existing = await db.query<{ module_id: string | null; status: string }>(
    'SELECT module_id, status FROM quizzes WHERE id = $1',
    [quizId],
  );
  if (!existing.rows.length) throw new AppError('Quiz not found', 404, 'NOT_FOUND');

  const newStatus = action === 'release' ? 'ACTIVE' : 'DRAFT';
  if (action === 'release') {
    await db.query(
      `UPDATE quiz_batches SET released = TRUE WHERE quiz_id = $1`,
      [quizId],
    );
  } else {
    await db.query(
      `UPDATE quiz_batches SET released = FALSE WHERE quiz_id = $1`,
      [quizId],
    );
  }
  const { rows } = await db.query(
    `UPDATE quizzes SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, module_id AS "moduleId", title, status`,
    [newStatus, quizId],
  );
  return rows[0];
}

export async function updateQuiz(
  id: string,
  input: Partial<CreateQuizInput> & { batchIds?: string[] },
) {
  const prev = await db.query<{ module_id: string | null; status: string }>(
    'SELECT module_id, status FROM quizzes WHERE id = $1',
    [id],
  );
  if (!prev.rows.length) throw new AppError('Quiz not found', 404, 'NOT_FOUND');

  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  const map: Record<string, string> = {
    title: 'title', description: 'description',
    questionsPerAttempt: 'questions_per_attempt',
    timeLimitMinutes: 'time_limit_minutes', passingScore: 'passing_score',
    randomizeQuestions: 'randomize_questions', randomizeOptions: 'randomize_options',
    maxAttempts: 'max_attempts', status: 'status',
    moduleId: 'module_id',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((input as Record<string, unknown>)[k] !== undefined) {
      fields.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[k]);
    }
  }

  if (fields.length) {
    params.push(id);
    await db.query(
      `UPDATE quizzes SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
      params,
    );
  }

  // Batch mapping only — does not flip status by itself.
  // Catch-up: if session already COMPLETED for a mapped batch, activate for quick-release.
  if (input.batchIds !== undefined) {
    await db.transaction(async (tx) => {
      await db.query('DELETE FROM quiz_batches WHERE quiz_id = $1', [id], tx);
      if (input.batchIds!.length > 0) {
        const vals: unknown[] = [];
        let pi = 1;
        const placeholders = input.batchIds!.map((batchId) => {
          vals.push(id, batchId);
          return `($${pi++},$${pi++},FALSE)`;
        });
        await db.query(
          `INSERT INTO quiz_batches (quiz_id, batch_id, released) VALUES ${placeholders.join(',')} ON CONFLICT DO NOTHING`,
          vals, tx,
        );
      }
    });

    const moduleId = (input.moduleId !== undefined ? input.moduleId : prev.rows[0].module_id) as string | null;
    if (
      input.status === undefined
      && prev.rows[0].status === 'DRAFT'
      && moduleId
      && (input.batchIds?.length ?? 0) > 0
    ) {
      await db.query(
        `UPDATE quiz_batches qb
         SET released = TRUE
         FROM batch_module_progress bmp
         WHERE qb.quiz_id = $1
           AND bmp.batch_id = qb.batch_id
           AND bmp.module_id = $2
           AND bmp.status = 'COMPLETED'
           AND qb.batch_id = ANY($3::uuid[])`,
        [id, moduleId, input.batchIds],
      );
      const done = await db.query(
        `SELECT 1 FROM quiz_batches WHERE quiz_id = $1 AND released = TRUE LIMIT 1`,
        [id],
      );
      if (done.rowCount) {
        await db.query(
          `UPDATE quizzes SET status = 'ACTIVE', updated_at = NOW()
           WHERE id = $1 AND status = 'DRAFT'`,
          [id],
        );
      }
    }
  }

  if (!fields.length && input.batchIds === undefined) {
    throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
  }

  const { rows } = await db.query(
    `SELECT q.id, q.title, q.status, q.module_id AS "moduleId",
            (SELECT COUNT(*)::int FROM quiz_batches qb WHERE qb.quiz_id = q.id) AS "batchCount",
            (SELECT COALESCE(json_agg(qb.batch_id), '[]'::json)
               FROM quiz_batches qb WHERE qb.quiz_id = q.id) AS "batchIds"
     FROM quizzes q WHERE q.id = $1`,
    [id],
  );
  if (!rows.length) throw new AppError('Quiz not found', 404, 'NOT_FOUND');
  return {
    ...rows[0],
    batchIds: Array.isArray(rows[0].batchIds) ? rows[0].batchIds : [],
  };
}

export async function deleteQuiz(id: string) {
  await db.query('DELETE FROM quizzes WHERE id = $1', [id]);
}

// â”€â”€ Attempts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function startAttempt(quizId: string, studentId: string) {
  const quizRes = await db.query(
    `SELECT q.id, q.title, q.module_id AS "moduleId", q.course_id AS "courseId",
            q.questions_per_attempt AS "questionsPerAttempt",
            q.max_attempts AS "maxAttempts",
            q.randomize_questions AS "randomizeQuestions",
            q.randomize_options AS "randomizeOptions",
            q.time_limit_minutes AS "timeLimitMinutes",
            q.passing_score AS "passingScore",
            q.status,
            q.available_from AS "availableFrom",
            q.available_until AS "availableUntil"
     FROM quizzes q WHERE q.id = $1`,
    [quizId],
  );
  if (!quizRes.rows.length) throw new AppError('Quiz not found', 404, 'NOT_FOUND');
  const quiz = quizRes.rows[0] as {
    id: string; title: string; moduleId: string | null; courseId: string;
    questionsPerAttempt: number; maxAttempts: number;
    randomizeQuestions: boolean; randomizeOptions: boolean;
    timeLimitMinutes: number | null; passingScore: number; status: string;
    availableFrom: Date | null; availableUntil: Date | null;
  };

  if (quiz.status !== 'ACTIVE') throw new AppError('Quiz is not active', 403, 'FORBIDDEN');

  const now = Date.now();
  if (quiz.availableFrom && new Date(quiz.availableFrom).getTime() > now) {
    throw new AppError('This quiz is not available yet', 403, 'QUIZ_NOT_AVAILABLE');
  }
  if (quiz.availableUntil && new Date(quiz.availableUntil).getTime() < now) {
    throw new AppError('This quiz is no longer available', 403, 'QUIZ_EXPIRED');
  }

  // Require released batch mapping + session COMPLETED for the student's batch
  const accessRes = await db.query<{ batch_id: string }>(
    `SELECT e.batch_id
     FROM quiz_batches qb
     JOIN enrollments e ON e.batch_id = qb.batch_id AND e.student_id = $2
     WHERE qb.quiz_id = $1 AND qb.released = TRUE
     LIMIT 1`,
    [quizId, studentId],
  );
  if (!accessRes.rowCount) {
    throw new AppError('You do not have access to this quiz', 403, 'FORBIDDEN');
  }

  if (quiz.moduleId) {
    const done = await db.query(
      `SELECT 1 FROM batch_module_progress
       WHERE batch_id = $1 AND module_id = $2 AND status = 'COMPLETED'
       LIMIT 1`,
      [accessRes.rows[0].batch_id, quiz.moduleId],
    );
    if (!done.rowCount) {
      throw new AppError('This quiz unlocks after the session is marked Done', 403, 'SESSION_NOT_COMPLETED');
    }
  }

  const attemptsRes = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM quiz_attempts
     WHERE quiz_id = $1 AND student_id = $2 AND status = 'SUBMITTED'`,
    [quizId, studentId],
  );
  if ((attemptsRes.rows[0].cnt as number) >= quiz.maxAttempts) {
    throw new AppError('Maximum attempts reached', 403, 'MAX_ATTEMPTS_REACHED');
  }

  const attemptNumRes = await db.query(
    'SELECT COUNT(*)::int AS cnt FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2',
    [quizId, studentId],
  );
  const attemptNumber = (attemptNumRes.rows[0].cnt as number) + 1;

  const lastAttemptRes = await db.query(
    `SELECT id FROM quiz_attempts
     WHERE quiz_id = $1 AND student_id = $2 AND status = 'SUBMITTED'
     ORDER BY submitted_at DESC LIMIT 1`,
    [quizId, studentId]
  );

  let wrongQuestionIds: string[] = [];
  if (lastAttemptRes.rows.length) {
    const lastAttemptId = lastAttemptRes.rows[0].id;
    const wrongAnswersRes = await db.query(
      `SELECT question_id FROM quiz_attempt_answers
       WHERE attempt_id = $1 AND is_correct = false`,
      [lastAttemptId]
    );
    wrongQuestionIds = wrongAnswersRes.rows.map((row: any) => row.question_id);
  }

  const qRes = await db.query(
    `SELECT id, question_text AS "questionText", question_type AS "questionType",
            options, correct_answer AS "correctAnswer", points, difficulty, explanation
     FROM quiz_questions
     WHERE module_id = (SELECT module_id FROM quizzes WHERE id = $1)`,
    [quizId],
  );

  let allQs = qRes.rows as Array<{
    id: string; questionText: string; questionType: string;
    options: string[] | null; correctAnswer: string;
    points: number; difficulty: string; explanation: string | null;
  }>;

  if (!allQs.length)
    throw new AppError(
      'This quiz has no questions yet. The trainer needs to add questions before you can attempt it.',
      422,
      'NO_QUESTIONS',
    );

  if (wrongQuestionIds.length > 0) {
    allQs = allQs.filter((q) => wrongQuestionIds.includes(q.id));
  }

  // Upsert: if an in-progress attempt already exists (e.g. StrictMode double-fire or refresh),
  // resume it with the SAME question set — never re-roll.
  const existingInProgress = await db.query<{ id: string; question_ids: unknown }>(
    `SELECT id, question_ids FROM quiz_attempts
     WHERE quiz_id = $1 AND student_id = $2 AND status = 'IN_PROGRESS'
     ORDER BY started_at DESC LIMIT 1`,
    [quizId, studentId],
  );

  let attemptId: string;
  let selectedQs: typeof allQs;

  if (existingInProgress.rows.length) {
    attemptId = existingInProgress.rows[0].id;
    const raw = existingInProgress.rows[0].question_ids;
    let stored: string[] = [];
    if (Array.isArray(raw)) stored = raw as string[];
    else if (typeof raw === 'string') {
      try {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) stored = p;
      } catch { /* ignore */ }
    }

    if (stored.length > 0) {
      // Load the exact assigned questions (ignore wrong-answer filter used for new attempts)
      const resumeRes = await db.query(
        `SELECT id, question_text AS "questionText", question_type AS "questionType",
                options, correct_answer AS "correctAnswer", points, difficulty, explanation
         FROM quiz_questions WHERE id = ANY($1)`,
        [stored],
      );
      const byId = new Map(resumeRes.rows.map((q: any) => [q.id, q]));
      selectedQs = stored.map((sid) => byId.get(sid)).filter(Boolean) as typeof allQs;
      if (!selectedQs.length) {
        throw new AppError('Attempt questions are missing — contact your trainer', 422, 'NO_QUESTIONS');
      }
    } else {
      const selected = pickRandomIds(
        allQs.map((q) => q.id),
        Math.min(quiz.questionsPerAttempt, allQs.length),
        quiz.randomizeQuestions,
      );
      selectedQs = selected.map((sid) => allQs.find((q) => q.id === sid)!).filter(Boolean);
      await db.query(
        `UPDATE quiz_attempts SET question_ids = $2 WHERE id = $1`,
        [attemptId, JSON.stringify(selected)],
      );
    }
  } else {
    const selected = pickRandomIds(
      allQs.map((q) => q.id),
      Math.min(quiz.questionsPerAttempt, allQs.length),
      quiz.randomizeQuestions,
    );
    selectedQs = selected.map((sid) => allQs.find((q) => q.id === sid)!).filter(Boolean);
    const { rows: attemptRows } = await db.query(
      `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_number, question_ids)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [quizId, studentId, attemptNumber, JSON.stringify(selected)],
    );
    attemptId = attemptRows[0].id as string;
  }

  const questions = selectedQs.map((q) => {
    let opts: string[] = [];
    if (Array.isArray(q.options)) opts = q.options;
    else if (typeof q.options === 'string') {
      try { const p = JSON.parse(q.options); if (Array.isArray(p)) opts = p; } catch {}
    }
    return {
      id:           q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      points:       q.points,
      difficulty:   q.difficulty,
      options:      quiz.randomizeOptions && opts.length > 0
        ? shuffleMcqOptions(opts)
        : opts,
    };
  });

  return {
    attemptId,
    attemptNumber,
    quizTitle:        quiz.title,
    timeLimitMinutes: quiz.timeLimitMinutes,
    passingScore:     quiz.passingScore,
    questions,
  };
}

// ── CSV builder for quiz results ─────────────────────────────────────────────
function buildQuizResultsCsv(info: {
  studentName: string; batchName: string; courseName: string;
  quizTitle: string; attemptNumber: number; score: number; passed: boolean;
  rows: Array<{
    no: number; questionText: string;
    selectedAnswer: string; correctAnswer: string;
    isCorrect: boolean; pointsEarned: number; maxPoints: number;
  }>;
}): string {
  const esc = (v: string | number | boolean) =>
    `"${String(v ?? '').replace(/"/g, '""')}"`;

  const lines: string[][] = [
    // Header block
    ['Student',       info.studentName],
    ['Batch',         info.batchName],
    ['Course',        info.courseName],
    ['Quiz',          info.quizTitle],
    ['Attempt #',     String(info.attemptNumber)],
    ['Score',         `${info.score}%`],
    ['Result',        info.passed ? 'PASSED' : 'FAILED'],
    [],
    // Answer table header
    ['#', 'Question', 'Student Answer', 'Correct Answer', 'Correct?', 'Points Earned', 'Max Points'],
    ...info.rows.map(r => [
      String(r.no), r.questionText, r.selectedAnswer, r.correctAnswer,
      r.isCorrect ? 'Yes' : 'No', String(r.pointsEarned), String(r.maxPoints),
    ]),
  ];

  return lines.map(row => row.map(c => esc(c)).join(',')).join('\r\n');
}

export async function submitAttempt(
  attemptId: string,
  studentId: string,
  answers: { questionId: string; selectedAnswer: string }[],
) {
  // ── 1. Load attempt + quiz context ───────────────────────────────────────────
  const attemptRes = await db.query<any>(
    `SELECT a.id, a.quiz_id AS "quizId", a.student_id AS "studentId",
            a.attempt_number AS "attemptNumber",
            a.started_at AS "startedAt",
            a.question_ids AS "questionIds",
            q.passing_score AS "passingScore", q.title AS "quizTitle",
            q.course_id AS "courseId",
            q.time_limit_minutes AS "timeLimitMinutes",
            q.available_until AS "availableUntil"
     FROM quiz_attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.id = $1 AND a.student_id = $2 AND a.status = 'IN_PROGRESS'`,
    [attemptId, studentId],
  );
  if (!attemptRes.rows.length) {
    throw new AppError('Attempt not found or already submitted', 404, 'NOT_FOUND');
  }
  const attempt = attemptRes.rows[0] as {
    id: string; quizId: string; studentId: string; attemptNumber: number;
    passingScore: number; quizTitle: string; courseId: string;
    startedAt: Date; questionIds: unknown;
    timeLimitMinutes: number | null; availableUntil: Date | null;
  };

  const now = new Date();
  if (attempt.availableUntil && now > new Date(attempt.availableUntil)) {
    throw new AppError('This quiz is no longer available', 403, 'QUIZ_EXPIRED');
  }
  if (attempt.timeLimitMinutes && attempt.startedAt) {
    const deadline = new Date(attempt.startedAt).getTime() + attempt.timeLimitMinutes * 60_000;
    if (now.getTime() > deadline + 15_000) { // 15s grace for network latency
      throw new AppError('Time limit exceeded for this attempt', 403, 'TIME_EXPIRED');
    }
  }

  // Bound grading to the attempt's assigned question set (prevents bank-wide cheat)
  let assignedIds: string[] = [];
  const rawIds = attempt.questionIds;
  if (Array.isArray(rawIds)) assignedIds = rawIds as string[];
  else if (typeof rawIds === 'string') {
    try {
      const p = JSON.parse(rawIds);
      if (Array.isArray(p)) assignedIds = p;
    } catch { /* ignore */ }
  }
  if (!assignedIds.length) {
    throw new AppError('Attempt has no assigned questions', 400, 'INVALID_ATTEMPT');
  }

  const answerMap = new Map<string, string>();
  for (const a of answers) {
    if (assignedIds.includes(a.questionId)) {
      answerMap.set(a.questionId, a.selectedAnswer ?? '');
    }
  }

  // ── 2. Grade answers (only assigned questions; missing = wrong) ──────────────
  const qBatchRes = await db.query<any>(
    `SELECT id, question_text AS "questionText", correct_answer AS "correctAnswer", points
     FROM quiz_questions
     WHERE id = ANY($1)`,
    [assignedIds],
  );
  const questionMap = new Map<string, { questionText: string; correctAnswer: string; points: number }>(
    qBatchRes.rows.map((r: any) => [r.id, r]),
  );

  let totalPoints  = 0;
  let earnedPoints = 0;
  const gradedRows: Array<{
    no: number; questionText: string; selectedAnswer: string;
    correctAnswer: string; isCorrect: boolean; pointsEarned: number; maxPoints: number;
  }> = [];

  const insertValues: unknown[] = [];
  let paramIdx = 1;
  const valueClauses: string[] = [];

  for (let i = 0; i < assignedIds.length; i++) {
    const qid = assignedIds[i];
    const q = questionMap.get(qid);
    if (!q) continue;
    const selectedAnswer = answerMap.get(qid) ?? '';
    const correctKey = (q.correctAnswer ?? '').trim().toLowerCase();
    const correct = selectedAnswer.trim().toLowerCase() === correctKey && correctKey.length > 0;
    const awarded = correct ? q.points : 0;
    totalPoints  += q.points;
    earnedPoints += awarded;

    valueClauses.push(`($${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++},$${paramIdx++})`);
    insertValues.push(attemptId, qid, selectedAnswer, correct, awarded);

    gradedRows.push({
      no:             i + 1,
      questionText:   q.questionText,
      selectedAnswer,
      correctAnswer:  q.correctAnswer ?? '',
      isCorrect:      correct,
      pointsEarned:   awarded,
      maxPoints:      q.points,
    });
  }

  if (valueClauses.length) {
    await db.query(
      `INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_answer, is_correct, points_earned)
       VALUES ${valueClauses.join(', ')}`,
      insertValues,
    );
  }

  const score  = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passed = score >= attempt.passingScore;

  await db.query(
    `UPDATE quiz_attempts
     SET score = $2, passed = $3, status = 'SUBMITTED', submitted_at = NOW()
     WHERE id = $1`,
    [attemptId, score, passed],
  );

  // ── 3. Build CSV and upload to S3 (fire-and-forget — never blocks the response) ──
  uploadQuizResultsCsv(attempt, gradedRows, score, passed, earnedPoints, totalPoints).catch(err =>
    console.error('[quiz-results] S3 upload failed:', err?.message ?? err),
  );

  return { attemptId, score, passed, earnedPoints, totalPoints };
}

/** Fetches context, builds CSV, uploads to S3. Called async after submitAttempt. */
async function uploadQuizResultsCsv(
  attempt: { id: string; quizId: string; studentId: string; attemptNumber: number; quizTitle: string; courseId: string },
  gradedRows: Parameters<typeof buildQuizResultsCsv>[0]['rows'],
  score: number, passed: boolean, earnedPoints: number, totalPoints: number,
) {
  // Fetch student name, course title, batch name (best-match batch for this quiz)
  const [studentRes, courseRes, batchRes] = await Promise.all([
    db.query<any>('SELECT name FROM users WHERE id = $1', [attempt.studentId]),
    db.query<any>('SELECT title FROM courses WHERE id = $1', [attempt.courseId]),
    db.query<any>(
      `SELECT b.name
       FROM quiz_batches qb
       JOIN batches b ON b.id = qb.batch_id
       JOIN enrollments e ON e.batch_id = qb.batch_id AND e.student_id = $2
       WHERE qb.quiz_id = $1
       ORDER BY b.created_at DESC LIMIT 1`,
      [attempt.quizId, attempt.studentId],
    ),
  ]);

  const studentName = studentRes.rows[0]?.name   ?? 'unknown-student';
  const courseName  = courseRes.rows[0]?.title   ?? 'unknown-course';
  const batchName   = batchRes.rows[0]?.name     ?? 'no-batch';

  const csv = buildQuizResultsCsv({
    studentName, batchName, courseName,
    quizTitle:     attempt.quizTitle,
    attemptNumber: attempt.attemptNumber,
    score, passed,
    rows: gradedRows,
  });

  await storageAdapter.uploadWithContext(
    {
      buffer:       Buffer.from(csv, 'utf-8'),
      originalname: 'results.csv',
      mimetype:     'text/csv',
    },
    {
      type:        'quiz-results',
      courseSlug:  slugify(courseName),
      batchSlug:   slugify(batchName),
      studentSlug: slugify(studentName),
      userId:      attempt.studentId,
      title:       slugify(attempt.quizTitle) + `_attempt-${attempt.attemptNumber}`,
    },
  );

  console.log(`[quiz-results] Uploaded: ${studentName} | ${attempt.quizTitle} | attempt ${attempt.attemptNumber} | score ${score}%`);
}

/** Review submitted attempt — returns each question's correct status for the student */
export async function reviewAttempt(attemptId: string, studentId: string) {
  const attemptRes = await db.query(
    `SELECT id FROM quiz_attempts WHERE id = $1 AND student_id = $2 AND status = 'SUBMITTED'`,
    [attemptId, studentId],
  );
  if (!attemptRes.rows.length) {
    throw new AppError('Attempt not found', 404, 'NOT_FOUND');
  }

  const { rows } = await db.query<any>(
    `SELECT
       aa.question_id   AS "questionId",
       aa.selected_answer AS "selectedAnswer",
       aa.is_correct    AS "isCorrect",
       aa.points_earned AS "pointsAwarded",
       q.correct_answer  AS "correctAnswer"
     FROM quiz_attempt_answers aa
     JOIN quiz_questions q ON q.id = aa.question_id
     WHERE aa.attempt_id = $1`,
    [attemptId],
  );
  return rows;
}

export async function listAttempts(quizId?: string) {
  const params: unknown[] = [];
  const where = quizId ? 'WHERE a.quiz_id = $1' : '';
  if (quizId) params.push(quizId);
  const { rows } = await db.query(
    `SELECT a.id, a.quiz_id AS "quizId", q.title AS "quizTitle",
            a.student_id AS "studentId", u.name AS "studentName",
            a.attempt_number AS "attemptNumber", a.score, a.passed,
            a.status, a.started_at AS "startedAt", a.submitted_at AS "submittedAt",
            CASE
              WHEN a.question_ids IS NULL THEN 0
              WHEN jsonb_typeof(a.question_ids) = 'array' THEN jsonb_array_length(a.question_ids)
              ELSE 0
            END AS "questionCount"
     FROM quiz_attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     JOIN users u ON u.id = a.student_id
     ${where}
     ORDER BY a.started_at DESC`,
    params,
  );
  return rows;
}

// â”€â”€ Preview (trainer view) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export async function previewRandomDraw(quizId: string) {
  const quizRes = await db.query(
    `SELECT q.id, q.title AS "quizTitle", q.description,
            q.questions_per_attempt AS "questionsPerAttempt",
            q.passing_score AS "passingScore",
            q.time_limit_minutes AS "timeLimitMinutes",
            q.randomize_questions AS "randomizeQuestions",
            q.randomize_options AS "randomizeOptions"
     FROM quizzes q WHERE q.id = $1`,
    [quizId],
  );
  if (!quizRes.rows.length) throw new AppError('Quiz not found', 404, 'NOT_FOUND');
  const quiz = quizRes.rows[0] as {
    id: string; quizTitle: string; description: string | null;
    questionsPerAttempt: number; passingScore: number;
    timeLimitMinutes: number | null;
    randomizeQuestions: boolean; randomizeOptions: boolean;
  };

  const qRes = await db.query(
    `SELECT id, question_text AS "questionText", question_type AS "questionType",
            options, correct_answer AS "correctAnswer", explanation,
            points, difficulty
     FROM quiz_questions
     WHERE module_id = (SELECT module_id FROM quizzes WHERE id = $1)`,
    [quizId],
  );

  type QuestionRow = {
    id: string; questionText: string; questionType: string;
    options: string[] | null; correctAnswer: string;
    explanation: string | null; points: number; difficulty: string;
  };
  const allQs = qRes.rows as QuestionRow[];
  const poolSize = allQs.length;
  const drawCount = Math.min(quiz.questionsPerAttempt, poolSize);

  const draws = [1, 2, 3].map((n) => {
    const ids = pickRandomIds(allQs.map((q) => q.id), drawCount, quiz.randomizeQuestions);
    const questions = ids.map((id) => {
      const q = allQs.find((qq) => qq.id === id)!;
      const opts = quiz.randomizeOptions && q.options
        ? shuffle([...q.options])
        : q.options;
      return {
        id: q.id, text: q.questionText, type: q.questionType,
        options: opts, correctAnswer: q.correctAnswer,
        explanation: q.explanation, points: q.points, difficulty: q.difficulty,
      };
    });
    return { studentLabel: `Student ${n}`, questions };
  });

  return {
    quizTitle: quiz.quizTitle, description: quiz.description,
    poolSize, questionsPerAttempt: quiz.questionsPerAttempt,
    passingScore: quiz.passingScore, timeLimitMinutes: quiz.timeLimitMinutes,
    draws,
  };
}

// â”€â”€ CSV Import â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface CsvImportSettings {
  title: string;
  questionsPerAttempt: number;
  timeLimitMinutes: number | null;
  passingScore: number;
  maxAttempts: number;
  status: string;
  availableFrom?: string | null;
  availableUntil?: string | null;
}

export async function importQuizFromCsv(
  courseId:     string,
  moduleId:     string,
  createdBy:    string,
  file:         { buffer: Buffer; originalname: string },
  userSettings?: Partial<CsvImportSettings>,
) {
  const mod = await db.query(
    'SELECT id FROM course_modules WHERE id = $1 AND course_id = $2',
    [moduleId, courseId],
  );
  if (!mod.rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');

  let parsedRows: any[] = [];
  try {
    const workbook = xlsx.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
    parsedRows = rawRows.map((row: any) => {
      const lowerRow: any = {};
      for (const [k, v] of Object.entries(row)) {
        lowerRow[k.toLowerCase().trim()] = v;
      }
      return lowerRow;
    });
  } catch (err) {
    throw new AppError('Failed to parse file. Must be a valid CSV or Excel file.', 400, 'INVALID_FILE');
  }

  if (parsedRows.length === 0) {
    throw new AppError('File must have a header row and at least one question', 400, 'INVALID_FILE');
  }

  interface ParsedQuestion { questionText: string; options: string[]; correctAnswer: string; points: number; }
  const parsed: ParsedQuestion[] = [];

  for (const row of parsedRows) {
    const questionText = (row.question ?? '').toString().trim();
    if (!questionText) continue;

    const options = [
      (row.optiona ?? '').toString().trim(),
      (row.optionb ?? '').toString().trim(),
      (row.optionc ?? '').toString().trim(),
      (row.optiond ?? '').toString().trim(),
    ].filter(Boolean);

    const rawAnswer = (row.correct_answer ?? '').toString().trim();
    const points = parseInt((row.points ?? '1').toString(), 10) || 1;

    if (options.length < 2 || !rawAnswer) continue;

    // Convert letter key (A/B/C/D) → actual option text so grading compares by value
    const letterIdx: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const idx = letterIdx[rawAnswer.toUpperCase()];
    const correctAnswer = idx !== undefined && options[idx] ? options[idx] : rawAnswer;
    parsed.push({ questionText, options, correctAnswer, points });
  }

  if (!parsed.length)
    throw new AppError('No valid questions found in file', 400, 'INVALID_FILE');

  const settings = {
    title:               userSettings?.title ?? '',
    questionsPerAttempt: userSettings?.questionsPerAttempt ?? Math.min(10, parsed.length),
    timeLimitMinutes:    userSettings?.timeLimitMinutes ?? null,
    passingScore:        userSettings?.passingScore ?? 70,
    maxAttempts:         userSettings?.maxAttempts ?? 3,
    status:              moduleId ? 'DRAFT' : (userSettings?.status ?? 'DRAFT'),
    availableFrom:       userSettings?.availableFrom ?? null,
    availableUntil:      userSettings?.availableUntil ?? null,
  };

  // Use user-provided title if given, otherwise auto-generate
  const quizTitle = settings.title.trim() || (await nextQuizTitle(courseId));
  const existing  = await db.query<{ id: string; status: string }>(
    'SELECT id, status FROM quizzes WHERE module_id = $1',
    [moduleId],
  );
  let quizId: string;

  if (existing.rowCount && existing.rowCount > 0) {
    // Re-import must not hide a quiz that was already released
    const importStatus = existing.rows[0].status === 'ACTIVE' ? 'ACTIVE' : settings.status;
    const upd = await db.query(
      `UPDATE quizzes
       SET title = $2, questions_per_attempt = $3, time_limit_minutes = $4,
           passing_score = $5, max_attempts = $6, status = $7,
           available_from = $8, available_until = $9, updated_at = NOW()
       WHERE module_id = $1
       RETURNING id`,
      [moduleId, quizTitle, settings.questionsPerAttempt, settings.timeLimitMinutes,
       settings.passingScore, settings.maxAttempts, importStatus,
       settings.availableFrom, settings.availableUntil],
    );
    quizId = upd.rows[0].id as string;
    await db.query('DELETE FROM quiz_questions WHERE module_id = $1', [moduleId]);
  } else {
    const ins = await db.query(
      `INSERT INTO quizzes
         (course_id, module_id, title, questions_per_attempt, time_limit_minutes,
          passing_score, randomize_questions, randomize_options, max_attempts, status, created_by,
          available_from, available_until)
       VALUES ($1,$2,$3,$4,$5,$6,true,true,$7,$8,$9,$10,$11)
       RETURNING id`,
      [courseId, moduleId, quizTitle, settings.questionsPerAttempt,
       settings.timeLimitMinutes, settings.passingScore,
       settings.maxAttempts, settings.status, createdBy,
       settings.availableFrom, settings.availableUntil],
    );
    quizId = ins.rows[0].id as string;
  }

  // Package quiz onto every batch that includes this course (Draft until session Done)
  await mapContentToCourseBatches('quiz', quizId, courseId);

  // If any linked batch already completed this session, release + activate now
  await db.query(
    `UPDATE quiz_batches qb
     SET released = TRUE
     FROM quizzes q
     JOIN batch_module_progress bmp
       ON bmp.batch_id = qb.batch_id AND bmp.module_id = q.module_id
     WHERE qb.quiz_id = q.id AND q.id = $1 AND bmp.status = 'COMPLETED'`,
    [quizId],
  );
  await db.query(
    `UPDATE quizzes q
     SET status = 'ACTIVE', updated_at = NOW()
     WHERE q.id = $1 AND q.status = 'DRAFT'
       AND EXISTS (
         SELECT 1 FROM quiz_batches qb
         WHERE qb.quiz_id = q.id AND qb.released = TRUE
       )`,
    [quizId],
  );

  // Batch-insert all questions in a single query
  {
    const vals: unknown[] = [];
    let pi = 1;
    const rows = parsed.map((q) => {
      vals.push(courseId, moduleId, q.questionText, JSON.stringify(q.options), q.correctAnswer, q.points);
      return `($${pi++},$${pi++},$${pi++},'MCQ',$${pi++},$${pi++},$${pi++},'MEDIUM')`;
    });
    await db.query(
      `INSERT INTO quiz_questions
         (course_id, module_id, question_text, question_type,
          options, correct_answer, points, difficulty)
       VALUES ${rows.join(', ')}`,
      vals,
    );
  }

  const quiz = await db.query(
    `SELECT q.id, q.title, q.status,
            q.questions_per_attempt AS "questionsPerAttempt",
            q.time_limit_minutes AS "timeLimitMinutes",
            q.passing_score AS "passingScore",
            q.max_attempts AS "maxAttempts",
            m.title AS "moduleTitle"
     FROM quizzes q
     JOIN course_modules m ON m.id = q.module_id
     WHERE q.id = $1`,
    [quizId],
  );

  return {
    quizId,
    quiz: {
      id:    quizId,
      title: quiz.rows[0]?.title ?? '',
      moduleTitle: quiz.rows[0]?.moduleTitle ?? '',
    },
    title:             quiz.rows[0]?.title ?? '',
    questionsImported: parsed.length,
    moduleTitle:       quiz.rows[0]?.moduleTitle ?? '',
  };
}
