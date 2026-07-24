import db from '../lib/db';
import { syncBatchProgressForCourse } from './batch-progress.service';
import { AppError } from '../middleware/error.middleware';
import { storageAdapter, slugify } from '../lib/storage';

interface UploadedFile {
  mimetype: string;
  originalname: string;
  buffer: Buffer;
}

// ── Structured data types ────────────────────────────────────────────────────

export interface SyllabusSession {
  session:  string | number;
  module:   string;
  topics:   string[];
  duration: number | null;
}

export interface SyllabusSheet {
  name:        string;
  courseTitle: string;
  sessions:    SyllabusSession[];
}

export interface StructuredSyllabus {
  type:   'excel_structured' | 'csv_structured';
  sheets: SyllabusSheet[];
}

export interface SyllabusResult {
  id:             string;
  filename:       string;
  fileType:       'PDF' | 'EXCEL' | 'CSV';
  label:          string | null;
  contentText:    string;
  structuredData: StructuredSyllabus | null;
  filePath:       string | null;   // S3 key (or null for old records)
  fileUrl:        string | null;   // presigned/public URL
  createdAt:      string;
  uploadedByName?: string;
}

// ── Excel structured parser ──────────────────────────────────────────────────
// Handles the format: Session# | Module | Expanded Detailed Topics | Duration
// Rows where Session# is null are continuation rows (additional bullets)

function parseExcelStructured(buffer: Buffer): StructuredSyllabus {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require('xlsx') as {
    read: (data: Buffer, opts: { type: string }) => {
      SheetNames: string[];
      Sheets: Record<string, unknown>;
    };
    utils: {
      sheet_to_json: (sheet: unknown, opts: { header: number; defval: unknown }) => unknown[][];
    };
  };

  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheets: SyllabusSheet[] = [];

  for (const sheetName of wb.SheetNames) {
    const raw: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
    });

    // Find the header row (contains "Session" or "Day" in col B/C area)
    let headerRow = -1;
    let courseTitle = sheetName;
    let sessionCol = 1, moduleCol = 2, topicsCol = 3, durationCol = 4;

    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      const row = raw[i];
      // Check for course title row (has text in col 1 but not numeric)
      if (row[1] && typeof row[1] === 'string' && row[1].trim() && !row[2] && !row[3]) {
        courseTitle = String(row[1]).trim();
      }
      // Find header row
      const rowStr = row.map((c) => String(c ?? '').toLowerCase());
      if (rowStr.some((c) => c.includes('session') || c.includes('day'))) {
        headerRow = i;
        // Detect column positions from header
        for (let j = 0; j < rowStr.length; j++) {
          if (rowStr[j].includes('session') || rowStr[j].includes('day')) sessionCol = j;
          else if (rowStr[j].includes('module')) moduleCol = j;
          else if (rowStr[j].includes('topic') || rowStr[j].includes('component')) topicsCol = j;
          else if (rowStr[j].includes('duration') || rowStr[j].includes('min')) durationCol = j;
        }
        break;
      }
    }

    if (headerRow === -1) continue; // Skip sheets without recognizable structure

    const sessions: SyllabusSession[] = [];
    let currentSession: SyllabusSession | null = null;

    for (let i = headerRow + 1; i < raw.length; i++) {
      const row = raw[i];
      const sessionVal = row[sessionCol];
      const moduleVal  = row[moduleCol];
      const topicsVal  = row[topicsCol];
      const durVal     = row[durationCol];

      // Skip completely empty rows
      if (!sessionVal && !moduleVal && !topicsVal) continue;

      const topicText = topicsVal ? String(topicsVal).trim() : '';

      if (sessionVal !== null && sessionVal !== undefined && sessionVal !== '') {
        // New session row
        currentSession = {
          session:  String(sessionVal).trim(),
          module:   moduleVal ? String(moduleVal).trim() : 'Untitled',
          topics:   topicText ? [topicText] : [],
          duration: durVal ? (parseInt(String(durVal), 10) || null) : null,
        };
        sessions.push(currentSession);
      } else if (currentSession && topicText) {
        // Continuation row — append topic to current session
        currentSession.topics.push(topicText);
      }
    }

    if (sessions.length > 0) {
      sheets.push({ name: sheetName, courseTitle, sessions });
    }
  }

  return { type: 'excel_structured', sheets };
}

// ── CSV structured parser ────────────────────────────────────────────────────
// Format: week, topic, subtopics, description, resources

function parseCsvStructured(buffer: Buffer): StructuredSyllabus {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new AppError('CSV must have a header row and at least one data row', 400, 'INVALID_CSV');

  const header = lines[0].split(',').map((h) => h.toLowerCase().trim());
  const weekCol     = header.indexOf('week');
  const topicCol    = header.indexOf('topic');
  const subCol      = header.indexOf('subtopics');
  const descCol     = header.indexOf('description');
  const resCol      = header.indexOf('resources');

  const sessions: SyllabusSession[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const week    = weekCol  >= 0 ? cols[weekCol]  : String(i);
    const topic   = topicCol >= 0 ? cols[topicCol] : '';
    const sub     = subCol   >= 0 ? cols[subCol]   : '';
    const desc    = descCol  >= 0 ? cols[descCol]  : '';
    const res     = resCol   >= 0 ? cols[resCol]   : '';

    const topics: string[] = [];
    if (sub)  topics.push(sub);
    if (desc) topics.push(desc);
    if (res)  topics.push('Resources: ' + res);

    sessions.push({ session: week, module: topic, topics, duration: null });
  }

  return {
    type: 'csv_structured',
    sheets: [{ name: 'Syllabus', courseTitle: 'Course Syllabus', sessions }],
  };
}

// ── Sync course_modules from structured syllabus data ─────────────────────────
// Called after every successful upload so students immediately see real sessions.
// Uses INSERT … ON CONFLICT DO UPDATE so re-uploads are safe (won't duplicate).

export async function syncModulesFromSyllabus(
  courseId: string,
  data: StructuredSyllabus | null,
): Promise<void> {
  if (!data || !data.sheets) {
    // Clear syllabus-synced modules only — preserve trainer-added sub-sessions (e.g. 1.1, 1.2)
    await db.query(
      `DELETE FROM course_modules
       WHERE course_id = $1 AND section IS NOT NULL
         AND (session_number IS NULL OR session_number NOT LIKE '%.%')`,
      [courseId]
    );
    await syncBatchProgressForCourse(courseId);
    return;
  }

  // Build a flat list of all sessions across all sheets
  const rows: { section: string; sessionNumber: string; title: string; topics: string[]; duration: number | null; sortOrder: number }[] = [];
  let globalOrder = 0;

  for (const sheet of data.sheets) {
    for (const sess of sheet.sessions) {
      rows.push({
        section:       sheet.name,
        sessionNumber: String(sess.session),
        title:         sess.module,
        topics:        sess.topics,
        duration:      sess.duration,
        sortOrder:     globalOrder++,
      });
    }
  }

  // Delete synced modules that are no longer in the new syllabus
  const { rows: existing } = await db.query(
    'SELECT id, section, session_number AS "sessionNumber" FROM course_modules WHERE course_id = $1 AND section IS NOT NULL',
    [courseId]
  );
  
  const newSet = new Set(rows.map(r => `${r.section}:::${r.sessionNumber}`));
  // Never wipe trainer sub-sessions (1.1, 1.2, …) — they are not in the Excel syllabus
  const toDelete = existing.filter(e => {
    const sn = String(e.sessionNumber ?? '');
    if (sn.includes('.')) return false;
    return !newSet.has(`${e.section}:::${e.sessionNumber}`);
  });

  if (toDelete.length > 0) {
    const idsToDelete = toDelete.map(e => e.id);
    await db.query('DELETE FROM course_modules WHERE id = ANY($1::uuid[])', [idsToDelete]);
  }

  if (!rows.length) return;

  // Upsert each session — update title/topics/duration if it already exists
  await Promise.all(rows.map(r => 
    db.query(
      `INSERT INTO course_modules
         (course_id, title, description, section, session_number, topics, duration_minutes, sort_order, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'LOCKED')
       ON CONFLICT (course_id, section, session_number)
       DO UPDATE SET
         title            = EXCLUDED.title,
         topics           = EXCLUDED.topics,
         duration_minutes = EXCLUDED.duration_minutes,
         sort_order       = EXCLUDED.sort_order,
         updated_at       = NOW()`,
      [
        courseId,
        r.title,
        r.topics.join('\n'),          // description = all topics joined (for search/display fallback)
        r.section,
        r.sessionNumber,
        JSON.stringify(r.topics),
        r.duration,
        r.sortOrder,
      ],
    )
  ));

  // Reindex sort_order so parents and dotted sub-sessions interleave correctly per section
  await db.query(
    `WITH ranked AS (
       SELECT m.id,
              ROW_NUMBER() OVER (
                ORDER BY
                  (
                    SELECT MIN(p.sort_order)
                    FROM course_modules p
                    WHERE p.course_id = m.course_id
                      AND p.section IS NOT DISTINCT FROM m.section
                      AND (p.session_number IS NULL OR p.session_number NOT LIKE '%.%')
                  ) NULLS LAST,
                  CASE
                    WHEN m.session_number ~ '^[0-9]+(\\.[0-9]+)*$'
                    THEN string_to_array(m.session_number, '.')::int[]
                    ELSE ARRAY[999999]
                  END,
                  m.created_at
              ) - 1 AS new_order
       FROM course_modules m
       WHERE m.course_id = $1
     )
     UPDATE course_modules cm
     SET sort_order = ranked.new_order
     FROM ranked
     WHERE cm.id = ranked.id`,
    [courseId],
  );

  await syncBatchProgressForCourse(courseId);
}

// ── Main upload function ─────────────────────────────────────────────────────

export async function uploadSyllabus(
  courseId:   string,
  uploadedBy: string,
  file:       UploadedFile,
  label?:     string,
): Promise<SyllabusResult> {
  const courseRes = await db.query<{ id: string; title: string }>(
    'SELECT id, title FROM courses WHERE id = $1',
    [courseId],
  );
  if (!courseRes.rowCount || courseRes.rowCount === 0)
    throw new AppError('Course not found', 404, 'NOT_FOUND');
  const courseSlug = slugify(courseRes.rows[0].title);

  const mimeType = file.mimetype;
  const name     = file.originalname.toLowerCase();
  let contentText  = '';
  let fileType: 'PDF' | 'EXCEL' | 'CSV' = 'PDF';
  let structuredData: StructuredSyllabus | null = null;

  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse/lib/pdf-parse') as
        (buffer: Buffer) => Promise<{ text: string }>;
      const parsed = await pdfParse(file.buffer);
      contentText = parsed.text.trim();
    } catch {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{ text: string }>;
      const parsed = await pdfParse(file.buffer);
      contentText = parsed.text.trim();
    }
    fileType = 'PDF';

  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    name.endsWith('.xlsx') || name.endsWith('.xls')
  ) {
    // Parse structured Excel (multi-sheet Session/Module/Topics/Duration format)
    try {
      structuredData = parseExcelStructured(file.buffer);
      // Also generate plain text summary for legacy/search
      contentText = structuredData.sheets
        .map((s) => {
          const lines = [`=== ${s.courseTitle} ===`];
          s.sessions.forEach((sess) => {
            lines.push('Session ' + String(sess.session) + ': ' + sess.module + (sess.duration ? ' (' + sess.duration + ' min)' : ''));
            sess.topics.forEach((t) => lines.push(`  - ${t}`));
          });
          return lines.join('\n');
        })
        .join('\n\n');
    } catch {
      // Fallback to raw CSV text extraction
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const XLSX = require('xlsx');
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const parts: string[] = [];
      for (const sn of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sn]);
        if (csv.trim()) parts.push(`=== ${sn} ===\n${csv.trim()}`);
      }
      contentText = parts.join('\n\n');
    }
    fileType = 'EXCEL';

  } else if (
    mimeType === 'text/csv' || mimeType === 'application/csv' ||
    name.endsWith('.csv')
  ) {
    structuredData = parseCsvStructured(file.buffer);
    contentText = structuredData.sheets[0]?.sessions
      .map((s) => `Week ${s.session}: ${s.module} — ${s.topics.join(', ')}`)
      .join('\n') ?? '';
    fileType = 'CSV';

  } else {
    throw new AppError(
      'Unsupported file type. Upload PDF, Excel (.xlsx/.xls), or CSV.',
      400,
      'INVALID_FILE_TYPE',
    );
  }

  if (!contentText && !structuredData) {
    throw new AppError(
      'Could not extract content from file. Make sure it is not empty.',
      422,
      'EMPTY_CONTENT',
    );
  }

  // ── Upload to structured S3 path ─────────────────────────────────────────
  // syllabi/{course-slug}/{version}/{ts}_{course-slug}-syllabus.{ext}
  const stored = await storageAdapter.uploadWithContext(
    { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
    { type: 'syllabus', courseSlug, syllabusLabel: label ?? undefined },
  );

  const uploaderExists = uploadedBy
    ? (await db.query('SELECT id FROM users WHERE id = $1', [uploadedBy])).rowCount ?? 0 > 0
    : false;
  const safeUploadedBy = uploaderExists ? uploadedBy : null;

  const { rows } = await db.query(
    `INSERT INTO course_syllabi (course_id, filename, file_type, content_text, structured_data, uploaded_by, label, file_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, filename, file_type AS "fileType",
               content_text AS "contentText",
               structured_data AS "structuredData",
               label,
               file_path AS "filePath",
               created_at AS "createdAt"`,
    [courseId, file.originalname, fileType, contentText,
     structuredData ? JSON.stringify(structuredData) : null, safeUploadedBy,
     label ?? null, stored.key],
  );

  const row = rows[0] as SyllabusResult;
  row.fileUrl = await storageAdapter.getUrl(stored.key);

  // Auto-sync sessions into course_modules so students see real data immediately
  if (structuredData) {
    try {
      await syncModulesFromSyllabus(courseId, structuredData);
    } catch (syncErr: any) {
      // Non-fatal — log but don't fail the upload
      console.warn('[syllabus] Module sync warning:', syncErr.message);
    }
  }

  return row;
}

// ── List all syllabi for a course ────────────────────────────────────────────
export async function listSyllabi(courseId: string) {
  const { rows } = await db.query(
    `SELECT s.id, s.filename, s.file_type AS "fileType",
            s.label,
            s.structured_data AS "structuredData",
            s.content_text AS "contentText",
            s.file_path AS "filePath",
            s.created_at AS "createdAt",
            u.name AS "uploadedByName"
     FROM course_syllabi s
     LEFT JOIN users u ON u.id = s.uploaded_by
     WHERE s.course_id = $1
     ORDER BY s.created_at DESC`,
    [courseId],
  );
  // Attach presigned/public URLs
  const results = await Promise.all(
    (rows as SyllabusResult[]).map(async (r) => ({
      ...r,
      fileUrl: r.filePath ? await storageAdapter.getUrl(r.filePath) : null,
    })),
  );
  return results;
}

// ── Get single syllabus (latest for course, or specific id) ──────────────────
export async function getSyllabus(courseId: string, syllabusId?: string): Promise<SyllabusResult | null> {
  if (syllabusId) {
    const { rows } = await db.query(
      `SELECT s.id, s.filename, s.file_type AS "fileType",
              s.label, s.content_text AS "contentText",
              s.structured_data AS "structuredData",
              s.file_path AS "filePath",
              s.created_at AS "createdAt",
              u.name AS "uploadedByName"
       FROM course_syllabi s
       LEFT JOIN users u ON u.id = s.uploaded_by
       WHERE s.id = $1 AND s.course_id = $2`,
      [syllabusId, courseId],
    );
    if (!rows[0]) return null;
    const r = rows[0] as SyllabusResult;
    r.fileUrl = r.filePath ? await storageAdapter.getUrl(r.filePath) : null;
    return r;
  }
  const { rows } = await db.query(
    `SELECT s.id, s.filename, s.file_type AS "fileType",
            s.label, s.content_text AS "contentText",
            s.structured_data AS "structuredData",
            s.file_path AS "filePath",
            s.created_at AS "createdAt",
            u.name AS "uploadedByName"
     FROM course_syllabi s
     LEFT JOIN users u ON u.id = s.uploaded_by
     WHERE s.course_id = $1
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [courseId],
  );
  if (!rows[0]) return null;
  const r = rows[0] as SyllabusResult;
  r.fileUrl = r.filePath ? await storageAdapter.getUrl(r.filePath) : null;
  return r;
}

// ── Delete a syllabus version ────────────────────────────────────────────────
export async function deleteSyllabus(courseId: string, syllabusId: string) {
  const res = await db.query(
    'DELETE FROM course_syllabi WHERE id = $1 AND course_id = $2 RETURNING id, file_path AS "filePath"',
    [syllabusId, courseId],
  );
  if (!res.rowCount || res.rowCount === 0) {
    throw new AppError('Syllabus not found', 404, 'NOT_FOUND');
  }
  // Delete the original file from S3 / local disk
  const filePath = (res.rows[0] as any).filePath as string | null;
  if (filePath) {
    try { await storageAdapter.delete(filePath); } catch (_) { /* ignore if already gone */ }
  }

  // Check if there are any remaining syllabuses for this course
  const remainingRes = await db.query(
    'SELECT COUNT(*) FROM course_syllabi WHERE course_id = $1',
    [courseId]
  );
  const count = parseInt(remainingRes.rows[0].count, 10);

  // If no syllabi are left, delete syllabus-synced modules — keep trainer sub-sessions (1.1, 1.2)
  if (count === 0) {
    await db.query(
      `DELETE FROM course_modules
       WHERE course_id = $1 AND section IS NOT NULL
         AND (session_number IS NULL OR session_number NOT LIKE '%.%')`,
      [courseId]
    );
  } else {
    // If there are still other syllabi, we re-sync with the latest one
    // to ensure the course modules match the latest available syllabus
    const latest = await db.query(
      'SELECT structured_data AS "structuredData" FROM course_syllabi WHERE course_id = $1 ORDER BY created_at DESC LIMIT 1',
      [courseId]
    );
    if (latest.rowCount && latest.rowCount > 0) {
      try {
        await syncModulesFromSyllabus(courseId, latest.rows[0].structuredData || null);
      } catch (e) {
        console.warn('[syllabus] Failed to re-sync syllabus after deletion', e);
      }
    }
  }
}

// ── Assign syllabus to batch ──────────────────────────────────────────────────
export async function assignSyllabusToBatch(batchId: string, syllabusId: string) {
  await db.query(
    `INSERT INTO batch_syllabi (batch_id, syllabus_id)
     VALUES ($1, $2)
     ON CONFLICT (batch_id) DO UPDATE SET syllabus_id = $2, assigned_at = NOW()`,
    [batchId, syllabusId],
  );
}

// ── Get syllabus assigned to a batch ─────────────────────────────────────────
export async function getBatchSyllabus(batchId: string): Promise<SyllabusResult | null> {
  const { rows } = await db.query(
    `SELECT s.id, s.filename, s.file_type AS "fileType",
            s.label, s.content_text AS "contentText",
            s.structured_data AS "structuredData",
            s.file_path AS "filePath",
            s.created_at AS "createdAt",
            u.name AS "uploadedByName"
     FROM batch_syllabi bs
     JOIN course_syllabi s ON s.id = bs.syllabus_id
     LEFT JOIN users u ON u.id = s.uploaded_by
     WHERE bs.batch_id = $1`,
    [batchId],
  );
  if (!rows[0]) return null;
  const r = rows[0] as SyllabusResult;
  r.fileUrl = r.filePath ? await storageAdapter.getUrl(r.filePath) : null;
  return r;
}
