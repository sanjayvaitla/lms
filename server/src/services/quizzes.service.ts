import fs from 'fs';
import path from 'path';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { extractTextFromFile } from '../lib/fileExtract';
import { pickRandomIds, shuffle, shuffleMcqOptions } from '../lib/quizRandomize';
import { DATASETS_DIR, ensureUploadDirs, safeFilename, relativeUploadPath } from '../lib/uploads';
import type { CreateQuestionInput, CreateQuizInput } from '../validators/quiz.validator';

ensureUploadDirs();

// ── Dashboard stats ───────────────────────────────────────────────────────────
export async function getQuizDashboard() {
  const [mods, qs, quizzes, attempts] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS cnt FROM course_modules`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM quiz_questions`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM quizzes WHERE status != 'ARCHIVED'`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM quiz_attempts WHERE status = 'SUBMITTED'`),
  ]);
  const released = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM quizzes q
     JOIN course_modules m ON m.id = q.module_id AND m.status = 'COMPLETED'`,
  );
  return {
    totalModules:    mods.rows[0].cnt,
    totalQuestions:  qs.rows[0].cnt,
    totalQuizzes:    quizzes.rows[0].cnt,
    releasedQuizzes: released.rows[0].cnt,
    totalAttempts:   attempts.rows[0].cnt,
  };
}

// ── Datasets ──────────────────────────────────────────────────────────────────
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
  return rows;
}

export async function uploadDataset(
  courseId: string,
  title: string,
  uploadedBy: string,
  file: { mimetype: string; originalname: string; buffer: Buffer },
) {
  const course = await db.query('SELECT id FROM courses WHERE id = $1', [courseId]);
  if (!course.rowCount) throw new AppError('Course not found', 404, 'NOT_FOUND');

  const { contentText, fileType } = await extractTextFromFile(file);
  const fname = safeFilename(file.originalname);
  const diskPath = path.join(DATASETS_DIR, fname);
  fs.writeFileSync(diskPath, file.buffer);

  const { rows } = await db.query(
    `INSERT INTO quiz_datasets (course_id, title, filename, file_type, content_text, file_path, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, course_id AS "courseId", title, filename, file_type AS "fileType",
               content_text AS "contentText", file_path AS "filePath", created_at AS "createdAt"`,
    [courseId, title, file.originalname, fileType, contentText, relativeUploadPath('datasets', fname), uploadedBy],
  );
  return rows[0];
}

export async function getDataset(id: string) {
  const { rows } = await db.query(
    `SELECT id, course_id AS "courseId", title, filename, file_type AS "fileType",
            content_text AS "contentText", file_path AS "filePath", created_at AS "createdAt"
     FROM quiz_datasets WHERE id = $1`,
    [id],
  );
  if (!rows.length) throw new AppError('Dataset not found', 404, 'NOT_FOUND');
  return rows[0];
}

export async function deleteDataset(id: string) {
  const { rows } = await db.query('SELECT file_path FROM quiz_datasets WHERE id = $1', [id]);
  if (!rows.length) throw new AppError('Dataset not found', 404, 'NOT_FOUND');
  const fp = rows[0].file_path as string | null;
  await db.query('DELETE FROM quiz_datasets WHERE id = $1', [id]);
  if (fp) {
    const full = path.join(__dirname, '../../uploads', fp);
    if (fs.existsSync(full)) fs.unlinkSync(full);
  }
}

// ── Questions ─────────────────────────────────────────────────────────────────
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
       (course_id, module_id, dataset_id, question_text, question_type, options, correct_answer, explanation, points, difficulty, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id, course_id AS "courseId", module_id AS "moduleId", question_text AS "questionText",
               question_type AS "questionType", options, correct_answer AS "correctAnswer",
               points, difficulty, tags`,
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

// ── Quizzes ───────────────────────────────────────────────────────────────────
export async function listQuizzes(filters: { courseId?: string; releasedOnly?: boolean }) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filters.courseId) { clauses.push(`q.course_id = $${i++}`); params.push(filters.courseId); }
  if (filters.releasedOnly) { clauses.push(`m.status = 'COMPLETED'`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT q.id, q.course_id AS "courseId", c.title AS "courseTitle",
            q.module_id AS "moduleId", m.title AS "moduleTitle", m.status AS "moduleStatus",
            m.sort_order AS "moduleOrder", q.title, q.description,
            q.questions_per_attempt AS "questionsPerAttempt",
            q.time_limit_minutes AS "timeLimitMinutes", q.passing_score AS "passingScore",
            q.randomize_questions AS "randomizeQuestions", q.randomize_options AS "randomizeOptions",
            q.max_attempts AS "maxAttempts", q.status,
            (SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.module_id = q.module_id) AS "poolSize",
            q.created_at AS "createdAt"
     FROM quizzes q
     JOIN courses c ON c.id = q.course_id
     JOIN course_modules m ON m.id = q.module_id
     ${where}
     ORDER BY m.sort_order ASC`,
    params,
  );
  return rows.map((r) => ({
    ...r,
    isReleased: r.moduleStatus === 'COMPLETED',
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

  const { rows } = await db.query(
    `INSERT INTO quizzes
       (course_id, module_id, title, description, questions_per_attempt, time_limit_minutes,
        passing_score, randomize_questions, randomize_options, max_attempts, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, module_id AS "moduleId", title, status`,
    [
      input.courseId, input.moduleId, input.title, input.description ?? null,
      input.questionsPerAttempt, input.timeLimitMinutes ?? null,
      input.passingScore, input.randomizeQuestions, input.randomizeOptions,
      input.maxAttempts, input.status, createdBy,
    ],
  );
  return rows[0];
}

export async function updateQuiz(id: string, input: Partial<CreateQuizInput>) {
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  const map: Record<string, string> = {
    title: 'title', description: 'description', questionsPerAttempt: 'questions_per_attempt',
    timeLimitMinutes: 'time_limit_minutes', passingScore: 'passing_score',
    randomizeQuestions: 'randomize_questions', randomizeOptions: 'randomize_options',
    maxAttempts: 'max_attempts', status: 'status',
  };
  for (const [k, col] of Object.entries(map)) {
    if ((input as Record<string, unknown>)[k] !== undefined) {
      fields.push(`${col} = $${i++}`);
      params.push((input as Record<string, unknown>)[k]);
    }
  }
  if (!fields.length) throw new AppError('No fields', 400, 'VALIDATION_ERROR');
  params.push(id);
  const { rows } = await db.query(
    `UPDATE quizzes SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, title, status`,
    params,
  );
  if (!rows.length) throw new AppError('Quiz not found', 404, 'NOT_FOUND');
  return rows[0];
}

export async function deleteQuiz(id: string) {
  await db.query('DELETE FROM quizzes WHERE id = $1', [id]);
}

// ── Start attempt (randomized questions per student) ──────────────────────────
export async function startAttempt(quizId: string, studentId: string) {
  const quizRes = await db.query(
    `SELECT q.*, m.status AS module_status
     FROM quizzes q
     JOIN course_modules m ON m.id = q.module_id
     WHERE q.id = $1`,
    [quizId],
  );
  if (!quizRes.rows.length) throw new AppError('Quiz not found', 404, 'NOT_FOUND');
  const quiz = quizRes.rows[0] as Record<string, unknown>;

  if (quiz.module_status !== 'COMPLETED') {
    throw new AppError('Quiz not released yet — complete the module first', 403, 'QUIZ_LOCKED');
  }
  if (quiz.status !== 'ACTIVE') {
    throw new AppError('Quiz is not active', 403, 'QUIZ_INACTIVE');
  }

  const poolRes = await db.query(
    `SELECT id, question_text, question_type, options, correct_answer, points
     FROM quiz_questions WHERE module_id = $1`,
    [quiz.module_id],
  );
  const pool = poolRes.rows as { id: string; question_text: string; question_type: string; options: string[] | null; correct_answer: string; points: number }[];
  if (!pool.length) throw new AppError('No questions in pool for this module', 422, 'EMPTY_POOL');

  const perAttempt = Math.min(quiz.questions_per_attempt as number, pool.length);
  const questionIds = quiz.randomize_questions
    ? pickRandomIds(pool.map((q) => q.id), perAttempt)
    : pool.slice(0, perAttempt).map((q) => q.id);

  const attemptCountRes = await db.query(
    `SELECT COUNT(*)::int AS cnt FROM quiz_attempts WHERE quiz_id = $1 AND student_id = $2`,
    [quizId, studentId],
  );
  const attemptNum = (attemptCountRes.rows[0].cnt as number) + 1;
  if (attemptNum > (quiz.max_attempts as number)) {
    throw new AppError('Maximum attempts reached', 403, 'MAX_ATTEMPTS');
  }

  const shuffledOptions: Record<string, string[]> = {};
  if (quiz.randomize_options) {
    for (const qid of questionIds) {
      const q = pool.find((p) => p.id === qid);
      if (q?.question_type === 'MCQ' && q.options?.length) {
        const opts = Array.isArray(q.options) ? q.options : JSON.parse(String(q.options));
        shuffledOptions[qid] = shuffleMcqOptions(opts).shuffled;
      }
    }
  }

  const { rows } = await db.query(
    `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_number, question_ids, shuffled_options)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id, attempt_number AS "attemptNumber", started_at AS "startedAt"`,
    [quizId, studentId, attemptNum, JSON.stringify(questionIds), JSON.stringify(shuffledOptions)],
  );

  const questions = questionIds.map((qid) => {
    const q = pool.find((p) => p.id === qid)!;
    const displayOptions = shuffledOptions[qid] ?? (Array.isArray(q.options) ? q.options : q.options ? JSON.parse(String(q.options)) : []);
    return {
      id: q.id,
      questionText: q.question_text,
      questionType: q.question_type,
      options: displayOptions,
      points: q.points,
    };
  });

  return { attempt: rows[0], questions, timeLimitMinutes: quiz.time_limit_minutes };
}

export async function submitAttempt(attemptId: string, answers: { questionId: string; selectedAnswer: string }[]) {
  const attRes = await db.query(
    `SELECT a.*, q.passing_score, q.module_id
     FROM quiz_attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.id = $1`,
    [attemptId],
  );
  if (!attRes.rows.length) throw new AppError('Attempt not found', 404, 'NOT_FOUND');
  const att = attRes.rows[0] as Record<string, unknown>;
  if (att.status !== 'IN_PROGRESS') throw new AppError('Attempt already submitted', 400, 'ALREADY_SUBMITTED');

  const questionIds = att.question_ids as string[];
  const poolRes = await db.query(
    `SELECT id, correct_answer, points, question_type FROM quiz_questions WHERE id = ANY($1::uuid[])`,
    [questionIds],
  );
  const poolMap = new Map(poolRes.rows.map((r) => [r.id as string, r]));

  let earned = 0;
  let total = 0;

  await db.transaction(async (tx) => {
    for (const ans of answers) {
      const q = poolMap.get(ans.questionId);
      if (!q) continue;
      total += q.points as number;
      const isCorrect = String(ans.selectedAnswer).trim().toLowerCase() ===
        String(q.correct_answer).trim().toLowerCase();
      const pts = isCorrect ? (q.points as number) : 0;
      earned += pts;
      await db.query(
        `INSERT INTO quiz_attempt_answers (attempt_id, question_id, selected_answer, is_correct, points_earned)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET selected_answer = $3, is_correct = $4, points_earned = $5`,
        [attemptId, ans.questionId, ans.selectedAnswer, isCorrect, pts],
        tx,
      );
    }
    const score = total > 0 ? Math.round((earned / total) * 100) : 0;
    await db.query(
      `UPDATE quiz_attempts SET status = 'SUBMITTED', submitted_at = NOW(),
              score = $2, total_points = $3, earned_points = $4
       WHERE id = $1`,
      [attemptId, score, total, earned],
      tx,
    );
  });

  const score = total > 0 ? Math.round((earned / total) * 100) : 0;
  return { score, earnedPoints: earned, totalPoints: total, passed: score >= (att.passing_score as number) };
}

export async function listAttempts(quizId?: string) {
  const params: unknown[] = [];
  let where = '';
  if (quizId) { where = 'WHERE a.quiz_id = $1'; params.push(quizId); }
  const { rows } = await db.query(
    `SELECT a.id, a.quiz_id AS "quizId", q.title AS "quizTitle",
            u.name AS "studentName", a.attempt_number AS "attemptNumber",
            a.score, a.status, a.started_at AS "startedAt", a.submitted_at AS "submittedAt",
            jsonb_array_length(a.question_ids) AS "questionCount"
     FROM quiz_attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     JOIN users u ON u.id = a.student_id
     ${where}
     ORDER BY a.submitted_at DESC NULLS LAST`,
    params,
  );
  return rows;
}

export async function previewRandomDraw(quizId: string) {
  const quizRes = await db.query('SELECT * FROM quizzes WHERE id = $1', [quizId]);
  if (!quizRes.rows.length) throw new AppError('Quiz not found', 404, 'NOT_FOUND');
  const quiz = quizRes.rows[0] as Record<string, unknown>;
  const poolRes = await db.query('SELECT id, question_text FROM quiz_questions WHERE module_id = $1', [quiz.module_id]);
  const pool = poolRes.rows as { id: string; question_text: string }[];
  const perAttempt = Math.min(quiz.questions_per_attempt as number, pool.length);
  const draws = Array.from({ length: 3 }, (_, i) => {
    const selectedIds = pickRandomIds(pool.map((q) => q.id), perAttempt);
    return {
      studentLabel: `Student ${i + 1}`,
      questionIds: selectedIds,
      questions: selectedIds.map((id) => {
        const q = pool.find((p) => p.id === id)!;
        return { id, text: q.question_text };
      }),
    };
  });
  return { poolSize: pool.length, questionsPerAttempt: perAttempt, draws };
}
