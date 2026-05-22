import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import type { CreateModuleInput, UpdateModuleInput } from '../validators/module.validator';

export async function listModules(courseId: string) {
  const { rows } = await db.query(
    `SELECT m.id, m.course_id AS "courseId", m.title, m.description,
            m.sort_order AS "sortOrder", m.status,
            m.completed_at AS "completedAt",
            u.name AS "completedByName",
            q.id AS "quizId", q.title AS "quizTitle", q.status AS "quizStatus",
            (SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.module_id = m.id) AS "questionCount"
     FROM course_modules m
     LEFT JOIN users u ON u.id = m.completed_by
     LEFT JOIN quizzes q ON q.module_id = m.id
     WHERE m.course_id = $1
     ORDER BY m.sort_order ASC, m.created_at ASC`,
    [courseId],
  );
  return rows;
}

export async function createModule(courseId: string, input: CreateModuleInput) {
  const course = await db.query('SELECT id FROM courses WHERE id = $1', [courseId]);
  if (!course.rowCount) throw new AppError('Course not found', 404, 'NOT_FOUND');

  const maxRes = await db.query(
    'SELECT COALESCE(MAX(sort_order), -1)::int AS mx FROM course_modules WHERE course_id = $1',
    [courseId],
  );
  const sortOrder = input.sortOrder ?? (maxRes.rows[0].mx as number) + 1;
  const status = sortOrder === 0 ? 'RELEASED' : 'LOCKED';

  const { rows } = await db.query(
    `INSERT INTO course_modules (course_id, title, description, sort_order, status)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, course_id AS "courseId", title, description, sort_order AS "sortOrder", status`,
    [courseId, input.title, input.description ?? null, sortOrder, status],
  );
  return rows[0];
}

export async function updateModule(moduleId: string, input: UpdateModuleInput) {
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (input.title !== undefined) { fields.push(`title = $${i++}`); params.push(input.title); }
  if (input.description !== undefined) { fields.push(`description = $${i++}`); params.push(input.description); }
  if (input.sortOrder !== undefined) { fields.push(`sort_order = $${i++}`); params.push(input.sortOrder); }
  if (!fields.length) throw new AppError('No fields to update', 400, 'VALIDATION_ERROR');
  params.push(moduleId);
  const { rows } = await db.query(
    `UPDATE course_modules SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, course_id AS "courseId", title, description, sort_order AS "sortOrder", status`,
    params,
  );
  if (!rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');
  return rows[0];
}

/** Trainer marks module complete → unlocks quiz for that module; releases next module */
export async function completeModule(moduleId: string, userId: string) {
  const modRes = await db.query(
    `SELECT id, course_id, sort_order, status FROM course_modules WHERE id = $1`,
    [moduleId],
  );
  if (!modRes.rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');
  const mod = modRes.rows[0] as { id: string; course_id: string; sort_order: number; status: string };

  if (mod.status === 'COMPLETED') {
    throw new AppError('Module already completed', 400, 'ALREADY_COMPLETED');
  }
  if (mod.status === 'LOCKED') {
    throw new AppError('Complete previous modules first', 400, 'MODULE_LOCKED');
  }

  await db.transaction(async (tx) => {
    await db.query(
      `UPDATE course_modules SET status = 'COMPLETED', completed_at = NOW(), completed_by = $2
       WHERE id = $1`,
      [moduleId, userId],
      tx,
    );

    await db.query(
      `UPDATE quizzes SET status = 'ACTIVE'
       WHERE module_id = $1 AND status = 'DRAFT'`,
      [moduleId],
      tx,
    );

    await db.query(
      `UPDATE course_modules SET status = 'RELEASED'
       WHERE course_id = $1 AND sort_order = $2 AND status = 'LOCKED'`,
      [mod.course_id, mod.sort_order + 1],
      tx,
    );
  });

  return listModules(mod.course_id);
}

export async function deleteModule(moduleId: string) {
  const res = await db.query('DELETE FROM course_modules WHERE id = $1 RETURNING id', [moduleId]);
  if (!res.rowCount) throw new AppError('Module not found', 404, 'NOT_FOUND');
}
