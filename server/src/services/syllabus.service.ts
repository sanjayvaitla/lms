import db from '../lib/db';
import { AppError } from '../middleware/error.middleware';
import { storageAdapter } from '../lib/storage';

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

// ── Main upload function ─────────────────────────────────────────────────────

export async function uploadSyllabus(
  courseId:   string,
  uploadedBy: string,
  file:       UploadedFile,
  label?:     string,
): Promise<SyllabusResult> {
  const courseRes = await db.query('SELECT id FROM courses WHERE id = $1', [courseId]);
  if (!courseRes.rowCount || courseRes.rowCount === 0)
    throw new AppError('Course not found', 404, 'NOT_FOUND');

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

  // ── Upload original file to S3 (or local disk) ───────────────────────────
  const stored = await storageAdapter.upload(
    { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
    'syllabi',
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
  row.fileUrl = stored.url;
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
