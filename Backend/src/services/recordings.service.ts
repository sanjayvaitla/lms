/**
 * recordings.service.ts
 *
 * Handles:
 *  - Section schedules (one start/end time per section per batch)
 *  - Session recordings via YouTube URLs (private / unlisted links)
 *
 * Bunny Stream removed. Videos are linked as plain YouTube URLs.
 * available_from = recorded_date + end_time + 4 hours.
 */

import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SectionSchedule {
  id:            string;
  batchId:       string;
  section:       string;
  startTime:     string;
  endTime:       string;
  classDays:     string | null;
  notes:         string | null;
  updatedAt:     string;
  updatedByName: string | null;
}

export interface SessionRecording {
  id:            string;
  moduleId:      string;
  batchId:       string | null;
  title:         string;
  youtubeUrl:    string | null;
  recordedDate:  string | null;
  availableFrom: string | null;
  createdAt:     string;
  moduleTitle?:  string;
  section?:      string;
  sessionNumber?: string;
  batchName?:    string | null;
}

// ── Section Schedules ─────────────────────────────────────────────────────────

export async function getSectionSchedules(batchId: string): Promise<SectionSchedule[]> {
  const { rows } = await db.query(
    `SELECT ss.id, ss.batch_id AS "batchId", ss.section,
            ss.start_time AS "startTime", ss.end_time AS "endTime",
            ss.class_days AS "classDays", ss.notes,
            ss.updated_at AS "updatedAt",
            u.name AS "updatedByName"
     FROM section_schedules ss
     LEFT JOIN users u ON u.id = ss.updated_by
     WHERE ss.batch_id = $1
     ORDER BY ss.section ASC`,
    [batchId],
  );
  return rows as SectionSchedule[];
}

export async function upsertSectionSchedule(
  batchId: string,
  section: string,
  startTime: string,
  endTime: string,
  classDays: string | null,
  notes: string | null,
  updatedBy: string,
): Promise<SectionSchedule> {
  const batchCheck = await db.query('SELECT id FROM batches WHERE id = $1', [batchId]);
  if (!batchCheck.rowCount) throw new AppError('Batch not found', 404, 'NOT_FOUND');

  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!timeRe.test(startTime)) throw new AppError('Invalid start_time. Use HH:MM (24h)', 400, 'VALIDATION_ERROR');
  if (!timeRe.test(endTime))   throw new AppError('Invalid end_time. Use HH:MM (24h)', 400, 'VALIDATION_ERROR');

  const { rows } = await db.query(
    `INSERT INTO section_schedules (batch_id, section, start_time, end_time, class_days, notes, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (batch_id, section) DO UPDATE SET
       start_time = EXCLUDED.start_time,
       end_time   = EXCLUDED.end_time,
       class_days = EXCLUDED.class_days,
       notes      = EXCLUDED.notes,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING id, batch_id AS "batchId", section,
               start_time AS "startTime", end_time AS "endTime",
               class_days AS "classDays", notes,
               updated_at AS "updatedAt"`,
    [batchId, section, startTime, endTime, classDays ?? null, notes ?? null, updatedBy],
  );
  return { ...rows[0], updatedByName: null } as SectionSchedule;
}

export async function deleteSectionSchedule(batchId: string, section: string): Promise<void> {
  await db.query(
    'DELETE FROM section_schedules WHERE batch_id = $1 AND section = $2',
    [batchId, section],
  );
}

export async function getBatchSections(batchId: string): Promise<string[]> {
  const { rows } = await db.query(
    `SELECT DISTINCT cm.section
     FROM course_modules cm
     JOIN batch_courses bc ON bc.course_id = cm.course_id
     WHERE bc.batch_id = $1 AND cm.section IS NOT NULL
     ORDER BY cm.section ASC`,
    [batchId],
  );
  return rows.map((r: any) => r.section as string);
}

// ── available_from helper ─────────────────────────────────────────────────────

function computeAvailableFrom(recordedDate: string, endTime: string): Date {
  const [hh, mm] = endTime.split(':').map(Number);
  const base = new Date(`${recordedDate}T00:00:00Z`);
  base.setUTCHours(hh, mm, 0, 0);
  base.setUTCHours(base.getUTCHours() + 4);
  return base;
}

// ── Session Recordings ────────────────────────────────────────────────────────

/** Get all recordings for a course — course-level templates + per-batch copies */
export async function getCourseRecordings(courseId: string): Promise<SessionRecording[]> {
  const { rows } = await db.query(
    `SELECT sr.id, sr.module_id AS "moduleId", sr.batch_id AS "batchId",
            sr.title, sr.youtube_url AS "youtubeUrl",
            sr.recorded_date AS "recordedDate",
            sr.available_from AS "availableFrom",
            sr.created_at AS "createdAt",
            cm.title AS "moduleTitle",
            cm.section, cm.session_number AS "sessionNumber",
            b.name AS "batchName"
     FROM session_recordings sr
     JOIN course_modules cm ON cm.id = sr.module_id
     LEFT JOIN batches b ON b.id = sr.batch_id
     WHERE cm.course_id = $1
     ORDER BY cm.sort_order ASC, sr.batch_id NULLS FIRST, b.name ASC NULLS LAST, sr.created_at DESC`,
    [courseId],
  );
  return rows as SessionRecording[];
}

/** Get all recordings for a batch (admin view) */
export async function getBatchRecordings(batchId: string): Promise<SessionRecording[]> {
  const { rows } = await db.query(
    `SELECT sr.id, sr.module_id AS "moduleId", sr.batch_id AS "batchId",
            sr.title, sr.youtube_url AS "youtubeUrl",
            sr.recorded_date AS "recordedDate",
            sr.available_from AS "availableFrom",
            sr.created_at AS "createdAt",
            cm.title AS "moduleTitle",
            cm.section, cm.session_number AS "sessionNumber"
     FROM session_recordings sr
     JOIN course_modules cm ON cm.id = sr.module_id
     WHERE sr.batch_id = $1
     ORDER BY cm.sort_order ASC, sr.created_at DESC`,
    [batchId],
  );
  return rows as SessionRecording[];
}

/** Get recording for a specific module+batch (student view — checks availability) */
export async function getModuleRecording(
  moduleId: string,
  batchId: string,
): Promise<(SessionRecording & { isAvailable: boolean }) | null> {
  const { rows } = await db.query(
    `SELECT sr.id, sr.module_id AS "moduleId", sr.batch_id AS "batchId",
            sr.title, sr.youtube_url AS "youtubeUrl",
            sr.recorded_date AS "recordedDate",
            sr.available_from AS "availableFrom",
            sr.created_at AS "createdAt"
     FROM session_recordings sr
     WHERE sr.module_id = $1 AND (sr.batch_id = $2 OR sr.batch_id IS NULL)
     ORDER BY sr.batch_id NULLS LAST
     LIMIT 1`,
    [moduleId, batchId],
  );
  if (!rows.length) return null;

  const r = rows[0] as any;
  const now = new Date();
  const availableFrom = r.availableFrom ? new Date(r.availableFrom) : null;
  const isAvailable = !availableFrom || now >= availableFrom;

  return {
    ...r,
    youtubeUrl:  isAvailable ? r.youtubeUrl : null,
    isAvailable,
  };
}

/** Push course-level recording templates to every batch running this course */
export async function syncCourseRecordingsToBatch(batchId: string, courseId: string, tx?: import('../lib/db').DbTransaction) {
  await db.query(
    `INSERT INTO session_recordings
       (module_id, batch_id, title, youtube_url, recorded_date, available_from, uploaded_by)
     SELECT cr.module_id, $1, cr.title, cr.youtube_url, cr.recorded_date, cr.available_from, cr.uploaded_by
     FROM session_recordings cr
     JOIN course_modules cm ON cm.id = cr.module_id
     WHERE cr.batch_id IS NULL
       AND cm.course_id = $2
     ON CONFLICT (module_id, batch_id) DO UPDATE SET
       title          = EXCLUDED.title,
       youtube_url    = EXCLUDED.youtube_url,
       recorded_date  = EXCLUDED.recorded_date,
       available_from = EXCLUDED.available_from,
       uploaded_by    = EXCLUDED.uploaded_by,
       updated_at     = NOW()`,
    [batchId, courseId],
    tx,
  );
}

/** Propagate one course-level template to all batches already linked to its course */
async function propagateCourseRecordingToBatches(moduleId: string) {
  await db.query(
    `INSERT INTO session_recordings
       (module_id, batch_id, title, youtube_url, recorded_date, available_from, uploaded_by)
     SELECT cr.module_id, bc.batch_id, cr.title, cr.youtube_url, cr.recorded_date, cr.available_from, cr.uploaded_by
     FROM session_recordings cr
     JOIN course_modules cm ON cm.id = cr.module_id
     JOIN batch_courses bc ON bc.course_id = cm.course_id
     WHERE cr.module_id = $1 AND cr.batch_id IS NULL
     ON CONFLICT (module_id, batch_id) DO UPDATE SET
       title          = EXCLUDED.title,
       youtube_url    = EXCLUDED.youtube_url,
       recorded_date  = EXCLUDED.recorded_date,
       available_from = EXCLUDED.available_from,
       uploaded_by    = EXCLUDED.uploaded_by,
       updated_at     = NOW()`,
    [moduleId],
  );
}

/** Course-first: save recording without batch — auto-syncs to linked batches */
export async function upsertCourseRecording(params: {
  moduleId:     string;
  title:        string;
  youtubeUrl:   string;
  recordedDate: string;
  endTime:      string;
  uploadedBy:   string;
}): Promise<SessionRecording> {
  const { moduleId, title, youtubeUrl, recordedDate, endTime, uploadedBy } = params;

  const modCheck = await db.query('SELECT id FROM course_modules WHERE id = $1', [moduleId]);
  if (!modCheck.rowCount) throw new AppError('Module not found', 404, 'NOT_FOUND');

  const ytPattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/i;
  if (!ytPattern.test(youtubeUrl)) {
    throw new AppError(
      'Invalid YouTube URL. Must be https://youtube.com/... or https://youtu.be/...',
      400,
      'VALIDATION_ERROR',
    );
  }

  const availableFrom = computeAvailableFrom(recordedDate, endTime);

  const { rows } = await db.query(
    `INSERT INTO session_recordings
       (module_id, batch_id, title, youtube_url, recorded_date, available_from, uploaded_by)
     VALUES ($1, NULL, $2, $3, $4, $5, $6)
     ON CONFLICT (module_id) WHERE batch_id IS NULL DO UPDATE SET
       title          = EXCLUDED.title,
       youtube_url    = EXCLUDED.youtube_url,
       recorded_date  = EXCLUDED.recorded_date,
       available_from = EXCLUDED.available_from,
       uploaded_by    = EXCLUDED.uploaded_by,
       updated_at     = NOW()
     RETURNING id, module_id AS "moduleId", batch_id AS "batchId",
               title, youtube_url AS "youtubeUrl",
               recorded_date AS "recordedDate",
               available_from AS "availableFrom",
               created_at AS "createdAt"`,
    [moduleId, title, youtubeUrl, recordedDate, availableFrom.toISOString(), uploadedBy],
  );

  await propagateCourseRecordingToBatches(moduleId);
  return rows[0] as SessionRecording;
}

/** Add or replace a YouTube link for a session (upsert — one per module+batch) */
export async function upsertRecording(params: {
  moduleId:     string;
  batchId?:     string;
  title:        string;
  youtubeUrl:   string;
  recordedDate: string;
  endTime:      string;
  uploadedBy:   string;
}): Promise<SessionRecording> {
  const { moduleId, batchId, title, youtubeUrl, recordedDate, endTime, uploadedBy } = params;

  if (!batchId) {
    return upsertCourseRecording({ moduleId, title, youtubeUrl, recordedDate, endTime, uploadedBy });
  }

  const modCheck = await db.query<{ id: string; course_id: string }>(
    'SELECT id, course_id FROM course_modules WHERE id = $1',
    [moduleId],
  );
  if (!modCheck.rowCount) throw new AppError('Module not found', 404, 'NOT_FOUND');

  const batchCheck = await db.query('SELECT id FROM batches WHERE id = $1', [batchId]);
  if (!batchCheck.rowCount) throw new AppError('Batch not found', 404, 'NOT_FOUND');

  const courseId = modCheck.rows[0].course_id;
  const linkCheck = await db.query(
    `SELECT 1 FROM batch_courses WHERE batch_id = $1 AND course_id = $2`,
    [batchId, courseId],
  );
  if (!linkCheck.rowCount) {
    throw new AppError(
      'This batch is not linked to the course for this session. Link the course in Batch Master first.',
      400,
      'VALIDATION_ERROR',
    );
  }

  const ytPattern = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/i;
  if (!ytPattern.test(youtubeUrl)) {
    throw new AppError(
      'Invalid YouTube URL. Must be https://youtube.com/... or https://youtu.be/...',
      400,
      'VALIDATION_ERROR',
    );
  }

  const availableFrom = computeAvailableFrom(recordedDate, endTime);

  const { rows } = await db.query(
    `INSERT INTO session_recordings
       (module_id, batch_id, title, youtube_url, recorded_date, available_from, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (module_id, batch_id) DO UPDATE SET
       title          = EXCLUDED.title,
       youtube_url    = EXCLUDED.youtube_url,
       recorded_date  = EXCLUDED.recorded_date,
       available_from = EXCLUDED.available_from,
       uploaded_by    = EXCLUDED.uploaded_by,
       updated_at     = NOW()
     RETURNING id, module_id AS "moduleId", batch_id AS "batchId",
               title, youtube_url AS "youtubeUrl",
               recorded_date AS "recordedDate",
               available_from AS "availableFrom",
               created_at AS "createdAt"`,
    [moduleId, batchId, title, youtubeUrl, recordedDate, availableFrom.toISOString(), uploadedBy],
  );
  return rows[0] as SessionRecording;
}

/** Delete course template + all batch copies for the same module when removing template */
export async function deleteRecording(recordingId: string): Promise<void> {
  const { rows } = await db.query<{ id: string; module_id: string; batch_id: string | null }>(
    'SELECT id, module_id, batch_id FROM session_recordings WHERE id = $1',
    [recordingId],
  );
  if (!rows.length) throw new AppError('Recording not found', 404, 'NOT_FOUND');
  const rec = rows[0];
  if (rec.batch_id === null) {
    await db.query('DELETE FROM session_recordings WHERE module_id = $1', [rec.module_id]);
  } else {
    await db.query('DELETE FROM session_recordings WHERE id = $1', [recordingId]);
  }
}
