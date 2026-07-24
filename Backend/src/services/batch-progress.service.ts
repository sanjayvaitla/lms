import db from '../lib/db';
import type { DbTransaction } from '../lib/db';

export type ModuleProgressStatus = 'LOCKED' | 'RELEASED' | 'COMPLETED';

/** Create progress rows for every module on a batch+course (idempotent) */
export async function ensureBatchModuleProgress(
  batchId: string,
  courseId: string,
  tx?: DbTransaction,
) {
  await db.query(
    `INSERT INTO batch_module_progress (batch_id, module_id, status)
     SELECT $1, cm.id,
       CASE cm.status
         WHEN 'COMPLETED' THEN 'COMPLETED'
         WHEN 'RELEASED'  THEN 'RELEASED'
         ELSE CASE WHEN cm.sort_order = 0 THEN 'RELEASED' ELSE 'LOCKED' END
       END
     FROM course_modules cm
     WHERE cm.course_id = $2
     ON CONFLICT (batch_id, module_id) DO NOTHING`,
    [batchId, courseId],
    tx,
  );
}

export async function ensureAllBatchModuleProgress(batchId: string, tx?: DbTransaction) {
  const { rows } = await db.query<{ course_id: string }>(
    'SELECT course_id FROM batch_courses WHERE batch_id = $1',
    [batchId],
    tx,
  );
  for (const r of rows) {
    await ensureBatchModuleProgress(batchId, r.course_id, tx);
  }
}

/** After syllabus adds modules, attach them to every batch running this course */
export async function syncBatchProgressForCourse(courseId: string) {
  const { rows } = await db.query<{ batch_id: string }>(
    'SELECT batch_id FROM batch_courses WHERE course_id = $1',
    [courseId],
  );
  for (const r of rows) {
    await ensureBatchModuleProgress(r.batch_id, courseId);
  }
}

export async function getBatchModuleStatus(
  batchId: string,
  moduleId: string,
): Promise<ModuleProgressStatus | null> {
  const { rows } = await db.query<{ status: ModuleProgressStatus }>(
    'SELECT status FROM batch_module_progress WHERE batch_id = $1 AND module_id = $2',
    [batchId, moduleId],
  );
  return rows[0]?.status ?? null;
}

/** Per-course completion % for one enrollment */
export async function getCourseCompletionPct(
  batchId: string,
  courseId: string,
): Promise<number> {
  const { rows } = await db.query<{ pct: number }>(
    `SELECT ROUND(
       COALESCE(
         COUNT(*) FILTER (WHERE bmp.status = 'COMPLETED')::numeric * 100.0
         / NULLIF(COUNT(*), 0),
         0
       )
     )::int AS pct
     FROM course_modules cm
     LEFT JOIN batch_module_progress bmp
       ON bmp.module_id = cm.id AND bmp.batch_id = $1
     WHERE cm.course_id = $2`,
    [batchId, courseId],
  );
  return rows[0]?.pct ?? 0;
}

/** Average completion across all courses in a batch — stored on enrollments.completion_pct */
export async function recalculateEnrollmentCompletion(batchId: string) {
  await db.query(
    `UPDATE enrollments e
     SET completion_pct = COALESCE((
       SELECT ROUND(AVG(course_pct))::int
       FROM (
         SELECT ROUND(
           COALESCE(
             COUNT(*) FILTER (WHERE bmp.status = 'COMPLETED')::numeric * 100.0
             / NULLIF(COUNT(*), 0),
             0
           )
         )::int AS course_pct
         FROM batch_courses bc
         JOIN course_modules cm ON cm.course_id = bc.course_id
         LEFT JOIN batch_module_progress bmp
           ON bmp.batch_id = bc.batch_id AND bmp.module_id = cm.id
         WHERE bc.batch_id = e.batch_id
         GROUP BY bc.course_id
       ) sub
     ), 0)
     WHERE e.batch_id = $1`,
    [batchId],
  );
}
