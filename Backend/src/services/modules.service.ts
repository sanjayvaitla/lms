import {
  notifyAssignmentsReleased,
  notifyQuizzesReleased,
  notifySessionCompleted,
} from './session-notifications.service';
import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import type { CreateModuleInput, UpdateModuleInput, CreateSubSessionInput } from '../validators/module.validator';
import {
  ensureBatchModuleProgress,
  getBatchModuleStatus,
  recalculateEnrollmentCompletion,
  syncBatchProgressForCourse,
} from './batch-progress.service';
import { syncCourseContentToBatch, markModuleContentReleasedForBatch, unreleaseModuleContentForBatch } from './batches.service';

export async function listModules(courseId: string) {
  const { rows } = await db.query(
    `SELECT m.id, m.course_id AS "courseId", m.title, m.description,
            m.sort_order AS "sortOrder", m.status,
            m.completed_at AS "completedAt",
            m.section, m.session_number AS "sessionNumber",
            m.duration_minutes AS "durationMinutes", m.topics,
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

/** Admin batch view: modules with per-batch progress status */
export async function listModulesForBatch(batchId: string, courseId: string) {
  await ensureBatchModuleProgress(batchId, courseId);
  const { rows } = await db.query(
    `SELECT m.id, m.course_id AS "courseId", m.title, m.description,
            m.sort_order AS "sortOrder",
            COALESCE(bmp.status, m.status) AS status,
            bmp.completed_at AS "completedAt",
            m.section, m.session_number AS "sessionNumber",
            m.duration_minutes AS "durationMinutes", m.topics,
            u.name AS "completedByName",
            q.id AS "quizId", q.title AS "quizTitle", q.status AS "quizStatus",
            (SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.module_id = m.id) AS "questionCount"
     FROM course_modules m
     LEFT JOIN batch_module_progress bmp ON bmp.module_id = m.id AND bmp.batch_id = $1
     LEFT JOIN users u ON u.id = bmp.completed_by
     LEFT JOIN quizzes q ON q.module_id = m.id
     WHERE m.course_id = $2
     ORDER BY m.sort_order ASC, m.created_at ASC`,
    [batchId, courseId],
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

  await syncBatchProgressForCourse(courseId);
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

function requireBatchId(batchId?: string): string {
  if (!batchId) {
    throw new AppError(
      'batchId is required — use Content Master → By Batch to manage session progress',
      400,
      'VALIDATION_ERROR',
    );
  }
  return batchId;
}

/** Mark session Done for a specific batch — releases PDF assignments + quizzes for that batch */
export async function completeModule(moduleId: string, userId: string, batchId?: string) {
  const bid = requireBatchId(batchId);

  const modRes = await db.query(
    `SELECT id, course_id, sort_order, title, session_number, section
     FROM course_modules WHERE id = $1`,
    [moduleId],
  );
  if (!modRes.rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');
  const mod = modRes.rows[0] as {
    id: string; course_id: string; sort_order: number;
    title: string; session_number: string | null; section: string | null;
  };

  await ensureBatchModuleProgress(bid, mod.course_id);
  const currentStatus = await getBatchModuleStatus(bid, moduleId);

  if (currentStatus === 'COMPLETED') {
    throw new AppError('Module already completed for this batch', 400, 'ALREADY_COMPLETED');
  }
  if (currentStatus === 'LOCKED') {
    throw new AppError('Release this session first, or complete previous sessions', 400, 'MODULE_LOCKED');
  }

  // Course↔batch packages all course content onto this batch (status stays DRAFT until here)
  await syncCourseContentToBatch(bid, mod.course_id);

  // Release this session's drafts that belong to the course (now mapped to this batch)
  const { rows: draftAssignments } = await db.query<{ id: string }>(
    `SELECT a.id FROM assignments a
     WHERE a.module_id = $1 AND a.status = 'DRAFT' AND a.pdf_path IS DISTINCT FROM 'git-task'
       AND EXISTS (
         SELECT 1 FROM assignment_batches ab
         WHERE ab.assignment_id = a.id AND ab.batch_id = $2
       )`,
    [moduleId, bid],
  );
  const { rows: draftQuizzes } = await db.query<{ id: string }>(
    `SELECT q.id FROM quizzes q
     WHERE q.module_id = $1 AND q.status = 'DRAFT'
       AND EXISTS (
         SELECT 1 FROM quiz_batches qb
         WHERE qb.quiz_id = q.id AND qb.batch_id = $2
       )`,
    [moduleId, bid],
  );
  // Also include already-published items that just need per-batch release
  const { rows: allAsg } = await db.query<{ id: string }>(
    `SELECT a.id FROM assignments a
     WHERE a.module_id = $1 AND a.pdf_path IS DISTINCT FROM 'git-task'
       AND EXISTS (
         SELECT 1 FROM assignment_batches ab
         WHERE ab.assignment_id = a.id AND ab.batch_id = $2
       )`,
    [moduleId, bid],
  );
  const { rows: allQuiz } = await db.query<{ id: string }>(
    `SELECT q.id FROM quizzes q
     WHERE q.module_id = $1
       AND EXISTS (
         SELECT 1 FROM quiz_batches qb
         WHERE qb.quiz_id = q.id AND qb.batch_id = $2
       )`,
    [moduleId, bid],
  );
  const releasedAssignmentIds = draftAssignments.map((r) => r.id);
  const releasedQuizIds = draftQuizzes.map((r) => r.id);

  await db.transaction(async (tx) => {
    await db.query(
      `UPDATE batch_module_progress
       SET status = 'COMPLETED', completed_at = NOW(), completed_by = $3
       WHERE batch_id = $1 AND module_id = $2`,
      [bid, moduleId, userId],
      tx,
    );

    await db.query(
      `UPDATE batch_module_progress bmp
       SET status = 'RELEASED'
       FROM course_modules cm_cur
       JOIN course_modules cm_next ON cm_next.course_id = cm_cur.course_id
         AND cm_next.sort_order = cm_cur.sort_order + 1
       WHERE bmp.batch_id = $1
         AND bmp.module_id = cm_next.id
         AND cm_cur.id = $2
         AND bmp.status = 'LOCKED'`,
      [bid, moduleId],
      tx,
    );

    await markModuleContentReleasedForBatch(bid, moduleId, tx);

    if (releasedAssignmentIds.length) {
      await db.query(
        `UPDATE assignments SET status = 'PUBLISHED', updated_at = NOW()
         WHERE id = ANY($1::uuid[]) AND status = 'DRAFT'`,
        [releasedAssignmentIds],
        tx,
      );
    }
    if (releasedQuizIds.length) {
      await db.query(
        `UPDATE quizzes SET status = 'ACTIVE', updated_at = NOW()
         WHERE id = ANY($1::uuid[]) AND status = 'DRAFT'`,
        [releasedQuizIds],
        tx,
      );
    }
  });

  await recalculateEnrollmentCompletion(bid);

  setImmediate(() => {
    notifySessionCompleted(moduleId, bid).catch(console.error);
    if (allAsg.length) {
      notifyAssignmentsReleased(allAsg.map((r) => r.id)).catch(console.error);
    }
    if (allQuiz.length) {
      notifyQuizzesReleased(moduleId, allQuiz.map((r) => r.id), bid).catch(console.error);
    }
  });

  const modules = await listModulesForBatch(bid, mod.course_id);
  return { modules, releasedAssignmentIds, releasedQuizIds };
}

export async function releaseModule(moduleId: string, batchId?: string) {
  const bid = requireBatchId(batchId);

  const modRes = await db.query<{ course_id: string }>(
    'SELECT course_id FROM course_modules WHERE id = $1',
    [moduleId],
  );
  if (!modRes.rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');
  await ensureBatchModuleProgress(bid, modRes.rows[0].course_id);

  let mod;
  await db.transaction(async (tx) => {
    const { rows } = await db.query(
      `UPDATE batch_module_progress SET status = 'RELEASED', completed_at = NULL, completed_by = NULL
       WHERE batch_id = $1 AND module_id = $2 AND status != 'COMPLETED'
       RETURNING module_id AS id`,
      [bid, moduleId],
      tx,
    );
    if (!rows.length) throw new AppError('Module not found or already completed', 404, 'NOT_FOUND');

    const cm = await db.query(
      `SELECT id, course_id AS "courseId", title FROM course_modules WHERE id = $1`,
      [moduleId],
      tx,
    );
    mod = { ...cm.rows[0], status: 'RELEASED' };
  });
  return mod;
}

export async function lockModule(moduleId: string, batchId?: string) {
  const bid = requireBatchId(batchId);

  const modRes = await db.query<{ course_id: string }>(
    'SELECT course_id FROM course_modules WHERE id = $1',
    [moduleId],
  );
  if (!modRes.rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');
  await ensureBatchModuleProgress(bid, modRes.rows[0].course_id);

  let mod;
  await db.transaction(async (tx) => {
    const { rows } = await db.query(
      `UPDATE batch_module_progress SET status = 'LOCKED'
       WHERE batch_id = $1 AND module_id = $2 AND status != 'COMPLETED'
       RETURNING module_id AS id`,
      [bid, moduleId],
      tx,
    );
    if (!rows.length) throw new AppError('Module not found or already completed', 404, 'NOT_FOUND');

    const cm = await db.query(
      `SELECT id, course_id AS "courseId", title FROM course_modules WHERE id = $1`,
      [moduleId],
      tx,
    );
    mod = { ...cm.rows[0], status: 'LOCKED' };
  });
  return mod;
}

export async function uncompleteModule(moduleId: string, batchId?: string) {
  const bid = requireBatchId(batchId);

  const modRes = await db.query<{ course_id: string }>(
    'SELECT course_id FROM course_modules WHERE id = $1',
    [moduleId],
  );
  if (!modRes.rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');
  const courseId = modRes.rows[0].course_id;

  await ensureBatchModuleProgress(bid, courseId);
  const status = await getBatchModuleStatus(bid, moduleId);
  if (status !== 'COMPLETED') {
    throw new AppError('Module is not completed for this batch', 400, 'NOT_COMPLETED');
  }

  await db.query(
    `UPDATE batch_module_progress
     SET status = 'RELEASED', completed_at = NULL, completed_by = NULL
     WHERE batch_id = $1 AND module_id = $2`,
    [bid, moduleId],
  );

  await unreleaseModuleContentForBatch(bid, moduleId);

  // Only revert global status if no other batch still has this content released
  await db.query(
    `UPDATE assignments SET status = 'DRAFT', updated_at = NOW()
     WHERE module_id = $1 AND status = 'PUBLISHED' AND pdf_path IS DISTINCT FROM 'git-task'
       AND NOT EXISTS (
         SELECT 1 FROM assignment_batches ab
         WHERE ab.assignment_id = assignments.id AND ab.released = TRUE
       )`,
    [moduleId],
  );
  await db.query(
    `UPDATE quizzes SET status = 'DRAFT', updated_at = NOW()
     WHERE module_id = $1 AND status = 'ACTIVE'
       AND NOT EXISTS (
         SELECT 1 FROM quiz_batches qb
         WHERE qb.quiz_id = quizzes.id AND qb.released = TRUE
       )`,
    [moduleId],
  );

  await recalculateEnrollmentCompletion(bid);
  return listModulesForBatch(bid, courseId);
}

export async function deleteModule(moduleId: string) {
  const { rows } = await db.query<{ id: string; session_number: string | null; course_id: string }>(
    `SELECT id, session_number, course_id FROM course_modules WHERE id = $1`,
    [moduleId],
  );
  if (!rows.length) throw new AppError('Module not found', 404, 'NOT_FOUND');
  const sn = rows[0].session_number ?? '';
  if (!sn.includes('.')) {
    throw new AppError(
      'Only sub-sessions (e.g. 1.1) can be deleted. Syllabus sessions must be removed via syllabus sync.',
      400,
      'PARENT_DELETE_FORBIDDEN',
    );
  }
  const courseId = rows[0].course_id;
  const res = await db.query('DELETE FROM course_modules WHERE id = $1 RETURNING id', [moduleId]);
  if (!res.rowCount) throw new AppError('Module not found', 404, 'NOT_FOUND');
  await syncBatchProgressForCourse(courseId);
}

export async function createSubSession(courseId: string, input: CreateSubSessionInput) {
  const parent = await db.query<{
    id: string; section: string | null; sort_order: number; session_number: string | null;
  }>(
    `SELECT id, section, sort_order, session_number FROM course_modules WHERE id = $1 AND course_id = $2`,
    [input.afterModuleId, courseId],
  );
  if (!parent.rows.length) throw new AppError('Parent session not found', 404, 'NOT_FOUND');
  const p = parent.rows[0];

  const parentNum = p.session_number ?? '';
  if (!parentNum) {
    throw new AppError('Parent session has no session number', 400, 'INVALID_PARENT');
  }
  const expectedPrefix = `${parentNum}.`;
  if (!input.sessionNumber.startsWith(expectedPrefix)) {
    throw new AppError(
      `Sub-session number must start with ${expectedPrefix} (got ${input.sessionNumber})`,
      400,
      'INVALID_SUB_SESSION',
    );
  }

  const section = input.section ?? p.section ?? 'General';
  const newSortOrder = p.sort_order + 1;

  await db.transaction(async (tx) => {
    await db.query(
      `UPDATE course_modules SET sort_order = sort_order + 1
       WHERE course_id = $1 AND sort_order >= $2`,
      [courseId, newSortOrder],
      tx,
    );
    await db.query(
      `INSERT INTO course_modules
         (course_id, title, description, sort_order, status, section, session_number,
          duration_minutes, topics)
       VALUES ($1, $2, $3, $4, 'LOCKED', $5, $6, $7, $8)`,
      [
        courseId,
        input.title,
        input.description ?? null,
        newSortOrder,
        section,
        input.sessionNumber,
        input.durationMinutes ?? null,
        JSON.stringify(input.topics ?? []),
      ],
      tx,
    );
  });

  await syncBatchProgressForCourse(courseId);
  return listModules(courseId);
}
