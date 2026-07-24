import db from './db';
import {
  invalidateCached,
  contentMasterCourseCacheKey,
  contentMasterBatchCacheKey,
} from './redis';

export async function invalidateContentMasterCourse(courseId: string): Promise<void> {
  await invalidateCached(contentMasterCourseCacheKey(courseId));
}

export async function invalidateContentMasterBatch(batchId: string): Promise<void> {
  await invalidateCached(contentMasterBatchCacheKey(batchId));
}

/** Course cache + every batch running that course (after course-level upload) */
export async function invalidateContentMasterForCourse(courseId: string): Promise<void> {
  await invalidateContentMasterCourse(courseId);
  const { rows } = await db.query<{ batch_id: string }>(
    'SELECT DISTINCT batch_id FROM batch_courses WHERE course_id = $1',
    [courseId],
  );
  await Promise.all(rows.map((r) => invalidateContentMasterBatch(r.batch_id)));
}

export async function invalidateContentMasterByModuleId(moduleId: string): Promise<void> {
  const { rows } = await db.query<{ course_id: string }>(
    'SELECT course_id FROM course_modules WHERE id = $1',
    [moduleId],
  );
  const courseId = rows[0]?.course_id;
  if (courseId) await invalidateContentMasterForCourse(courseId);
}

export async function invalidateContentMasterByReferenceId(refId: string): Promise<void> {
  const { rows } = await db.query<{ course_id: string }>(
    `SELECT cm.course_id
     FROM session_references sr
     JOIN course_modules cm ON cm.id = sr.module_id
     WHERE sr.id = $1`,
    [refId],
  );
  const courseId = rows[0]?.course_id;
  if (courseId) await invalidateContentMasterForCourse(courseId);
}

export async function invalidateContentMasterByArtifactId(artId: string): Promise<void> {
  const { rows } = await db.query<{ course_id: string }>(
    `SELECT cm.course_id
     FROM session_artifacts sa
     JOIN course_modules cm ON cm.id = sa.module_id
     WHERE sa.id = $1`,
    [artId],
  );
  const courseId = rows[0]?.course_id;
  if (courseId) await invalidateContentMasterForCourse(courseId);
}
