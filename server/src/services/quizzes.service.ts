import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { extractTextFromFile } from '../lib/fileExtract';
import { pickRandomIds, shuffle, shuffleMcqOptions } from '../lib/quizRandomize';
import { storageAdapter } from '../lib/storage';
import type { CreateQuestionInput, CreateQuizInput } from '../validators/quiz.validator';

// ── Auto-number helper ────────────────────────────────────────────────────────
async function nextQuizTitle(courseId: string): Promise<string> {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS cnt FROM quizzes WHERE course_id = $1',
    [courseId],
  );
  return `Quiz ${(rows[0].cnt as number) + 1}`;
}

// ── CSV helper ────────────────────────────────────────────────────────────────
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

// ── Dashboard stats ───────────────────────────────────────────────────────────
export async function getQuizDashboard() {
  const [mods, qs, quizzes, attempts] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS cnt FROM course_modules'),
    db.query('SELECT COUNT(*)::int AS cnt FROM quiz_questions'),
    db.query("SELECT COUNT(*)::int AS cnt FROM quizzes WHERE status != 'ARCHIVED'"),
    db.query("SELECT COUNT(*)::int AS cnt FROM quiz_attempts WHERE status = 'SUBMITTED'"),
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
  const stored = await storageAdapter.upload(file, 'datasets');

  const { rows } = await db.query(
    `INSERT INTO quiz_datasets
       (course_id, title, filename, file_type, content_text, file_path, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, course_id AS "courseId", title, filename,
               file_type AS "fileType", content_text AS "contentText",
               file_path AS "filePath", created_at AS "createdAt"`,
    [courseId, title, file.originalname, fileType, contentText, stored.key, uploadedBy],
  );
  return rows[0];
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
  return rows[0];
}

export async function deleteDataset(id: string) {
  const { rows } = await db.query('SELECT file_path FROM quiz_datasets WHERE id = $1', [id]);
  if (!rows.length) throw new AppError('Dataset not found', 404, 'NOT_FOUND');
  const fp = rows[0].file_path as string | null;
  await db.query('DELETE FROM quiz_datasets WHERE id = $1', [id]);
  if (fp) await storageAdapter.delete(fp);
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

// ── Quizzes ───────────────────────────────────────────────────────────────────
export async function listQuizzes(filters: { courseId?: string; releasedOnly?: boolean }) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (filters.courseId)    { clauses.push(`q.course_id = $${i++}`); params.push(filters.courseId); }
  if (filters.releasedOnly){ clauses.push(`m.status = 'COMPLETED'`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const { rows } = await db.query(
    `SELECT q.id, q.course_id AS "courseId", c.title AS "courseTitle",
            q.module_id AS "moduleId", m.title AS "moduleTitle", m.status AS "moduleStatus",
            m.sort_order AS "moduleOrder", q.title, q.description,
            q.questions_per_attempt AS "questionsPerAttempt",
            q.time_limit_minutes AS "timeLimitMinutes", q.passing_score AS "passingScore",
            q.randomize_questions AS "randomizeQuestions",
            q.randomize_options AS "randomizeOptions",
            q.max_attempts AS "maxAttempts", q.status,
            (SELECT COUNT(*)::int FROM quiz_questions qq
             WHERE qq.module_id = q.module_id) AS "poolSize",
            q.created_at AS "createdAt"
     FROM quizzes q
     JOIN courses c ON c.id = q.course_id
     JOIN course_modules m ON m.id = q.module_id
     ${where}
     ORDER BY m.sort_order, q.created_at`,
    params,
  );
  return rows;
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

  const { rows } = await db.query(
    `INSERT INTO quizzes
       (course_id, module_id, title, description, questions_per_attempt,
        time_limit_minutes, passing_score, randomize_questions, randomize_options,
        max_attempts, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, module_id AS "moduleId", title, status`,
    [
      input.courseId, input.moduleId, title, input.description ?? null,
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
    title: 'title', description: 'description',
    questionsPerAttempt: 'questions_per_attempt',
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
  if (!fields.length) throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
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

// ── Attempts ──────────────────────────────────────────────────────────────────
export async function startAttempt(quizId: string, studentId: string) {
  const quizRes = await db.query(
    `SELECT q.id, q.questions_per_attempt AS "questionsPerAttempt",
            q.max_attempts AS "maxAttempts",
            q.randomize_questions AS "randomizeQuestions",
            q.randomize_options AS "randomizeOptions",
            q.time_limit_minutes AS "timeLimitMinutes",
            q.passing_score AS "passingScore",
            q.status
     FROM quizzes q WHERE q.id = $1`,
    [quizId],
  );
  if (!quizRes.rows.length) throw new AppError('Quiz not found', 404, 'NOT_FOUND');
  const quiz = quizRes.rows[0] as {
    id: string; questionsPerAttempt: number; maxAttempts: number;
    randomizeQuestions: boolean; randomizeOptions: boolean;
    timeLimitMinutes: number | null; passingScore: number; status: string;
  };

  if (quiz.status !== 'ACTIVE') throw new AppError('Quiz is not active', 403, 'FORBIDDEN');

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

  const qRes = await db.query(
    `SELECT id, question_text AS "questionText", question_type AS "questionType",
            options, correct_answer AS "correctAnswer", points, difficulty, explanation
     FROM quiz_questions
     WHERE module_id = (SELECT module_id FROM quizzes WHERE id = $1)`,
    [quizId],
  );

  const allQs = qRes.rows as Array<{
    id: string; questionText: string; questionType: string;
    options: string[] | null; correctAnswer: string;
    points: number; difficulty: string; explanation: string | null;
  }>;

  const selected = pickRandomIds(
    allQs.map((q) => q.id),
    Math.min(quiz.questionsPerAttempt, allQs.length),
    quiz.randomizeQuestions,
  );
  const selectedQs = selected.map((sid) => allQs.find((q) => q.id === sid)!);

  const { rows: attemptRows } = await db.query(
    `INSERT INTO quiz_attempts (quiz_id, student_id, attempt_number)
     VALUES ($1, $2, $3) RETURNING id`,
    [quizId, studentId, attemptNumber],
  );
  const attemptId = attemptRows[0].id as string;

  const questions = selectedQs.map((q) => ({
    id:           q.id,
    questionText: q.questionText,
    questionType: q.questionType,
    points:       q.points,
    difficulty:   q.difficulty,
    options: quiz.randomizeOptions && q.options
      ? shuffleMcqOptions(q.options as string[])
      : q.options,
  }));

  return {
    attemptId,
    attemptNumber,
    timeLimitMinutes: quiz.timeLimitMinutes,
    passingScore:     quiz.passingScore,
    questions,
  };
}

export async function submitAttempt(
  attemptId: string,
  answers: { questionId: string; selectedAnswer: string }[],
) {
  const attemptRes = await db.query(
    `SELECT a.id, a.quiz_id AS "quizId", q.passing_score AS "passingScore"
     FROM quiz_attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     WHERE a.id = $1 AND a.status = 'IN_PROGRESS'`,
    [attemptId],
  );
  if (!attemptRes.rows.length) {
    throw new AppError('Attempt not found or already submitted', 404, 'NOT_FOUND');
  }
  const attempt = attemptRes.rows[0] as { id: string; quizId: string; passingScore: number };

  let totalPoints = 0;
  let earnedPoints = 0;

  for (const ans of answers) {
    const qRes = await db.query(
      'SELECT correct_answer AS "correctAnswer", points FROM quiz_questions WHERE id = $1',
      [ans.questionId],
    );
    if (!qRes.rows.length) continue;
    const q = qRes.rows[0] as { correctAnswer: string; points: number };
    const correct = ans.selectedAnswer.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
    const awarded = correct ? q.points : 0;
    totalPoints  += q.points;
    earnedPoints += awarded;

    await db.query(
      `INSERT INTO quiz_attempt_answers
         (attempt_id, question_id, selected_answer, is_correct, points_awarded)
       VALUES ($1,$2,$3,$4,$5)`,
      [attemptId, ans.questionId, ans.selectedAnswer, correct, awarded],
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

  return { attemptId, score, passed, earnedPoints, totalPoints };
}

export async function listAttempts(quizId?: string) {
  const params: unknown[] = [];
  const where = quizId ? 'WHERE a.quiz_id = $1' : '';
  if (quizId) params.push(quizId);
  const { rows } = await db.query(
    `SELECT a.id, a.quiz_id AS "quizId", q.title AS "quizTitle",
            a.student_id AS "studentId", u.name AS "studentName",
            a.attempt_number AS "attemptNumber", a.score, a.passed,
            a.status, a.started_at AS "startedAt", a.submitted_at AS "submittedAt"
     FROM quiz_attempts a
     JOIN quizzes q ON q.id = a.quiz_id
     JOIN users u ON u.id = a.student_id
     ${where}
     ORDER BY a.started_at DESC`,
    params,
  );
  return rows;
}

// ── Preview (trainer view) ────────────────────────────────────────────────────
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

// ── CSV Import ────────────────────────────────────────────────────────────────
export interface CsvImportSettings {
  title: string;
  questionsPerAttempt: number;
  timeLimitMinutes: number | null;
  passingScore: number;
  maxAttempts: number;
  status: string;
}

export async function importQuizFromCsv(
  courseId: string,
  moduleId: string,
  createdBy: string,
  file: { buffer: Buffer; originalname: string; mimetype: string },
  userSettings?: Partial<CsvImportSettings>
) {
  const mod = await db.query(
    'SELECT id FROM course_modules WHERE id = $1 AND course_id = $2',
    [moduleId, courseId],
  );
  if (!mod.rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');

  const csvText = file.buffer.toString('utf-8');
  const lines   = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new AppError('CSV must have a header row and at least one question', 400, 'INVALID_CSV');
  }

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase().trim());
  const col = (name: string) => {
    const idx = header.indexOf(name);
    if (idx === -1) throw new AppError(`CSV missing required column: "${name}"`, 400, 'INVALID_CSV');
    return idx;
  };

  const qCol   = col('question');
  const aCol   = col('optiona');
  const bCol   = col('optionb');
  const cCol   = col('optionc');
  const dCol   = col('optiond');
  const ansCol = col('correct_answer');
  const ptCol  = header.indexOf('points');

  interface ParsedQuestion {
    questionText: string;
    options: string[];
    correctAnswer: string;
    points: number;
  }
  const parsed: ParsedQuestion[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const questionText = (cols[qCol] ?? '').trim();
    if (!questionText) continue;
    const options = [
      (cols[aCol] ?? '').trim(),
      (cols[bCol] ?? '').trim(),
      (cols[cCol] ?? '').trim(),
      (cols[dCol] ?? '').trim(),
    ].filter(Boolean);
    const correctAnswer = (cols[ansCol] ?? '').trim();
    const points        = ptCol >= 0 ? parseInt(cols[ptCol] ?? '1', 10) || 1 : 1;
    if (options.length < 2 || !correctAnswer) continue;
    parsed.push({ questionText, options, correctAnswer, points });
  }

  if (!parsed.length) throw new AppError('No valid questions found in CSV', 400, 'INVALID_CSV');

  const settings: CsvImportSettings = {
    title:               userSettings?.title ?? '',
    questionsPerAttempt: userSettings?.questionsPerAttempt ?? Math.min(10, parsed.length),
    timeLimitMinutes:    userSettings?.timeLimitMinutes ?? null,
    passingScore:        userSettings?.passingScore ?? 70,
    maxAttempts:         userSettings?.maxAttempts ?? 3,
    status:              userSettings?.status ?? 'DRAFT',
  };

  // Auto-number: always name by sequence per course
  const quizTitle = await nextQuizTitle(courseId);

  const existing = await db.query('SELECT id FROM quizzes WHERE module_id = $1', [moduleId]);
  let quizId: string;

  if (existing.rowCount && existing.rowCount > 0) {
    const upd = await db.query(
      `UPDATE quizzes
       SET title = $2, questions_per_attempt = $3, time_limit_minutes = $4,
           passing_score = $5, max_attempts = $6, status = $7
       WHERE module_id = $1
       RETURNING id`,
      [moduleId, quizTitle, settings.questionsPerAttempt, settings.timeLimitMinutes,
       settings.passingScore, settings.maxAttempts, settings.status],
    );
    quizId = upd.rows[0].id as string;
    await db.query('DELETE FROM quiz_questions WHERE module_id = $1', [moduleId]);
  } else {
    const ins = await db.query(
      `INSERT INTO quizzes
         (course_id, module_id, title, questions_per_attempt, time_limit_minutes,
          passing_score, randomize_questions, randomize_options, max_attempts, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,true,true,$7,$8,$9)
       RETURNING id`,
      [courseId, moduleId, quizTitle, settings.questionsPerAttempt,
       settings.timeLimitMinutes, settings.passingScore,
       settings.maxAttempts, settings.status, createdBy],
    );
    quizId = ins.rows[0].id as string;
  }

  for (const q of parsed) {
    await db.query(
      `INSERT INTO quiz_questions
         (course_id, module_id, question_text, question_type,
          options, correct_answer, points, difficulty)
       VALUES ($1,$2,$3,'MCQ',$4,$5,$6,'MEDIUM')`,
      [courseId, moduleId, q.questionText,
       JSON.stringify(q.options), q.correctAnswer, q.points],
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
    title:             quiz.rows[0]?.title ?? '',
    questionsImported: parsed.length,
    moduleTitle:       quiz.rows[0]?.moduleTitle ?? '',
  };
}
